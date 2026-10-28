'use strict';
/* Tells the Mini App who the user is and whether their phone number is verified. */
const { verifyInitData, getCustomer, botUsername } = require('../lib/common');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const user = verifyInitData(req.body && req.body.initData);
  if (!user) return res.status(401).json({ error: 'bad_init_data' });
  try {
    const c = await getCustomer(user.id);
    return res.status(200).json({ ok: true, verified: !!c, phone: c ? c.phone : null, bot: await botUsername() });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server' });
  }
};
