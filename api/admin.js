'use strict';
/* Admin panel API. Login with ADMIN_PASSWORD (set in Vercel); returns a signed 12-hour token. */
const crypto = require('crypto');
const { env, tg, db, getOrder, patchOrder } = require('../lib/common');
const { CATALOG } = require('../lib/catalog');
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
      const [orders, customers] = await Promise.all([
        db('orders?select=*&order=created_at.desc&limit=500'),
        db('customers?select=telegram_id,phone,first_name,username,verified_at&order=verified_at.desc&limit=500'),
      ]);
      const catalog = Object.entries(CATALOG).map(([id, p]) => ({ id: +id, name: p.uz, price: p.price }));
      return res.status(200).json({ orders: orders || [], customers: customers || [], catalog });
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
    return res.status(400).json({ error: 'bad_action' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server' });
  }
};
