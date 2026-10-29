'use strict';
/* Checks a promo code. The real discount is applied again on the server when the order is placed. */
const { db, verifyInitData } = require('../lib/common');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const b = req.body || {};
  if (!verifyInitData(b.initData)) return res.status(401).json({ error: 'bad_init_data' });
  const code = String(b.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
  try {
    const r = code ? (await db(`promos?code=eq.${code}&active=eq.true&select=code,percent`)) || [] : [];
    return r[0] ? res.status(200).json({ code: r[0].code, percent: r[0].percent }) : res.status(404).json({ error: 'bad_promo' });
  } catch (e) {
    return res.status(500).json({ error: 'server' });
  }
};
