import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  CalendarClock,
  Car as CarIcon,
  FileText,
  ReceiptIndianRupee,
  Satellite,
  ClipboardCheck,
  IdCard,
  LifeBuoy,
  MapPin,
  XCircle,
  CheckCircle2,
  Wallet,
  History,
  Timer,
  ChevronDown,
  MessageCircle,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useStore } from '../lib/store';
import { useNotify } from '../lib/notify';
import { LOCATIONS, locationLabel, refundFor } from '../lib/pricing';
import { rentalAgreementPdf, gstInvoicePdf } from '../lib/pdf';
import { inr, fmtDateTime, countdownParts, cx } from '../lib/format';
import { Button, Badge, Tabs, Empty, Stat, Modal, Row, Spinner } from '../components/ui';
import CarArt from '../components/CarArt';
import Telematics from '../components/Telematics';
import HandoverChecklist from '../components/HandoverChecklist';
import KycPanel from '../components/KycPanel';
import TicketsPanel from '../components/TicketsPanel';
import { bookingWhatsappUrl } from '../lib/whatsapp';

const hubName = locationLabel;

function bookingPhase(b) {
  if (b.status === 'Cancelled') return 'cancelled';
  const now = Date.now();
  if (now < b.pickupMs) return 'upcoming';
  if (now <= b.returnMs) return 'active';
  return 'completed';
}

function Countdown({ to, label }) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const p = countdownParts(to - Date.now());
  const cells = [
    [p.days, 'days'],
    [p.hours, 'hrs'],
    [p.minutes, 'min'],
    [p.seconds, 'sec'],
  ];
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">
        <Timer size={11} /> {label}
      </p>
      <div className="flex gap-1.5">
        {cells.map(([v, unit]) => (
          <div key={unit} className="min-w-[3rem] rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 text-center">
            <p className="font-display text-[15px] font-bold text-white tabular-nums">
              {String(v).padStart(2, '0')}
            </p>
            <p className="text-[9px] uppercase tracking-wide text-slate-600">{unit}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function BookingCard({ booking, car, settings, onPatch, highlight }) {
  const { toast, push } = useNotify();
  const [tab, setTab] = useState('overview');
  const [expanded, setExpanded] = useState(highlight || false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const phase = bookingPhase(booking);

  const PHASE_META = {
    upcoming: { tone: 'info', label: 'Upcoming' },
    active: { tone: 'success', label: 'Active now' },
    completed: { tone: 'neutral', label: 'Completed' },
    cancelled: { tone: 'danger', label: 'Cancelled' },
  }[phase];

  const refund = useMemo(() => refundFor(booking, settings), [booking, settings]);

  const doCancel = async () => {
    setCancelling(true);
    try {
      await onPatch({
        status: 'Cancelled',
        cancelledAt: Date.now(),
        refund: { ...refund, initiatedAt: Date.now(), expectedBy: Date.now() + 7 * 86400000 },
      });
      push(
        'Booking cancelled · ' + booking.ref,
        `${inr(refund.total)} will be refunded to your source account within 7 working days.`,
        { type: 'success' }
      );
      setCancelOpen(false);
    } catch (err) {
      toast(err.message || 'Could not cancel this booking.', { type: 'error' });
    } finally {
      setCancelling(false);
    }
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: CalendarClock },
    ...(phase === 'active' ? [{ id: 'live', label: 'Live tracking', icon: Satellite }] : []),
    { id: 'handover', label: 'Inspections', icon: ClipboardCheck },
    { id: 'documents', label: 'Documents', icon: FileText },
  ];

  return (
    <div
      className={cx(
        'panel overflow-hidden transition',
        highlight && 'border-brand-400/50 shadow-glow',
        phase === 'active' && 'border-emerald-400/25'
      )}
    >
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-4 p-4 text-left transition hover:bg-white/[0.02]"
      >
        <div className="hidden h-20 w-32 shrink-0 overflow-hidden rounded-xl border border-white/10 sm:block">
          <CarArt car={car || { category: booking.carCategory, name: booking.carName }} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={PHASE_META.tone}>{PHASE_META.label}</Badge>
            <span className="font-mono text-[11px] text-slate-500">{booking.ref}</span>
            {phase === 'active' && (
              <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> GPS live
              </span>
            )}
          </div>
          <h3 className="mt-1.5 truncate text-[16px] leading-tight">{booking.carName}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <CalendarClock size={12} /> {fmtDateTime(booking.pickupMs)}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin size={12} /> {hubName(booking.locationId)}
            </span>
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="font-display text-[17px] font-bold text-white tabular-nums">
            {inr(booking.quote?.payable)}
          </p>
          <p className="text-[10.5px] text-slate-500">
            {booking.quote?.days} day{booking.quote?.days > 1 ? 's' : ''} · {booking.paymentStatus}
          </p>
        </div>

        <ChevronDown
          size={17}
          className={cx('shrink-0 text-slate-500 transition', expanded && 'rotate-180')}
        />
      </button>

      {expanded && (
        <div className="border-t border-white/[0.07] bg-ink-950/40">
          {(phase === 'upcoming' || phase === 'active') && (
            <div className="border-b border-white/[0.07] px-4 py-3.5">
              <Countdown
                to={phase === 'upcoming' ? booking.pickupMs : booking.returnMs}
                label={phase === 'upcoming' ? 'Pickup in' : 'Return due in'}
              />
            </div>
          )}

          <div className="px-4 pt-4">
            <Tabs tabs={tabs} value={tab} onChange={setTab} />
          </div>

          <div className="p-4">
            {tab === 'overview' && (
              <div className="grid gap-5 lg:grid-cols-2">
                <div>
                  <h4 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-slate-400">
                    Rental
                  </h4>
                  <Row k="Pickup" v={fmtDateTime(booking.pickupMs)} />
                  <Row k="Return" v={fmtDateTime(booking.returnMs)} />
                  <Row k="Pickup hub" v={hubName(booking.locationId)} />
                  <Row k="Drop-off hub" v={hubName(booking.dropLocationId)} />
                  <Row k="Registration" v={booking.carPlate || car?.plate || '—'} />
                  <Row k="Driver" v={booking.customerName} />
                  <Row
                    k="KYC on file"
                    v={booking.kycStatus}
                    tone={booking.kycStatus === 'Verified' ? 'text-emerald-400' : 'text-amber-400'}
                  />
                </div>

                <div>
                  <h4 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-slate-400">
                    Payment
                  </h4>
                  <Row
                    k={`Base · ${booking.quote?.charge?.label || booking.quote?.days + " days"}`}
                    v={inr(booking.quote?.base)}
                  />
                  {(booking.quote?.addonLines || []).map((l) => (
                    <Row key={l.id} k={l.label} v={inr(l.amount)} />
                  ))}
                  {booking.quote?.logisticsFee > 0 && (
                    <Row k="Hub / delivery fee" v={inr(booking.quote.logisticsFee)} />
                  )}
                  {booking.quote?.discount > 0 && (
                    <Row
                      k={`Discount · ${booking.couponCode}`}
                      v={`− ${inr(booking.quote.discount)}`}
                      tone="text-emerald-400"
                    />
                  )}
                  <Row k={`GST @ ${booking.quote?.gstRate}%`} v={inr(booking.quote?.gst)} />
                  <Row k="Refundable deposit" v={inr(booking.quote?.deposit)} tone="text-slate-300" />
                  <div className="mt-2 flex items-baseline justify-between border-t border-white/10 pt-2">
                    <span className="text-[13px] font-semibold text-white">Total</span>
                    <span className="font-display text-[16px] font-bold text-white tabular-nums">
                      {inr(booking.quote?.payable)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    {booking.paymentMethod?.toUpperCase()} · {booking.paymentStatus}
                    {booking.txnRef && ` · ${booking.txnRef}`}
                  </p>
                </div>

                {booking.status === 'Cancelled' && booking.refund && (
                  <div className="lg:col-span-2 rounded-xl border border-emerald-400/25 bg-emerald-500/[0.07] p-4">
                    <h4 className="flex items-center gap-2 text-[13.5px] font-semibold text-emerald-200">
                      <Wallet size={14} /> Refund in progress
                    </h4>
                    <p className="mt-1 text-[12.5px] text-slate-300">{booking.refund.label}</p>
                    <div className="mt-2 grid gap-x-6 sm:grid-cols-2">
                      <Row k="Rent refunded" v={inr(booking.refund.rentRefund)} />
                      <Row k="Deposit refunded" v={inr(booking.refund.depositRefund)} />
                      {booking.refund.fee > 0 && (
                        <Row k="Cancellation fee" v={`− ${inr(booking.refund.fee)}`} tone="text-rose-300" />
                      )}
                      <Row k="Total refund" v={inr(booking.refund.total)} tone="text-emerald-300" />
                    </div>
                    <p className="mt-2 text-[11.5px] text-slate-500">
                      Expected in your account by {fmtDateTime(booking.refund.expectedBy)}.
                    </p>
                  </div>
                )}

                {phase !== 'cancelled' && phase !== 'completed' && (
                  <div className="lg:col-span-2 flex flex-wrap gap-2 border-t border-white/[0.07] pt-4">
                    <Button variant="danger" size="sm" icon={XCircle} onClick={() => setCancelOpen(true)}>
                      Cancel booking
                    </Button>
                    <Button as={Link} to="/fleet" variant="secondary" size="sm" icon={CarIcon}>
                      Book another car
                    </Button>
                  </div>
                )}
              </div>
            )}

            {tab === 'live' && <Telematics booking={booking} car={car} settings={settings} />}

            {tab === 'handover' && (
              <div className="space-y-6">
                <HandoverChecklist
                  booking={booking}
                  car={car}
                  phase="pickup"
                  onSave={(inspections) => onPatch({ inspections })}
                />
                <div className="border-t border-white/[0.07] pt-6">
                  {booking.inspections?.pickup ? (
                    <HandoverChecklist
                      booking={booking}
                      car={car}
                      phase="return"
                      onSave={(inspections) => onPatch({ inspections })}
                    />
                  ) : (
                    <p className="rounded-xl border border-white/10 bg-ink-950/50 px-4 py-3 text-[12.5px] text-slate-500">
                      The post-return inspection unlocks once the pre-pickup handover checklist is filed.
                    </p>
                  )}
                </div>
              </div>
            )}

            {tab === 'documents' && (
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    icon: FileText,
                    title: 'Rental Agreement',
                    body: 'The full legal agreement with all 12 clauses, vehicle particulars and signature blocks.',
                    action: () => rentalAgreementPdf(booking, car, null),
                    cta: 'Download agreement',
                  },
                  {
                    icon: ReceiptIndianRupee,
                    title: 'GST Tax Invoice',
                    body: `Rule 46 compliant invoice INV-${booking.ref} with CGST/SGST split and SAC code 996601.`,
                    action: () => gstInvoicePdf(booking, car, null),
                    cta: 'Download invoice',
                  },
                  {
                    icon: MessageCircle,
                    title: 'Send to WhatsApp',
                    body: 'Forward the full booking summary to the DelhiDrive operations desk.',
                    href: bookingWhatsappUrl(booking, car),
                    cta: 'Open WhatsApp',
                  },
                ].map((d) => (
                  <div key={d.title} className="panel-tight flex flex-col p-4">
                    <span className="inline-grid h-10 w-10 place-items-center rounded-xl bg-brand-500/15 text-brand-300">
                      <d.icon size={18} />
                    </span>
                    <h4 className="mt-3 text-[14px]">{d.title}</h4>
                    <p className="mt-1 flex-1 text-[12px] leading-relaxed text-slate-400">{d.body}</p>
                    {d.href ? (
                      <Button
                        as="a"
                        href={d.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        size="sm"
                        variant="secondary"
                        className="mt-3.5 self-start"
                      >
                        {d.cta}
                      </Button>
                    ) : (
                      <Button size="sm" variant="secondary" className="mt-3.5 self-start" onClick={d.action}>
                        {d.cta}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        size="sm"
        title="Cancel this booking?"
        subtitle={`${booking.ref} · ${booking.carName}`}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setCancelOpen(false)}>
              Keep booking
            </Button>
            <Button variant="danger" className="flex-1" loading={cancelling} onClick={doCancel}>
              Confirm cancellation
            </Button>
          </div>
        }
      >
        <div
          className={cx(
            'rounded-xl border px-4 py-3',
            refund.tier === 'full'
              ? 'border-emerald-400/25 bg-emerald-500/[0.08]'
              : 'border-amber-400/25 bg-amber-500/[0.08]'
          )}
        >
          <p className="text-[13px] font-semibold text-white">{refund.label}</p>
        </div>
        <div className="mt-3">
          <Row k="Rent paid" v={inr((booking.quote?.taxable || 0) + (booking.quote?.gst || 0))} />
          {refund.fee > 0 && <Row k="Cancellation fee" v={`− ${inr(refund.fee)}`} tone="text-rose-300" />}
          <Row k="Deposit refunded" v={inr(refund.depositRefund)} />
          <div className="mt-2 flex items-baseline justify-between border-t border-white/10 pt-2">
            <span className="text-[13px] font-semibold text-white">You get back</span>
            <span className="font-display text-[17px] font-bold text-emerald-400 tabular-nums">
              {inr(refund.total)}
            </span>
          </div>
        </div>
        <p className="mt-3 text-[11.5px] leading-relaxed text-slate-500">
          Refunds are credited to the original payment method within 7 working days. This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { myBookings, fleet, settings, patchBooking, myTickets, myKyc, ready } = useStore();
  const location = useLocation();
  const [tab, setTab] = useState('bookings');
  const [filter, setFilter] = useState('all');

  const highlight = location.state?.highlight;

  const enriched = useMemo(
    () =>
      [...myBookings]
        .map((b) => ({ ...b, phase: bookingPhase(b), car: fleet.find((c) => c.id === b.carId) }))
        .sort((a, b) => {
          const order = { active: 0, upcoming: 1, completed: 2, cancelled: 3 };
          return order[a.phase] - order[b.phase] || b.pickupMs - a.pickupMs;
        }),
    [myBookings, fleet]
  );

  const counts = useMemo(
    () => ({
      all: enriched.length,
      active: enriched.filter((b) => b.phase === 'active').length,
      upcoming: enriched.filter((b) => b.phase === 'upcoming').length,
      completed: enriched.filter((b) => b.phase === 'completed').length,
      cancelled: enriched.filter((b) => b.phase === 'cancelled').length,
    }),
    [enriched]
  );

  const spend = useMemo(
    () =>
      enriched
        .filter((b) => b.status !== 'Cancelled')
        .reduce((sum, b) => sum + ((b.quote?.taxable || 0) + (b.quote?.gst || 0)), 0),
    [enriched]
  );

  const visible = filter === 'all' ? enriched : enriched.filter((b) => b.phase === filter);

  if (!ready) return <Spinner label="Loading your bookings" />;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-300">Dashboard</p>
        <h1 className="text-2xl sm:text-3xl">Welcome back, {(user?.name || '').split(' ')[0] || 'driver'}</h1>
        <p className="mt-1.5 text-[13.5px] text-slate-400">
          Track live rentals, download paperwork, verify your documents and reach support — all in one place.
        </p>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active rentals" value={counts.active} sub="GPS streaming" icon={Satellite} tone="success" />
        <Stat label="Upcoming" value={counts.upcoming} sub="Reserved and paid" icon={CalendarClock} tone="info" />
        <Stat label="Trips completed" value={counts.completed} sub="All time" icon={History} />
        <Stat label="Total spend" value={inr(spend)} sub="Excluding deposits" icon={Wallet} tone="warning" />
      </div>

      <Tabs
        className="mb-5 max-w-xl"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'bookings', label: 'My Bookings', icon: CalendarClock, count: counts.all },
          { id: 'kyc', label: 'KYC', icon: IdCard },
          { id: 'support', label: 'Support', icon: LifeBuoy, count: myTickets.length },
        ]}
      />

      {tab === 'bookings' && (
        <>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {[
              ['all', 'All'],
              ['active', 'Active'],
              ['upcoming', 'Upcoming'],
              ['completed', 'Completed'],
              ['cancelled', 'Cancelled'],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={cx(
                  'rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition',
                  filter === id
                    ? 'border-brand-400/50 bg-brand-500/20 text-brand-100'
                    : 'border-white/10 text-slate-400 hover:border-white/25 hover:text-white'
                )}
              >
                {label}
                <span className="ml-1.5 text-[10.5px] text-slate-500 tabular-nums">{counts[id]}</span>
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <Empty
              icon={CarIcon}
              title={filter === 'all' ? 'No bookings yet' : `No ${filter} bookings`}
              body="Pick a car from the fleet and your reservation, live telematics and paperwork will all appear here."
              action={
                <Button as={Link} to="/fleet">
                  Browse the fleet
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {visible.map((b) => (
                <BookingCard
                  key={b.id}
                  booking={b}
                  car={b.car}
                  settings={settings}
                  highlight={b.id === highlight}
                  onPatch={(patch) => patchBooking(b.id, patch)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'kyc' && (
        <div className="max-w-3xl">
          <KycPanel />
        </div>
      )}

      {tab === 'support' && <TicketsPanel />}
    </div>
  );
}
