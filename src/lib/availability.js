// Date availability — which cars are already taken over a given window.
//
// A customer can only read their own bookings (row-level security), so the
// busy windows for everyone else come from the `car_busy_slots` database
// function, which returns a car id and two timestamps per booking and nothing
// about who booked. Bookings this session can read directly (your own, or all
// of them for an admin) are always fresher than the last poll, so they win.
// Without Supabase, the local store holds every booking and the same windows
// are derived from those.

import { PAYMENT_STATUS } from './pricing';

/** An online booking that was never paid holds its car this long, then lets it go. */
export const UNPAID_HOLD_MINUTES = 30;

const RELEASED = new Set(['Cancelled', 'Rejected']);

/** Does this booking keep its car off the market? */
export function holdsCar(b, now = Date.now()) {
  if (!b || RELEASED.has(b.status)) return false;
  if (!(Number(b.pickupMs) > 0) || !(Number(b.returnMs) > 0)) return false;
  if (b.paymentStatus === PAYMENT_STATUS.awaiting) {
    const created = Number(b.createdAtMs || b.createdAt) || 0;
    if (created && now - created > UNPAID_HOLD_MINUTES * 60000) return false;
  }
  return true;
}

/** The window a booking blocks: from pickup until the car came back, or is due back. */
export function slotOf(b) {
  return {
    bookingId: b.id,
    carId: b.carId,
    start: Number(b.pickupMs),
    end: Number(b.returnedAt) || Number(b.returnMs),
  };
}

/**
 * Every busy window: the server's list for bookings this session cannot see,
 * plus this session's own bookings, which replace any stale copy.
 */
export function mergeSlots(remoteSlots, visibleBookings, now = Date.now()) {
  const visible = new Set(visibleBookings.map((b) => b.id));
  const others = (remoteSlots || []).filter((s) => !visible.has(s.bookingId));
  return [...others, ...visibleBookings.filter((b) => holdsCar(b, now)).map(slotOf)];
}

export const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

/** Bookings on `carId` that collide with [start, end), soonest first. */
export function clashesFor(slots, carId, start, end, ignoreBookingId) {
  if (!carId || !(end > start)) return [];
  return slots
    .filter(
      (s) => s.carId === carId && s.bookingId !== ignoreBookingId && overlaps(start, end, s.start, s.end)
    )
    .sort((a, b) => a.start - b.start);
}

/**
 * The earliest start at or after `from` when the car is free for `durationMs`
 * in one stretch — used to offer the next slot when the chosen one is sold out.
 */
export function nextFreeStart(slots, carId, from, durationMs, ignoreBookingId) {
  let start = from;
  for (let i = 0; i < 100; i++) {
    const clashes = clashesFor(slots, carId, start, start + durationMs, ignoreBookingId);
    if (!clashes.length) return start;
    start = Math.max(...clashes.map((c) => c.end));
  }
  return null;
}

/**
 * A pickup/return pair from two datetime-local strings, as carried in the URL
 * between the home page, the fleet and checkout. Null unless both parse and
 * the return is after the pickup.
 */
export function parseWindow(pickup, ret) {
  const start = pickup ? new Date(pickup).getTime() : NaN;
  const end = ret ? new Date(ret).getTime() : NaN;
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  return { start, end };
}
