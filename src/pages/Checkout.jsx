import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  CalendarClock,
  MapPin,
  Ticket,
  Baby,
  Navigation,
  UserPlus,
  Fuel,
  QrCode,
  CreditCard,
  Landmark,
  Banknote,
  Check,
  ChevronLeft,
  ShieldCheck,
  Clock,
  TrendingUp,
  Tag,
  X,
  Lock,
} from 'lucide-react';
import { useStore } from '../lib/store';
import { useAuth } from '../lib/auth';
import { useNotify } from '../lib/notify';
import {
  ADDONS,
  LOCATIONS,
  PAYMENT_METHODS,
  computeQuote,
  rentalHours,
  FREE_LOGISTICS_FROM_DAYS,
} from '../lib/pricing';
import { inr, cx, fmtDuration, toLocalInput } from '../lib/format';
import { Button, Badge, Field, Input, Toggle, Row, Spinner } from '../components/ui';
import CarArt from '../components/CarArt';
import PhoneVerify from '../components/PhoneVerify';
import { sendBookingToWhatsapp } from '../lib/whatsapp';
import { msg91Ready } from '../lib/otp';

const ADDON_ICONS = { Ticket, Baby, Navigation, UserPlus, Fuel };
const PAY_ICONS = { QrCode, CreditCard, Landmark, Banknote };

function defaultWindow() {
  const pickup = new Date();
  pickup.setHours(pickup.getHours() + 24, 0, 0, 0);
  const drop = new Date(pickup);
  drop.setDate(drop.getDate() + 2);
  return { pickup: pickup.getTime(), drop: drop.getTime() };
}

function StepHeader({ n, title, sub }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-500/20 font-display text-[13px] font-bold text-brand-200">
        {n}
      </span>
      <div>
        <h2 className="text-[16px] leading-tight">{title}</h2>
        {sub && <p className="mt-0.5 text-[12.5px] text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}

export default function Checkout() {
  const { carId } = useParams();
  const navigate = useNavigate();
  const { fleet, ready, activeCoupons, settings, createBooking, myKyc } = useStore();
  const { user } = useAuth();
  const { push, toast } = useNotify();

  const car = useMemo(() => fleet.find((c) => c.id === carId), [fleet, carId]);
  const initial = useMemo(defaultWindow, []);

  const [pickupMs, setPickupMs] = useState(initial.pickup);
  const [returnMs, setReturnMs] = useState(initial.drop);
  const [locationId, setLocationId] = useState('airport');
  const [dropLocationId, setDropLocationId] = useState('airport');
  const [addons, setAddons] = useState({});
  const [couponInput, setCouponInput] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '' });
  const [placing, setPlacing] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (car?.hub) {
      setLocationId(car.hub);
      setDropLocationId(car.hub);
    }
  }, [car?.hub]);

  useEffect(() => {
    if (user) {
      setCustomer((c) => ({
        name: c.name || user.name || '',
        email: c.email || user.email || '',
        phone: c.phone || user.phone || '',
      }));
    }
  }, [user]);

  const quote = useMemo(
    () =>
      car
        ? computeQuote({
            car,
            pickupMs,
            returnMs,
            addons,
            locationId,
            dropLocationId,
            couponCode,
            coupons: activeCoupons,
            settings,
          })
        : null,
    [car, pickupMs, returnMs, addons, locationId, dropLocationId, couponCode, activeCoupons, settings]
  );

  const hours = rentalHours(pickupMs, returnMs);
  const minHours = settings.minRentalHours || 4;
  const dateError =
    returnMs <= pickupMs
      ? 'Return time must be after pickup.'
      : hours < minHours
        ? `Minimum rental is ${minHours} hours.`
        : pickupMs < Date.now() - 60000
          ? 'Pickup time is in the past.'
          : '';

  if (!ready) return <Spinner label="Loading vehicle" />;

  if (!car) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h2 className="text-xl">Car not found</h2>
        <p className="mt-2 text-[13.5px] text-slate-400">
          This vehicle may have been removed from the fleet.
        </p>
        <Button as={Link} to="/fleet" className="mt-5">
          Back to the fleet
        </Button>
      </div>
    );
  }

  // Accepts an explicit code so the suggestion chips can apply immediately
  // instead of waiting a render for `couponInput` state to settle.
  const applyCode = (raw) => {
    const code = String(raw ?? couponInput)
      .trim()
      .toUpperCase();
    if (!code) return;
    const test = computeQuote({
      car,
      pickupMs,
      returnMs,
      addons,
      locationId,
      dropLocationId,
      couponCode: code,
      coupons: activeCoupons,
      settings,
    });
    if (test.couponResult.ok) {
      setCouponCode(code);
      toast(`${code} applied — you saved ${inr(test.discount)}.`, { type: 'success', title: 'Promo applied' });
    } else {
      setCouponCode('');
      toast(test.couponResult.reason || 'That code could not be applied.', { type: 'error' });
    }
  };

  const validate = () => {
    const e = {};
    if (!customer.name.trim()) e.name = 'Required for the rental agreement.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customer.email)) e.email = 'Enter a valid email.';
    if (!/^[6-9]\d{9}$/.test(customer.phone.replace(/\D/g, '').slice(-10)))
      e.phone = 'Enter a valid 10-digit Indian mobile number.';
    if (dateError) e.dates = dateError;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const placeBooking = async () => {
    if (!user) {
      toast('Sign in to complete your reservation.', { type: 'warning' });
      navigate('/login', { state: { from: `/checkout/${car.id}` } });
      return;
    }
    if (!validate()) {
      toast('Please fix the highlighted fields.', { type: 'error' });
      return;
    }
    setPlacing(true);
    try {
      const ref = 'DD' + Date.now().toString(36).toUpperCase().slice(-6);
      const booking = {
        ref,
        userId: user.uid,
        carId: car.id,
        carName: car.name,
        carPlate: car.plate || '',
        carCategory: car.category,
        customerName: customer.name.trim(),
        customerEmail: customer.email.trim(),
        customerPhone: customer.phone.trim(),
        phoneVerified,
        pickupMs,
        returnMs,
        locationId,
        dropLocationId,
        addons,
        couponCode,
        paymentMethod,
        paymentStatus: paymentMethod === 'cod' ? 'Pay on delivery' : 'Paid',
        txnRef: paymentMethod === 'cod' ? '' : 'TXN' + Math.random().toString(36).slice(2, 12).toUpperCase(),
        status: 'Confirmed',
        kycStatus: myKyc?.status || 'Pending Review',
        quote,
        inspections: {},
        createdAtMs: Date.now(),
      };
      const id = await createBooking(booking);

      // Hand the booking summary to operations on WhatsApp. Opened straight
      // after the click so the browser still counts it as user-initiated.
      const opened = sendBookingToWhatsapp(booking, car);
      if (!opened) {
        toast('Allow pop-ups to send the booking to WhatsApp, or open it from My Bookings.', {
          type: 'warning',
        });
      }

      push(
        'Booking confirmed · ' + ref,
        `${car.name} is reserved for ${new Date(pickupMs).toLocaleDateString('en-IN')}. Total paid ${inr(
          quote.payable
        )}.`,
        { tag: 'booking-' + ref }
      );
      setTimeout(
        () =>
          push(
            'Payment receipt generated',
            `GST invoice INV-${ref} for ${inr(quote.payable)} is ready to download from My Bookings.`,
            { tag: 'receipt-' + ref, type: 'success' }
          ),
        1600
      );

      navigate('/dashboard', { state: { highlight: id, justBooked: ref } });
    } catch (err) {
      console.error(err);
      toast(err.message || 'Could not place the booking. Please try again.', { type: 'error' });
    } finally {
      setPlacing(false);
    }
  };

  const kycBadge = {
    Verified: { tone: 'success', text: 'KYC verified' },
    'Pending Review': { tone: 'warning', text: 'KYC pending review' },
    Rejected: { tone: 'danger', text: 'KYC rejected' },
  }[myKyc?.status || 'Pending Review'];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <button
        onClick={() => navigate(-1)}
        className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-slate-400 transition hover:text-white"
      >
        <ChevronLeft size={15} /> Back
      </button>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        {/* ------------------ left column ------------------ */}
        <div className="space-y-5">
          {/* car summary */}
          <div className="panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
            <div className="h-28 w-full overflow-hidden rounded-xl border border-white/10 sm:w-48">
              <CarArt car={car} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="brand">{car.category}</Badge>
                {car.zeroDep && (
                  <Badge tone="success" icon={ShieldCheck}>
                    Zero Dep
                  </Badge>
                )}
                <Badge tone={kycBadge.tone}>{kycBadge.text}</Badge>
              </div>
              <h1 className="mt-2 text-xl leading-tight">{car.name}</h1>
              <p className="mt-1 text-[12.5px] text-slate-400">
                {car.transmission} · {car.fuel} · {car.seats} seats · {car.engineCc ? `${car.engineCc} cc` : 'Electric'}{' '}
                · {car.plate}
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-2xl font-bold text-white">{inr(car.rate)}</p>
              <p className="text-[11px] text-slate-500">per day</p>
            </div>
          </div>

          {/* 1 — dates */}
          <section className="panel p-5">
            <StepHeader n={1} title="Pickup & return" sub="Part-days round up to a full chargeable day." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Pickup date & time">
                <Input
                  type="datetime-local"
                  value={toLocalInput(pickupMs)}
                  onChange={(e) => {
                    const v = new Date(e.target.value).getTime();
                    if (!Number.isNaN(v)) {
                      setPickupMs(v);
                      if (returnMs <= v) setReturnMs(v + 2 * 86400000);
                    }
                  }}
                />
              </Field>
              <Field label="Return date & time">
                <Input
                  type="datetime-local"
                  value={toLocalInput(returnMs)}
                  onChange={(e) => {
                    const v = new Date(e.target.value).getTime();
                    if (!Number.isNaN(v)) setReturnMs(v);
                  }}
                />
              </Field>
            </div>

            <div
              className={cx(
                'mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border px-4 py-3',
                dateError ? 'border-rose-400/30 bg-rose-500/10' : 'border-white/10 bg-ink-950/50'
              )}
            >
              {dateError ? (
                <p className="text-[13px] font-medium text-rose-300">{dateError}</p>
              ) : (
                <>
                  <span className="flex items-center gap-2 text-[13px] text-slate-300">
                    <Clock size={14} className="text-brand-300" />
                    Duration <strong className="text-white">{fmtDuration(returnMs - pickupMs)}</strong>
                  </span>
                  <span className="flex items-center gap-2 text-[13px] text-slate-300">
                    <CalendarClock size={14} className="text-brand-300" />
                    Chargeable{' '}
                    <strong className="text-white">
                      {quote.days} day{quote.days > 1 ? 's' : ''}
                    </strong>
                  </span>
                  <span className="text-[13px] text-slate-300">
                    ≈ <strong className="text-white">{Math.round(hours)}</strong> hours
                  </span>
                  {quote.surge > 1 && (
                    <Badge tone="warning" icon={TrendingUp}>
                      Surge ×{quote.surge.toFixed(2)}
                    </Badge>
                  )}
                </>
              )}
            </div>
          </section>

          {/* 2 — locations */}
          <section className="panel p-5">
            <StepHeader
              n={2}
              title="Where do you want the car?"
              sub="Return it to a different hub if you like — the destination hub's fee applies."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ['Pickup location', locationId, setLocationId],
                ['Drop-off location', dropLocationId, setDropLocationId],
              ].map(([label, value, setter]) => (
                <div key={label}>
                  <p className="label">{label}</p>
                  <div className="space-y-2">
                    {LOCATIONS.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => setter(l.id)}
                        className={cx(
                          'flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition',
                          value === l.id
                            ? 'border-brand-400/50 bg-brand-500/12'
                            : 'border-white/10 hover:border-white/25'
                        )}
                      >
                        <MapPin
                          size={15}
                          className={value === l.id ? 'text-brand-300' : 'text-slate-500'}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-white">{l.label}</span>
                          <span className="block truncate text-[11px] text-slate-500">{l.note}</span>
                        </span>
                        <span
                          className={cx(
                            'shrink-0 text-[11.5px] font-semibold',
                            l.fee ? 'text-amber-300' : 'text-emerald-400'
                          )}
                        >
                          {l.fee ? `+${inr(l.fee)}` : 'Free'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 3 — add-ons */}
          <section className="panel p-5">
            <StepHeader n={3} title="Add-ons" sub="Optional extras, priced per booking or per day." />
            <div className="grid gap-2.5 sm:grid-cols-2">
              {ADDONS.map((a) => {
                const Icon = ADDON_ICONS[a.icon] || Ticket;
                const on = Boolean(addons[a.id]);
                const cost = a.unit === 'day' ? a.price * quote.days : a.price;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAddons((s) => ({ ...s, [a.id]: !s[a.id] }))}
                    className={cx(
                      'flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition',
                      on ? 'border-brand-400/50 bg-brand-500/12' : 'border-white/10 hover:border-white/25'
                    )}
                  >
                    <span
                      className={cx(
                        'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg',
                        on ? 'bg-brand-500 text-white' : 'bg-white/[0.06] text-slate-400'
                      )}
                    >
                      {on ? <Check size={15} /> : <Icon size={15} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-[13px] font-semibold text-white">{a.label}</span>
                        <span className="shrink-0 text-[12px] font-bold text-brand-200 tabular-nums">
                          {inr(cost)}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[11.5px] leading-snug text-slate-400">{a.desc}</span>
                      <span className="mt-1 block text-[10.5px] text-slate-600">
                        {inr(a.price)} per {a.unit === 'day' ? `day × ${quote.days}` : 'booking'}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 4 — driver details */}
          <section className="panel p-5">
            <StepHeader n={4} title="Driver details" sub="These appear on the rental agreement and GST invoice." />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Full name" error={errors.name}>
                <Input
                  value={customer.name}
                  onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))}
                  placeholder="As printed on your licence"
                />
              </Field>
              <Field label="Email" error={errors.email}>
                <Input
                  type="email"
                  value={customer.email}
                  onChange={(e) => setCustomer((c) => ({ ...c, email: e.target.value }))}
                  placeholder="you@example.com"
                />
              </Field>
              <Field label="Mobile number" error={errors.phone}>
                <Input
                  value={customer.phone}
                  onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))}
                  placeholder="98XXXXXXXX"
                  inputMode="numeric"
                />
              </Field>
            </div>

            <div className="mt-3">
              <PhoneVerify
                phone={customer.phone}
                verified={phoneVerified}
                onVerified={setPhoneVerified}
              />
            </div>

            {myKyc?.status !== 'Verified' && (
              <p className="mt-3 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3.5 py-2.5 text-[12.5px] text-amber-200">
                You can book now, but handover needs a verified profile. Upload your licence and Aadhaar from{' '}
                <Link to="/dashboard" className="font-semibold underline">
                  Dashboard → KYC
                </Link>
                .
              </p>
            )}
          </section>

          {/* 5 — payment */}
          <section className="panel p-5">
            <StepHeader n={5} title="Payment method" sub="Deposit is collected with the rental and refunded after return." />
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {PAYMENT_METHODS.map((p) => {
                const Icon = PAY_ICONS[p.icon] || CreditCard;
                const on = paymentMethod === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPaymentMethod(p.id)}
                    className={cx(
                      'rounded-xl border p-3.5 text-left transition',
                      on ? 'border-brand-400/50 bg-brand-500/12' : 'border-white/10 hover:border-white/25'
                    )}
                  >
                    <Icon size={17} className={on ? 'text-brand-300' : 'text-slate-500'} />
                    <p className="mt-2 text-[13px] font-semibold text-white">{p.label}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{p.desc}</p>
                  </button>
                );
              })}
            </div>

            {paymentMethod === 'upi' && (
              <div className="mt-4 flex flex-col items-center gap-4 rounded-xl border border-white/10 bg-ink-950/50 p-5 sm:flex-row">
                <div className="rounded-xl bg-white p-2.5">
                  <svg viewBox="0 0 29 29" className="h-28 w-28" shapeRendering="crispEdges">
                    {/* deterministic pseudo-QR built from the amount so it changes with the cart */}
                    {Array.from({ length: 29 }).map((_, y) =>
                      Array.from({ length: 29 }).map((__, x) => {
                        const finder =
                          (x < 7 && y < 7) || (x > 21 && y < 7) || (x < 7 && y > 21);
                        if (finder) {
                          const lx = x > 21 ? x - 22 : x;
                          const ly = y > 21 ? y - 22 : y;
                          const edge = lx === 0 || lx === 6 || ly === 0 || ly === 6;
                          const core = lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4;
                          return edge || core ? (
                            <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#0d1120" />
                          ) : null;
                        }
                        const seed = (x * 31 + y * 17 + Math.round(quote.payable / 7)) % 11;
                        return seed < 5 ? (
                          <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#0d1120" />
                        ) : null;
                      })
                    )}
                  </svg>
                </div>
                <div className="text-center sm:text-left">
                  <p className="text-[13px] font-semibold text-white">Scan to pay {inr(quote.payable)}</p>
                  <p className="mt-1 text-[12px] text-slate-400">
                    UPI ID <span className="font-mono text-brand-200">delhidrive@okhdfcbank</span>
                  </p>
                  <p className="mt-2 max-w-xs text-[11.5px] leading-relaxed text-slate-500">
                    Works with GPay, PhonePe, Paytm and any BHIM-compatible app. The reservation is held for
                    10 minutes while the payment settles.
                  </p>
                </div>
              </div>
            )}

            {paymentMethod === 'cod' && (
              <p className="mt-4 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3.5 py-2.5 text-[12.5px] text-amber-200">
                Cash on delivery requires the full amount including the {inr(quote.deposit)} deposit in cash at
                handover. Available for Delhi NCR addresses only.
              </p>
            )}
          </section>
        </div>

        {/* ------------------ fare summary ------------------ */}
        <aside>
          <div className="panel sticky top-20 p-5">
            <h2 className="text-[16px]">Fare breakdown</h2>

            <div className="mt-3.5 divide-y divide-white/[0.06]">
              <div className="pb-2">
                <Row
                  k={
                    quote.charge.tier === 'daily'
                      ? `${inr(quote.charge.unitRate)} × ${quote.charge.label}`
                      : quote.charge.label
                  }
                  v={inr(quote.charge.amount)}
                />
                {quote.surgeAmount > 0 && (
                  <Row
                    k={quote.surgeReasons.join(' · ')}
                    v={`+ ${inr(quote.surgeAmount)}`}
                    tone="text-amber-300"
                  />
                )}
              </div>

              {quote.addonLines.length > 0 && (
                <div className="py-2">
                  {quote.addonLines.map((l) => (
                    <Row key={l.id} k={`${l.label}${l.qty > 1 ? ` × ${l.qty}` : ''}`} v={inr(l.amount)} />
                  ))}
                </div>
              )}

              {(quote.logisticsFeeFull > 0 || quote.logisticsFee > 0) && (
                <div className="py-2">
                  <Row
                    k="Pickup & drop"
                    v={quote.logisticsWaived ? 'Free' : inr(quote.logisticsFee)}
                    tone={quote.logisticsWaived ? 'text-emerald-400' : undefined}
                  />
                  {quote.logisticsWaived && (
                    <p className="mt-0.5 text-[11px] text-emerald-400/80">
                      Saved {inr(quote.logisticsSaved)} — free on rentals of{' '}
                      {FREE_LOGISTICS_FROM_DAYS} days or more
                    </p>
                  )}
                </div>
              )}

              <div className="py-2">
                <Row k="Subtotal" v={inr(quote.subtotal)} />
                {quote.discount > 0 && (
                  <Row k={`Discount · ${couponCode}`} v={`− ${inr(quote.discount)}`} tone="text-emerald-400" />
                )}
                <Row k={`GST @ ${quote.gstRate}%`} v={inr(quote.gst)} />
                <Row k="Refundable deposit" v={inr(quote.deposit)} tone="text-slate-300" />
              </div>
            </div>

            <div className="mt-3 flex items-baseline justify-between rounded-xl bg-brand-500/12 px-3.5 py-3">
              <span className="text-[13px] font-semibold text-brand-100">Total payable</span>
              <span className="font-display text-xl font-bold text-white tabular-nums">
                {inr(quote.payable)}
              </span>
            </div>

            {/* coupon */}
            <div className="mt-4">
              <p className="label">Promo code</p>
              {couponCode && quote.couponResult.ok ? (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3.5 py-2.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <Tag size={14} className="shrink-0 text-emerald-400" />
                    <span className="truncate text-[13px] font-semibold text-emerald-200">{couponCode}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-[12px] font-bold text-emerald-300">− {inr(quote.discount)}</span>
                    <button
                      onClick={() => {
                        setCouponCode('');
                        setCouponInput('');
                      }}
                      className="text-slate-400 hover:text-white"
                      aria-label="Remove promo code"
                    >
                      <X size={14} />
                    </button>
                  </span>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && applyCode()}
                    placeholder="FIRST500"
                    className="uppercase"
                  />
                  <Button variant="secondary" onClick={applyCode}>
                    Apply
                  </Button>
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {activeCoupons.slice(0, 3).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setCouponInput(c.code);
                      applyCode(c.code);
                    }}
                    className="chip transition hover:border-brand-400/40 hover:text-brand-200"
                    title={c.description}
                  >
                    <Tag size={10} /> {c.code}
                  </button>
                ))}
              </div>
            </div>

            <Button
              size="lg"
              className="mt-5 w-full"
              onClick={placeBooking}
              loading={placing}
              disabled={placing || Boolean(dateError)}
              icon={placing ? undefined : Lock}
            >
              {placing ? 'Confirming…' : `Pay ${inr(quote.payable)}`}
            </Button>

            <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-500">
              Free cancellation up to {settings.cancellationWindowHours}h before pickup. Late returns are billed
              at {inr(quote.latePenaltyPerHour)}/hour.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
