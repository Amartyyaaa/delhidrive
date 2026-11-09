// Bookings desk — every reservation in one place, with the actions operations
// take on it: accept or reject, share the terms with the customer, hand the car
// over, receive it back (which stops the late charge), and edit anything.

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Clock3,
  CalendarClock,
  Car,
  Timer,
  CheckCheck,
  XCircle,
  Inbox,
  Search,
  Check,
  X,
  Pencil,
  KeyRound,
  FileText,
  ReceiptIndianRupee,
  MessageCircle,
  Send,
  Copy,
  Phone,
  MapPin,
  Images,
} from 'lucide-react';
import { useStore } from '../../lib/store';
import { useAuth } from '../../lib/auth';
import { useNotify } from '../../lib/notify';
import { locationLabel, latePenaltyFor, PAYMENT_STATUS } from '../../lib/pricing';
import { STATUS, PHASE_META, REJECTION_REASONS, bookingPhase, isPaid } from '../../lib/rental';
import { acceptanceMessage } from '../../lib/terms';
import { customerWhatsappUrl, rejectionMessage } from '../../lib/whatsapp';
import { rentalAgreementPdf, gstInvoicePdf } from '../../lib/pdf';
import { REQUIRED_PHOTOS } from '../../lib/verification';
import { inr, fmtDateTime, fmtDuration, cx } from '../../lib/format';
import { Button, Badge, Modal, Input, Textarea, Empty, Tabs } from '../ui';
import EditBookingModal from './EditBookingModal';
import ReceiveCarModal from './ReceiveCarModal';

const FILTERS = [
  { id: 'action', label: 'Needs action', icon: AlertTriangle, phases: ['review', 'overdue'] },
  { id: 'review', label: 'Under review', icon: Clock3, phases: ['review'] },
  { id: 'upcoming', label: 'Upcoming', icon: CalendarClock, phases: ['upcoming'] },
  { id: 'active', label: 'On the road', icon: Car, phases: ['active'] },
  { id: 'overdue', label: 'Overdue', icon: Timer, phases: ['overdue'] },
  { id: 'completed', label: 'Completed', icon: CheckCheck, phases: ['completed'] },
  { id: 'closed', label: 'Cancelled', icon: XCircle, phases: ['cancelled', 'rejected'] },
  { id: 'all', label: 'All', icon: Inbox, phases: null },
];

const PAYMENT_TONE = { Paid: 'success', 'Awaiting payment': 'warning', 'Pay at pickup': 'info', Refunded: 'neutral' };
const KYC_TONE = { Verified: 'success', 'Pending Review': 'warning', Rejected: 'danger' };
const DAY = 86400000;

export default function BookingsManager() {
  const { bookings, fleet, settings, kycDocs, patchBooking, patchKyc } = useStore();
  const { user } = useAuth();
  const { push, toast } = useNotify();
  const [filter, setFilter] = useState('action');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [receiving, setReceiving] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState(REJECTION_REASONS[0]);
  const [otherReason, setOtherReason] = useState('');
  const [sharing, setSharing] = useState(null);
  const [photos, setPhotos] = useState(null);
  const [now, setNow] = useState(Date.now());

  // Overdue bookings and their running late charge move with the clock.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const who = user?.email || user?.name || 'console';
  const carOf = (b) => fleet.find((c) => c.id === b.carId);
  // Look the live booking up again so modals never act on a stale copy.
  const live = (b) => (b ? bookings.find((x) => x.id === b.id) || b : null);

  const enriched = useMemo(
    () => bookings.map((b) => ({ ...b, phase: bookingPhase(b, now) })),
    [bookings, now]
  );

  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map((f) => [
          f.id,
          f.phases ? enriched.filter((b) => f.phases.includes(b.phase)).length : enriched.length,
        ])
      ),
    [enriched]
  );

  const visible = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter);
    const needle = q.trim().toLowerCase();
    const order = {
      review: (a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0),
      upcoming: (a, b) => a.pickupMs - b.pickupMs,
      active: (a, b) => a.returnMs - b.returnMs,
      overdue: (a, b) => a.returnMs - b.returnMs,
    }[filter];
    return enriched
      .filter((b) => !f.phases || f.phases.includes(b.phase))
      .filter(
        (b) =>
          !needle ||
          `${b.ref} ${b.customerName} ${b.customerPhone} ${b.customerEmail} ${b.carName} ${b.carPlate}`
            .toLowerCase()
            .includes(needle)
      )
      .sort(order || ((a, b) => (b.createdAtMs || b.pickupMs) - (a.createdAtMs || a.pickupMs)));
  }, [enriched, filter, q]);

  // Rentals that ended long ago but were never closed in the console.
  const stale = enriched.filter((b) => b.phase === 'overdue' && now - b.returnMs > 7 * DAY);

  /* ---------------- actions ---------------- */
  const accept = async (b) => {
    const doc = kycDocs.find((k) => k.userId === b.userId);
    if (!doc && !window.confirm(`${b.customerName} has no KYC documents on file. Accept the booking anyway?`)) return;
    try {
      await patchBooking(b.id, {
        status: STATUS.confirmed,
        kycStatus: 'Verified',
        approvedAt: Date.now(),
        approvedVia: 'console',
        approvedBy: who,
      });
      // Accepting the booking is accepting the renter's documents, as in Telegram.
      if (doc && doc.status !== 'Verified') {
        await patchKyc(doc.id, { status: 'Verified', reviewedAt: Date.now(), reason: '' });
      }
      push('Booking accepted · ' + b.ref, `${b.carName} for ${b.customerName}. Share the terms next.`, {
        type: 'success',
      });
      setSharing({ ...b, status: STATUS.confirmed, kycStatus: 'Verified' });
    } catch (err) {
      toast(err.message || 'Could not accept this booking.', { type: 'error' });
    }
  };

  const reject = async () => {
    const b = live(rejecting);
    const why = reason === 'other' ? otherReason.trim() : reason;
    if (!why) {
      toast('Give the customer a reason.', { type: 'warning' });
      return;
    }
    try {
      await patchBooking(b.id, {
        status: STATUS.rejected,
        rejectionReason: why,
        rejectedAt: Date.now(),
        rejectedVia: 'console',
        rejectedBy: who,
      });
      push(
        'Booking rejected · ' + b.ref,
        isPaid(b)
          ? `Refund ${inr(b.quote?.payable)} from the Razorpay dashboard, then tell the customer.`
          : 'Tell the customer from the booking card.',
        { type: 'warning' }
      );
      setRejecting(null);
      setOtherReason('');
    } catch (err) {
      toast(err.message || 'Could not reject this booking.', { type: 'error' });
    }
  };

  const handOver = async (b) => {
    if (b.kycStatus !== 'Verified') {
      toast('Verify the renter’s KYC before handing the car over.', { type: 'warning' });
      return;
    }
    try {
      await patchBooking(b.id, { status: STATUS.handedOver, handoverAt: Date.now(), handedOverBy: who });
      push('Car handed over · ' + b.ref, `${b.carName} released to ${b.customerName}.`, { type: 'success' });
    } catch (err) {
      toast(err.message || 'Could not record the handover.', { type: 'error' });
    }
  };

  const shareTerms = async (b) => {
    const url = customerWhatsappUrl(b.customerPhone, acceptanceMessage(b, carOf(b), settings));
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) {
      toast('Allow pop-ups to open WhatsApp, or copy the message instead.', { type: 'warning' });
      return;
    }
    try {
      await patchBooking(b.id, { termsSharedAt: Date.now(), termsSharedBy: who });
    } catch {
      /* the message went out; the timestamp is only a convenience */
    }
    setSharing(null);
  };

  const copyTerms = async (b) => {
    try {
      await navigator.clipboard.writeText(acceptanceMessage(b, carOf(b), settings));
      toast('Message copied — paste it into WhatsApp or SMS.', { type: 'success' });
    } catch {
      toast('Could not copy. Select the text and copy it by hand.', { type: 'error' });
    }
  };

  const tidyStale = async () => {
    if (
      !window.confirm(
        `Close ${stale.length} rental(s) that ended over a week ago as returned on time, with no late charge? ` +
          'Use this only for cars you know came back.'
      )
    )
      return;
    try {
      await Promise.all(
        stale.map((b) =>
          patchBooking(b.id, {
            status: STATUS.returned,
            returnedAt: b.returnMs,
            receivedBy: `${who} (tidy-up)`,
            latePenalty: { overdueMs: 0, hours: 0, rate: 0, assessed: 0, amount: 0, waived: false },
          })
        )
      );
      toast(`${stale.length} old rental(s) closed.`, { type: 'success' });
    } catch (err) {
      toast(err.message || 'Some rentals could not be closed.', { type: 'error' });
    }
  };

  /* ---------------- render ---------------- */
  const renderBooking = (b) => {
    const car = carOf(b);
    const meta = PHASE_META[b.phase];
    const penalty = latePenaltyFor(b, { car, settings, at: now });
    const shots = [b.inspections?.pickup, b.inspections?.return].filter(Boolean);
    const open = !['completed', 'cancelled', 'rejected'].includes(b.phase);

    return (
      <div
        key={b.id}
        className={cx(
          'panel p-4',
          b.phase === 'overdue' && 'border-rose-400/35',
          b.phase === 'review' && 'border-amber-400/30'
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={meta.tone}>{meta.label}</Badge>
              <span className="font-mono text-[11px] text-slate-500">{b.ref}</span>
              {b.paymentStatus && (
                <Badge tone={PAYMENT_TONE[b.paymentStatus] || 'neutral'}>{b.paymentStatus}</Badge>
              )}
              <Badge tone={KYC_TONE[b.kycStatus] || 'warning'}>KYC {b.kycStatus || 'not on file'}</Badge>
              {b.editedAt && <Badge tone="neutral">Edited</Badge>}
            </div>
            <p className="mt-1.5 text-[14.5px] font-semibold text-white">
              {b.carName}
              <span className="ml-2 font-mono text-[11px] font-normal text-slate-500">
                {b.carPlate || car?.plate}
              </span>
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12px] text-slate-400">
              <span>{b.customerName}</span>
              <a href={`tel:${b.customerPhone}`} className="inline-flex items-center gap-1 hover:text-white">
                <Phone size={11} /> {b.customerPhone}
              </a>
            </p>
          </div>
          <div className="text-right">
            <p className="font-display text-[17px] font-bold text-white tabular-nums">{inr(b.quote?.payable)}</p>
            <p className="text-[10.5px] text-slate-500">
              {String(b.paymentMethod || '').toUpperCase()}
              {b.txnRef ? ` · ${b.txnRef}` : ''}
            </p>
          </div>
        </div>

        <div className="mt-3 grid gap-2 text-[12px] sm:grid-cols-2">
          <p className="flex items-start gap-1.5 text-slate-400">
            <MapPin size={12} className="mt-0.5 shrink-0 text-brand-300" />
            <span>
              <span className="text-slate-300">Pickup</span> {fmtDateTime(b.pickupMs)} · {locationLabel(b.locationId)}
            </span>
          </p>
          <p className="flex items-start gap-1.5 text-slate-400">
            <MapPin size={12} className="mt-0.5 shrink-0 text-slate-500" />
            <span>
              <span className="text-slate-300">Return</span> {fmtDateTime(b.returnMs)} ·{' '}
              {locationLabel(b.dropLocationId)}
            </span>
          </p>
        </div>

        {b.phase === 'overdue' && (
          <p className="mt-3 flex items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3.5 py-2 text-[12.5px] text-rose-200">
            <Timer size={14} />
            Late by {fmtDuration(penalty.overdueMs)} · {inr(penalty.amount)} so far at {inr(penalty.rate)}/hour — runs
            until you mark the car received.
          </p>
        )}
        {b.phase === 'completed' && b.latePenalty?.assessed > 0 && (
          <p className="mt-3 text-[12px] text-slate-400">
            Returned {fmtDuration(b.latePenalty.overdueMs)} late ·{' '}
            {b.latePenalty.waived ? (
              <span className="text-emerald-300">late charge of {inr(b.latePenalty.assessed)} waived</span>
            ) : (
              <span className="text-rose-300">late charge {inr(b.latePenalty.amount)}</span>
            )}
          </p>
        )}
        {b.phase === 'rejected' && b.rejectionReason && (
          <p className="mt-3 text-[12px] text-rose-300">Rejected: {b.rejectionReason}</p>
        )}
        {b.adminNote && <p className="mt-2 text-[12px] italic text-slate-500">Note: {b.adminNote}</p>}

        <div className="mt-3.5 flex flex-wrap gap-1.5 border-t border-white/[0.07] pt-3">
          {b.phase === 'review' && (
            <>
              <Button size="sm" variant="success" icon={Check} onClick={() => accept(b)}>
                Accept
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={X}
                className="text-rose-300 hover:bg-rose-500/10"
                onClick={() => {
                  setReason(REJECTION_REASONS[0]);
                  setRejecting(b);
                }}
              >
                Reject
              </Button>
            </>
          )}
          {(b.phase === 'upcoming' || b.phase === 'active') && b.status !== STATUS.handedOver && (
            <Button size="sm" icon={KeyRound} onClick={() => handOver(b)}>
              Hand over
            </Button>
          )}
          {(b.phase === 'active' || b.phase === 'overdue' || b.status === STATUS.handedOver) && open && (
            <Button size="sm" variant="success" icon={CheckCheck} onClick={() => setReceiving(b)}>
              Car received
            </Button>
          )}
          {open && b.phase !== 'review' && (
            <Button size="sm" variant="secondary" icon={Send} onClick={() => setSharing(b)}>
              {b.termsSharedAt ? 'Share T&C again' : 'Share T&C'}
            </Button>
          )}
          {b.phase === 'rejected' && (
            <Button
              as="a"
              size="sm"
              variant="secondary"
              icon={MessageCircle}
              href={customerWhatsappUrl(b.customerPhone, rejectionMessage(b, { refund: isPaid(b) ? b.quote?.payable : 0 }))}
              target="_blank"
              rel="noopener noreferrer"
            >
              Tell customer
            </Button>
          )}
          <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(b)}>
            Edit
          </Button>
          {shots.length > 0 && (
            <Button size="sm" variant="ghost" icon={Images} onClick={() => setPhotos(b)}>
              Photos
            </Button>
          )}
          <Button size="sm" variant="ghost" icon={FileText} onClick={() => rentalAgreementPdf(b, car, null)}>
            Agreement
          </Button>
          <Button size="sm" variant="ghost" icon={ReceiptIndianRupee} onClick={() => gstInvoicePdf(b, car, null)}>
            Invoice
          </Button>
        </div>
        {b.termsSharedAt && (
          <p className="mt-2 text-[11px] text-slate-600">T&C shared {fmtDateTime(b.termsSharedAt)}</p>
        )}
      </div>
    );
  };

  const sharingLive = live(sharing);
  const photosLive = live(photos);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[16px]">Bookings</h3>
          <p className="mt-0.5 text-[12.5px] text-slate-400">
            Accept, edit, hand over and receive cars. Late charges run until a car is marked received.
          </p>
        </div>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ref, name, phone or car"
            className="w-60 pl-9"
          />
        </div>
      </div>

      <Tabs
        value={filter}
        onChange={setFilter}
        tabs={FILTERS.map((f) => ({ id: f.id, label: f.label, icon: f.icon, count: counts[f.id] || undefined }))}
      />

      {(filter === 'overdue' || filter === 'action') && stale.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-ink-950/50 px-4 py-3">
          <p className="text-[12.5px] text-slate-400">
            {stale.length} rental(s) ended more than a week ago and were never closed here, so their late charge
            is still counting.
          </p>
          <Button size="sm" variant="secondary" onClick={tidyStale}>
            Close them as returned on time
          </Button>
        </div>
      )}

      {visible.length === 0 ? (
        <Empty
          icon={Inbox}
          title={filter === 'action' ? 'Nothing needs you right now' : 'No bookings here'}
          body="New bookings under review and overdue cars show up under Needs action."
        />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">{visible.map(renderBooking)}</div>
      )}

      <EditBookingModal booking={live(editing)} onClose={() => setEditing(null)} />
      <ReceiveCarModal booking={live(receiving)} onClose={() => setReceiving(null)} />

      <Modal
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        size="sm"
        title="Reject this booking?"
        subtitle={rejecting ? `${rejecting.ref} · ${rejecting.customerName}` : ''}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setRejecting(null)}>
              Keep it
            </Button>
            <Button variant="danger" className="flex-1" onClick={reject}>
              Reject booking
            </Button>
          </div>
        }
      >
        <p className="mb-3 text-[12.5px] text-slate-400">The customer sees this reason.</p>
        <div className="space-y-1.5">
          {[...REJECTION_REASONS, 'other'].map((r) => (
            <label
              key={r}
              className={cx(
                'flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-[12.5px] transition',
                reason === r ? 'border-rose-400/40 bg-rose-500/10 text-white' : 'border-white/10 text-slate-300'
              )}
            >
              <input
                type="radio"
                name="reject-reason"
                checked={reason === r}
                onChange={() => setReason(r)}
                className="accent-rose-500"
              />
              {r === 'other' ? 'Another reason…' : r}
            </label>
          ))}
        </div>
        {reason === 'other' && (
          <Textarea
            rows={2}
            className="mt-2"
            value={otherReason}
            onChange={(e) => setOtherReason(e.target.value)}
            placeholder="Write the reason the customer will see"
          />
        )}
        {rejecting && isPaid(rejecting) && (
          <p className="mt-3 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3.5 py-2.5 text-[12px] text-amber-200">
            This booking is paid. Refund {inr(rejecting.quote?.payable)} from the Razorpay dashboard after rejecting.
          </p>
        )}
      </Modal>

      <Modal
        open={Boolean(sharingLive)}
        onClose={() => setSharing(null)}
        size="lg"
        title="Share terms & conditions"
        subtitle={sharingLive ? `${sharingLive.ref} · to ${sharingLive.customerName} on ${sharingLive.customerPhone}` : ''}
        footer={
          sharingLive && (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setSharing(null)}>
                Later
              </Button>
              <Button variant="secondary" icon={Copy} onClick={() => copyTerms(sharingLive)}>
                Copy message
              </Button>
              <Button icon={MessageCircle} onClick={() => shareTerms(sharingLive)}>
                Send on WhatsApp
              </Button>
            </div>
          )
        }
      >
        {sharingLive && (
          <>
            <p className="mb-3 text-[12.5px] text-slate-400">
              The booking confirmation with the key terms and a link to the full terms page. WhatsApp opens with
              it ready to send to the customer.
            </p>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-ink-950/70 p-4 font-sans text-[12.5px] leading-relaxed text-slate-300">
              {acceptanceMessage(sharingLive, carOf(sharingLive), settings)}
            </pre>
          </>
        )}
      </Modal>

      <Modal
        open={Boolean(photosLive)}
        onClose={() => setPhotos(null)}
        size="xl"
        title="Inspection photos"
        subtitle={photosLive ? `${photosLive.ref} · ${photosLive.carName}` : ''}
      >
        {photosLive &&
          ['pickup', 'return'].map((phase) => {
            const insp = photosLive.inspections?.[phase];
            if (!insp) return null;
            const extra = insp.photos || [];
            return (
              <div key={phase} className="mb-5">
                <p className="label">
                  {phase === 'pickup' ? 'At pickup' : 'At return'} · {fmtDateTime(insp.at)} · odometer{' '}
                  {Number(insp.odometer || 0).toLocaleString('en-IN')} km · fuel {insp.fuelLevel}%
                </p>
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {REQUIRED_PHOTOS.map((shot) => (
                    <a
                      key={shot.id}
                      href={insp.sides?.[shot.id] || undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="panel-tight block overflow-hidden"
                    >
                      {insp.sides?.[shot.id] ? (
                        <img src={insp.sides[shot.id]} alt={shot.label} className="h-24 w-full object-cover" />
                      ) : (
                        <span className="grid h-24 place-items-center text-[11px] text-slate-600">Not taken</span>
                      )}
                      <span className="block px-2 py-1 text-[11px] text-slate-400">{shot.label}</span>
                    </a>
                  ))}
                  {extra.map((src, i) => (
                    <a key={src + i} href={src} target="_blank" rel="noopener noreferrer" className="panel-tight block overflow-hidden">
                      <img src={src} alt={`Extra ${i + 1}`} className="h-24 w-full object-cover" />
                      <span className="block px-2 py-1 text-[11px] text-slate-400">Extra {i + 1}</span>
                    </a>
                  ))}
                </div>
                {insp.notes && <p className="mt-2 text-[12px] text-slate-400">Notes: {insp.notes}</p>}
              </div>
            );
          })}
      </Modal>
    </div>
  );
}
