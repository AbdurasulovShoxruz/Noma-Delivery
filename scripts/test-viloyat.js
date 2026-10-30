'use strict';
/* Region (viloyat) delivery: details with the order, prepayment first, BTS tracking, expiry. Run: node scripts/test-viloyat.js */
const assert = require('assert');
const crypto = require('crypto');
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.SUPABASE_URL = 'https://sb.test';
process.env.SUPABASE_SERVICE_KEY = 'sb_secret_test';
process.env.STAFF_CHAT_ID = '-100777';
process.env.WEBHOOK_SECRET = 'sec';
process.env.ADMIN_PASSWORD = 'pw-long-enough';

const tables = { customers: [{ telegram_id: 501, phone: '998901112233', first_name: 'Ali' }, { telegram_id: 502, phone: '998909998877', first_name: 'Vali' }], orders: [] };
let seq = 0, msg = 100; const calls = [];
const reply = (b, s = 200) => ({ ok: s < 400, status: s, text: async () => JSON.stringify(b), json: async () => b });
global.fetch = async (url, o = {}) => {
  url = String(url);
  if (url.startsWith('https://api.telegram.org/')) { const m = url.split('/').pop(); calls.push({ m, b: JSON.parse(o.body || '{}') }); return reply({ ok: true, result: { message_id: ++msg } }); }
  const [t, qs = ''] = url.replace('https://sb.test/rest/v1/', '').split('?'), q = new URLSearchParams(qs), rows = tables[t];
  const f = [...q.entries()];
  const match = (r) => f.every(([k, v]) => v.startsWith('eq.') ? String(r[k]) === v.slice(3) : v.startsWith('lt.') ? String(r[k]) < v.slice(3) : true);
  const body = o.body ? JSON.parse(o.body) : null;
  if (!o.method || o.method === 'GET') return reply(rows.filter(match));
  if (o.method === 'POST') { const r = { id: ++seq, created_at: new Date().toISOString(), ...body }; rows.push(r); return reply([r]); }
  if (o.method === 'PATCH') { const h = rows.filter(match); h.forEach((r) => Object.assign(r, body)); return reply(h); }
  throw new Error('unexpected ' + url);
};
const mkRes = () => ({ code: 200, body: null, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, send(s) { this.body = s; return this; } });
const sign = (id) => {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: 'T' }) });
  const chk = [...p.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  p.set('hash', crypto.createHmac('sha256', crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest()).update(chk).digest('hex'));
  return p.toString();
};
const call = async (h, body, headers = {}) => { const r = mkRes(); await h({ method: 'POST', body, headers }, r); return r; };
const order = require('../api/order'), pay = require('../api/pay'), admin = require('../api/admin'), orders = require('../api/orders');
const { nextStatuses } = require('../lib/render');
const { REGIONS } = require('../lib/catalog');
let n = 0; const ok = (m) => console.log(`  ok ${++n} ${m}`);

(async () => {
  const A = sign(501), B = sign(502);
  const items = [{ id: 1, size: 'M', color: 0, qty: 1 }];
  const det = { region: REGIONS[3], tuman: 'Marg‘ilon', address: 'Mustaqillik 5', phone: '90 123 45 67', name: 'Ali Valiyev' };

  let r = await call(order, { initData: A, type: 'viloyat', items, name: 'Ali', ...det, region: 'Mars' });
  assert.strictEqual(r.code, 400); r = await call(order, { initData: A, type: 'viloyat', items, name: 'Ali', ...det, phone: '12' });
  assert.strictEqual(r.code, 400); r = await call(order, { initData: A, type: 'viloyat', items, name: 'Ali', ...det, tuman: '' });
  assert.strictEqual(r.code, 400); assert.strictEqual(tables.orders.length, 0); ok('order without a valid region, district or phone is refused');

  r = await call(order, { initData: A, type: 'viloyat', items, name: 'Ali Valiyev', ...det });
  assert.strictEqual(r.code, 200); assert.ok(r.body.pending && r.body.id);
  const id = r.body.id, o = tables.orders[0];
  assert.strictEqual(o.status, 'awaiting_payment'); assert.strictEqual(o.delivery_fee, 35000); assert.strictEqual(o.pay, 'prepaid');
  assert.strictEqual(o.region, REGIONS[3]); assert.strictEqual(o.district, 'Marg‘ilon'); assert.strictEqual(o.recipient_phone, '998901234567'); assert.strictEqual(o.phone, '998901112233');
  assert.ok(!calls.some((c) => c.m === 'sendMessage' && c.b.chat_id === '-100777'));
  ok('details are saved with the order, fee 35 000, verified phone kept, nothing sent to staff before payment');

  r = await call(pay, { initData: B, id }); assert.strictEqual(r.code, 404); ok('another customer cannot pay this order');
  r = await call(pay, { initData: A, id }); assert.strictEqual(r.code, 200); assert.strictEqual(o.status, 'new'); assert.ok(o.paid_at);
  const g = calls.find((c) => c.m === 'sendMessage' && c.b.chat_id === '-100777');
  assert.ok(g && g.b.text.includes('BTS Express') && g.b.text.includes('Marg‘ilon') && g.b.text.includes('To‘langan') && g.b.text.includes('+998 90 123 45 67'));
  ok('after payment the order reaches the staff group with BTS Express, region and the recipient phone');
  const sent = calls.filter((c) => c.b.chat_id === '-100777').length;
  r = await call(pay, { initData: A, id }); assert.strictEqual(r.code, 200); assert.strictEqual(calls.filter((c) => c.b.chat_id === '-100777').length, sent);
  ok('paying twice does nothing more');

  r = await call(order, { initData: A, type: 'viloyat', items, name: 'Ali', ...det, phone: '' });
  assert.strictEqual(r.code, 400); ok('recipient phone is required (the shop fills it with the Telegram number, the customer may change it)');

  assert.deepStrictEqual(nextStatuses({ type: 'viloyat', status: 'awaiting_payment' }), ['cancelled']);
  assert.deepStrictEqual(nextStatuses({ type: 'viloyat', status: 'new' }), ['accepted', 'cancelled']); ok('status steps for region orders');

  const tok = (await call(admin, { action: 'login', password: 'pw-long-enough' })).body.token; const H = { 'x-admin-token': tok };
  r = await call(admin, { action: 'status', id, status: 'accepted' }, H); assert.strictEqual(r.code, 200);
  const before = calls.length;
  r = await call(admin, { action: 'status', id, status: 'on_way', track: 'BTS-778812' }, H); assert.strictEqual(r.code, 200); assert.strictEqual(o.bts_track, 'BTS-778812');
  const note = calls.slice(before).find((c) => c.m === 'sendMessage' && c.b.chat_id === 501);
  assert.ok(note && note.b.text.includes('BTS Express') && note.b.text.includes('BTS-778812')); ok('sending via BTS saves the tracking number and tells the customer');
  r = await call(orders, { initData: A }); assert.strictEqual(r.body.orders[0].track, 'BTS-778812'); ok('customer sees the tracking number in My orders');

  r = await call(order, { initData: B, type: 'viloyat', items, name: 'Vali', ...det }); const id2 = r.body.id;
  tables.orders.find((x) => x.id === id2).created_at = new Date(Date.now() - 31 * 60000).toISOString();
  await call(admin, { action: 'list' }, H);
  assert.strictEqual(tables.orders.find((x) => x.id === id2).status, 'cancelled'); ok('unpaid order older than 30 min is cancelled automatically');

  process.env.DEMO_PAYMENTS = 'off';
  r = await call(order, { initData: B, type: 'viloyat', items, name: 'Vali', ...det }); r = await call(pay, { initData: B, id: r.body.id });
  assert.strictEqual(r.code, 501); ok('demo payment can be switched off');
  console.log('\nRegion delivery checks passed');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
