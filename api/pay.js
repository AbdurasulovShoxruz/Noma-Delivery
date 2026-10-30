'use strict';
/* DEMO payment (Click / Payme) for region (viloyat) orders: marks the customer's own order as paid, and only then
   the order is posted to the staff group. REAL PROJECTS: remove this and do the same from the Click / Payme
   server callback instead (after checking the amount). Set DEMO_PAYMENTS=off in Vercel to switch the demo off. */
const { env, tg, expireUnpaid, getOrder, patchOrder, verifyInitData } = require('../lib/common');
const { orderText, keyboard, orderNo } = require('../lib/render');

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
    if (o.status !== 'awaiting_payment') return res.status(200).json({ ok: true, no: orderNo(o.id), status: o.status }); // already paid
    const u = await patchOrder(o.id, { status: 'new', paid_at: new Date().toISOString() }, 'awaiting_payment');
    if (!u) return res.status(409).json({ error: 'changed' });
    if (env('STAFF_CHAT_ID')) {
      const m = await tg('sendMessage', { chat_id: env('STAFF_CHAT_ID'), text: orderText(u), parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: keyboard(u) });
      if (m.ok) await patchOrder(u.id, { group_message_id: m.result.message_id }).catch(() => {});
    }
    const no = orderNo(u.id), lang = u.lang === 'ru' ? 'ru' : 'uz';
    await tg('sendMessage', { chat_id: user.id, text: lang === 'ru'
      ? `💳 Оплата получена. Заказ ${no} принят. Доставка по регионам через BTS Express; номер отслеживания пришлём здесь.`
      : `💳 To‘lov qabul qilindi. ${no} buyurtma qabul qilindi. Viloyatga BTS Express orqali yuboriladi; kuzatuv raqamini shu yerga yuboramiz.` });
    return res.status(200).json({ ok: true, no, status: 'new' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server' });
  }
};
