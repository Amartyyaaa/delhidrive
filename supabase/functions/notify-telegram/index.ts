// DelhiDrive — operations alerts to Telegram, fired by the database itself.
//
// WHY THIS EXISTS: the app used to POST to Telegram directly, which meant the
// bot token shipped inside the APK and could be extracted by anyone who
// installed it. Here the token lives in Supabase's secret store and never
// leaves the server.
//
// It is driven by a Database Webhook on INSERT, so the alert fires from the
// row itself. That is strictly better than firing from the client: it works
// even if the phone dies mid-booking, and it covers rows created by the
// website too.
//
// Deploy (see README.md in this folder):
//   supabase secrets set TELEGRAM_BOT_TOKEN=...
//   supabase secrets set TELEGRAM_CHAT_ID=...
//   supabase functions deploy notify-telegram --no-verify-jwt

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

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

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/** Telegram HTML mode allows a few tags only; escape everything else. */
const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const inr = (n: unknown) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');

const fmtDateTime = (ms: unknown) => {
  const n = Number(ms);
  if (!n) return '—';
  // Render in IST regardless of where the function happens to run.
  return new Date(n).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const HUBS: Record<string, string> = {
  airport: 'Delhi Airport — Terminal 3',
  station: 'New Delhi Railway Station',
  home: 'Home Delivery',
  // Retired hubs, so older rows still read correctly.
  t3: 'Delhi Airport T3',
  cp: 'Connaught Place',
  cyber: 'Cyber City Gurgaon',
  noida18: 'Noida Sector 18',
  door: 'Doorstep Delivery',
};
const hubName = (id: unknown) => HUBS[String(id)] || '—';

/* ------------------------------------------------------------------ */
/* Messages — same wording the app used to send                        */
/* ------------------------------------------------------------------ */

function bookingAlert(d: Record<string, any>) {
  const lines = [
    `🚗 <b>New Booking — needs review!</b>`,
    ``,
    `<b>Ref:</b> ${esc(d.ref)}`,
    `<b>Name:</b> ${esc(d.customerName)}`,
    `<b>Phone:</b> ${esc(d.customerPhone)}`,
    `<b>Car:</b> ${esc(d.carName)}${d.carPlate ? ` (${esc(d.carPlate)})` : ''}`,
    `<b>Pickup:</b> ${esc(fmtDateTime(d.pickupMs))}`,
    `<b>From:</b> ${esc(hubName(d.locationId))}`,
    `<b>Return:</b> ${esc(fmtDateTime(d.returnMs))}`,
    `<b>Amount:</b> ${esc(inr(d.quote?.payable))} (${esc(
      String(d.paymentMethod || '—').toUpperCase()
    )} · ${esc(d.paymentStatus || '—')})`,
  ];

  if (d.delivery?.line) {
    lines.push(
      `<b>Deliver to:</b> ${esc(d.delivery.line)}${
        d.delivery.landmark ? ` — ${esc(d.delivery.landmark)}` : ''
      }`
    );
    if (d.delivery.coords) {
      lines.push(`<b>Map:</b> https://maps.google.com/?q=${d.delivery.coords.lat},${d.delivery.coords.lng}`);
    }
  }

  const socials = Object.values(d.verification?.socials || {}) as Array<{ url?: string }>;
  if (socials.length) {
    lines.push(`<b>Social:</b> ${socials.map((s) => esc(s.url)).join(' · ')}`);
  }

  lines.push(``, `<b>KYC:</b> ${esc(d.kycStatus || 'Pending Review')}`);
  lines.push(`<i>Open the Ops console to accept or reject.</i>`);
  lines.push(`<b>Source:</b> DelhiDrive`);
  return lines.join('\n');
}

function kycAlert(d: Record<string, any>) {
  return [
    `🪪 <b>New KYC submission!</b>`,
    ``,
    `<b>Name:</b> ${esc(d.name)}`,
    `<b>Email:</b> ${esc(d.email)}`,
    `<b>Licence:</b> ${esc(d.licenceNo)}`,
    `<b>Submitted:</b> ${esc(fmtDateTime(d.submittedAt))}`,
    ``,
    `<i>Review it in the Ops console → KYC.</i>`,
    `<b>Source:</b> DelhiDrive`,
  ].join('\n');
}

function subscriptionAlert(d: Record<string, any>) {
  return [
    `♾️ <b>New subscription!</b>`,
    ``,
    `<b>Ref:</b> ${esc(d.ref)}`,
    `<b>Name:</b> ${esc(d.customerName)}`,
    `<b>Phone:</b> ${esc(d.customerPhone)}`,
    `<b>Car:</b> ${esc(d.carName)}`,
    `<b>Plan:</b> ${esc(d.months)} months · ${esc(inr(d.monthlyWithGst))}/month`,
    ``,
    `<b>Source:</b> DelhiDrive`,
  ].join('\n');
}

function testAlert() {
  return [
    `✅ <b>DelhiDrive is connected</b>`,
    ``,
    `Booking, KYC and subscription alerts will arrive in this chat.`,
    `<i>Sent ${esc(fmtDateTime(Date.now()))}</i>`,
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/* Delivery                                                            */
/* ------------------------------------------------------------------ */

/**
 * Accept / Reject buttons, attached to booking alerts only.
 *
 * callback_data is capped at 64 bytes by Telegram, so it carries just a verb
 * and the row id — the handler reads everything else from the database.
 */
function decisionKeyboard(bookingId: string) {
  return {
    inline_keyboard: [
      [
        { text: '✅ Accept', callback_data: `a:${bookingId}` },
        { text: '❌ Reject', callback_data: `r0:${bookingId}` },
      ],
    ],
  };
}

async function sendToTelegram(
  token: string,
  chatIds: string[],
  text: string,
  replyMarkup?: unknown
) {
  const results = await Promise.all(
    chatIds.map(async (chatId) => {
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body?.ok === false) {
          return { ok: false, chatId, reason: body?.description || `HTTP ${res.status}` };
        }
        return { ok: true, chatId };
      } catch (err) {
        return { ok: false, chatId, reason: String(err) };
      }
    })
  );
  return results;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'Use POST.' }, 405);

  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const chatIds = String(Deno.env.get('TELEGRAM_CHAT_ID') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!token || !chatIds.length) {
    console.error('[notify-telegram] secrets missing');
    return json({ ok: false, error: 'TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set.' }, 500);
  }

  let payload: Record<string, any>;
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: 'Body must be JSON.' }, 400);
  }

  // Manual test from the Ops console.
  if (payload.test) {
    const results = await sendToTelegram(token, chatIds, testAlert());
    const delivered = results.filter((r) => r.ok).length;
    return json({ ok: delivered > 0, delivered, total: chatIds.length });
  }

  // Database Webhook shape: { type, table, record: { id, user_id, data } }
  const { type, table, record } = payload;
  if (type !== 'INSERT' || !record) {
    // Not an insert we care about — acknowledge so Supabase does not retry.
    return json({ ok: true, skipped: true });
  }

  const data = record.data || {};
  let text: string | null = null;
  let keyboard: unknown = undefined;

  if (table === 'bookings') {
    text = bookingAlert(data);
    // Only bookings are actionable, and only while they await a decision.
    if (data.status === 'Under review') keyboard = decisionKeyboard(record.id);
  } else if (table === 'kyc') text = kycAlert(data);
  else if (table === 'subscriptions') text = subscriptionAlert(data);

  if (!text) return json({ ok: true, skipped: true, table });

  const results = await sendToTelegram(token, chatIds, text, keyboard);
  const delivered = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  if (failed.length) console.error('[notify-telegram] failures:', JSON.stringify(failed));

  return json({ ok: delivered > 0, delivered, total: chatIds.length });
});
