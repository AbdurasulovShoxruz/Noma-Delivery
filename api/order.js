'use strict';
/* Creates an order: checks the Telegram signature, requires a verified phone, prices the cart on the server,
   saves it, posts it to the staff group (with status buttons and a map pin) and confirms to the customer. */
const { env, tg, verifyInitData, getCustomer, insertOrder, patchOrder } = require('../lib/common');
const { priceOrder, inZone } = require('../lib/catalog');
const { orderText, keyboard, orderNo, money } = require('../lib/render');

const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const b = req.body || {};
  const user = verifyInitData(b.initData);
  if (!user) return res.status(401).json({ error: 'bad_init_data' });

  try {
    const customer = await getCustomer(user.id);
    if (!customer) return res.status(403).json({ error: 'not_verified' });

    const type = b.type === 'pickup' ? 'pickup' : 'courier';
    let priced;
    try {
      priced = priceOrder(b.items, type);
    } catch (e) {
      return res.status(400).json({ error: 'bad_items' });
    }
    const pay = ['cash', 'card', 'online'].includes(b.pay) ? b.pay : 'cash';

    let lat = null, lon = null, address = null;
    if (type === 'courier') {
      lat = Number(b.lat);
      lon = Number(b.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: 'bad_location' });
      if (!inZone(lat, lon)) return res.status(400).json({ error: 'outside_zone' });
      address = clean(b.address, 200);
      if (!address) return res.status(400).json({ error: 'bad_address' });
    }
    const name = clean(b.name, 60) || customer.first_name || '—';
    const lang = b.lang === 'ru' ? 'ru' : 'uz';

    const order = await insertOrder({
      telegram_id: user.id,
      name,
      phone: customer.phone, // always the verified number, never one sent by the browser
      type, address, lat, lon, pay,
      items: priced.lines,
      subtotal: priced.subtotal,
      delivery_fee: priced.fee,
      total: priced.total,
      status: 'new',
      lang,
    });

    if (env('STAFF_CHAT_ID')) {
      const m = await tg('sendMessage', {
        chat_id: env('STAFF_CHAT_ID'),
        text: orderText(order),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: keyboard(order),
      });
      if (m.ok) {
        await patchOrder(order.id, { group_message_id: m.result.message_id }).catch(() => {});
        if (type === 'courier') {
          await tg('sendLocation', {
            chat_id: env('STAFF_CHAT_ID'), latitude: lat, longitude: lon, reply_to_message_id: m.result.message_id,
          });
        }
      }
    }

    const no = orderNo(order.id);
    const text =
      lang === 'ru'
        ? `🛍 Заказ ${no} принят. Сумма: ${money(order.total).replace('so‘m', 'сум')}. Мы сообщим о статусе здесь.`
        : `🛍 ${no} buyurtma qabul qilindi. Summa: ${money(order.total)}. Holat haqida shu yerda xabar beramiz.`;
    await tg('sendMessage', { chat_id: user.id, text });

    return res.status(200).json({ ok: true, no, total: order.total });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server' });
  }
};
