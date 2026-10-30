'use strict';
/* Cancelling an order gives its stock back. Run: node scripts/test-stock.js */
const assert = require('assert');
process.env.BOT_TOKEN = '1:T'; process.env.SUPABASE_URL = 'https://sb.test'; process.env.SUPABASE_SERVICE_KEY = 'k';
process.env.STAFF_CHAT_ID = '-100777'; process.env.WEBHOOK_SECRET = 'sec'; process.env.ADMIN_PASSWORD = 'pw';
const products = [
  { id: 1, stock: 5, size_stock: null },
  { id: 2, stock: 3, size_stock: { 40: 1, 41: 2 } },
  { id: 3, stock: null, size_stock: null },
];
let order = { id: 7, status: 'new', type: 'courier', telegram_id: 9, lang: 'uz', group_message_id: 5, items: [
  { id: 1, qty: 2, size: null }, { id: 1, qty: 1, size: null }, { id: 2, qty: 1, size: '40' }, { id: 2, qty: 2, size: '39' }, { id: 3, qty: 4, size: null }, { id: 99, qty: 1, size: null },
] };
const reply = (b) => ({ ok: true, status: 200, text: async () => JSON.stringify(b) });
global.fetch = async (url, o = {}) => {
  url = String(url);
  if (url.startsWith('https://api.telegram.org/')) return reply({ ok: true, result: true });
  const [path, qs = ''] = url.replace('https://sb.test/rest/v1/', '').split('?');
  const body = o.body ? JSON.parse(o.body) : null;
  if (path === 'orders') {
    if (o.method === 'PATCH') { const st = new URLSearchParams(qs).get('status'); if (st && st !== 'eq.' + order.status) return reply([]); Object.assign(order, body); return reply([order]); }
    return reply([order]);
  }
  if (path === 'shop_products') return reply(products);
  if (path === 'rpc/give_stock') { const p = products.find((x) => x.id === body.pid); if (p.stock != null) p.stock += body.q; return reply(null); }
  if (path === 'rpc/give_size_stock') { const p = products.find((x) => x.id === body.pid); p.size_stock[body.sz] += body.q; p.stock = Object.values(p.size_stock).reduce((a, b) => a + b, 0); return reply(null); }
  return reply([]);
};
const admin = require('../api/admin');
const call = async (b, tok) => { let out = {}; const res = { status(c) { out.c = c; return this; }, json(j) { out.j = j; return this; } }; await admin({ method: 'POST', body: b, headers: { 'x-admin-token': tok || '' } }, res); return out; };
(async () => {
  const tok = (await call({ action: 'login', password: 'pw' })).j.token;
  const r = await call({ action: 'status', id: 7, status: 'cancelled' }, tok);
  assert.strictEqual(r.c, 200);
  assert.strictEqual(products[0].stock, 8, 'plain stock 5 + 2 + 1');
  assert.deepStrictEqual(products[1].size_stock, { 40: 2, 41: 2 }, 'size 40 back; removed size 39 not resurrected');
  assert.strictEqual(products[1].stock, 4);
  assert.strictEqual(products[2].stock, null, 'unlimited stays unlimited');
  console.log('  ok cancel from admin panel gives stock back (plain + per size)');
  const again = await call({ action: 'status', id: 7, status: 'cancelled' }, tok);
  assert.strictEqual(again.c, 409); assert.strictEqual(products[0].stock, 8);
  console.log('  ok cancelling twice does not add stock twice');
  console.log('\nStock checks passed');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
