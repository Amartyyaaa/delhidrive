// Daily slot inspector — hourly pickup density with paperwork access and
// handover triggers (module 4).

import { useMemo, useState } from 'react';
import {
  Sunrise,
  Sun,
  Moon,
  FileText,
  ReceiptIndianRupee,
  KeyRound,
  CheckCheck,
  Phone,
  Mail,
  ShieldCheck,
  Clock3,
  XCircle,
  CalendarX2,
} from 'lucide-react';
import { rentalAgreementPdf, gstInvoicePdf } from '../../lib/pdf';
import { useNotify } from '../../lib/notify';
import { LOCATIONS, locationLabel } from '../../lib/pricing';
import { inr, fmtTime, cx } from '../../lib/format';
import { Button, Badge, Empty, Input } from '../ui';

const BANDS = [
  { id: 'morning', label: 'Morning', sub: '06:00 – 11:59', icon: Sunrise, from: 6, to: 12 },
  { id: 'afternoon', label: 'Afternoon', sub: '12:00 – 16:59', icon: Sun, from: 12, to: 17 },
  { id: 'evening', label: 'Evening', sub: '17:00 – 05:59', icon: Moon, from: 17, to: 30 },
];

const hubName = locationLabel;

const KYC_TONE = { Verified: 'success', 'Pending Review': 'warning', Rejected: 'danger' };

function bandOf(hour) {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

export default function SlotInspector({ day, bookings, fleet, onPatchBooking }) {
  const { push, toast } = useNotify();
  const [openRef, setOpenRef] = useState(null);
  const [dayValue, setDayValue] = useState(day);

  const activeDay = dayValue || day;
  const start = new Date(`${activeDay}T00:00:00`).getTime();
  const end = start + 86399999;

  const pickups = useMemo(
    () =>
      bookings
        .filter((b) => b.pickupMs >= start && b.pickupMs <= end)
        .sort((a, b) => a.pickupMs - b.pickupMs),
    [bookings, start, end]
  );

  const returns = useMemo(
    () =>
      bookings
        .filter((b) => b.status !== 'Cancelled' && b.returnMs >= start && b.returnMs <= end)
        .sort((a, b) => a.returnMs - b.returnMs),
    [bookings, start, end]
  );

  const hourly = useMemo(() => {
    const buckets = Array.from({ length: 24 }, () => 0);
    pickups.forEach((b) => {
      buckets[new Date(b.pickupMs).getHours()] += 1;
    });
    return buckets;
  }, [pickups]);

  const peakHour = hourly.indexOf(Math.max(...hourly));
  const maxCount = Math.max(1, ...hourly);

  const bandCounts = BANDS.map((band) => ({
    ...band,
    count: pickups.filter((b) => bandOf(new Date(b.pickupMs).getHours()) === band.id).length,
  }));

  const dayRevenue = pickups
    .filter((b) => b.status !== 'Cancelled')
    .reduce((s, b) => s + ((b.quote?.taxable || 0) + (b.quote?.gst || 0)), 0);

  const trigger = async (booking, action) => {
    try {
      if (action === 'handover') {
        await onPatchBooking(booking.id, { handoverAt: Date.now(), status: 'Handed over' });
        push(
          'Handover triggered · ' + booking.ref,
          `${booking.carName} released to ${booking.customerName} at ${hubName(booking.locationId)}.`,
          { type: 'success' }
        );
      } else {
        await onPatchBooking(booking.id, { returnedAt: Date.now(), status: 'Returned' });
        push('Return logged · ' + booking.ref, `${booking.carName} is back in the fleet.`, {
          type: 'success',
        });
      }
    } catch (err) {
      toast(err.message || 'Could not update the booking.', { type: 'error' });
    }
  };

  const BookingRow = ({ b, mode }) => {
    const car = fleet.find((c) => c.id === b.carId);
    const open = openRef === b.id + mode;
    return (
      <div className="panel-tight overflow-hidden">
        <button
          onClick={() => setOpenRef(open ? null : b.id + mode)}
          className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-white/[0.03]"
        >
          <span className="w-16 shrink-0 font-display text-[13px] font-bold text-brand-200 tabular-nums">
            {fmtTime(mode === 'return' ? b.returnMs : b.pickupMs)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="truncate text-[13px] font-semibold text-white">{b.carName}</span>
              <span className="font-mono text-[10.5px] text-slate-500">{b.ref}</span>
              {b.status === 'Cancelled' && <Badge tone="danger">Cancelled</Badge>}
              {b.status === 'Handed over' && <Badge tone="info">Handed over</Badge>}
              {b.status === 'Returned' && <Badge tone="neutral">Returned</Badge>}
            </span>
            <span className="mt-0.5 block truncate text-[11.5px] text-slate-500">
              {b.customerName} · {hubName(mode === 'return' ? b.dropLocationId : b.locationId)}
            </span>
          </span>
          <Badge tone={KYC_TONE[b.kycStatus] || 'warning'}>{b.kycStatus || 'Pending'}</Badge>
          <span className="hidden w-20 shrink-0 text-right font-display text-[13px] font-bold text-white tabular-nums sm:block">
            {inr(b.quote?.payable)}
          </span>
        </button>

        {open && (
          <div className="border-t border-white/[0.07] bg-ink-950/50 px-3.5 py-3.5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 text-[12px]">
                <p className="flex items-center gap-2 text-slate-400">
                  <Mail size={12} /> {b.customerEmail}
                </p>
                <p className="flex items-center gap-2 text-slate-400">
                  <Phone size={12} /> {b.customerPhone}
                </p>
                <p className="flex items-center gap-2 text-slate-400">
                  <ShieldCheck size={12} /> KYC {b.kycStatus}
                </p>
                <p className="flex items-center gap-2 text-slate-400">
                  <Clock3 size={12} /> {b.quote?.days} day(s) · returns {fmtTime(b.returnMs)}
                </p>
                <p className="text-slate-400">
                  Registration <span className="font-mono text-white">{b.carPlate || car?.plate || '—'}</span>
                </p>
              </div>

              <div className="flex flex-wrap items-start gap-2">
                <Button size="sm" variant="secondary" icon={FileText} onClick={() => rentalAgreementPdf(b, car, null)}>
                  Agreement
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={ReceiptIndianRupee}
                  onClick={() => gstInvoicePdf(b, car, null)}
                >
                  Invoice
                </Button>
                {b.status !== 'Cancelled' && mode === 'pickup' && b.status !== 'Handed over' && (
                  <Button size="sm" icon={KeyRound} onClick={() => trigger(b, 'handover')}>
                    Trigger handover
                  </Button>
                )}
                {b.status !== 'Cancelled' && mode === 'return' && b.status !== 'Returned' && (
                  <Button size="sm" variant="success" icon={CheckCheck} onClick={() => trigger(b, 'return')}>
                    Log return
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="panel p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-[16px]">Daily slot inspector</h3>
            <p className="mt-0.5 text-[12.5px] text-slate-400">
              Hourly pickup density with instant access to paperwork and handover triggers.
            </p>
          </div>
          <div className="w-full sm:w-52">
            <Input type="date" value={activeDay} onChange={(e) => setDayValue(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-4">
          {bandCounts.map((band) => (
            <div key={band.id} className="panel-tight p-3.5">
              <div className="flex items-center gap-2 text-slate-500">
                <band.icon size={13} />
                <span className="text-[10.5px] font-semibold uppercase tracking-wide">{band.label}</span>
              </div>
              <p className="mt-1 font-display text-xl font-bold text-white tabular-nums">{band.count}</p>
              <p className="text-[10.5px] text-slate-600">{band.sub}</p>
            </div>
          ))}
          <div className="panel-tight bg-brand-500/10 p-3.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-brand-300">Day revenue</p>
            <p className="mt-1 font-display text-xl font-bold text-white tabular-nums">{inr(dayRevenue)}</p>
            <p className="text-[10.5px] text-slate-500">
              {pickups.length} pickup{pickups.length !== 1 ? 's' : ''} · {returns.length} return
              {returns.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* hourly density */}
        <div className="mt-5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Hourly pickup density
            {pickups.length > 0 && (
              <span className="ml-2 font-normal normal-case tracking-normal text-slate-600">
                busiest hour {String(peakHour).padStart(2, '0')}:00
              </span>
            )}
          </p>
          <div className="flex h-24 items-end gap-[3px]">
            {hourly.map((count, h) => (
              <div key={h} className="group relative flex-1" title={`${String(h).padStart(2, '0')}:00 — ${count} pickup(s)`}>
                <div
                  className={cx(
                    'w-full rounded-t transition',
                    count === 0
                      ? 'bg-white/[0.05]'
                      : count >= maxCount
                        ? 'bg-rose-500/85'
                        : count >= maxCount * 0.6
                          ? 'bg-orange-500/80'
                          : 'bg-brand-500/75'
                  )}
                  style={{ height: `${Math.max(4, (count / maxCount) * 88)}px` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[9.5px] text-slate-600">
            {[0, 4, 8, 12, 16, 20, 23].map((h) => (
              <span key={h}>{String(h).padStart(2, '0')}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="panel p-5">
          <h4 className="mb-3 flex items-center gap-2 text-[14.5px]">
            <KeyRound size={14} className="text-brand-300" />
            Pickups · {new Date(start).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
            <Badge tone="brand" className="ml-auto">
              {pickups.length}
            </Badge>
          </h4>
          {pickups.length === 0 ? (
            <Empty icon={CalendarX2} title="No pickups scheduled" body="Nothing leaves the yard on this date." />
          ) : (
            <div className="space-y-2">
              {pickups.map((b) => (
                <BookingRow key={b.id} b={b} mode="pickup" />
              ))}
            </div>
          )}
        </div>

        <div className="panel p-5">
          <h4 className="mb-3 flex items-center gap-2 text-[14.5px]">
            <CheckCheck size={14} className="text-emerald-400" />
            Returns due
            <Badge tone="success" className="ml-auto">
              {returns.length}
            </Badge>
          </h4>
          {returns.length === 0 ? (
            <Empty icon={XCircle} title="No returns due" body="No vehicles are scheduled back on this date." />
          ) : (
            <div className="space-y-2">
              {returns.map((b) => (
                <BookingRow key={b.id} b={b} mode="return" />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
