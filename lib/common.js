'use strict';
const crypto = require('crypto');

const env = (k) => process.env[k];

/* Validate Telegram Mini App initData (HMAC-SHA256). Returns the user object, or null if invalid. */
function verifyInitData(initData, maxAgeSec = 86400) {
  const token = env('BOT_TOKEN');
  if (!token || typeof initData !== 'string' || !initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const check = [...params.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const calc = crypto.createHmac('sha256', secret).update(check).digest('hex');
  const a = Buffer.from(calc);
  const b = Buffer.from(hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;
  try {
    const user = JSON.parse(params.get('user'));
    return user && user.id ? user : null;
  } catch (e) {
    return null;
  }
}

/* ---- Telegram Bot API ---- */
async function tg(method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${env('BOT_TOKEN')}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  let j;
  try { j = await r.json(); } catch (e) { j = { ok: false, description: 'bad json' }; }
  if (!j.ok) console.error('telegram', method, j.description);
  return j;
}

let _bot = '';
async function botUsername() {
  if (env('BOT_USERNAME')) return env('BOT_USERNAME').replace(/^@/, '');
  if (!_bot) {
    const j = await tg('getMe');
    _bot = j.ok ? j.result.username : '';
  }
  return _bot;
}

/* ---- Supabase (REST, service key; only ever used on the server) ---- */
async function db(path, { method = 'GET', body, prefer } = {}) {
  const key = env('SUPABASE_SERVICE_KEY');
  const headers = { apikey: key, 'content-type': 'application/json' };
  if (key && key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`; // legacy JWT keys only
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${env('SUPABASE_URL')}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`supabase ${r.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

let _shop = { t: 0, v: null };
const clearShop = () => { _shop = { t: 0, v: null }; };
/* Products from the admin panel, or null when the table is missing/empty (then the built-in catalog is used). */
async function getShop() {
  if (_shop.v && Date.now() - _shop.t < 10000) return _shop.v;
  try {
    const rows = await db('shop_products?select=*&order=id');
    if (rows && rows.length) { _shop = { t: Date.now(), v: rows }; return rows; }
  } catch (e) { /* table not created yet */ }
  return null;
}

const intId = (v) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error('bad id');
  return n;
};

const getCustomer = async (id) => ((await db(`customers?telegram_id=eq.${intId(id)}&select=*`)) || [])[0] || null;
const upsertCustomer = (row) =>
  db('customers?on_conflict=telegram_id', { method: 'POST', body: row, prefer: 'resolution=merge-duplicates,return=representation' });
const insertOrder = async (row) => (await db('orders', { method: 'POST', body: row, prefer: 'return=representation' }))[0];
const getOrder = async (id) => ((await db(`orders?id=eq.${intId(id)}&select=*`)) || [])[0] || null;
/* If expectStatus is given the update only applies when the order still has that status (no double clicks). */
const patchOrder = async (id, patch, expectStatus) => {
  const filter = expectStatus ? `&status=eq.${expectStatus}` : '';
  const rows = await db(`orders?id=eq.${intId(id)}${filter}`, { method: 'PATCH', body: patch, prefer: 'return=representation' });
  return (rows || [])[0] || null;
};

/* Give the stock of a cancelled order back: plain stock, or per-size stock. Call it once, right after the
   status was changed to 'cancelled' (patchOrder only lets that happen once, so it can not run twice). */
async function restoreStock(order) {
  try {
    const lines = Array.isArray(order && order.items) ? order.items : [];
    const ids = [...new Set(lines.map((l) => Number(l.id)).filter((n) => Number.isInteger(n)))];
    if (!ids.length) return;
    const rows = (await db(`shop_products?id=in.(${ids.join(',')})&select=id,stock,size_stock`)) || [];
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    const jobs = {};
    for (const l of lines) {
      const p = by[Number(l.id)], q = Number(l.qty) || 0;
      if (!p || q < 1) continue;
      if (p.size_stock) {
        // only sizes that still exist on the product (a size removed later must not come back)
        if (l.size != null && Object.prototype.hasOwnProperty.call(p.size_stock, l.size)) {
          const k = `s|${p.id}|${l.size}`;
          jobs[k] = jobs[k] || { fn: 'give_size_stock', body: { pid: p.id, sz: String(l.size), q: 0 } };
          jobs[k].body.q += q;
        }
      } else if (p.stock != null) {
        const k = `p|${p.id}`;
        jobs[k] = jobs[k] || { fn: 'give_stock', body: { pid: p.id, q: 0 } };
        jobs[k].body.q += q;
      }
    }
    await Promise.all(Object.values(jobs).map((j) => db(`rpc/${j.fn}`, { method: 'POST', body: j.body }).catch((e) => console.error(j.fn, e.message))));
    clearShop();
  } catch (e) { console.error('restoreStock', e.message); }
}

/* Region orders that were never paid within 30 minutes are cancelled and their stock is given back. */
async function expireUnpaid() {
  try {
    const cut = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const rows = (await db(`orders?status=eq.awaiting_payment&created_at=lt.${encodeURIComponent(cut)}&select=id`)) || [];
    for (const r of rows) {
      const u = await patchOrder(r.id, { status: 'cancelled', handled_by: 'Avto: to‘lov kutilmadi' }, 'awaiting_payment');
      if (u) await restoreStock(u);
    }
  } catch (e) { console.error('expireUnpaid', e.message); }
}

/* ---- Phone helpers ---- */
function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  const prefix = env('PHONE_PREFIX') === undefined ? '998' : env('PHONE_PREFIX');
  if (prefix === '998') return /^998\d{9}$/.test(digits) ? digits : null;
  const okLen = digits.length >= 8 && digits.length <= 15;
  if (prefix && prefix !== 'any') return digits.startsWith(prefix) && okLen ? digits : null;
  return okLen ? digits : null;
}

function formatPhone(d) {
  d = String(d || '');
  const m = /^998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(d);
  return m ? `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : `+${d}`;
}

module.exports = {
  getShop, clearShop, restoreStock, expireUnpaid, env, verifyInitData, tg, botUsername, db,
  getCustomer, upsertCustomer, insertOrder, getOrder, patchOrder,
  normalizePhone, formatPhone,
};
