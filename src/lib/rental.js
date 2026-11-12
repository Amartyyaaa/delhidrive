// Booking lifecycle — the states a booking moves through, and the changes
// operations make to it. Shared by the customer dashboard and the console so
// both read a booking the same way.

import { LATE_GRACE_MINUTES, PAYMENT_STATUS, latePenaltyFor } from './pricing';

export const STATUS = {
  review: 'Under review',
  confirmed: 'Confirmed',
  handedOver: 'Handed over',
  returned: 'Returned',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
};

/** Same list the Telegram bot offers, so both surfaces reject for the same reasons. */
export const REJECTION_REASONS = [
  'Driving licence could not be verified',
  'Licence held for less than 12 months',
  'Selfie does not match the licence photo',
  'Social profile could not be verified',
  'Vehicle no longer available for this slot',
  'Delivery address outside our service area',
];

/** Statuses older bookings (or the app) may use for a finished rental. */
const FINISHED = /^(returned|completed|closed)$/i;

/**
 * Where a booking stands right now:
 * review · upcoming · active · overdue · completed · cancelled · rejected
 *
 * "overdue" is the important one: the return time has passed but nobody has
 * received the car yet, so the late charge is still running.
 */
export function bookingPhase(b, now = Date.now()) {
  if (b.status === STATUS.cancelled) return 'cancelled';
  if (b.status === STATUS.rejected) return 'rejected';
  if (b.returnedAt || FINISHED.test(String(b.status || ''))) return 'completed';
  if (b.status === STATUS.review) return 'review';
  if (now < b.pickupMs) return 'upcoming';
  if (now <= b.returnMs + LATE_GRACE_MINUTES * 60000) return 'active';
  return 'overdue';
}

export const PHASE_META = {
  review: { tone: 'warning', label: 'Under review' },
  upcoming: { tone: 'info', label: 'Upcoming' },
  active: { tone: 'success', label: 'On the road' },
  overdue: { tone: 'danger', label: 'Return overdue' },
  completed: { tone: 'neutral', label: 'Completed' },
  cancelled: { tone: 'danger', label: 'Cancelled' },
  rejected: { tone: 'danger', label: 'Rejected' },
};

export const isPaid = (b) => b?.paymentStatus === PAYMENT_STATUS.paid;

/**
 * The patch that closes a rental when the car comes back. Fixes the late
 * charge at that moment so it stops running, optionally waived.
 */
export function receiveCarPatch(booking, { receivedAt = Date.now(), waive = false, by = '', car, settings } = {}) {
  const assessed = latePenaltyFor({ ...booking, latePenalty: null, returnedAt: receivedAt }, { car, settings });
  return {
    status: STATUS.returned,
    returnedAt: receivedAt,
    receivedBy: by,
    latePenalty: {
      overdueMs: assessed.overdueMs,
      hours: assessed.hours,
      rate: assessed.rate,
      assessed: assessed.amount,
      amount: waive ? 0 : assessed.amount,
      waived: Boolean(waive && assessed.amount > 0),
    },
  };
}
