// DelhiDrive — online payment for bookings, through Razorpay.
//
// The key secret lives only here, in Supabase's secret store. Three callers:
//
//   website / app (signed in)   { action: 'order', bookingId }
//       → creates a Razorpay order for the booking's amount
//   website / app (signed in)   { action: 'verify', bookingId, orderId, paymentId, signature }
//       → checks Razorpay's signature and marks the booking paid
//   Razorpay webhook            payment.captured / order.paid
//       → marks the booking paid even if the customer's browser closed before
//         'verify' could run
//
// Only this function (with the service role) can set paymentVerified on a
// booking — supabase-booking-rules.sql stops customers writing it themselves.
//
// Deploy (see README.md in this folder):
//   supabase secrets set RAZORPAY_KEY_ID=rzp_live_... RAZORPAY_KEY_SECRET=... RAZORPAY_WEBHOOK_SECRET=...
//   supabase functions deploy razorpay --no-verify-jwt
// --no-verify-jwt because Razorpay's webhook carries no Supabase token; the
// function checks every caller itself.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const KEY_ID = Deno.env.get('RAZORPAY_KEY_ID') ?? '';
const KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') ?? '';
const WEBHOOK_SECRET = Deno.env.get('RAZORPAY_WEBHOOK_SECRET') ?? '';

// Supabase injects these into every Edge Function automatically.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const fail = (error: string, status = 400) => json({ ok: false, error }, status);

/* ------------------------------------------------------------------ */
/* Signatures                                                          */
/* ------------------------------------------------------------------ */

async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Constant-time comparison, so the check leaks nothing through timing. */
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ------------------------------------------------------------------ */
/* Database and Razorpay                                               */
/* ------------------------------------------------------------------ */

const db = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

async function getBooking(id: string) {
  const res = await db(`bookings?id=eq.${encodeURIComponent(id)}&select=id,user_id,data`);
  const rows = await res.json().catch(() => null);
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

/** Merge a patch into the booking's jsonb `data`. */
async function patchBooking(id: string, patch: Record<string, unknown>) {
  const row = await getBooking(id);
  if (!row) return false;
  const res = await db(`bookings?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ data: { ...(row.data || {}), ...patch } }),
  });
  return res.ok;
}

/** The signed-in caller's user id, from their Supabase access token. */
async function callerId(req: Request) {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY || SERVICE_KEY, Authorization: auth },
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return user?.id ?? null;
}

const razorpay = (path: string, body?: unknown) =>
  fetch(`https://api.razorpay.com/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Basic ${btoa(`${KEY_ID}:${KEY_SECRET}`)}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

const paidPatch = (orderId: string, paymentId: string, via: string) => ({
  paymentStatus: 'Paid',
  paymentVerified: true,
  txnRef: paymentId,
  paidAt: Date.now(),
  razorpay: { orderId, paymentId, via },
});

/* ------------------------------------------------------------------ */
/* Handlers                                                            */
/* ------------------------------------------------------------------ */

/** Razorpay's own call when a payment is captured. */
async function handleWebhook(req: Request, signature: string) {
  const raw = await req.text();
  if (!WEBHOOK_SECRET) return fail('RAZORPAY_WEBHOOK_SECRET is not set.', 500);
  if (!safeEqual(await hmacHex(WEBHOOK_SECRET, raw), signature)) return fail('Bad signature.', 401);

  let event: Record<string, any>;
  try {
    event = JSON.parse(raw);
  } catch {
    return fail('Body must be JSON.');
  }
  if (!['payment.captured', 'order.paid'].includes(event.event)) return json({ ok: true, skipped: true });

  const payment = event.payload?.payment?.entity ?? {};
  const order = event.payload?.order?.entity ?? {};
  const bookingId = payment.notes?.bookingId || order.notes?.bookingId;
  if (!bookingId) return json({ ok: true, skipped: true, reason: 'no booking id' });

  const booking = await getBooking(bookingId);
  if (!booking) return json({ ok: true, skipped: true, reason: 'booking not found' });
  if (booking.data?.paymentStatus !== 'Paid') {
    await patchBooking(bookingId, paidPatch(payment.order_id || order.id || '', payment.id || '', 'webhook'));
  }
  return json({ ok: true });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('Use POST.', 405);
  if (!KEY_ID || !KEY_SECRET) return fail('Online payment is not set up yet. Please pay at pickup.', 503);

  const signature = req.headers.get('x-razorpay-signature');
  if (signature) return handleWebhook(req, signature);

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail('Body must be JSON.');
  }

  const userId = await callerId(req);
  if (!userId) return fail('Please sign in again.', 401);

  const bookingId = String(body.bookingId ?? '');
  const booking = bookingId ? await getBooking(bookingId) : null;
  if (!booking || booking.user_id !== userId) return fail('Booking not found.', 404);
  const d = booking.data || {};

  /* ---- create (or reuse) the order ---- */
  if (body.action === 'order') {
    if (d.paymentStatus === 'Paid') return fail('This booking is already paid.', 409);
    if (['Cancelled', 'Rejected'].includes(d.status)) return fail('This booking is no longer active.', 409);

    // The amount comes from the fare saved on the booking. Customers cannot
    // change it after booking (supabase-booking-rules.sql), and operations see
    // it on every booking before accepting.
    const amount = Math.round((Number(d.quote?.payable) || 0) * 100);
    if (amount < 100) return fail('This booking has nothing to pay.');

    // A retry for the same amount reuses the order instead of making another.
    if (d.razorpay?.orderId && d.razorpay?.amount === amount) {
      return json({ ok: true, keyId: KEY_ID, orderId: d.razorpay.orderId, amount, currency: 'INR' });
    }

    const res = await razorpay('orders', {
      amount,
      currency: 'INR',
      receipt: String(d.ref || bookingId).slice(0, 40),
      notes: { bookingId, ref: String(d.ref ?? '') },
    });
    const order = await res.json().catch(() => ({}));
    if (!res.ok || !order.id) {
      console.error('[razorpay] order failed', JSON.stringify(order));
      return fail(order?.error?.description || 'Could not start the payment. Please try again.', 502);
    }
    await patchBooking(bookingId, { razorpay: { orderId: order.id, amount } });
    return json({ ok: true, keyId: KEY_ID, orderId: order.id, amount, currency: 'INR' });
  }

  /* ---- verify a completed payment ---- */
  if (body.action === 'verify') {
    const orderId = String(body.orderId ?? '');
    const paymentId = String(body.paymentId ?? '');
    const sig = String(body.signature ?? '');
    if (!orderId || !paymentId || !sig) return fail('Payment details are missing.');

    const expected = await hmacHex(KEY_SECRET, `${orderId}|${paymentId}`);
    if (!safeEqual(expected, sig)) return fail('This payment could not be verified.');

    // The signature proves Razorpay took the money for this order; make sure
    // the order is the one created for this booking.
    if (d.razorpay?.orderId !== orderId) {
      const res = await razorpay(`orders/${encodeURIComponent(orderId)}`);
      const order = await res.json().catch(() => ({}));
      if (order?.notes?.bookingId !== bookingId) return fail('That payment belongs to a different booking.');
    }

    if (d.paymentStatus !== 'Paid') {
      const saved = await patchBooking(bookingId, paidPatch(orderId, paymentId, 'checkout'));
      if (!saved) return fail('Payment received, but the booking could not be updated. We will fix it — no need to pay again.', 500);
    }
    return json({ ok: true, paymentId });
  }

  return fail('Unknown action.');
});
