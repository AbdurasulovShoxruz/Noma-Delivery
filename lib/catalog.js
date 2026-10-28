'use strict';
/* Server-side price list. The browser never sends prices: the server prices every order from this table.
   Keep ids, prices, sizes and colour lists in sync with the P array in index.html (scripts/test.js checks this). */

const CL = ['XS', 'S', 'M', 'L', 'XL'];

const CATALOG = {
  1: { price: 389000, sizes: CL, colors: ['#FFFFFF', '#7C8A9A', '#181818'], uz: 'Zig‘ir ko‘ylak' },
  2: { price: 459000, sizes: CL, colors: ['#181818', '#B8A88F', '#6B5B4B'], uz: 'Keng shim' },
  3: { price: 1290000, sizes: CL, colors: ['#3A3733', '#C9B79C', '#181818'], uz: 'Uzun jun palto' },
  4: { price: 169000, sizes: CL, colors: ['#FFFFFF', '#181818', '#B8A88F'], uz: 'Asosiy futbolka' },
  5: { price: 559000, sizes: CL, colors: ['#D9CDBA', '#7A6A58', '#181818'], uz: 'Merinos sviter' },
  6: { price: 679000, sizes: CL, colors: ['#181818', '#8C6F5A', '#CFC5B3'], uz: 'Midi ko‘ylak' },
  7: { price: 489000, sizes: CL, colors: ['#4A4743', '#D3CDC0', '#181818'], uz: 'Qalin xudi' },
  8: { price: 249000, sizes: CL, colors: ['#C7B89C', '#181818', '#7C8A9A'], uz: 'Chino shortik' },
  9: { price: 399000, sizes: CL, colors: ['#181818', '#C9B79C', '#5A4B3F'], uz: 'Plisse yubka' },
  10: { price: 129000, sizes: null, colors: ['#FFFFFF', '#181818'], uz: 'Kanvas sumka' },
  11: { price: 219000, sizes: null, colors: ['#B8A88F', '#3A3733', '#7C8A9A'], uz: 'Jun sharf' },
  12: { price: 99000, sizes: null, colors: ['#181818', '#D3CDC0'], uz: 'Paxta kepka' },
};

const COLOR_NAMES = {
  '#FFFFFF': 'Oq', '#181818': 'Qora', '#7C8A9A': 'Ko‘kimtir-kulrang', '#B8A88F': 'Qumrang',
  '#6B5B4B': 'Jigarrang', '#3A3733': 'To‘q kulrang', '#C9B79C': 'Bej', '#D9CDBA': 'Och bej',
  '#7A6A58': 'Mokko', '#8C6F5A': 'Qahvarang', '#CFC5B3': 'Kulrang-bej', '#4A4743': 'Grafit',
  '#D3CDC0': 'Och kulrang', '#C7B89C': 'Xaki', '#5A4B3F': 'Shokolad',
};
const colorName = (hex) => COLOR_NAMES[hex] || hex;

const DELIVERY_FEE = 25000;
const FREE_OVER = 500000;
/* Delivery area: a box around Tashkent city. */
const ZONE = { latMin: 41.15, latMax: 41.47, lonMin: 69.08, lonMax: 69.45 };
const inZone = (lat, lon) => lat >= ZONE.latMin && lat <= ZONE.latMax && lon >= ZONE.lonMin && lon <= ZONE.lonMax;

const bad = () => Object.assign(new Error('bad_items'), { code: 'bad_items' });

/* Validate the cart and price it. Throws {code:'bad_items'} on anything unexpected. */
function priceOrder(rawItems, type) {
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 30) throw bad();
  const lines = [];
  let subtotal = 0;
  for (const it of rawItems) {
    if (!it || typeof it !== 'object') throw bad();
    const p = CATALOG[it.id];
    if (!p) throw bad();
    const qty = Number(it.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) throw bad();
    const ci = Number(it.color);
    if (!Number.isInteger(ci) || ci < 0 || ci >= p.colors.length) throw bad();
    let size = null;
    if (p.sizes) {
      if (!p.sizes.includes(it.size)) throw bad();
      size = it.size;
    }
    lines.push({ id: Number(it.id), name: p.uz, size, color: p.colors[ci], qty, price: p.price });
    subtotal += p.price * qty;
  }
  const fee = type === 'pickup' || subtotal >= FREE_OVER ? 0 : DELIVERY_FEE;
  return { lines, subtotal, fee, total: subtotal + fee };
}

module.exports = { CATALOG, colorName, priceOrder, inZone, ZONE, DELIVERY_FEE, FREE_OVER };
