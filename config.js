/* One place to change per client. Used by the shop (index.html) and the server (lib/catalog.js). */
(function (g) {
  var c = {
    brand: 'NOMA',
    since: 2020,
    phone: '+998977775437',
    phoneShown: '+998 97 777 54 37',
    store: {
      lat: 41.3111, lon: 69.2797,
      addr: { uz: 'Amir Temur ko‘chasi 15, Toshkent', ru: 'ул. Амира Темура 15, Ташкент', en: 'Amir Temur street 15, Tashkent' },
      hours: { uz: 'Har kuni 10:00 – 22:00', ru: 'Ежедневно 10:00 – 22:00', en: 'Daily 10:00 – 22:00' },
    },
    fees: { delivery: 25000, freeOver: 500000, viloyat: 35000 }, // so'm
    banner: { uz: '', ru: '' }, // a short announcement on top of the home page, e.g. 'Yangi kolleksiya -20%'
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = c; else g.NOMA_CONFIG = c;
})(typeof window !== 'undefined' ? window : this);
