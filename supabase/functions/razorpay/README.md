# razorpay — online payment for bookings

Checkout offers **Pay online** (UPI, cards, netbanking, wallets) once this is
set up. Until then it offers **Pay at pickup** only, and online payment shows
as "being set up".

The Razorpay **key secret** lives only in this function. The browser gets the
public key id, opens Razorpay's own payment window, and hands the result back
here to be checked. Only this function can mark a booking's payment verified.

---

## One-time setup

### 1. Get your keys from Razorpay

Razorpay Dashboard → **Account & Settings → API Keys** → generate a key.
You get a **Key Id** (`rzp_live_…`) and a **Key Secret**. Start with **Test
Mode** keys (`rzp_test_…`) to try it without real money.

### 2. Store them as Supabase secrets

```bash
npx supabase secrets set RAZORPAY_KEY_ID=rzp_live_xxxxxxxx
```

```bash
npx supabase secrets set RAZORPAY_KEY_SECRET=<YOUR_KEY_SECRET>
```

### 3. Deploy the function

```bash
npx supabase functions deploy razorpay --no-verify-jwt
```

`--no-verify-jwt` is needed because Razorpay's webhook (step 5) has no Supabase
login. The function checks every caller itself: customers must be signed in and
can only pay for their own booking; webhooks must carry Razorpay's signature.

### 4. Turn it on in the website

Add the **Key Id** (never the secret) to the website build:

- locally: `VITE_RAZORPAY_KEY_ID=rzp_live_xxxxxxxx` in `.env`
- GitHub Pages: a repository secret named `VITE_RAZORPAY_KEY_ID`

Rebuild and deploy. Checkout now shows **Pay online**.

### 5. Add the webhook (recommended)

If a customer pays and closes the page before it finishes, the webhook still
marks the booking paid.

Razorpay Dashboard → **Account & Settings → Webhooks → Add New Webhook**:

- **URL:** `https://<PROJECT_REF>.supabase.co/functions/v1/razorpay`
- **Secret:** any long random string
- **Events:** `payment.captured` and `order.paid`

Then store the same secret:

```bash
npx supabase secrets set RAZORPAY_WEBHOOK_SECRET=<THE_SAME_STRING>
```

Also check **Account & Settings → Payment Capture** is set to automatic, so
payments are captured without a manual step.

---

## How a payment flows

1. The customer books. The booking is saved with **Awaiting payment**.
2. The website asks this function for an order. The amount is the fare saved
   on the booking, in paise.
3. Razorpay's window opens; the customer pays.
4. The website sends Razorpay's signed result here. The function checks the
   signature and marks the booking **Paid**, with `paymentVerified: true` and the
   Razorpay payment id as `txnRef`. Telegram gets a "Payment received" alert.
5. If the customer closes the window without paying, the car is held for 30
   minutes. They can pay later from **My Bookings**.

## Refunds

Refund from the Razorpay dashboard (Transactions → Payments → the payment →
Refund). The console reminds you when you reject or cancel a paid booking.
