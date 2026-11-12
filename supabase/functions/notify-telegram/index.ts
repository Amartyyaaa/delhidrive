// DelhiDrive — operations alerts to Telegram, fired by the database itself.
//
// WHY THIS EXISTS: the app used to POST to Telegram directly, which meant the
// bot token shipped inside the APK and could be extracted by anyone who
// installed it. Here the token lives in Supabase's secret store and never
// leaves the server.
//
// It is driven by database triggers, so the alert fires from the row itself.
// That is strictly better than firing from the client: it works even if the
// phone dies mid-booking, and it covers rows written by the website too.
//
//   INSERT  new booking, KYC submission or subscription
//   UPDATE  a booking accepted, rejected, cancelled, edited, paid, handed over
//           or received back; a KYC re-submitted after a rejection
//   {"overdue": true}  sent every 15 minutes by pg_cron — alerts once for each
//           car past its return time that nobody has marked received
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
  hub: 'Self pickup — Kaushambi Metro Station',
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

/** "2h 15m" */
const fmtSpan = (ms: number) => {
  const mins = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  return [d && `${d}d`, (d || h) && `${h}h`, `${m}m`].filter(Boolean).join(' ');
};

/** Late-return grace, as in src/lib/pricing.js. */
const GRACE_MS = 29 * 60000;

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

  // The app stores the address as line + landmark, the website as address.
  const deliverTo = d.delivery?.line || d.delivery?.address;
  if (deliverTo) {
    lines.push(
      `<b>Deliver to:</b> ${esc(deliverTo)}${
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

function kycAlert(d: Record<string, any>, resubmitted = false) {
  return [
    resubmitted ? `🪪 <b>KYC re-submitted — needs review</b>` : `🪪 <b>New KYC submission!</b>`,
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

/**
 * What changed on a booking, as one message — or null when nothing worth an
 * alert changed. Decisions taken in Telegram itself are skipped: the bot has
 * already edited the original alert to say so.
 */
function bookingUpdateAlert(d: Record<string, any>, old: Record<string, any>) {
  const lines: string[] = [];
  const statusChanged = d.status !== old.status;
  const decidedInTelegram =
    (d.status === 'Confirmed' && d.approvedVia === 'telegram') ||
    (d.status === 'Rejected' && d.rejectedVia === 'telegram');

  if (statusChanged && !decidedInTelegram) {
    if (d.status === 'Confirmed' && old.status === 'Under review') {
      lines.push(`✅ <b>Booking accepted</b>${d.approvedBy ? ` by ${esc(d.approvedBy)}` : ''}`);
    } else if (d.status === 'Rejected') {
      lines.push(`❌ <b>Booking rejected</b>${d.rejectedBy ? ` by ${esc(d.rejectedBy)}` : ''}`);
      if (d.rejectionReason) lines.push(`<b>Reason:</b> ${esc(d.rejectionReason)}`);
    } else if (d.status === 'Cancelled') {
      lines.push(`🚫 <b>Booking cancelled</b>`);
      if (d.refund?.total) lines.push(`<b>Refund due:</b> ${esc(inr(d.refund.total))}`);
    } else if (d.status === 'Handed over') {
      lines.push(`🔑 <b>Car handed over</b>${d.handedOverBy ? ` by ${esc(d.handedOverBy)}` : ''}`);
    } else if (d.status === 'Returned') {
      const p = d.latePenalty || {};
      lines.push(`🏁 <b>Car received back</b>${d.receivedBy ? ` by ${esc(d.receivedBy)}` : ''}`);
      lines.push(
        p.assessed > 0
          ? `<b>Late by:</b> ${esc(fmtSpan(p.overdueMs))} — ${
              p.waived ? `late charge of ${esc(inr(p.assessed))} waived` : `late charge ${esc(inr(p.amount))}`
            }`
          : `<b>Returned on time.</b>`
      );
    } else {
      lines.push(`🔄 <b>Status:</b> ${esc(old.status || '—')} → ${esc(d.status || '—')}`);
    }
  }

  if (d.paymentStatus !== old.paymentStatus && d.paymentStatus === 'Paid') {
    lines.push(
      `💰 <b>Payment received:</b> ${esc(inr(d.quote?.payable))}${d.txnRef ? ` · ${esc(d.txnRef)}` : ''}${
        d.paymentVerified ? ' (verified by Razorpay)' : ''
      }`
    );
  }

  const edits: string[] = [];
  if (d.carId !== old.carId) edits.push(`<b>Car:</b> ${esc(old.carName)} → ${esc(d.carName)}`);
  if (d.pickupMs !== old.pickupMs) {
    edits.push(`<b>Pickup:</b> ${esc(fmtDateTime(old.pickupMs))} → ${esc(fmtDateTime(d.pickupMs))}`);
  }
  if (d.returnMs !== old.returnMs) {
    edits.push(`<b>Return:</b> ${esc(fmtDateTime(old.returnMs))} → ${esc(fmtDateTime(d.returnMs))}`);
  }
  if (edits.length) {
    lines.push(`✏️ <b>Booking changed</b>${d.editedBy ? ` by ${esc(d.editedBy)}` : ''}`, ...edits);
    if (d.quote?.payable !== old.quote?.payable) {
      lines.push(`<b>Total:</b> ${esc(inr(old.quote?.payable))} → ${esc(inr(d.quote?.payable))}`);
    }
  }

  if (!lines.length) return null;
  return [
    ...lines,
    ``,
    `<b>Ref:</b> ${esc(d.ref)} · ${esc(d.carName)}${d.carPlate ? ` (${esc(d.carPlate)})` : ''}`,
    `<b>Customer:</b> ${esc(d.customerName)} · ${esc(d.customerPhone)}`,
    `<b>Trip:</b> ${esc(fmtDateTime(d.pickupMs))} → ${esc(fmtDateTime(d.returnMs))}`,
    `<b>Source:</b> DelhiDrive`,
  ].join('\n');
}

function overdueAlert(d: Record<string, any>, now: number) {
  const late = now - Number(d.returnMs);
  const hours = late > GRACE_MS ? Math.ceil(late / 3600000) : 0;
  const rate = Number(d.quote?.latePenaltyPerHour) || 0;
  return [
    `⏰ <b>Car overdue — not received yet</b>`,
    ``,
    `<b>Ref:</b> ${esc(d.ref)}`,
    `<b>Car:</b> ${esc(d.carName)}${d.carPlate ? ` (${esc(d.carPlate)})` : ''}`,
    `<b>Customer:</b> ${esc(d.customerName)} · ${esc(d.customerPhone)}`,
    `<b>Was due:</b> ${esc(fmtDateTime(d.returnMs))} at ${esc(hubName(d.dropLocationId))}`,
    `<b>Late by:</b> ${esc(fmtSpan(late))}${
      rate ? ` — late charge so far ${esc(inr(hours * rate))} (${esc(inr(rate))}/hour)` : ''
    }`,
    ``,
    `<i>Mark the car received in the Ops console when it is back — the charge runs until then.</i>`,
  ].join('\n');
}

function testAlert() {
  return [
    `✅ <b>DelhiDrive is connected</b>`,
    ``,
    `Booking, KYC, subscription and overdue-car alerts will arrive in this chat.`,
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

/* ------------------------------------------------------------------ */
/* Database (overdue sweep only)                                       */
/* ------------------------------------------------------------------ */

// Supabase injects these into every Edge Function automatically.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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

/** Merge a patch into one booking's jsonb `data`. */
async function patchBookingData(id: string, patch: Record<string, unknown>) {
  const res = await db(`bookings?id=eq.${encodeURIComponent(id)}&select=data`);
  const rows = await res.json().catch(() => null);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return;
  await db(`bookings?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ data: { ...(row.data || {}), ...patch } }),
  });
}

const STILL_OUT = new Set(['Confirmed', 'Handed over', 'Active']);

/**
 * Alert once for each car that should have been back by now but has not been
 * received. Only rentals due in the last three days: older unclosed ones are
 * a tidy-up job for the console, not an alarm.
 */
async function overdueSweep(token: string, chatIds: string[]) {
  if (!SUPABASE_URL || !SERVICE_KEY) return { ok: false, error: 'Service key not available.' };
  const now = Date.now();
  // Only the fields the alert needs — a booking row can carry photos.
  const fields = [
    'id',
    'ref:data->>ref',
    'status:data->>status',
    'carName:data->>carName',
    'carPlate:data->>carPlate',
    'customerName:data->>customerName',
    'customerPhone:data->>customerPhone',
    'returnMs:data->>returnMs',
    'dropLocationId:data->>dropLocationId',
    'overdueAlertedAt:data->>overdueAlertedAt',
    'rate:data->quote->>latePenaltyPerHour',
  ].join(',');
  const res = await db(`bookings?select=${fields}&data->>returnedAt=is.null&order=created_at.desc&limit=500`);
  const rows = await res.json().catch(() => null);
  if (!Array.isArray(rows)) return { ok: false, error: 'Could not read bookings.' };

  const candidates = rows.map((r: Record<string, any>) => ({
    id: r.id,
    data: { ...r, quote: { latePenaltyPerHour: r.rate } },
  }));
  const overdue = candidates.filter(({ data: d }: { data: Record<string, any> }) => {
    const ret = Number(d?.returnMs);
    return (
      d &&
      STILL_OUT.has(d.status) &&
      !d.overdueAlertedAt &&
      ret > now - 3 * 86400000 &&
      now - ret > GRACE_MS
    );
  });

  let sent = 0;
  for (const row of overdue) {
    const results = await sendToTelegram(token, chatIds, overdueAlert(row.data, now));
    if (results.some((r) => r.ok)) {
      sent += 1;
      await patchBookingData(row.id, { overdueAlertedAt: now });
    }
  }
  return { ok: true, overdue: overdue.length, alerted: sent };
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

  // Scheduled sweep for cars past their return time (pg_cron, see webhooks.sql).
  if (payload.overdue) {
    return json(await overdueSweep(token, chatIds));
  }

  // Trigger shape: { type, table, record: { id, user_id, data }, old_record? }
  const { type, table, record, old_record } = payload;
  if ((type !== 'INSERT' && type !== 'UPDATE') || !record) {
    // Not something we alert on — acknowledge so the caller does not retry.
    return json({ ok: true, skipped: true });
  }

  const data = record.data || {};
  const old = old_record?.data || {};
  let text: string | null = null;
  let keyboard: unknown = undefined;

  if (type === 'UPDATE') {
    if (table === 'bookings') text = bookingUpdateAlert(data, old);
    else if (table === 'kyc' && data.status === 'Pending Review' && old.status !== 'Pending Review') {
      text = kycAlert(data, true);
    }
  } else if (table === 'bookings') {
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
