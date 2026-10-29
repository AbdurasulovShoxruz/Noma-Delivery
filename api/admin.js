'use strict';
/* Admin panel API. Login with ADMIN_PASSWORD (set in Vercel); returns a signed 12-hour token. */
const crypto = require('crypto');
const { env, tg, db, getOrder, patchOrder, clearShop } = require('../lib/common');
const { CATALOG, ARTS, MATS, CATS, SUBS, CL, SH, paletteFrom } = require('../lib/catalog');
const HEX = /^#[0-9A-Fa-f]{6}$/;
const colorRows = () => db('shop_colors?select=*&order=pos,hex').catch(() => null);
const { orderText, keyboard, nextStatuses, orderNo, CUSTOMER_NOTE } = require('../lib/render');

const key = () => crypto.createHash('sha256').update(`${env('ADMIN_PASSWORD')}|${env('WEBHOOK_SECRET')}`).digest();
const sign = (p) => crypto.createHmac('sha256', key()).update(p).digest('hex');
const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const makeToken = () => { const exp = String(Date.now() + 12 * 3600e3); return `${exp}.${sign(exp)}`; };
const okToken = (t) => {
  const [exp, sig] = String(t || '').split('.');
  return !!(env('ADMIN_PASSWORD') && exp && sig && Number(exp) > Date.now() && same(sig, sign(exp)));
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  if (!env('ADMIN_PASSWORD')) return res.status(503).json({ error: 'no_admin_password' });
  const b = req.body || {};
  try {
    if (b.action === 'login') {
      await new Promise((r) => setTimeout(r, 400)); // slows down guessing
      const given = crypto.createHash('sha256').update(String(b.password || '')).digest('hex');
      const real = crypto.createHash('sha256').update(env('ADMIN_PASSWORD')).digest('hex');
      return same(given, real) ? res.status(200).json({ token: makeToken() }) : res.status(401).json({ error: 'bad_password' });
    }
    if (!okToken(req.headers['x-admin-token'])) return res.status(401).json({ error: 'unauthorized' });

    if (b.action === 'list') {
      const [orders, customers, products, promos, crows] = await Promise.all([
        db('orders?select=*&order=created_at.desc&limit=500'),
        db('customers?select=telegram_id,phone,first_name,username,verified_at&order=verified_at.desc&limit=500'),
        db('shop_products?select=*&order=id').catch(() => null),
        db('promos?select=*&order=code').catch(() => null),
        colorRows(),
      ]);
      const catalog = Object.entries(CATALOG).map(([id, p]) => ({ id: +id, name: p.uz, price: p.price }));
      return res.status(200).json({ orders: orders || [], customers: customers || [], catalog, products, promos: promos || [], opts: { ARTS, MATS, CATS, SUBS, SIZES: { clothing: CL, shoes: SH }, COLORS: paletteFrom(crows), COLORS_DB: crows !== null } });
    }

    if (b.action === 'status') {
      const order = await getOrder(Number(b.id));
      if (!order) return res.status(404).json({ error: 'not_found' });
      if (!nextStatuses(order).includes(b.status)) return res.status(409).json({ error: 'bad_transition' });
      const u = await patchOrder(order.id, { status: b.status, handled_by: 'Admin panel' }, order.status);
      if (!u) return res.status(409).json({ error: 'changed' });
      if (env('STAFF_CHAT_ID') && u.group_message_id) {
        await tg('editMessageText', {
          chat_id: env('STAFF_CHAT_ID'), message_id: u.group_message_id, text: orderText(u),
          parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: keyboard(u),
        });
      }
      await tg('sendMessage', { chat_id: u.telegram_id, text: CUSTOMER_NOTE[b.status][u.lang === 'ru' ? 'ru' : 'uz'](orderNo(u.id)) });
      return res.status(200).json({ ok: true, order: u });
    }
    if (b.action === 'product_save') {
      const p = b.product || {};
      const int = (v, lo, hi) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };
      const name = { uz: String(p.name && p.name.uz || '').trim().slice(0, 60), ru: String(p.name && p.name.ru || '').trim().slice(0, 60) };
      const palette = paletteFrom(await colorRows());
      const colors = (Array.isArray(p.colors) ? p.colors : []).filter((h) => palette[h]).slice(0, 6);
      const price = int(p.price, 1000, 100000000), sale = int(p.sale || 0, 0, 90);
      const stock = p.stock === null || p.stock === '' || p.stock === undefined ? null : int(p.stock, 0, 100000);
      if (!name.uz || !name.ru || price === null || sale === null || (p.stock !== null && p.stock !== '' && p.stock !== undefined && stock === null) ||
          !colors.length || !CATS.includes(p.cat) || !ARTS.includes(p.art) || !MATS.includes(p.mat)) return res.status(400).json({ error: 'bad_product' });
      const base = `${env('SUPABASE_URL')}/storage/v1/object/public/products/`;
      const photos = (Array.isArray(p.photos) ? p.photos : [])
        .map((x) => (typeof x === 'string' ? { u: x, c: null } : x))
        .filter((x) => x && typeof x.u === 'string' && x.u.startsWith(base))
        .map((x) => ({ u: x.u, c: colors.includes(x.c) ? x.c : null }))   // colour tag must be one of the product's colours
        .slice(0, 12);
      const kind = p.sizes === 'shoes' ? SH : p.sizes === 'clothing' || p.sizes === true ? CL : null;
      let size_stock = null;
      if (kind && p.size_stock && typeof p.size_stock === 'object') {
        size_stock = {};
        for (const s of kind) {
          const v = p.size_stock[s], n = v === '' || v == null ? 0 : Number(v);
          if (!Number.isInteger(n) || n < 0 || n > 100000) return res.status(400).json({ error: 'bad_product' });
          size_stock[s] = n;
        }
      }
      const mt = p.mat_text || {};
      const mat_text = p.mat === 'other' ? { uz: String(mt.uz || '').trim().slice(0, 40), ru: String(mt.ru || '').trim().slice(0, 40) } : null;
      if (mat_text && (!mat_text.uz || !mat_text.ru)) return res.status(400).json({ error: 'bad_product' });
      const finalStock = size_stock ? Object.values(size_stock).reduce((a, b) => a + b, 0) : stock;
      let id = int(p.id, 1, 1e6);
      if (!id) { const all = (await db('shop_products?select=id')) || []; id = Math.max(99, ...all.map((r) => r.id)) + 1; }
      await db('shop_products?on_conflict=id', { method: 'POST', prefer: 'resolution=merge-duplicates',
        body: { id, name, cat: p.cat, art: p.art, mat: p.mat, price, sale, stock: finalStock, size_stock, mat_text, is_new: p.is_new === true, active: p.active !== false, sizes: p.sizes === 'shoes' ? SH : p.sizes === 'clothing' || p.sizes === true ? CL : null, colors, sub: SUBS.includes(p.sub) ? p.sub : null, photos } });
      clearShop();
      return res.status(200).json({ ok: true });
    }
    if (b.action === 'photo_upload') {
      const buf = Buffer.from(String(b.data || ''), 'base64');
      if (buf.length < 500 || buf.length > 1.5e6 || buf[0] !== 0xff || buf[1] !== 0xd8) return res.status(400).json({ error: 'bad_image' });
      const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`, k = env('SUPABASE_SERVICE_KEY');
      const headers = { apikey: k, 'content-type': 'image/jpeg', 'x-upsert': 'true' };
      if (k && k.startsWith('eyJ')) headers.Authorization = `Bearer ${k}`;
      const r = await fetch(`${env('SUPABASE_URL')}/storage/v1/object/products/${name}`, { method: 'POST', headers, body: buf });
      if (!r.ok) { console.error('upload', r.status, await r.text()); return res.status(502).json({ error: 'upload_failed' }); }
      return res.status(200).json({ url: `${env('SUPABASE_URL')}/storage/v1/object/public/products/${name}` });
    }
    if (b.action === 'product_delete') {
      await db(`shop_products?id=eq.${Number(b.id) | 0}`, { method: 'DELETE' }); clearShop();
      return res.status(200).json({ ok: true });
    }
    if (b.action === 'color_save') {
      const rows = await colorRows();
      if (rows === null) return res.status(503).json({ error: 'no_colors_table' });
      const hex = String(b.hex || '').toUpperCase(), old = b.old_hex ? String(b.old_hex).toUpperCase() : null;
      const name = String(b.name || '').trim().slice(0, 30);
      if (!HEX.test(hex) || !name) return res.status(400).json({ error: 'bad_color' });
      const have = rows.find((r) => r.hex === hex), prev = old && rows.find((r) => r.hex === old);
      if (old && !prev) return res.status(404).json({ error: 'not_found' });
      if (!old && have) return res.status(409).json({ error: 'exists' });
      if (old && hex !== old && have) return res.status(409).json({ error: 'exists' });
      if (!old && rows.length >= 60) return res.status(400).json({ error: 'too_many' });
      const pos = prev ? prev.pos : Math.max(0, ...rows.map((r) => r.pos || 0)) + 1;
      await db('shop_colors?on_conflict=hex', { method: 'POST', prefer: 'resolution=merge-duplicates', body: { hex, name, pos } });
      if (old && hex !== old) {
        // the shade itself changed: move every product (and its photo tags) from the old shade to the new one
        const prods = (await db('shop_products?select=id,colors,photos').catch(() => [])) || [];
        for (const r of prods.filter((x) => Array.isArray(x.colors) && x.colors.includes(old))) {
          await db(`shop_products?id=eq.${r.id}`, { method: 'PATCH', body: {
            colors: r.colors.map((h) => (h === old ? hex : h)),
            photos: (r.photos || []).map((x) => (x && typeof x === 'object' && x.c === old ? { ...x, c: hex } : x)),
          } });
        }
        await db(`shop_colors?hex=eq.${encodeURIComponent(old)}`, { method: 'DELETE' });
        clearShop();
      }
      return res.status(200).json({ ok: true });
    }
    if (b.action === 'color_delete') {
      const rows = await colorRows();
      if (rows === null) return res.status(503).json({ error: 'no_colors_table' });
      const hex = String(b.hex || '').toUpperCase();
      if (!rows.some((r) => r.hex === hex)) return res.status(404).json({ error: 'not_found' });
      if (rows.length <= 1) return res.status(400).json({ error: 'last_color' });
      const prods = (await db('shop_products?select=id,name,colors').catch(() => [])) || [];
      const used = prods.filter((x) => Array.isArray(x.colors) && x.colors.includes(hex));
      if (used.length) return res.status(409).json({ error: 'color_in_use', products: used.map((x) => (x.name && x.name.uz) || '#' + x.id) });
      await db(`shop_colors?hex=eq.${encodeURIComponent(hex)}`, { method: 'DELETE' });
      return res.status(200).json({ ok: true });
    }
    if (b.action === 'promo_save') {
      const code = String(b.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20), percent = Number(b.percent);
      if (code.length < 2 || !Number.isInteger(percent) || percent < 1 || percent > 90) return res.status(400).json({ error: 'bad_promo' });
      await db('promos?on_conflict=code', { method: 'POST', prefer: 'resolution=merge-duplicates', body: { code, percent, active: b.active !== false } });
      return res.status(200).json({ ok: true });
    }
    if (b.action === 'promo_delete') {
      await db(`promos?code=eq.${String(b.code || '').replace(/[^A-Za-z0-9]/g, '')}`, { method: 'DELETE' });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'bad_action' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server' });
  }
};
