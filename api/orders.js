'use strict';
/* The signed-in customer's own orders (last 20). */
const { db, verifyInitData } = require('../lib/common');
const { orderNo } = require('../lib/render');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const user = verifyInitData(req.body && req.body.initData);
  if (!user) return res.status(401).json({ error: 'bad_init_data' });
  try {
    const rows = (await db(`orders?telegram_id=eq.${Number(user.id)}&select=id,status,total,items,type,created_at&order=created_at.desc&limit=20`)) || [];
    return res.status(200).json({ orders: rows.map((o) => ({ no: orderNo(o.id), status: o.status, total: o.total, type: o.type, at: o.created_at, items: (o.items || []).map((l) => ({ name: l.name, qty: l.qty, size: l.size })) })) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server' });
  }
};
