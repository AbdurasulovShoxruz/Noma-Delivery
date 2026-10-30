'use strict';
/* DEMO payment for region (viloyat) orders: marks the customer's own order as paid, and only then the order goes to the staff group.
   There is no real Click / Payme connection. DEMO_PAYMENTS=off in Vercel switches this demo off. */
const { env, tg, expireUnpaid, getOrder, patchOrder, verifyInitData } = require('../lib/common');
const { orderText, keyboard, orderNo } = require('../lib/render');
const { rateLimit } = require('../lib/common');

/* Marks a region order as paid and releases it to the staff group. Used by the demo payment. */
async function markPaid(o, extra) {
  const u = await patchOrder(o.id, { status: 'new', paid_at: new Date().toISOString(), ...(extra || {}) }, 'awaiting_payment');
  if (!u) return null;
  if (env('STAFF_CHAT_ID')) {
    const m = await tg('sendMessage', { chat_id: env('STAFF_CHAT_ID'), text: orderText(u), parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: keyboard(u) });
    if (m.ok) await patchOrder(u.id, { group_message_id: m.result.message_id }).catch(() => {});
  }
  const no = orderNo(u.id), lang = u.lang === 'ru' ? 'ru' : 'uz';
  await tg('sendMessage', { chat_id: u.telegram_id, text: lang === 'ru'
    ? `💳 Оплата получена. Заказ ${no} принят. Доставка по регионам через BTS Express; номер отслеживания пришлём здесь.`
    : `💳 To‘lov qabul qilindi. ${no} buyurtma qabul qilindi. Viloyatga BTS Express orqali yuboriladi; kuzatuv raqamini shu yerga yuboramiz.` });
  return u;
}

const handler = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const b = req.body || {};
  const user = verifyInitData(b.initData);
  if (!user) return res.status(401).json({ error: 'bad_init_data' });
  if (!rateLimit(`pay:${user.id}`, 20, 60000)) return res.status(429).json({ error: 'too_many' });
  try {
    await expireUnpaid();
    const o = await getOrder(Number(b.id));
    if (!o || String(o.telegram_id) !== String(user.id) || o.type !== 'viloyat') return res.status(404).json({ error: 'not_found' });
    if (o.status === 'cancelled') return res.status(410).json({ error: 'expired' });
    if (o.status !== 'awaiting_payment') return res.status(200).json({ ok: true, no: orderNo(o.id), status: o.status }); // already paid
    if (env('DEMO_PAYMENTS') === 'off') return res.status(501).json({ error: 'payments_not_connected' });
    const u = await markPaid(o);
    if (!u) return res.status(409).json({ error: 'changed' });
    return res.status(200).json({ ok: true, no: orderNo(u.id), status: 'new' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server' });
  }
};
module.exports = handler;
module.exports.markPaid = markPaid;
