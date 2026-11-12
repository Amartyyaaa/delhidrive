// Edit a booking from the console — change the car, the dates, the pickup and
// drop points, the customer's details, the status or the payment state. The
// fare is recalculated for a new car or new dates unless the agreed price
// should stand, and every edit is written to the booking's edit log.

import { useEffect, useMemo, useState } from 'react';
import { Save, AlertTriangle } from 'lucide-react';
import { useStore } from '../../lib/store';
import { useAuth } from '../../lib/auth';
import { useNotify } from '../../lib/notify';
import { LOCATIONS, PAYMENT_STATUS, computeQuote, minRentalHours } from '../../lib/pricing';
import { clashesFor } from '../../lib/availability';
import { STATUS } from '../../lib/rental';
import { inr, toLocalInput } from '../../lib/format';
import { Button, Modal, Field, Input, Select, Textarea, Checkbox, Row } from '../ui';

const FIELDS = {
  carId: 'car',
  pickupMs: 'pickup time',
  returnMs: 'return time',
  locationId: 'pickup point',
  dropLocationId: 'drop point',
  customerName: 'name',
  customerPhone: 'phone',
  customerEmail: 'email',
  status: 'status',
  paymentStatus: 'payment',
  adminNote: 'note',
};

// "Returned" is set by the Car received action, which also fixes the late charge.
const EDITABLE_STATUSES = [STATUS.review, STATUS.confirmed, STATUS.handedOver, STATUS.cancelled, STATUS.rejected];
const PAYMENT_STATES = [PAYMENT_STATUS.awaiting, PAYMENT_STATUS.paid, PAYMENT_STATUS.atPickup, 'Refunded'];

const draftOf = (b) => ({
  carId: b.carId || '',
  pickupMs: Number(b.pickupMs) || Date.now(),
  returnMs: Number(b.returnMs) || Date.now(),
  locationId: b.locationId || '',
  dropLocationId: b.dropLocationId || '',
  customerName: b.customerName || '',
  customerPhone: b.customerPhone || '',
  customerEmail: b.customerEmail || '',
  status: b.status || STATUS.confirmed,
  paymentStatus: b.paymentStatus || '',
  adminNote: b.adminNote || '',
});

export default function EditBookingModal({ booking, onClose }) {
  const { fleet, bookings, busySlots, coupons, settings, patchBooking } = useStore();
  const { user } = useAuth();
  const { push, toast } = useNotify();
  const [draft, setDraft] = useState(null);
  const [reprice, setReprice] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (booking) {
      setDraft(draftOf(booking));
      setReprice(true);
    }
  }, [booking?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const car = useMemo(() => fleet.find((c) => c.id === draft?.carId), [fleet, draft?.carId]);

  const newQuote = useMemo(() => {
    if (!booking || !draft || !car || !(draft.returnMs > draft.pickupMs)) return null;
    return computeQuote({
      car,
      pickupMs: draft.pickupMs,
      returnMs: draft.returnMs,
      addons: booking.addons || {},
      locationId: draft.locationId,
      dropLocationId: draft.dropLocationId,
      couponCode: booking.couponCode || '',
      coupons,
      settings,
    });
  }, [booking, draft, car, coupons, settings]);

  if (!booking || !draft) return null;

  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }));
  const setTime = (key) => (e) => {
    const v = new Date(e.target.value).getTime();
    if (!Number.isNaN(v)) setDraft((d) => ({ ...d, [key]: v }));
  };

  const changed = Object.keys(FIELDS).filter((k) => String(draft[k] ?? '') !== String(booking[k] ?? ''));
  const moved = ['carId', 'pickupMs', 'returnMs', 'locationId', 'dropLocationId'].some((k) => changed.includes(k));
  const hours = (draft.returnMs - draft.pickupMs) / 3600000;
  const dateError =
    draft.returnMs <= draft.pickupMs
      ? 'Return must be after pickup.'
      : hours < minRentalHours(settings)
        ? `Shorter than the ${minRentalHours(settings)}-hour minimum.`
        : '';
  const clashes = clashesFor(busySlots, draft.carId, draft.pickupMs, draft.returnMs, booking.id);
  const clashRefs = clashes.map((c) => bookings.find((x) => x.id === c.bookingId)?.ref || 'another booking');

  const statuses = EDITABLE_STATUSES.includes(booking.status)
    ? EDITABLE_STATUSES
    : [booking.status, ...EDITABLE_STATUSES].filter(Boolean);
  const payments = PAYMENT_STATES.includes(booking.paymentStatus)
    ? PAYMENT_STATES
    : [booking.paymentStatus, ...PAYMENT_STATES].filter(Boolean);

  const save = async () => {
    if (!changed.length) {
      toast('Nothing has changed.', { type: 'info' });
      return;
    }
    if (!car) {
      toast('Pick a car from the fleet.', { type: 'warning' });
      return;
    }
    if (draft.returnMs <= draft.pickupMs) {
      toast('Return must be after pickup.', { type: 'warning' });
      return;
    }
    if (!/^[6-9]\d{9}$/.test(String(draft.customerPhone).replace(/\D/g, '').slice(-10))) {
      toast('Enter a valid 10-digit mobile number.', { type: 'warning' });
      return;
    }
    setBusy(true);
    try {
      const who = user?.email || user?.name || 'console';
      const at = Date.now();
      const patch = {
        ...Object.fromEntries(changed.map((k) => [k, draft[k]])),
        carName: car.name,
        carPlate: car.plate || '',
        carCategory: car.category,
        carSeats: Number(car.seats) || 5,
        ...(moved && reprice && newQuote ? { quote: newQuote } : {}),
        editedAt: at,
        editedBy: who,
        editLog: [
          ...(booking.editLog || []),
          { at, by: who, fields: changed.map((k) => FIELDS[k]) },
        ].slice(-20),
      };
      // Re-opening a closed rental clears its return record, so the late
      // charge is measured afresh against the (possibly new) return time.
      if (booking.returnedAt && draft.status !== STATUS.returned) {
        patch.returnedAt = null;
        patch.latePenalty = null;
      }
      await patchBooking(booking.id, patch);
      push('Booking updated · ' + booking.ref, `Changed ${changed.map((k) => FIELDS[k]).join(', ')}.`, {
        type: 'success',
      });
      onClose();
    } catch (err) {
      toast(err.message || 'Could not save the booking.', { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(booking)}
      onClose={onClose}
      size="lg"
      title={`Edit booking ${booking.ref}`}
      subtitle={`${booking.customerName} · created ${new Date(booking.createdAtMs || booking.createdAt).toLocaleString('en-IN')}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={Save} onClick={save} loading={busy} disabled={busy || !changed.length}>
            {clashes.length ? 'Save anyway' : 'Save changes'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Car" className="sm:col-span-3">
            <Select value={draft.carId} onChange={set('carId')}>
              {!car && <option value={draft.carId}>{booking.carName} (no longer in the fleet)</option>}
              {fleet.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.plate} · {c.seats} seats{c.status === 'maintenance' ? ' · in maintenance' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Pickup">
            <Input type="datetime-local" value={toLocalInput(draft.pickupMs)} onChange={setTime('pickupMs')} />
          </Field>
          <Field label="Return">
            <Input type="datetime-local" value={toLocalInput(draft.returnMs)} onChange={setTime('returnMs')} />
          </Field>
          <Field label="Status">
            <Select value={draft.status} onChange={set('status')}>
              {statuses.map((st) => (
                <option key={st}>{st}</option>
              ))}
            </Select>
          </Field>
          <Field label="Pickup point">
            <Select value={draft.locationId} onChange={set('locationId')}>
              {!LOCATIONS.some((l) => l.id === draft.locationId) && (
                <option value={draft.locationId}>{draft.locationId || '—'}</option>
              )}
              {LOCATIONS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Drop point">
            <Select value={draft.dropLocationId} onChange={set('dropLocationId')}>
              {!LOCATIONS.some((l) => l.id === draft.dropLocationId) && (
                <option value={draft.dropLocationId}>{draft.dropLocationId || '—'}</option>
              )}
              {LOCATIONS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Payment">
            <Select value={draft.paymentStatus} onChange={set('paymentStatus')}>
              {payments.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          </Field>
        </div>

        {dateError && <p className="text-[12px] font-medium text-amber-300">{dateError}</p>}
        {clashes.length > 0 && (
          <p className="flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3.5 py-2.5 text-[12.5px] text-rose-200">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            This car is already booked over these times ({clashRefs.join(', ')}). Saving will double-book it.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Customer name">
            <Input value={draft.customerName} onChange={set('customerName')} />
          </Field>
          <Field label="Mobile">
            <Input value={draft.customerPhone} onChange={set('customerPhone')} inputMode="numeric" />
          </Field>
          <Field label="Email">
            <Input type="email" value={draft.customerEmail} onChange={set('customerEmail')} />
          </Field>
        </div>

        <Field label="Note for the team" hint="Only visible in the console.">
          <Textarea rows={2} value={draft.adminNote} onChange={set('adminNote')} placeholder="e.g. extended by phone, customer pays the difference at return" />
        </Field>

        {moved && newQuote && (
          <div className="rounded-xl border border-white/10 bg-ink-950/50 px-4 py-3">
            <Row k="Current total" v={inr(booking.quote?.payable)} />
            <Row
              k={`New total · ${newQuote.charge.tier === 'daily' ? `${newQuote.days} day(s)` : newQuote.charge.label}`}
              v={inr(newQuote.payable)}
              tone={newQuote.payable > (booking.quote?.payable || 0) ? 'text-amber-300' : 'text-emerald-400'}
            />
            <Checkbox
              className="mt-2"
              checked={reprice}
              onChange={setReprice}
              label="Recalculate the fare for the new car, dates or pickup points"
            />
            {!reprice && (
              <p className="mt-1 text-[11.5px] text-slate-500">The agreed price of {inr(booking.quote?.payable)} stays.</p>
            )}
          </div>
        )}

        {(booking.editLog || []).length > 0 && (
          <div>
            <p className="label">Edit history</p>
            <ul className="space-y-1 text-[11.5px] text-slate-500">
              {[...booking.editLog].reverse().map((e, i) => (
                <li key={i}>
                  {new Date(e.at).toLocaleString('en-IN')} · {e.by} · {(e.fields || []).join(', ')}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
