// DelhiDrive — accept or reject a booking from inside Telegram.
//
// The alert posted by `notify-telegram` carries two inline buttons. Tapping
// one sends a callback_query here; this function writes the decision straight
// to the database and edits the original message so the chat becomes the audit
// trail — who decided what, and when.
//
// Rejecting asks for a reason first (a second row of buttons), because a
// rejection the customer cannot act on is worse than no rejection at all.
//
// SECURITY. Two independent gates, because this endpoint can change booking
// state:
//   1. Telegram signs every call with the secret set at setWebhook time; a
//      request without the matching header is dropped.
//   2. Only Telegram user ids listed in TELEGRAM_ADMIN_IDS may decide. Being
//      in the group is not enough — group membership is not authorisation.
//
// Deploy:
//   supabase functions deploy telegram-webhook --no-verify-jwt
//   (then register it with Telegram — see README.md)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? '';
const ADMIN_IDS = String(Deno.env.get('TELEGRAM_ADMIN_IDS') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Supabase injects these into every Edge Function automatically.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/** Same list the app offers, so both surfaces reject for the same reasons. */
const REJECTION_REASONS = [
  'Driving licence could not be verified',
  'Licence held for less than 12 months',
  'Selfie does not match the licence photo',
  'Social profile could not be verified',
  'Vehicle no longer available for this slot',
  'Delivery address outside our service area',
];

const tg = (method: string, body: unknown) =>
  fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/**
 * The pair of buttons on an undecided booking. Mirrors the keyboard that
 * notify-telegram attaches, so backing out of the reason list restores
 * exactly what was there before.
 */
const decisionRow = (bookingId: string) => [
  { text: '✅ Accept', callback_data: `a:${bookingId}` },
  { text: '❌ Reject', callback_data: `r0:${bookingId}` },
];

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const nowIst = () =>
  new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

/* ------------------------------------------------------------------ */
/* Database                                                            */
/* ------------------------------------------------------------------ */

/** Read one row from a table using the service key (bypasses RLS). */
async function getRow(table: string, id: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=*`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : null;
}

/** Merge a patch into the row's jsonb `data` column. */
async function patchData(table: string, id: string, patch: Record<string, unknown>) {
  const row = await getRow(table, id);
  if (!row) return { ok: false, error: 'Row not found.' };
  const merged = { ...(row.data || {}), ...patch };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ data: merged }),
  });
  if (!res.ok) return { ok: false, error: `Update failed (${res.status}).` };
  return { ok: true, row, data: merged };
}

/** Verifying the renter's KYC is part of accepting their booking. */
async function verifyKycFor(userId: string) {
  if (!userId) return;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/kyc?user_id=eq.${encodeURIComponent(userId)}&select=id,data`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const rows = await res.json();
  const doc = Array.isArray(rows) ? rows[0] : null;
  if (!doc) return;
  await patchData('kyc', doc.id, { status: 'Verified', reviewedAt: Date.now() });
}

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */

serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('ok');

  // Gate 1: the shared secret Telegram sends with every call.
  if (WEBHOOK_SECRET) {
    const got = req.headers.get('x-telegram-bot-api-secret-token');
    if (got !== WEBHOOK_SECRET) {
      console.warn('[telegram-webhook] bad secret token');
      return new Response('forbidden', { status: 403 });
    }
  }

  let update: Record<string, any>;
  try {
    update = await req.json();
  } catch {
    return new Response('ok');
  }

  const cq = update.callback_query;
  if (!cq) return new Response('ok'); // plain messages are ignored

  const fromId = String(cq.from?.id ?? '');
  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;
  const originalText = cq.message?.text ?? '';
  const answer = (text: string, alert = false) =>
    tg('answerCallbackQuery', { callback_query_id: cq.id, text, show_alert: alert });

  // Gate 2: only listed operators may decide.
  if (ADMIN_IDS.length && !ADMIN_IDS.includes(fromId)) {
    await answer('You are not authorised to action bookings.', true);
    return new Response('ok');
  }

  const data = String(cq.data ?? '');
  const who = [cq.from?.first_name, cq.from?.last_name].filter(Boolean).join(' ') || 'operator';

  /* ---- Reject tapped: offer the reasons ---- */
  if (data.startsWith('r0:')) {
    const bookingId = data.slice(3);
    await tg('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          ...REJECTION_REASONS.map((reason, i) => [
            { text: `❌ ${reason}`, callback_data: `r1:${i}:${bookingId}` },
          ]),
          [{ text: '◀︎ Back', callback_data: `bk:${bookingId}` }],
        ],
      },
    });
    await answer('Pick a reason — the customer sees it.');
    return new Response('ok');
  }

  /* ---- Back out of the reason list ---- */
  if (data.startsWith('bk:')) {
    const bookingId = data.slice(3);
    await tg('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [decisionRow(bookingId)] },
    });
    await answer('');
    return new Response('ok');
  }

  /* ---- Accept ---- */
  if (data.startsWith('a:')) {
    const bookingId = data.slice(2);
    const at = Date.now();
    const res = await patchData('bookings', bookingId, {
      status: 'Confirmed',
      kycStatus: 'Verified',
      approvedAt: at,
      approvedVia: 'telegram',
      approvedBy: who,
    });
    if (!res.ok) {
      await answer(res.error ?? 'Could not update.', true);
      return new Response('ok');
    }
    await verifyKycFor(res.row.user_id);

    const d = res.data as Record<string, any>;
    await tg('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'HTML',
      text:
        `${esc(originalText)}\n\n` +
        `✅ <b>ACCEPTED</b> by ${esc(who)} · ${esc(nowIst())}\n` +
        `<i>KYC marked verified. Message ${esc(d.customerName)} on ${esc(d.customerPhone)} ` +
        `to confirm — or use the Ops console, which drafts it for you.</i>`,
      reply_markup: { inline_keyboard: [] },
    });
    await answer('Booking accepted ✅');
    return new Response('ok');
  }

  /* ---- Reject with a chosen reason ---- */
  if (data.startsWith('r1:')) {
    const [, idxRaw, ...rest] = data.split(':');
    const bookingId = rest.join(':');
    const reason = REJECTION_REASONS[Number(idxRaw)] ?? 'Could not be approved.';
    const at = Date.now();

    const res = await patchData('bookings', bookingId, {
      status: 'Rejected',
      rejectedAt: at,
      rejectionReason: reason,
      rejectedVia: 'telegram',
      rejectedBy: who,
    });
    if (!res.ok) {
      await answer(res.error ?? 'Could not update.', true);
      return new Response('ok');
    }

    const d = res.data as Record<string, any>;
    await tg('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'HTML',
      text:
        `${esc(originalText)}\n\n` +
        `❌ <b>REJECTED</b> by ${esc(who)} · ${esc(nowIst())}\n` +
        `<b>Reason:</b> ${esc(reason)}\n` +
        `<i>Tell ${esc(d.customerName)} on ${esc(d.customerPhone)} — the Ops console drafts ` +
        `the message with this reason already in it.</i>`,
      reply_markup: { inline_keyboard: [] },
    });
    await answer('Booking rejected');
    return new Response('ok');
  }

  await answer('');
  return new Response('ok');
});

