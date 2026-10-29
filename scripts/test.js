'use strict';
/* Integration test with a fake Telegram and a fake Supabase. Run: node scripts/test.js */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.SUPABASE_URL = 'https://sb.test';
process.env.SUPABASE_SERVICE_KEY = 'sb_secret_test';
process.env.STAFF_CHAT_ID = '-100777';
process.env.WEBHOOK_SECRET = 'sec';
process.env.BOT_USERNAME = 'noma_test_bot';

/* ---------- fakes ---------- */
const tables = { customers: [], orders: [] };
let orderSeq = 0, msgSeq = 100;
const calls = [];
const reply = (body, status = 200) => ({
  ok: status < 400, status,
  text: async () => JSON.stringify(body), json: async () => body,
});

global.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.startsWith('https://api.telegram.org/')) {
    const method = url.split('/').pop();
    const body = JSON.parse(opts.body || '{}');
    calls.push({ method, body });
    return reply({ ok: true, result: method === 'sendMessage' ? { message_id: ++msgSeq } : true });
  }
  if (url.startsWith('https://sb.test/rest/v1/')) {
    const [table, qs = ''] = url.replace('https://sb.test/rest/v1/', '').split('?');
    const q = new URLSearchParams(qs);
    const rows = tables[table];
    const filters = [...q.entries()].filter(([, v]) => v.startsWith('eq.'));
    const match = (r) => filters.every(([k, v]) => String(r[k]) === v.slice(3));
    const body = opts.body ? JSON.parse(opts.body) : null;
    if (!opts.method || opts.method === 'GET') return reply(rows.filter(match));
    if (opts.method === 'POST') {
      if (table === 'customers') {
        const i = rows.findIndex((r) => r.telegram_id === body.telegram_id);
        if (i >= 0) rows[i] = { ...rows[i], ...body }; else rows.push({ ...body });
        return reply([rows.find((r) => r.telegram_id === body.telegram_id)]);
      }
      const row = { id: ++orderSeq, created_at: new Date().toISOString(), handled_by: null, ...body };
      rows.push(row);
      return reply([row]);
    }
    if (opts.method === 'PATCH') {
      const hit = rows.filter(match);
      hit.forEach((r) => Object.assign(r, body));
      return reply(hit);
    }
  }
  throw new Error('unexpected fetch ' + url);
};

const mkRes = () => ({
  code: 200, body: null,
  status(c) { this.code = c; return this; },
  json(o) { this.body = o; return this; },
  send(s) { this.body = s; return this; },
});
const sign = (user, extra = {}) => {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'AAH', user: JSON.stringify(user), ...extra });
  const check = [...params.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
  params.set('hash', crypto.createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
};

const common = require('../lib/common');
const bot = require('../api/bot');
const me = require('../api/me');
const order = require('../api/order');
const { priceOrder } = require('../lib/catalog');

const U = { id: 555, first_name: 'Aziza', language_code: 'uz' };
const call = async (h, body, headers = {}) => { const r = mkRes(); await h({ method: 'POST', headers, body }, r); return r; };
const hook = (update) => call(bot, update, { 'x-telegram-bot-api-secret-token': 'sec' });
const last = (m) => [...calls].reverse().find((c) => c.method === m);
let n = 0;
const ok = (name) => console.log(`  ok ${++n} ${name}`);

(async () => {
  /* initData */
  assert(common.verifyInitData(sign(U)), 'valid initData accepted'); ok('valid initData accepted');
  assert.strictEqual(common.verifyInitData(sign(U).replace('Aziza', 'Hacker')), null); ok('tampered initData rejected');
  assert.strictEqual(common.verifyInitData(sign(U, { auth_date: '1000' })), null); ok('expired initData rejected');

  /* webhook secret */
  assert.strictEqual((await call(bot, {}, { 'x-telegram-bot-api-secret-token': 'wrong' })).code, 401); ok('webhook rejects wrong secret');

  /* not verified yet */
  let r = await call(me, { initData: sign(U) });
  assert.deepStrictEqual([r.code, r.body.verified], [200, false]); ok('/api/me: not verified at first');
  r = await call(order, { initData: sign(U), items: [{ id: 3, size: 'M', color: 0, qty: 1 }], type: 'pickup' });
  assert.deepStrictEqual([r.code, r.body.error], [403, 'not_verified']); ok('/api/order refuses unverified customer');

  /* /start asks for the contact */
  await hook({ message: { chat: { id: 555, type: 'private' }, from: U, text: '/start' } });
  assert(last('sendMessage').body.reply_markup.keyboard[0][0].request_contact); ok('/start shows share-number button');

  /* contact checks */
  const contact = (c) => ({ message: { chat: { id: 555, type: 'private' }, from: U, contact: c } });
  await hook(contact({ phone_number: '+998901234567', user_id: 999 }));
  assert.strictEqual(tables.customers.length, 0); ok("someone else's contact rejected");
  await hook(contact({ phone_number: '+12025550123', user_id: 555 }));
  assert.strictEqual(tables.customers.length, 0); ok('non-Uzbek number rejected');
  await hook(contact({ phone_number: '998901234567', user_id: 555 }));
  assert.strictEqual(tables.customers[0].phone, '998901234567'); ok('own Uzbek number verified and saved');
  r = await call(me, { initData: sign(U) });
  assert.deepStrictEqual([r.body.verified, r.body.phone], [true, '998901234567']); ok('/api/me: verified');

  /* order validation */
  const base = { initData: sign(U), type: 'courier', lat: 41.3, lon: 69.25, address: 'Chilonzor 5', name: 'Aziza K.', pay: 'cash', lang: 'uz' };
  r = await call(order, { ...base, items: [{ id: 3, size: 'M', color: 0, qty: 0 }] });
  assert.strictEqual(r.body.error, 'bad_items'); ok('quantity 0 rejected');
  r = await call(order, { ...base, items: [{ id: 3, size: 'XXL', color: 0, qty: 1 }] });
  assert.strictEqual(r.body.error, 'bad_items'); ok('unknown size rejected');
  r = await call(order, { ...base, items: [{ id: 99, size: 'M', color: 0, qty: 1 }] });
  assert.strictEqual(r.body.error, 'bad_items'); ok('unknown product rejected');
  r = await call(order, { ...base, lat: 40.1, lon: 64.0, items: [{ id: 4, size: 'M', color: 0, qty: 1 }] });
  assert.strictEqual(r.body.error, 'outside_zone'); ok('location outside Tashkent rejected');
  r = await call(order, { ...base, address: '  ', items: [{ id: 4, size: 'M', color: 0, qty: 1 }] });
  assert.strictEqual(r.body.error, 'bad_address'); ok('empty address rejected');

  /* a real order; the browser tries to cheat with its own price/phone */
  calls.length = 0;
  r = await call(order, {
    ...base, phone: '998000000000',
    items: [{ id: 12, size: null, color: 0, qty: 1, price: 1 }],
  });
  assert.strictEqual(r.code, 200); assert.strictEqual(r.body.no, 'NM-1001');
  assert.strictEqual(tables.orders[0].total, 124000); // 99 000 + 25 000 delivery, price from the server
  assert.strictEqual(tables.orders[0].phone, '998901234567'); // verified phone, not the one sent
  ok('order priced on the server, verified phone used');
  const staff = calls.find((c) => c.method === 'sendMessage' && String(c.body.chat_id) === '-100777');
  assert(staff.body.text.includes('NM-1001') && staff.body.text.includes('+998 90 123 45 67') && staff.body.text.includes('Chilonzor 5'));
  assert(staff.body.reply_markup.inline_keyboard[0].length === 2); ok('staff group message with buttons');
  const loc = last('sendLocation');
  assert.deepStrictEqual([loc.body.latitude, loc.body.longitude], [41.3, 69.25]); ok('map pin sent to staff group');
  assert(calls.some((c) => c.method === 'sendMessage' && c.body.chat_id === 555)); ok('customer receives confirmation');

  r = await call(order, { ...base, items: [{ id: 3, size: 'M', color: 0, qty: 1 }] });
  assert.strictEqual(tables.orders[1].delivery_fee, 0); ok('free delivery over 500 000');

  /* staff buttons */
  const press = (data, chat = -100777) => hook({ callback_query: { id: 'cb', data, from: { id: 1, first_name: 'Dilnoza' }, message: { chat: { id: chat }, message_id: 101 } } });
  calls.length = 0;
  await press('st:1:accepted', -100999);
  assert.strictEqual(tables.orders[0].status, 'new'); ok('buttons outside staff group ignored');
  await press('st:1:delivered');
  assert.strictEqual(tables.orders[0].status, 'new'); ok('cannot skip statuses');
  await press('st:1:accepted');
  assert.strictEqual(tables.orders[0].status, 'accepted');
  assert.strictEqual(tables.orders[0].handled_by, 'Dilnoza');
  assert(last('editMessageText').body.text.includes('Qabul qilindi'));
  assert(calls.some((c) => c.method === 'sendMessage' && c.body.chat_id === 555 && c.body.text.includes('qabul qilindi'))); ok('accept: message edited, customer notified');
  await press('st:1:on_way'); await press('st:1:delivered');
  assert.strictEqual(tables.orders[0].status, 'delivered');
  assert.deepStrictEqual(last('editMessageText').body.reply_markup.inline_keyboard, []); ok('delivered: buttons removed');

  /* chat id helper */
  calls.length = 0;
  await hook({ message: { chat: { id: -100777, type: 'group' }, from: { id: 1 }, text: '/chatid' } });
  assert(last('sendMessage').body.text.includes('-100777')); ok('/chatid works in a group');

  /* catalog parity with index.html */
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const src = /const P = (\[[\s\S]*?\n\]);/.exec(html)[1];
  const P = new Function('CL', 'SH', 'return ' + src)(['XS', 'S', 'M', 'L', 'XL'], require('../lib/catalog').SH);
  const { CATALOG } = require('../lib/catalog');
  assert.strictEqual(P.length, Object.keys(CATALOG).length);
  for (const p of P) {
    const c = CATALOG[p.id];
    assert(c, 'id ' + p.id);
    assert.strictEqual(c.price, p.price, 'price ' + p.id);
    assert.deepStrictEqual(c.colors, p.colors, 'colors ' + p.id);
    assert.deepStrictEqual(c.sizes, p.sizes, 'sizes ' + p.id);
    assert.strictEqual(c.uz, p.name.uz, 'name ' + p.id);
  }
  ok('server catalog matches index.html');
  console.log(`\nAll ${n} checks passed`);
})().catch((e) => { console.error('\nFAILED', e); process.exit(1); });
