'use strict';
const { colorName } = require('./catalog');
const { formatPhone } = require('./common');

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' so‘m';
const orderNo = (id) => 'NM-' + (1000 + Number(id));

const STATUS = {
  new: '🆕 Yangi',
  accepted: '✅ Qabul qilindi',
  on_way: '🛵 Yo‘lda',
  delivered: '📦 Yetkazildi',
  cancelled: '❌ Bekor qilindi',
};
const PAY = { cash: 'Naqd pul', card: 'Karta (yetkazilganda)', online: 'Click / Payme (demo)' };

/* Which statuses may follow the current one. Pickup orders skip "on the way". */
function nextStatuses(order) {
  if (order.type === 'pickup') {
    return { new: ['accepted', 'cancelled'], accepted: ['delivered', 'cancelled'] }[order.status] || [];
  }
  return {
    new: ['accepted', 'cancelled'],
    accepted: ['on_way', 'cancelled'],
    on_way: ['delivered', 'cancelled'],
  }[order.status] || [];
}

function orderText(o) {
  const items = (o.items || [])
    .map((l) => `• ${l.qty} × ${esc(l.name)}${l.size ? ' · ' + esc(l.size) : ''} · ${esc(colorName(l.color))}`)
    .join('\n');
  const where =
    o.type === 'pickup'
      ? '🏬 Olib ketish (do‘kondan)'
      : `🚚 Kuryer\n📍 ${esc(o.address)}\n🗺 <a href="https://yandex.com/maps/?pt=${o.lon},${o.lat}&amp;z=17&amp;l=map">Yandex</a> · ` +
        `<a href="https://www.google.com/maps?q=${o.lat},${o.lon}">Google</a> · ` +
        `<a href="https://www.openstreetmap.org/?mlat=${o.lat}&amp;mlon=${o.lon}#map=18/${o.lat}/${o.lon}">OSM</a>`;
  return (
    `🛍 <b>Buyurtma ${orderNo(o.id)}</b>\n` +
    `👤 ${esc(o.name)}\n📞 ${esc(formatPhone(o.phone))}\n\n` +
    `${items}\n\n${where}\n💳 ${PAY[o.pay] || esc(o.pay)}\n` +
    `💰 <b>${money(o.total)}</b> (yetkazish: ${o.delivery_fee ? money(o.delivery_fee) : 'bepul'})${o.discount ? `\n🏷 ${esc(o.promo)}: −${money(o.discount)}` : ''}\n\n` +
    `Holat: <b>${STATUS[o.status] || esc(o.status)}</b>${o.handled_by ? ' — ' + esc(o.handled_by) : ''}`
  );
}

function keyboard(o) {
  const label = {
    accepted: '✅ Qabul qilish',
    on_way: '🛵 Yo‘lda',
    delivered: o.type === 'pickup' ? '📦 Topshirildi' : '📦 Yetkazildi',
    cancelled: '❌ Bekor qilish',
  };
  const buttons = nextStatuses(o).map((s) => ({ text: label[s], callback_data: `st:${o.id}:${s}` }));
  return { inline_keyboard: buttons.length ? [buttons] : [] };
}

/* Messages sent to the customer when staff change the status. */
const CUSTOMER_NOTE = {
  accepted: { uz: (n) => `✅ ${n} buyurtmangiz qabul qilindi.`, ru: (n) => `✅ Ваш заказ ${n} принят.` },
  on_way: { uz: (n) => `🛵 ${n} buyurtmangiz yo‘lda.`, ru: (n) => `🛵 Ваш заказ ${n} в пути.` },
  delivered: {
    uz: (n) => `📦 ${n} buyurtma topshirildi. Xaridingiz uchun rahmat!`,
    ru: (n) => `📦 Заказ ${n} выдан. Спасибо за покупку!`,
  },
  cancelled: {
    uz: (n) => `❌ ${n} buyurtma bekor qilindi. Savollar bo‘lsa, biz bilan bog‘laning.`,
    ru: (n) => `❌ Заказ ${n} отменён. Если есть вопросы, свяжитесь с нами.`,
  },
};

module.exports = { orderText, keyboard, nextStatuses, orderNo, money, CUSTOMER_NOTE };
