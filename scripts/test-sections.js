'use strict';
/* Sections (categories) managed in the admin panel + custom sizes. Run: node scripts/test-sections.js */
const assert = require('assert');
process.env.ADMIN_PASSWORD = 'pw'; process.env.WEBHOOK_SECRET = 's'; process.env.SUPABASE_URL = 'http://sb'; process.env.SUPABASE_SERVICE_KEY = 'k'; process.env.BOT_TOKEN = 'x';
let secs = [
  { key: 'women', kind: 'cat', uz: 'Ayollar', ru: 'Женское', pos: 1 }, { key: 'men', kind: 'cat', uz: 'Erkaklar', ru: 'Мужское', pos: 2 },
  { key: 'tops', kind: 'sub', uz: 'Ustki kiyim', ru: 'Верх', pos: 3 }, { key: 'bags', kind: 'sub', uz: 'Sumkalar', ru: 'Сумки', pos: 4 },
];
let prods = [{ id: 1, name: { uz: 'Ko\u2018ylak' }, cat: 'women', sub: 'tops' }];
let saved = null;
const ok = (j) => ({ ok: true, status: 200, text: async () => (j === undefined ? '' : JSON.stringify(j)) });
global.fetch = async (url, o = {}) => {
  const u = new URL(String(url).replace('http://sb/rest/v1/', 'http://x/')), p = u.pathname.slice(1), m = o.method || 'GET', b = o.body ? JSON.parse(o.body) : null;
  if (p === 'shop_sections') {
    if (m === 'GET') return ok([...secs].sort((a, c) => a.pos - c.pos));
    if (m === 'POST') { (Array.isArray(b) ? b : [b]).forEach((r) => { const i = secs.findIndex((x) => x.key === r.key); i >= 0 ? (secs[i] = r) : secs.push(r); }); return ok(); }
    if (m === 'PATCH') { const k = decodeURIComponent(u.searchParams.get('key').slice(3)); Object.assign(secs.find((x) => x.key === k), b); return ok(); }
    if (m === 'DELETE') { const k = decodeURIComponent(u.searchParams.get('key').slice(3)); secs = secs.filter((x) => x.key !== k); return ok(); }
  }
  if (p === 'shop_products') {
    if (m === 'POST') { saved = b; return ok(); }
    return ok(prods);
  }
  return ok([]);
};
const admin = require('../api/admin');
const call = async (body, tok) => { const out = {}; const res = { status(c) { out.c = c; return this; }, json(j) { out.j = j; return this; } }; await admin({ method: 'POST', body, headers: { 'x-admin-token': tok || '' } }, res); return out; };
const prod = (extra) => ({ id: 5, name: { uz: 'A', ru: 'B' }, cat: 'men', art: 'shirt', mat: 'linen', price: 100000, sale: 0, stock: null, colors: ['#FFFFFF'], sizes: 'none', ...extra });
(async () => {
  const tok = (await call({ action: 'login', password: 'pw' })).j.token;
  let r = await call({ action: 'section_save', kind: 'sub', uz: 'Poyabzal', ru: 'Обувь' }, tok);
  assert.strictEqual(r.c, 200); const added = secs.find((x) => x.uz === 'Poyabzal'); assert(added && /^s_/.test(added.key) && added.pos === 5); console.log('  ok add a section');
  r = await call({ action: 'section_save', kind: 'sub', uz: '', ru: 'x' }, tok); assert.strictEqual(r.c, 400); console.log('  ok empty name rejected');
  r = await call({ action: 'section_save', key: added.key, kind: 'sub', uz: 'Oyoq', ru: 'Ноги' }, tok); assert.strictEqual(secs.find((x) => x.key === added.key).uz, 'Oyoq'); console.log('  ok rename');
  r = await call({ action: 'section_move', key: added.key, dir: -1 }, tok); const subs = secs.filter((x) => x.kind === 'sub').sort((a, c) => a.pos - c.pos).map((x) => x.key);
  assert.deepStrictEqual(subs, ['tops', added.key, 'bags']); console.log('  ok move up');
  r = await call({ action: 'section_delete', key: 'tops' }, tok); assert.strictEqual(r.c, 409); assert.deepStrictEqual(r.j.products, ['Ko\u2018ylak']); console.log('  ok section with products cannot be deleted');
  r = await call({ action: 'section_delete', key: added.key }, tok); assert.strictEqual(r.c, 200); assert(!secs.some((x) => x.key === added.key)); console.log('  ok unused section deleted');
  r = await call({ action: 'section_delete', key: 'men' }, tok); assert.strictEqual(r.c, 200);
  r = await call({ action: 'section_delete', key: 'women' }, tok); assert.strictEqual(r.c, 400); assert.strictEqual(r.j.error, 'last_cat'); console.log('  ok last category is protected');
  r = await call({ action: 'list' }, tok); assert.deepStrictEqual(r.j.opts.CATS, ['women']); assert.deepStrictEqual(r.j.opts.SUBS, ['tops', 'bags']); assert.strictEqual(r.j.opts.SNAMES.tops.ru, 'Верх'); console.log('  ok list returns the saved categories and sections');
  secs.push({ key: 'men', kind: 'cat', uz: 'Erkaklar', ru: 'Мужское', pos: 9 });
  r = await call({ action: 'product_save', product: prod({ cat: 'gone' }) }, tok); assert.strictEqual(r.c, 400); console.log('  ok product with an unknown category rejected');
  r = await call({ action: 'product_save', product: prod({ sub: 'bags' }) }, tok); assert.strictEqual(r.c, 200); assert.strictEqual(saved.sub, 'bags'); console.log('  ok product saved with a chosen section');
  // custom sizes
  r = await call({ action: 'product_save', product: prod({ sizes: 'custom', custom_sizes: ' XXL, 3XL ,XXL, 4XL' }) }, tok);
  assert.strictEqual(r.c, 200); assert.deepStrictEqual(saved.sizes, ['XXL', '3XL', '4XL']); console.log('  ok custom sizes parsed (trimmed, no duplicates)');
  r = await call({ action: 'product_save', product: prod({ sizes: 'custom', custom_sizes: '47, 48', size_stock: { 47: 3, 48: '', 99: 7 } }) }, tok);
  assert.deepStrictEqual(saved.size_stock, { 47: 3, 48: 0 }); assert.strictEqual(saved.stock, 3); console.log('  ok per-size stock works for custom sizes');
  r = await call({ action: 'product_save', product: prod({ sizes: 'custom', custom_sizes: '' }) }, tok); assert.strictEqual(r.c, 400);
  r = await call({ action: 'product_save', product: prod({ sizes: 'custom', custom_sizes: 'WAYTOOLONGSIZE' }) }, tok); assert.strictEqual(r.c, 400); console.log('  ok empty / too long custom sizes rejected');
  r = await call({ action: 'product_save', product: prod({ sizes: 'shoes' }) }, tok); assert.strictEqual(saved.sizes.length, 11); console.log('  ok shoe sizes still work');
  console.log('\nSections checks passed');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
