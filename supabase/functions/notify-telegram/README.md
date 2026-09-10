# notify-telegram — booking alerts, fired by the database

Posts a Telegram message the moment a booking, KYC submission or subscription
row is inserted. The bot token lives in Supabase's secret store and **never**
ships inside the app.

**Why it moved here.** Everything in the app's `.env` gets compiled into the
APK. Anyone who installs a published app can unzip it and read the token, then
post as your bot or read its messages. On a server it stays private. It is also
more reliable: the alert fires from the row itself, so it still goes out if the
customer's phone dies right after booking, and it covers bookings made on the
website too.

---

## One-time setup (about 10 minutes)

### 1. Install the Supabase CLI

```bash
# The CLI is not a global npm package any more — npx fetches it on demand,
# so there is nothing to install. Every command below uses `npx supabase`.
```

### 2. Log in and link the project

```bash
npx supabase login
```

```bash
npx supabase link --project-ref joobrzcchmgwixcdmozi
```

### 3. Store the secrets

These stay on the server. Replace with your own values if the bot ever changes.

```bash
npx supabase secrets set TELEGRAM_BOT_TOKEN=<YOUR_BOT_TOKEN>
```

```bash
npx supabase secrets set TELEGRAM_CHAT_ID=<YOUR_CHAT_ID>
```

To alert several people, use a comma-separated list, or better, create a
Telegram group, add the bot, and use the group's id (group ids are negative —
keep the minus sign):

```bash
npx supabase secrets set TELEGRAM_CHAT_ID=<YOUR_CHAT_ID>,-1001234567890
```

### 4. Deploy the function

```bash
npx supabase functions deploy notify-telegram --no-verify-jwt
```

`--no-verify-jwt` is needed because Postgres calls this function itself, not a
signed-in user. The function is harmless if called directly: it only sends a
message to *your* chat, and exposes no data.

### 5. Connect the database to it

Open **Supabase → SQL Editor**, paste the whole of `webhooks.sql` from this
folder, replace the two placeholders at the top, and Run:

- `<PROJECT_REF>` → `joobrzcchmgwixcdmozi`
- `<ANON_KEY>` → your publishable key (Settings → API Keys)

That creates one trigger function and attaches it to `bookings`, `kyc` and
`subscriptions`. It also creates the `subscriptions` table if the website's
original setup script predates that feature.

---

## Check it works

**From the app:** Ops console → Policy → **Send a test alert**. It should say
"Delivered to 1 of 1 chat(s)".

**From SQL:** uncomment the last block in `webhooks.sql` and run it.

**Watch the logs:**

```bash
npx supabase functions logs notify-telegram --tail
```

Then make a real booking — the alert should arrive within a second or two.

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| "notify-telegram is not deployed yet" | Step 4 hasn't run |
| Test alert works, real bookings don't | `webhooks.sql` hasn't run, or the placeholders weren't replaced |
| Nothing at all, no errors | `TELEGRAM_CHAT_ID` is wrong, or nobody has messaged the bot from that chat |
| Bookings still save fine but no alert | Correct by design — the trigger catches its own errors so a Telegram outage can never roll back a customer's booking |

## Changing the message wording

Edit `index.ts` and redeploy with step 4. The app does not need rebuilding —
this is the only place the alert text lives now.

---

## Accept / reject from inside Telegram

Booking alerts carry **✅ Accept** and **❌ Reject** buttons. Tapping one writes
the decision straight to the database and edits the message to record who
decided and when — so the chat becomes the audit trail.

Rejecting shows the six standard reasons first; the one you pick is stored on
the booking and is what the customer is told.

This is handled by the sibling `telegram-webhook` function.

### Setup (after the steps above)

**1. Get your Telegram numeric user id.** Only listed ids may action bookings —
being in the group is not enough.

```bash
curl "https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates"
```

Look for `"from":{"id":<YOUR_CHAT_ID>` — that number is yours.

**2. Store the operator allowlist and a webhook secret.** The secret is any
random string; Telegram sends it back on every call so nobody else can post
fake button presses.

```bash
npx supabase secrets set TELEGRAM_ADMIN_IDS=<YOUR_CHAT_ID>
```

```bash
npx supabase secrets set TELEGRAM_WEBHOOK_SECRET=pick-a-long-random-string
```

**3. Deploy the handler.**

```bash
npx supabase functions deploy telegram-webhook --no-verify-jwt
```

**4. Point Telegram at it.** Replace both placeholders:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook" -H "Content-Type: application/json" -d "{\"url\":\"https://joobrzcchmgwixcdmozi.supabase.co/functions/v1/telegram-webhook\",\"secret_token\":\"<THE_SECRET_FROM_STEP_2>\",\"allowed_updates\":[\"callback_query\"]}"
```

You should get `{"ok":true,"result":true,"description":"Webhook was set"}`.

### Check it

Make a booking. The alert arrives with two buttons — tap **Accept** and the
message should update to "✅ ACCEPTED by <you>". Confirm the booking flipped to
Confirmed in the Ops console.

### Notes

- **Setting a webhook disables `getUpdates`.** If you need to look up a chat id
  later, remove the webhook first: `.../deleteWebhook`, then re-set it.
- **The customer is not messaged automatically.** WhatsApp cannot send
  unattended without the Business Cloud API, so after accepting from Telegram
  you still send the customer message from the Ops console, which drafts it for
  you. The Telegram message reminds you, with their phone number.
- Buttons only appear on bookings that are still `Under review`. Once decided,
  the buttons are removed so the same booking cannot be actioned twice.
