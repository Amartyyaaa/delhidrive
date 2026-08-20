// WhatsApp booking hand-off.
//
// A browser-only app cannot silently send a WhatsApp message — that needs the
// WhatsApp Business API, which must be called from a server with a secret
// token. What we do instead is compose the full booking summary and open a
// pre-filled chat to the operations number, so the message is one tap away and
// nothing has to be typed. See the README for how to make it fully automatic
// with a Supabase Edge Function later.

import { WHATSAPP_NUMBER } from './config';
import { LOCATIONS } from './pricing';
import { inr } from './format';

const hubName = (id) => LOCATIONS.find((l) => l.id === id)?.label || '—';

const dt = (ms) =>
  new Date(ms).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

/** The message body sent to operations for a new booking. */
export function bookingMessage(booking, car) {
  const q = booking.quote || {};
  const addons = (q.addonLines || []).map((l) => l.label).join(', ') || 'None';

  return [
    '*NEW BOOKING — DELHIDRIVE*',
    '',
    `*Ref:* ${booking.ref}`,
    `*Car:* ${car?.name || booking.carName}${car?.plate ? ` (${car.plate})` : ''}`,
    '',
    '*Customer*',
    `Name: ${booking.customerName}`,
    `Phone: ${booking.customerPhone}${booking.phoneVerified ? ' (verified)' : ''}`,
    `Email: ${booking.customerEmail}`,
    `KYC: ${booking.kycStatus || 'Pending Review'}`,
    '',
    '*Trip*',
    `Pickup: ${dt(booking.pickupMs)}`,
    `Return: ${dt(booking.returnMs)}`,
    `Duration: ${q.charge?.label || (q.days ? q.days + ' day(s)' : '—')}`,
    `From: ${hubName(booking.locationId)}`,
    `To: ${hubName(booking.dropLocationId)}`,
    `Add-ons: ${addons}`,
    '',
    '*Payment*',
    `Base: ${inr(q.base)}`,
    ...(q.logisticsFee ? [`Hub/delivery: ${inr(q.logisticsFee)}`] : []),
    ...(q.discount ? [`Discount (${booking.couponCode}): -${inr(q.discount)}`] : []),
    `GST @ ${q.gstRate}%: ${inr(q.gst)}`,
    `Deposit (refundable): ${inr(q.deposit)}`,
    `*TOTAL: ${inr(q.payable)}*`,
    `Method: ${String(booking.paymentMethod || '').toUpperCase()} — ${booking.paymentStatus}`,
  ].join('\n');
}

/** wa.me deep link with the message pre-filled. */
export function bookingWhatsappUrl(booking, car) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(bookingMessage(booking, car))}`;
}

/**
 * Opens the pre-filled chat. Called straight from the checkout click handler so
 * the browser treats it as user-initiated and does not block the popup.
 */
export function sendBookingToWhatsapp(booking, car) {
  const win = window.open(bookingWhatsappUrl(booking, car), '_blank', 'noopener,noreferrer');
  return Boolean(win);
}

/** Generic "chat to us" link used in the footer and support screens. */
export function supportWhatsappUrl(text = 'Hello DelhiDrive, I need help with a booking.') {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}
