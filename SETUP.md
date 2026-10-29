# NOMA: connect the live backend

What you get after this setup:
- Customers must verify their phone (Telegram "share my number") before they can order
- Delivery location is chosen on an OpenStreetMap map (pin + address)
- Every order is posted to your staff Telegram group with the map pin and buttons
  (Qabul qilish, Yo'lda, Yetkazildi, Bekor qilish); the customer is notified in the bot on each change
- Orders and verified customers are saved in Supabase

Time needed: about 25 minutes. Do the parts in order.

---

## Part A. Supabase (database)

1. Go to https://supabase.com and sign in. Click **New project**. Name it `noma`, set a database password, pick the closest region, and click **Create**.
2. When the project is ready, open **SQL Editor -> New query**.
3. Open `supabase.sql` from this folder, copy everything, paste it into the editor, and click **Run**. It should say "Success".
4. Open **Project Settings -> API** (or **API Keys**) and copy two things:
   - **Project URL**, like `https://abcdxyz.supabase.co`
   - the **secret key** (named `service_role` on the Legacy tab, or `sb_secret_...` on the new tab)

The secret key gives full access to your data. It goes only into Vercel (Part B). Never put it in `index.html`, GitHub, or a chat.

## Part B. Vercel environment variables

1. Open vercel.com, then the `noma-clothes` project, then **Settings -> Environment Variables**.
2. Add these one by one (leave all environments ticked):

| Name | Value |
|---|---|
| `BOT_TOKEN` | the token from @BotFather |
| `SUPABASE_URL` | the Project URL from Part A |
| `SUPABASE_SERVICE_KEY` | the secret key from Part A |
| `WEBHOOK_SECRET` | any long random text; generate one in Terminal with `openssl rand -hex 20` |

| `ADMIN_PASSWORD` | a strong password for the admin panel (opens at `/admin`) |

Optional:
- `PHONE_PREFIX`: default is `998` (Uzbek numbers only). Set it to `any` to accept foreign numbers, for example to test with another country's SIM.

## Part C. Upload the new code

In Terminal (check `pwd` shows `/Users/shokhruz7/noma-demo` first):

```
cd ~/noma-demo
pwd
unzip -o ~/Downloads/noma-demo.zip
git add .
git commit -m "Add bot backend, phone verification, map, staff group"
git push
```

Vercel redeploys by itself in about a minute. Wait until the deployment shows **Ready**.

## Part D. Connect the bot to your server (webhook)

Run this in Terminal. Replace the two values in quotes (the secret must be exactly the same as `WEBHOOK_SECRET` in Vercel):

```
export BOT_TOKEN="PASTE_YOUR_BOT_TOKEN"
export WEBHOOK_SECRET="PASTE_THE_SAME_SECRET_AS_IN_VERCEL"

curl -s "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -d "url=https://noma-clothes.vercel.app/api/bot" \
  -d "secret_token=$WEBHOOK_SECRET" \
  -d 'allowed_updates=["message","callback_query"]'
```

You should see `"ok":true` and `"Webhook was set"`. To check it any time:

```
curl -s "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo"
```

If your bot token was ever posted in a chat, screenshot or GitHub, replace it: @BotFather -> `/revoke`, then update `BOT_TOKEN` in Vercel and repeat this part.

## Part E. Staff group for orders

1. In Telegram create a new group, for example **NOMA Orders**.
2. Add your staff and add your bot (search its username) to the group.
3. Make the bot an admin of the group (group name -> Edit -> Administrators -> Add).
4. Send `/chatid` in the group. The bot replies `Chat ID: -100...`. If it does not answer, send `/chatid@your_bot_username`.
5. In Vercel add one more variable: `STAFF_CHAT_ID` = that number, including the minus sign.
6. In Vercel open **Deployments**, click the three dots on the latest one, then **Redeploy**. Variables only apply to new deployments.

## Part F. Test everything

1. Open the bot and send `/start`. Press **Raqamni yuborish**. The bot answers "Raqamingiz tasdiqlandi".
2. Open the shop. It should show the shop directly (no "Demo rejim" banner).
3. Add something, go to checkout, press **Mening joylashuvim** or drag the map, then place the order.
4. In the staff group you should see the order with the map pin and 2 buttons. Press **Qabul qilish**. The customer receives a message in the bot. Continue with **Yo'lda** and **Yetkazildi**.
5. Safety checks: a number outside Tashkent is refused, and sharing someone else's contact is rejected.

## If something does not work

| Problem | Likely cause |
|---|---|
| Shop shows "Demo rejim: server ulanmagan" | Variables missing, or no redeploy after adding them. Check Vercel -> project -> Logs. |
| Bot ignores `/start` | Webhook not set (run `getWebhookInfo`), or secret does not match (Logs show 401). |
| Order works but nothing in the group | `STAFF_CHAT_ID` wrong, or bot not in the group. Run `/chatid` again after making the bot admin (the ID can change when a group becomes a supergroup). |
| "Faqat O'zbekiston raqamlari" | Number is not +998. Set `PHONE_PREFIX` to `any` for testing. |
| Map is grey or tiles do not load | Slow connection, or OpenStreetMap blocked. Reload. |

## Notes for real client projects

- The free OpenStreetMap tile server and address search are meant for light use. For a real store with traffic, switch to a paid tile provider (MapTiler or Yandex) with an API key.
- Telegram's "share my number" proves the number belongs to that Telegram account, and Telegram itself verified it by SMS, so it cannot be typed in or faked. It does not prove the person answers calls. An SMS code (Eskiz) can be added later if a client wants it.
- Prices are checked on the server from `lib/catalog.js`, and the customer's phone always comes from the verified record, so the app cannot be tricked into changing them. When you edit products in `index.html`, edit `lib/catalog.js` too; `node scripts/test.js` checks they match.
- Not included yet: real payments (Click / Payme), order history for customers, rate limiting.

## Admin panel

Open `https://YOUR-APP.vercel.app/admin` and sign in with `ADMIN_PASSWORD` (add it in Vercel, then Redeploy).
It shows today's orders, revenue, a 7-day chart, all orders with status buttons (the customer is notified in the bot and the staff group message is updated), customers, and products.
Use a long password: it is the only protection.
