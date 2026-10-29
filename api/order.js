'use strict';
/* Creates an order: checks the Telegram signature, requires a verified phone, prices the cart on the server,
   saves it, posts it to the staff group (with status buttons and a map pin) and confirms to the customer. */
const { env, tg, db, getShop, clearShop, verifyInitData, getCustomer, insertOrder, patchOrder } = require('../lib/common');
const { priceOrder, inZone, toCatalog, CATALOG } = require('../lib/catalog');
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
    const shop = await getShop();
    const cat = shop ? toCatalog(shop) : CATALOG;
    let pct = 0, promo = null;
    if (b.promo) {
      const code = String(b.promo).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
      const r = (await db(`promos?code=eq.${code}&active=eq.true&select=*`).catch(() => [])) || [];
      if (!r[0]) return res.status(400).json({ error: 'bad_promo' });
      pct = r[0].percent; promo = r[0].code;
    }
    let priced;
    try {
      priced = priceOrder(b.items, type, cat, pct);
    } catch (e) {
      return res.status(400).json({ error: e.code === 'out_of_stock' ? 'out_of_stock' : 'bad_items' });
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

    const plain = {}, bySize = {};
    priced.lines.forEach((l) => {
      const p = cat[l.id];
      if (p && p.sizeStock) { const k = `${l.id}|${l.size}`; bySize[k] = (bySize[k] || 0) + l.qty; }
      else plain[l.id] = (plain[l.id] || 0) + l.qty;
    });
    const taken = [];
    const release = () => Promise.all(taken.map((t) => db(`rpc/${t.fn}`, { method: 'POST', body: t.body }).catch(() => {})));
    if (shop) {
      const jobs = [
        ...Object.keys(plain).filter((id) => cat[id] && cat[id].stock != null).map((id) => ({ take: 'take_stock', give: 'give_stock', body: { pid: Number(id), q: plain[id] } })),
        ...Object.keys(bySize).map((k) => { const [id, sz] = k.split('|'); return { take: 'take_size_stock', give: 'give_size_stock', body: { pid: Number(id), sz, q: bySize[k] } }; }),
      ];
      for (const j of jobs) {
        let ok = false;
        try { ok = (await db(`rpc/${j.take}`, { method: 'POST', body: j.body })) === true; } catch (e) { console.error(j.take, e.message); }
        if (!ok) { await release(); return res.status(400).json({ error: 'out_of_stock' }); }
        taken.push({ fn: j.give, body: j.body });
      }
    }
    let order;
    try {
      order = await insertOrder({
      telegram_id: user.id,
      name,
      phone: customer.phone, // always the verified number, never one sent by the browser
      type, address, lat, lon, pay,
      items: priced.lines,
      promo,
      discount: priced.discount,
      subtotal: priced.subtotal,
      delivery_fee: priced.fee,
      total: priced.total,
      status: 'new',
      lang,
    });
    } catch (e) { await release(); throw e; }

    try { // count the promo use
      if (promo) { const u = (await db(`promos?code=eq.${promo}&select=used`))[0]; await db(`promos?code=eq.${promo}`, { method: 'PATCH', body: { used: ((u && u.used) || 0) + 1 } }); }
      clearShop();
    } catch (e) { console.error('promo', e.message); }

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
