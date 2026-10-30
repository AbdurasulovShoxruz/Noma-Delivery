'use strict';
/* DEMO payment for region (viloyat) orders: marks the customer's own order as paid.
   REAL PROJECTS: remove this and set status 'paid' (+ paid_at) from the Click / Payme server callback instead,
   after checking the amount. Set DEMO_PAYMENTS=off in Vercel to switch this demo endpoint off. */
const { env, tg, expireUnpaid, getOrder, patchOrder, verifyInitData } = require('../lib/common');
const { orderNo } = require('../lib/render');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const b = req.body || {};
  const user = verifyInitData(b.initData);
  if (!user) return res.status(401).json({ error: 'bad_init_data' });
  if (env('DEMO_PAYMENTS') === 'off') return res.status(501).json({ error: 'payments_not_connected' });
  try {
    await expireUnpaid();
    const o = await getOrder(Number(b.id));
    if (!o || String(o.telegram_id) !== String(user.id) || o.type !== 'viloyat') return res.status(404).json({ error: 'not_found' });
    if (o.status === 'cancelled') return res.status(410).json({ error: 'expired' });
    if (o.status !== 'awaiting_payment') return res.status(200).json({ ok: true, status: o.status }); // already paid
    const u = await patchOrder(o.id, { status: 'paid', paid_at: new Date().toISOString() }, 'awaiting_payment');
    if (!u) return res.status(409).json({ error: 'changed' });
    const lang = o.lang === 'ru' ? 'ru' : 'uz';
    await tg('sendMessage', { chat_id: user.id, text: lang === 'ru'
      ? `💳 Оплата заказа ${orderNo(o.id)} получена. Заполните данные доставки в приложении (BTS Express).`
      : `💳 ${orderNo(o.id)} buyurtma uchun to‘lov qabul qilindi. Ilovada yetkazib berish ma’lumotlarini to‘ldiring (BTS Express).` });
    return res.status(200).json({ ok: true, status: 'paid' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server' });
  }
};
