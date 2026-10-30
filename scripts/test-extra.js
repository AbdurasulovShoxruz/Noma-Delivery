'use strict';
/* Extras: rate limit, demo payment, customer cancel, courier, broadcast, sold-out alert. Run: node scripts/test-extra.js */
const assert = require('assert');
const crypto = require('crypto');
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.SUPABASE_URL = 'https://sb.test';
process.env.SUPABASE_SERVICE_KEY = 'sb_secret_test';
process.env.STAFF_CHAT_ID = '-100777';
process.env.WEBHOOK_SECRET = 'sec';
process.env.ADMIN_PASSWORD = 'pw-long-enough';


const tables = { customers: [{ telegram_id: 501, phone: '998901112233', first_name: 'Ali' }, { telegram_id: 502, phone: '998909998877', first_name: 'Vali' }], orders: [], shop_products: [{ id: 1, cat: 'women', art: 'tee', mat: 'cotton', price: 100000, sale: 0, stock: 1, active: true, sizes: null, colors: ['#181818'], name: { uz: 'Test mahsulot', ru: 'Тест' } }, { id: 2, cat: 'men', art: 'tee', mat: 'cotton', price: 100000, sale: 0, stock: 0, active: true, sizes: null, colors: ['#181818'], name: { uz: 'Yo‘q', ru: 'Нет' } }] };
let seq = 0, msg = 100; const calls = [];
const reply = (b, s = 200) => ({ ok: s < 400, status: s, text: async () => JSON.stringify(b), json: async () => b });
global.fetch = async (url, o = {}) => {
  url = String(url);
  if (url.startsWith('https://api.telegram.org/')) { const m = url.split('/').pop(); calls.push({ m, b: JSON.parse(o.body || '{}') }); return reply({ ok: true, result: { message_id: ++msg } }); }
  if (url.includes('/rpc/')) return reply(true);
  const [t, qs = ''] = url.replace('https://sb.test/rest/v1/', '').split('?'), q = new URLSearchParams(qs), rows = tables[t];
  const f = [...q.entries()];
  const match = (r) => f.every(([k, v]) => v.startsWith('eq.') ? String(r[k]) === v.slice(3) : v.startsWith('lt.') ? String(r[k]) < v.slice(3) : true);
  const body = o.body ? JSON.parse(o.body) : null;
  if (!o.method || o.method === 'GET') return reply(rows.filter(match));
  if (o.method === 'POST') { const r = { id: ++seq, created_at: new Date().toISOString(), ...body }; rows.push(r); return reply([r]); }
  if (o.method === 'PATCH') { const h = rows.filter(match); h.forEach((r) => Object.assign(r, body)); return reply(h); }
  throw new Error('unexpected ' + url);
};
const mkRes = () => ({ code: 200, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, send(s) { this.body = s; return this; } });
const sign = (id) => {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: 'T' }) });
  const chk = [...p.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  p.set('hash', crypto.createHmac('sha256', crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest()).update(chk).digest('hex'));
  return p.toString();
};
const call = async (h, body, headers = {}) => { const r = mkRes(); await h({ method: 'POST', body, headers }, r); return r; };
const order = require('../api/order'), pay = require('../api/pay'), cancel = require('../api/cancel'), admin = require('../api/admin'), shop = require('../api/shop');
const { rateLimit } = require('../lib/common');
const { REGIONS } = require('../lib/catalog');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
let n = 0; const ok = (m) => console.log(`  ok ${++n} ${m}`);

(async () => {
  const A = sign(501), B = sign(502);
  assert.ok(rateLimit('k', 2, 5000) && rateLimit('k', 2, 5000) && !rateLimit('k', 2, 5000)); ok('rate limit blocks the 3rd call');

  const det = { region: REGIONS[0], tuman: 'Nukus', phone: '901234567', name: 'Ali' };
  let r = await call(order, { initData: A, type: 'viloyat', items: [{ id: 1, size: null, color: 0, qty: 1 }], ...det });
  assert.strictEqual(r.code, 200); const id = r.body.id, total = r.body.total, o = tables.orders[0];
  const alert = calls.find((c) => c.m === 'sendMessage' && String(c.b.text || '').includes('tugadi'));
  assert.ok(alert && alert.b.text.includes('Test mahsulot')); ok('last piece sold: staff group gets a sold-out alert');
  tables.shop_products[0].stock = 0;
  r = await call(shop, {}); assert.ok(!r.body.products.some((p) => p.stock === 0)); ok('sold-out products are hidden from the shop list');

  r = await call(pay, { initData: A, id }); assert.strictEqual(r.code, 200); assert.strictEqual(o.status, 'new'); ok('demo payment releases the region order to staff');
  r = await call(pay, { initData: A, id }); assert.strictEqual(r.body.status, 'new'); ok('paid order is not paid again');

  tables.shop_products[0].stock = 5; require('../lib/common').clearShop();
  r = await call(order, { initData: A, type: 'courier', items: [{ id: 1, size: null, color: 0, qty: 1 }], name: 'Ali', address: 'Test 1', lat: 41.31, lon: 69.28, pay: 'cash' });
  assert.ok(r.body.ok, JSON.stringify(r.body)); const cid = tables.orders[tables.orders.length - 1].id;
  r = await call(cancel, { initData: B, id: cid }); assert.strictEqual(r.code, 404);
  r = await call(cancel, { initData: A, id: cid }); assert.strictEqual(r.code, 200); assert.strictEqual(tables.orders.find((x) => x.id === cid).status, 'cancelled'); ok('customer cancels his own new order; others cannot');
  r = await call(cancel, { initData: A, id }); assert.strictEqual(r.code, 409); ok('a paid region order cannot be cancelled by the customer');

  const tok = (await call(admin, { action: 'login', password: 'pw-long-enough' })).body.token, H = { 'x-admin-token': tok };
  r = await call(admin, { action: 'courier', id, courier: 'Aziz' }, H); assert.strictEqual(o.courier, 'Aziz'); ok('courier name saved');
  r = await call(admin, { action: 'broadcast', text: 'Yangi kolleksiya!', offset: 0 }, H);
  assert.strictEqual(r.body.sent, 2); assert.strictEqual(r.body.done, true); ok('broadcast reaches both verified customers');
  r = await call(admin, { action: 'broadcast', text: 'x' }, H); assert.strictEqual(r.code, 400); ok('too short broadcast refused');
  for (let i = 0; i < 9; i++) r = await call(admin, { action: 'login', password: 'wrong' });
  assert.strictEqual(r.code, 429); ok('admin login is rate limited');
  console.log('\nExtra checks passed');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
