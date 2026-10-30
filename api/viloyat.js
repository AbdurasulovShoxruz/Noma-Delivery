'use strict';
/* Step 2 of a region order: after payment the customer sends region, district, name, phone and address.
   Only then the order reaches the staff group. */
const { env, tg, getOrder, patchOrder, verifyInitData, normalizePhone } = require('../lib/common');
const { REGIONS } = require('../lib/catalog');
const { orderText, keyboard, orderNo } = require('../lib/render');

const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const b = req.body || {};
  const user = verifyInitData(b.initData);
  if (!user) return res.status(401).json({ error: 'bad_init_data' });
  try {
    const o = await getOrder(Number(b.id));
    if (!o || String(o.telegram_id) !== String(user.id) || o.type !== 'viloyat') return res.status(404).json({ error: 'not_found' });
    if (o.status !== 'paid') return res.status(409).json({ error: o.status === 'awaiting_payment' ? 'not_paid' : 'already_sent' });
    const region = REGIONS.includes(b.region) ? b.region : null;
    const district = clean(b.tuman, 60), address = clean(b.address, 200), name = clean(b.name, 60);
    const phone = normalizePhone('998' + String(b.phone || '').replace(/\D/g, '').slice(-9));
    if (!region || district.length < 2 || address.length < 3 || name.length < 2 || !phone) return res.status(400).json({ error: 'bad_details' });
    const u = await patchOrder(o.id, { region, district, address, name, recipient_phone: phone, status: 'new' }, 'paid');
    if (!u) return res.status(409).json({ error: 'already_sent' });
    if (env('STAFF_CHAT_ID')) {
      const m = await tg('sendMessage', { chat_id: env('STAFF_CHAT_ID'), text: orderText(u), parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: keyboard(u) });
      if (m.ok) await patchOrder(u.id, { group_message_id: m.result.message_id }).catch(() => {});
    }
    const no = orderNo(u.id), lang = u.lang === 'ru' ? 'ru' : 'uz';
    await tg('sendMessage', { chat_id: user.id, text: lang === 'ru'
      ? `🛍 Заказ ${no} принят. Доставка по регионам через BTS Express; номер отслеживания пришлём здесь.`
      : `🛍 ${no} buyurtma qabul qilindi. Viloyatga BTS Express orqali yuboriladi; kuzatuv raqamini shu yerga yuboramiz.` });
    return res.status(200).json({ ok: true, no });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server' });
  }
};
