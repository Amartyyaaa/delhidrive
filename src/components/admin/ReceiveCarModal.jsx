// "Car received" — closes a rental when the car is physically back, which is
// what stops the late-return charge. The time defaults to now but can be set
// back to when the car actually arrived, so a rental closed late in the
// console is not billed for the console's delay.

import { useEffect, useMemo, useState } from 'react';
import { CheckCheck } from 'lucide-react';
import { useStore } from '../../lib/store';
import { useAuth } from '../../lib/auth';
import { useNotify } from '../../lib/notify';
import { latePenaltyFor, LATE_GRACE_MINUTES } from '../../lib/pricing';
import { receiveCarPatch } from '../../lib/rental';
import { inr, fmtDateTime, fmtDuration, toLocalInput } from '../../lib/format';
import { Button, Modal, Field, Input, Checkbox, Row } from '../ui';

export default function ReceiveCarModal({ booking, onClose }) {
  const { fleet, settings, patchBooking } = useStore();
  const { user } = useAuth();
  const { push, toast } = useNotify();
  const [receivedAt, setReceivedAt] = useState(Date.now());
  const [waive, setWaive] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (booking) {
      setReceivedAt(Date.now());
      setWaive(false);
    }
  }, [booking?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const car = booking ? fleet.find((c) => c.id === booking.carId) : null;
  const penalty = useMemo(
    () =>
      booking
        ? latePenaltyFor({ ...booking, latePenalty: null, returnedAt: receivedAt }, { car, settings })
        : null,
    [booking, receivedAt, car, settings]
  );

  if (!booking) return null;

  const tooEarly = receivedAt < booking.pickupMs;
  const inFuture = receivedAt > Date.now() + 60000;

  const confirm = async () => {
    if (tooEarly || inFuture) return;
    setBusy(true);
    try {
      await patchBooking(
        booking.id,
        receiveCarPatch(booking, { receivedAt, waive, by: user?.email || user?.name || '', car, settings })
      );
      push(
        'Car received · ' + booking.ref,
        penalty.amount > 0
          ? `${booking.carName} is back. Late by ${fmtDuration(penalty.overdueMs)} — ${
              waive ? 'late charge waived' : `${inr(penalty.amount)} late charge`
            }.`
          : `${booking.carName} is back on time. The rental is closed.`,
        { type: 'success' }
      );
      onClose();
    } catch (err) {
      toast(err.message || 'Could not close this rental.', { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(booking)}
      onClose={onClose}
      size="sm"
      title="Car received"
      subtitle={`${booking.ref} · ${booking.carName} · ${booking.customerName}`}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Not yet
          </Button>
          <Button
            variant="success"
            className="flex-1"
            icon={CheckCheck}
            loading={busy}
            disabled={busy || tooEarly || inFuture}
            onClick={confirm}
          >
            Close rental
          </Button>
        </div>
      }
    >
      <p className="text-[12.5px] leading-relaxed text-slate-400">
        This ends the rental and stops the late-return charge. If the car came back earlier than now, set the
        time it actually arrived.
      </p>

      <Field label="Car received at" className="mt-4">
        <Input
          type="datetime-local"
          value={toLocalInput(receivedAt)}
          max={toLocalInput(Date.now())}
          onChange={(e) => {
            const v = new Date(e.target.value).getTime();
            if (!Number.isNaN(v)) setReceivedAt(v);
          }}
        />
      </Field>
      {tooEarly && <p className="mt-1.5 text-[12px] text-rose-300">That is before the pickup time.</p>}
      {inFuture && <p className="mt-1.5 text-[12px] text-rose-300">That time has not happened yet.</p>}

      <div className="mt-4 rounded-xl border border-white/10 bg-ink-950/50 px-4 py-3">
        <Row k="Due back" v={fmtDateTime(booking.returnMs)} />
        <Row
          k="Late by"
          v={penalty.hours ? fmtDuration(penalty.overdueMs) : `On time (${LATE_GRACE_MINUTES}-min grace)`}
          tone={penalty.hours ? 'text-rose-300' : 'text-emerald-400'}
        />
        {penalty.hours > 0 && (
          <>
            <Row k={`${penalty.hours} h × ${inr(penalty.rate)}/hour`} v={inr(penalty.amount)} />
            <div className="mt-2 flex items-baseline justify-between border-t border-white/10 pt-2">
              <span className="text-[13px] font-semibold text-white">Late charge</span>
              <span className="font-display text-[16px] font-bold text-white tabular-nums">
                {waive ? 'Waived' : inr(penalty.amount)}
              </span>
            </div>
          </>
        )}
      </div>

      {penalty.hours > 0 && (
        <Checkbox
          className="mt-3"
          checked={waive}
          onChange={setWaive}
          label="Waive the late charge for this rental"
        />
      )}
    </Modal>
  );
}
