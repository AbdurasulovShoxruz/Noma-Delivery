'use strict';
/* Public: the product list the shop shows (from the admin panel). Returns {products:null} until supabase-admin.sql is run. */
const { getShop } = require('../lib/common');
const { effPrice } = require('../lib/catalog');

module.exports = async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  const rows = await getShop();
  if (!rows) return res.status(200).json({ products: null });
  const products = rows.filter((r) => r.active !== false).map((r) => ({
    id: r.id, cat: r.cat, art: r.art, mat: r.mat, sizes: r.sizes, colors: r.colors, name: r.name, stock: r.stock,
    price: effPrice(r), old: r.sale ? r.price : 0,
  }));
  return res.status(200).json({ products });
};
