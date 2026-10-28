# NOMA: Telegram Mini App demo

- `index.html`   the Mini App (HTML, CSS, JS). Works alone in a browser as a demo.
- `api/`         Vercel functions: `bot.js` (webhook), `me.js` (verification status), `order.js` (orders)
- `lib/`         shared code (Telegram, Supabase, catalog, message formatting)
- `supabase.sql` database tables
- `SETUP.md`     step-by-step: connect Supabase, Vercel variables, webhook, staff group
- `scripts/test.js`  `node scripts/test.js` runs 27 checks with a fake Telegram and database
- `avatar.png`   bot profile picture (@BotFather -> /setuserpic)

Languages: Uzbek (default) and Russian.
Without the backend the app runs in demo mode (no verification, orders are not saved).
