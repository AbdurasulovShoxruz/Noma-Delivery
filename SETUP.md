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

## Products, stock, discounts and promo codes (admin panel)

1. In Supabase open **SQL Editor -> New query**, paste everything from `supabase-admin.sql`, and click **Run**. It creates the product and promo tables and loads the 12 demo products.
2. Push the code and wait for Vercel to show **Ready**.
3. Open `/admin`:
   - **Products**: **+ Add product**, or click a row to change price, discount %, stock, colours, sizes, visibility, or to delete it. Stock `0` shows "Sold out" in the shop; an empty stock means unlimited.
   - **Promo codes**: create a code with a % discount, pause it, or delete it. Customers enter it in the bag; the server applies it again when the order is placed.
4. Each order lowers the stock of its products and counts the promo use.

Until step 1 is done, the shop keeps using the built-in product list.

### Second update: photos, sections, safe stock
Run `supabase-update.sql` in the same way (after `supabase-admin.sql`). It adds:
- the **Section** field (Dresses, Tops, Knitwear, Bottoms, Outerwear, Bags, Scarves, Hats). In the shop, choosing Women, Men or Accessories shows only the sections that have products.
- **Photos**: in the product editor press **+ Photo** (up to 3, resized in the browser, stored in a public Supabase bucket named `products`). The first photo replaces the drawn silhouette.
- **Safe stock**: stock is now taken in the database in one step, so two simultaneous orders cannot buy the same last piece.
New in the shop: search, price sorting, a size guide on the product page, and "My orders" (link at the bottom of the home page). The admin Overview lists products with 5 or fewer in stock.

### Shoes
Run `supabase-shoes.sql` (after `supabase-update.sql`). The shop gets a **Shoes** category with the sections Sneakers and Boots and 3 demo products with shoe sizes 36–46. In the admin product editor, choose Category **shoes**, Shape **sneaker** or **boot**, and Sizes **Shoes 36–46**. The Products tab has category filters, including Shoes.

### Stock per size and your own material text
Run `supabase-sizes.sql` in the Supabase SQL Editor (after the other SQL files), push the code, and wait for Ready.
- Run `supabase-sections.sql` once too: it adds the "New Products" flag used by the home page and the admin panel.
- Run `supabase-colors.sql` once too: it creates the colour list managed in the admin panel (Colours tab).
- Run `supabase-categories.sql` once too: it creates the category and section lists managed in the admin panel (Sections tab).
- **Stock for each size**: in the product editor choose Sizes (Clothing or Shoes), tick **Stock for each size**, and type a number for every size, for example M 6, S 2, XL empty. An empty size or 0 is greyed out and crossed out in the shop and cannot be ordered. The total stock is the sum of the sizes. Each order lowers only the size that was bought, and it is locked in the database, so the last piece cannot be sold twice. A size with 3 or fewer pieces shows "Left: N" on the product page.
- **Material**: the list now also has Leather, Suede, Mesh, Synthetic, Denim and Silk. Choose **other** to type your own text in Uzbek and Russian; the shop shows exactly that text.
