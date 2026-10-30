'use strict';
/* Telegram webhook: /start, phone verification (contact share), staff status buttons, /chatid helper. */
const {
  env, tg, getCustomer, upsertCustomer, getOrder, patchOrder, normalizePhone, restoreStock,
} = require('../lib/common');
const { orderText, keyboard, nextStatuses, orderNo, CUSTOMER_NOTE } = require('../lib/render');

const T = {
  uz: {
    welcome: 'NOMA do‘koniga xush kelibsiz! Buyurtma berish uchun avval Telegram raqamingizni tasdiqlang: pastdagi tugmani bosing.',
    back: 'Xush kelibsiz! Do‘konni ochish uchun tugmani bosing.',
    share: '📱 Raqamni yuborish',
    ok: '✅ Raqamingiz tasdiqlandi.',
    next: 'Endi do‘konni ochishingiz mumkin:',
    open: '🛍 Do‘konni ochish',
    notOwn: 'Iltimos, faqat o‘zingizning raqamingizni yuboring (pastdagi tugma orqali).',
    badPhone: 'Hozircha faqat O‘zbekiston raqamlari (+998) qabul qilinadi.',
  },
  ru: {
    welcome: 'Добро пожаловать в NOMA! Чтобы оформить заказ, сначала подтвердите номер Telegram: нажмите кнопку ниже.',
    back: 'Добро пожаловать! Нажмите кнопку, чтобы открыть магазин.',
    share: '📱 Отправить номер',
    ok: '✅ Ваш номер подтверждён.',
    next: 'Теперь можно открыть магазин:',
    open: '🛍 Открыть магазин',
    notOwn: 'Пожалуйста, отправьте только свой номер (кнопкой ниже).',
    badPhone: 'Сейчас принимаются только номера Узбекистана (+998).',
  },
};

const langOf = (from) => (from && from.language_code === 'ru' ? 'ru' : 'uz');
const webAppUrl = () =>
  env('WEBAPP_URL') ||
  (env('VERCEL_PROJECT_PRODUCTION_URL') ? `https://${env('VERCEL_PROJECT_PRODUCTION_URL')}/` : 'https://noma-clothes.vercel.app/');
const openButton = (lang) => ({ inline_keyboard: [[{ text: T[lang].open, web_app: { url: webAppUrl() } }]] });

async function onMessage(m) {
  const chat = m.chat || {};
  if (m.text && /^\/chatid(@\w+)?$/.test(m.text.trim())) {
    await tg('sendMessage', { chat_id: chat.id, text: `Chat ID: ${chat.id}` });
    return;
  }
  if (chat.type !== 'private' || !m.from) return;
  const lang = langOf(m.from);
  if (m.contact) return onContact(m, lang);
  const customer = await getCustomer(m.from.id);
  if (customer) {
    await tg('sendMessage', { chat_id: chat.id, text: T[lang].back, reply_markup: openButton(lang) });
  } else {
    await tg('sendMessage', {
      chat_id: chat.id,
      text: T[lang].welcome,
      reply_markup: { keyboard: [[{ text: T[lang].share, request_contact: true }]], resize_keyboard: true, one_time_keyboard: true },
    });
  }
}

async function onContact(m, lang) {
  const c = m.contact;
  // The shared contact must be the sender's own: Telegram fills user_id with the owner of the number.
  if (c.user_id !== m.from.id) {
    await tg('sendMessage', { chat_id: m.chat.id, text: T[lang].notOwn });
    return;
  }
  const phone = normalizePhone(c.phone_number);
  if (!phone) {
    await tg('sendMessage', { chat_id: m.chat.id, text: T[lang].badPhone });
    return;
  }
  await upsertCustomer({
    telegram_id: m.from.id,
    phone,
    first_name: [m.from.first_name, m.from.last_name].filter(Boolean).join(' ') || null,
    username: m.from.username || null,
    lang,
    verified_at: new Date().toISOString(),
  });
  await tg('sendMessage', { chat_id: m.chat.id, text: T[lang].ok, reply_markup: { remove_keyboard: true } });
  await tg('sendMessage', { chat_id: m.chat.id, text: T[lang].next, reply_markup: openButton(lang) });
}

async function onCallback(q) {
  const answer = (text, alert) => tg('answerCallbackQuery', { callback_query_id: q.id, text, show_alert: !!alert });
  const msg = q.message;
  // Only buttons pressed inside the staff group are accepted.
  if (!msg || !env('STAFF_CHAT_ID') || String(msg.chat.id) !== String(env('STAFF_CHAT_ID'))) return answer('Ruxsat yo‘q', true);
  const m = /^st:(\d+):(accepted|on_way|delivered|cancelled)$/.exec(q.data || '');
  if (!m) return answer('?');
  const order = await getOrder(Number(m[1]));
  if (!order) return answer('Buyurtma topilmadi', true);
  const next = m[2];
  if (!nextStatuses(order).includes(next)) return answer('Holat allaqachon o‘zgargan');
  const by = [q.from.first_name, q.from.last_name].filter(Boolean).join(' ') || q.from.username || '';
  const updated = await patchOrder(order.id, { status: next, handled_by: by }, order.status);
  if (!updated) return answer('Holat allaqachon o‘zgargan');
  if (next === 'cancelled') await restoreStock(updated);
  await tg('editMessageText', {
    chat_id: msg.chat.id,
    message_id: msg.message_id,
    text: orderText(updated),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: keyboard(updated),
  });
  await answer('✓');
  const note = CUSTOMER_NOTE[next][updated.lang === 'ru' ? 'ru' : 'uz'](orderNo(updated.id));
  await tg('sendMessage', { chat_id: updated.telegram_id, text: note });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(200).send('ok');
  const secret = env('WEBHOOK_SECRET');
  if (!secret || req.headers['x-telegram-bot-api-secret-token'] !== secret) return res.status(401).send('unauthorized');
  const u = req.body || {};
  try {
    if (u.message) await onMessage(u.message);
    else if (u.callback_query) await onCallback(u.callback_query);
  } catch (e) {
    console.error(e);
  }
  return res.status(200).send('ok');
};
