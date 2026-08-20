# DelhiDrive — Self-Drive Car Rental Platform

A complete self-drive car rental platform for Delhi NCR, built to the DelhiDrive
feature specification. Vite + React + Tailwind CSS on the front end, Supabase
(Postgres + Auth + Storage) on the back end, jsPDF for documents.

---

## Running it

```bash
npm install
```

```bash
npm run dev
```

Then open **http://localhost:5180**.

To build for production:

```bash
npm run build
```

### Signing in

- **Customer account** — any email address works.
- **Admin console** — sign in as `admin@delhidrive.in` to unlock `/admin`.
  (Change this list via `VITE_ADMIN_EMAILS` in your `.env`.)

The app runs fully without Supabase — everything persists to your browser's
local storage so you can click through every screen straight away. Connect
Supabase when you want real accounts and shared data.

---

## Connecting Supabase

### 1. Create the project
Go to <https://supabase.com>, sign in with GitHub or email, and click
**New project**. Give it a name, set a database password (save it somewhere),
pick region **South Asia (Mumbai)**, and create. It takes about a minute.

### 2. Copy your keys
You need two values from your project settings:

| Value | Where to find it | Line in `.env` |
|---|---|---|
| Project URL | **Settings → Data API** | `VITE_SUPABASE_URL` |
| Publishable key (`sb_publishable_…`) | **Settings → API Keys** | `VITE_SUPABASE_ANON_KEY` |

Rename `.env.example` to `.env` and paste them in.

> **Older projects** show an `anon` `public` key starting with `eyJ…` instead of
> a publishable key. Either works — they go on the same line.

> ⚠️ Never put the **Secret key** (`sb_secret_…`) or the legacy `service_role`
> key in `.env`. Those bypass every security rule, and this file is compiled
> into the browser bundle. The publishable key is *designed* to be public —
> Row Level Security is what actually protects your data.

### 3. Run the setup script
Open `supabase-setup.sql` and change the admin email near the top (inside
`is_admin()`) to your own — it must match `VITE_ADMIN_EMAILS` in `.env`.

Then in Supabase: **SQL Editor** → **New query** → paste the whole file →
**Run**. That single script creates every table, all the security policies,
both storage buckets, and inserts the 14 seed cars and 3 promo codes.

It is safe to run again later if you change the admin email.

### 4. Turn off email confirmation (optional but easier)
**Authentication** → **Sign In / Providers** → **Email** → switch off
**Confirm email**. Otherwise every new signup has to click a link in their
inbox before they can log in.

To enable Google sign-in, turn on the **Google** provider on the same screen
and follow its instructions.

### 5. Restart and check
Restart the dev server. The badge in the header should read **Supabase live**
instead of *Local store*, and **Table Editor → fleet** should show 14 rows.

Sign up with your admin email, and the **Admin** link appears in the nav.

---

## What is in here

### 1. Fleet search, browsing & filters
Catalogue cards showing daily rate, transmission, fuel, seating and mileage.
Filter by category, transmission and fuel; live price and seating-capacity
sliders; search across model, brand and features. Filters are stored in the URL,
so a filtered view can be bookmarked or shared. The vehicle detail modal carries
engine displacement, boot capacity, zero-dep insurance terms, customer reviews
and an instant checkout CTA.

### 2. Smart checkout & reservation engine
Date/time range picker with live duration in hours and days, five location hubs
(Airport T3, Connaught Place, Cyber City, Noida 18, doorstep delivery) with
independent pickup and drop-off, five add-ons priced per booking or per day,
promo-code validation, and a fare breakdown showing surge, discount, 18% GST and
the refundable deposit. UPI QR, card, netbanking and cash on delivery.

### 3. Customer dashboard & live telematics
Bookings split into active / upcoming / completed / cancelled with live
countdown timers. Active rentals get a GPS telematics panel: map trace, speed
gauge with over-speed alerting, fuel or state-of-charge, coolant temperature,
tyre pressures, battery voltage, odometer and a rolling speed trace. One-click
PDF rental agreements and GST tax invoices. Digital handover checklist with
photo upload and odometer verification, for both pre-pickup and post-return.
24-hour free cancellation with a tiered refund calculator.

### 4. Admin dashboard & fleet operations
Revenue and utilisation overview; peak-demand heatmap with Peak / High /
Moderate / Low / Available tiers and per-vehicle occupancy timelines; daily slot
inspector with hourly pickup density, morning/afternoon/evening bands, customer
paperwork and handover triggers; fleet inventory manager (add cars, update
rates, upload photos, toggle maintenance and availability); KYC verification
portal; promotions and coupon creator; system settings for deposits, GST rate,
late penalty per hour and surge multipliers.

### 5. AI assistant (DelhiDrive Copilot)
Floating support widget that answers from live platform data — pricing, zero-dep
policy, airport pickup, documents, cancellations, add-ons, breakdown help. It
parses free text like *"6 people going to the hills under ₹4000"* into
structured slots and ranks three specific cars with reasons.

### 6. Biometric KYC & security verification
Driving licence and Aadhaar upload with format validation, and Verified /
Pending Review / Rejected flags that propagate onto every booking profile.
Admin approves or rejects in one click, with a reason the customer can see.

### 7. Support tickets & customer care
In-app tickets for breakdown assistance, billing queries and trip extensions,
with a threaded conversation. Admin queue sorts high-priority breakdowns first
and moves status through Open → In Progress → Resolved.

### 8. Architecture & integrations
Vite + React + Tailwind CSS with Lucide icons; client-side jsPDF document
synthesis (agreements, GST invoices, inspection reports, feature audit);
Supabase Postgres, Auth and Storage with row-level security; browser push
notifications for booking confirmations, payment receipts and inspection
updates.

---

## Project layout

```
delhidrive/
├── supabase-setup.sql       Tables, RLS policies, buckets, seed data
├── .env.example             Supabase config template
└── src/
    ├── lib/
    │   ├── supabase.js      Client bootstrap, admin-email list
    │   ├── db.js            Data layer — Supabase or local store
    │   ├── auth.jsx         Auth context
    │   ├── store.jsx        App-wide data subscriptions
    │   ├── pricing.js       Fare engine, hubs, add-ons, refunds
    │   ├── pdf.js           jsPDF documents
    │   ├── ai.js            Copilot intents + recommendations
    │   ├── telematics.js    GPS/OBD simulator
    │   ├── notify.jsx       Toasts + browser push
    │   └── format.js        Currency, dates, durations
    ├── data/fleet.js        Seed fleet + promo codes
    ├── components/
    │   ├── ui.jsx           Buttons, modals, inputs, tabs, badges
    │   ├── admin/           Heatmap, slot inspector, inventory, KYC, coupons…
    │   └── …                Nav, CarCard, CarModal, Copilot, Telematics…
    └── pages/               Home, Fleet, Checkout, Dashboard, Admin, Login
```

---

## Notes

- **Pricing lives in one place.** `src/lib/pricing.js` produces every rupee shown
  at checkout, in the dashboard and on the invoice PDF, so the numbers cannot
  drift apart.
- **Vehicle artwork** is generated as SVG per category, so no image hosting is
  needed. Add a real photo any time from *Admin → Fleet Inventory* — either a URL
  or an upload — and it replaces the illustration.
- **The telematics feed is a simulator.** It produces the same shape of data a
  real OBD-II tracker would push, so wiring in a live provider later means
  replacing one hook (`src/lib/telematics.js`).

---

## Hosting it

The build is a static site, so any static host works. Two routes:

### Quickest — Netlify Drop (no account setup, no CLI)

1. `npm run build`
2. Go to <https://app.netlify.com/drop>
3. Drag the whole **`dist`** folder onto the page

Live in about 20 seconds on a `*.netlify.app` URL. The Supabase URL and
publishable key are compiled into the bundle at build time, so nothing else
needs configuring.

To update: `npm run build` again and drag `dist` over a second time.

### Proper — Vercel or Netlify connected to Git

Gives you automatic rebuilds on every push and a stable URL.

```bash
npx vercel
```

Answer the prompts (link to your account, accept the detected Vite settings).
Then add your three environment variables in the Vercel dashboard under
**Settings → Environment Variables** — `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`, `VITE_ADMIN_EMAILS` — and redeploy. The host builds
from source, so it cannot see your local `.env`.

`vercel.json` and `netlify.toml` are already committed with the SPA rewrite
rules, so deep links like `/fleet` and `/admin` survive a page refresh.

### After deploying — point Supabase at your new URL

This step is easy to miss. In Supabase go to
**Authentication → URL Configuration** and set:

- **Site URL** → your live URL, e.g. `https://delhidrive.netlify.app`
- **Redirect URLs** → add both your live URL and `http://localhost:5180`

Without this, signup confirmation emails and Google sign-in will bounce people
back to localhost instead of your live site.

