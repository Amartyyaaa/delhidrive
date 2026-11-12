// Rental terms & conditions — one source for the clauses printed on the rental
// agreement, the key points sent to a customer when their booking is accepted,
// and the link to the full terms page.
//
// public/terms.html is the same terms as a standalone page (it has to work
// without the app, for links opened from WhatsApp). Keep the two in step.

import { SITE_URL, COMPANY_PHONE } from './config';
import {
  SELF_PICKUP_HUB,
  LATE_GRACE_MINUTES,
  MIN_RENTAL_HOURS,
  locationLabel,
  latePenaltyRate,
  normaliseSettings,
} from './pricing';
import { MIN_INSPECTION_PHOTOS } from './verification';
import { inr, fmtDateTime } from './format';

export const TERMS_URL = `${SITE_URL}/terms.html`;

/** Full clauses, as printed on the rental agreement PDF. */
export const AGREEMENT_TERMS = [
  'A booking is accepted only after the Lessee’s KYC — a valid Indian driving licence and Aadhaar card — has been submitted and verified by DelhiDrive. The Lessee confirms the licence has been held for a minimum of 12 months and will be produced in original at handover.',
  `The minimum rental period is ${MIN_RENTAL_HOURS} hours. Rentals of up to ${MIN_RENTAL_HOURS} hours are billed at the ${MIN_RENTAL_HOURS}-hour slab and longer rentals per day or part-day.`,
  'The vehicle shall be driven only by the Lessee and any additional driver expressly recorded on this agreement and covered under the insurance policy.',
  'Driving under the influence of alcohol or any intoxicating substance voids all insurance cover and makes the Lessee liable for the full assessed value of loss.',
  'The vehicle shall not be used for racing, motor sport, driving instruction, subletting, transport of contraband, or for carrying passengers or goods for hire or reward.',
  `Photographs of the vehicle — front, both sides, rear and the dashboard, at least ${MIN_INSPECTION_PHOTOS} in all — are recorded at handover and again at return. Damage not visible in the handover photographs is chargeable to the Lessee.`,
  `The rental ends only when DelhiDrive staff record the vehicle as received. Return after the scheduled time is charged at the late-return rate stated above, which depends on the vehicle's seating (5-seater or 7-seater), in full-hour blocks after a ${LATE_GRACE_MINUTES}-minute grace period, until the vehicle is received.`,
  'Traffic challans, toll charges and parking penalties incurred during the rental period are recoverable from the Lessee, including a Rs. 250 administrative fee per notice.',
  'Fuel or state of charge is to be returned at the level recorded on the digital handover checklist. Any shortfall is billed at prevailing retail rates plus a Rs. 300 service charge.',
  'Interstate travel is permitted within India subject to applicable state permits. The Lessee bears all interstate entry taxes and green-tax levies.',
  'The security deposit is refunded to the source account within seven working days of return, net of any damage, fuel shortfall, late-return penalty or challan liability recorded at inspection.',
  'Damage not covered by the insurance policy, including tyres, rims, glass, undercarriage, interiors and the vehicle keys, is chargeable at actuals unless a specific add-on cover was purchased.',
  'In the event of a breakdown, the Lessee shall immediately notify the DelhiDrive 24x7 helpline and shall not authorise third-party repairs without written approval.',
  'The Lessor may repossess the vehicle without notice if it is used in breach of these terms or if the rental period is exceeded by more than twelve hours without an approved extension.',
  'This agreement is governed by the laws of India. Courts at New Delhi shall have exclusive jurisdiction over any dispute arising hereunder.',
];

/** The handful of points every customer should read before pickup. */
export function keyTerms(booking, car, settings) {
  const s = normaliseSettings(settings);
  const rate = Number(booking?.quote?.latePenaltyPerHour) || latePenaltyRate(car, s);
  const seats = Number(car?.seats) >= 7 ? '7-seater' : '5-seater';
  return [
    'Bring your original driving licence and Aadhaar. The car is handed only to the person named on the booking.',
    `Minimum rental is ${MIN_RENTAL_HOURS} hours.`,
    `Late return costs ${inr(rate)}/hour for this ${seats}, after a ${LATE_GRACE_MINUTES}-minute grace period, in full hours.`,
    'The rental — and any late charge — ends only when our team receives the car back.',
    `At pickup and return we photograph the car (all four sides and the dashboard, at least ${MIN_INSPECTION_PHOTOS} photos). Damage not in the pickup photos is charged.`,
    'Return the fuel at the level you received it; any shortfall is billed plus ₹300.',
    'Challans, tolls and parking fines during your trip are yours, plus ₹250 per notice.',
    'No drink-driving, racing, sub-letting or carrying paying passengers — any of these voids the insurance.',
    `Your ${inr(booking?.quote?.deposit)} deposit is refunded within 7 working days of return, minus any dues.`,
    `Free cancellation up to ${s.cancellationWindowHours} hours before pickup.`,
  ];
}

/** The WhatsApp message a customer receives when their booking is accepted. */
export function acceptanceMessage(booking, car, settings) {
  const q = booking.quote || {};
  const selfPickup = booking.locationId === SELF_PICKUP_HUB.id;
  return [
    '*BOOKING CONFIRMED — DELHIDRIVE*',
    '',
    `Hi ${String(booking.customerName || '').split(' ')[0] || 'there'}, your booking *${booking.ref}* is confirmed.`,
    '',
    `Car: ${car?.name || booking.carName}${booking.carPlate || car?.plate ? ` (${booking.carPlate || car.plate})` : ''}`,
    `Pickup: ${fmtDateTime(booking.pickupMs)} — ${locationLabel(booking.locationId)}`,
    ...(selfPickup ? [SELF_PICKUP_HUB.address, SELF_PICKUP_HUB.mapsUrl] : []),
    `Return: ${fmtDateTime(booking.returnMs)} — ${locationLabel(booking.dropLocationId)}`,
    `Amount: ${inr(q.payable)} (${booking.paymentStatus || 'payment pending'})`,
    '',
    '*Please read before pickup*',
    ...keyTerms(booking, car, settings).map((t, i) => `${i + 1}. ${t}`),
    '',
    `Full terms & conditions: ${TERMS_URL}`,
    'Taking the car means you accept these terms.',
    '',
    `Helpline (24×7): ${COMPANY_PHONE}`,
  ].join('\n');
}
