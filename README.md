# NOMA — Telegram Mini App demo

Static app, no build step. Files:
- `index.html`  the whole Mini App (HTML, CSS, JS)
- `avatar.png`  640x640 bot profile picture (upload via @BotFather -> /setuserpic)
- `logo.png`    cropped wordmark (already embedded in index.html)

## Preview
Open `index.html` in a browser (mobile view in DevTools).

## Deploy (Vercel)
1. Push this folder to a GitHub repo, import it in Vercel (Framework: Other, no build command).
2. Vercel gives you an HTTPS URL, e.g. https://noma-demo.vercel.app

## Connect to Telegram
1. @BotFather -> /newbot (e.g. "NOMA Demo")
2. /setuserpic -> upload avatar.png
3. /newapp (or Bot Settings -> Menu Button) -> paste the Vercel URL

## Next (live version)
`place()` in index.html is where the order should be POSTed to `/api/order`
(save to Supabase, then message the store's admin chat with Accept / Delivered buttons).
