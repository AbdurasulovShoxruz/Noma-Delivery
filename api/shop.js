'use strict';
/* Public: the product list the shop shows (from the admin panel). Returns {products:null} until supabase-admin.sql is run. */
const { getShop, db } = require('../lib/common');
const { effPrice } = require('../lib/catalog');

module.exports = async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  const rows = await getShop();
  if (!rows) return res.status(200).json({ products: null });
  const products = rows.filter((r) => r.active !== false && r.stock !== 0).map((r) => ({
    id: r.id, cat: r.cat, art: r.art, mat: r.mat, sizes: r.sizes, colors: r.colors, name: r.name, stock: r.stock, sub: r.sub, photos: r.photos, isNew: r.is_new === true, sizeStock: r.size_stock, matText: r.mat_text,
    price: effPrice(r), old: r.sale ? r.price : 0,
  }));
  const sec = await db('shop_sections?select=key,kind,uz,ru&order=pos,key').catch(() => null);
  return res.status(200).json({ products, sections: Array.isArray(sec) && sec.length ? sec : null });
};
