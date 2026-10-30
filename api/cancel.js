'use strict';
/* The customer cancels his own order while it is still new (courier / pickup) or unpaid (region). */
const { env, tg, getOrder, patchOrder, restoreStock, verifyInitData } = require('../lib/common');
const { orderText, keyboard } = require('../lib/render');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const b = req.body || {};
  const user = verifyInitData(b.initData);
  if (!user) return res.status(401).json({ error: 'bad_init_data' });
  try {
    const o = await getOrder(Number(b.id));
    if (!o || String(o.telegram_id) !== String(user.id)) return res.status(404).json({ error: 'not_found' });
    const ok = o.type === 'viloyat' ? o.status === 'awaiting_payment' : o.status === 'new';
    if (!ok) return res.status(409).json({ error: 'too_late' });
    const u = await patchOrder(o.id, { status: 'cancelled', handled_by: 'Mijoz' }, o.status);
    if (!u) return res.status(409).json({ error: 'too_late' });
    await restoreStock(u);
    if (env('STAFF_CHAT_ID') && u.group_message_id) {
      await tg('editMessageText', { chat_id: env('STAFF_CHAT_ID'), message_id: u.group_message_id, text: orderText(u), parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: keyboard(u) }).catch(() => {});
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server' });
  }
};
