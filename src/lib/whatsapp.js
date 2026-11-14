// WhatsApp booking hand-off.
//
// A browser-only app cannot silently send a WhatsApp message — that needs the
// WhatsApp Business API, which must be called from a server with a secret
// token. What we do instead is compose the full booking summary and open a
// pre-filled chat to the operations number, so the message is one tap away and
// nothing has to be typed. See the README for how to make it fully automatic
// with a Supabase Edge Function later.

import { WHATSAPP_NUMBER, SITE_URL } from './config';
import { LOCATIONS, locationLabel } from './pricing';
import { inr } from './format';
import { HOST_SUBMITTED_MESSAGE, HOST_STATUS, carTitle } from './host';

const hubName = locationLabel;

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
    ...(booking.verification
      ? [
          '',
          '*Verification*',
          `Live selfie: ${booking.verification.selfie ? 'captured' : 'MISSING'}`,
          ...Object.entries(booking.verification.socials || {}).map(
            ([k, v]) => `${k[0].toUpperCase() + k.slice(1)}: ${v.url}`
          ),
        ]
      : []),
    ...(booking.delivery?.address
      ? [
          '',
          '*Delivery address*',
          booking.delivery.address,
          ...(booking.delivery.coords
            ? [
                `Map: https://www.google.com/maps/search/?api=1&query=${booking.delivery.coords.lat},${booking.delivery.coords.lng}`,
              ]
            : []),
        ]
      : []),
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

/* ------------------------------------------------------------------ */
/* Messages to the customer                                            */
/* ------------------------------------------------------------------ */

/** wa.me link that opens a chat with the customer, message pre-filled. */
export function customerWhatsappUrl(phone, text) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) digits = `91${digits.slice(1)}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Telling a customer their booking could not be accepted, and why. */
export function rejectionMessage(booking, { refund = 0 } = {}) {
  return [
    '*DELHIDRIVE — BOOKING UPDATE*',
    '',
    `Hi ${String(booking.customerName || '').split(' ')[0] || 'there'}, we are sorry — we could not accept booking *${booking.ref}* (${booking.carName}, ${dt(booking.pickupMs)}).`,
    '',
    `Reason: ${booking.rejectionReason || 'not specified'}`,
    ...(refund > 0 ? ['', `Your payment of ${inr(refund)} will be refunded to the original payment method within 7 working days.`] : []),
    '',
    'Reply here if you have questions, or to book again once this is sorted.',
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/* Host Your Car                                                       */
/* ------------------------------------------------------------------ */

/** A chat with operations, with the vendor's "I have submitted" message ready to send. */
export function hostSubmittedWhatsappUrl() {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(HOST_SUBMITTED_MESSAGE)}`;
}

/** Telling a vendor what was decided about their car. */
export function hostDecisionMessage(app) {
  const first = String(app.host?.name || '').split(' ')[0] || 'there';
  const car = `${carTitle(app)}${app.car?.plate ? ` (${app.car.plate})` : ''}`;

  if (app.status === HOST_STATUS.approved) {
    return [
      '*DELHIDRIVE — YOUR CAR IS LIVE*',
      '',
      `Hi ${first}, good news — your ${car} has been approved and is now live on DelhiDrive.`,
      '',
      `See it here: ${SITE_URL}/fleet?q=${encodeURIComponent(carTitle(app))}`,
      `Application: ${app.ref}`,
      '',
      'Reply here if you have any questions.',
    ].join('\n');
  }

  if (app.delistedAt) {
    return [
      '*DELHIDRIVE — LISTING UPDATE*',
      '',
      `Hi ${first}, your ${car} is no longer listed on DelhiDrive.`,
      '',
      `Reason: ${app.rejectionReason || 'not specified'}`,
      '',
      `You can apply again here: ${SITE_URL}/host-your-car`,
      `Application: ${app.ref}`,
    ].join('\n');
  }

  return [
    '*DELHIDRIVE — HOST APPLICATION UPDATE*',
    '',
    `Hi ${first}, thank you for offering your ${car} to DelhiDrive. We could not approve it this time.`,
    '',
    `Reason: ${app.rejectionReason || 'not specified'}`,
    '',
    `You can correct this and apply again here: ${SITE_URL}/host-your-car`,
    `Application: ${app.ref}`,
  ].join('\n');
}
