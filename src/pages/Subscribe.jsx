// Smart Subscription — the long-term half of the business, alongside the
// hourly/daily rental flow.

import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ShieldCheck,
  Wrench,
  Umbrella,
  CarFront,
  Repeat,
  FileText,
  ArrowRight,
  Check,
  TrendingDown,
  Gauge,
} from 'lucide-react';
import { useStore } from '../lib/store';
import { useAuth } from '../lib/auth';
import { useNotify } from '../lib/notify';
import { TENURES, KM_PACKS, SUBSCRIPTION_INCLUSIONS, subscriptionQuote } from '../lib/subscription';
import { supportWhatsappUrl } from '../lib/whatsapp';
import { inr, cx } from '../lib/format';
import { Button, Badge, Select, Row, Spinner, SectionHeading } from '../components/ui';
import CarArt from '../components/CarArt';

const ICONS = { ShieldCheck, Wrench, Umbrella, CarFront, Repeat, FileText };

export default function Subscribe() {
  const { fleet, ready, settings } = useStore();
  const { user } = useAuth();
  const { toast } = useNotify();
  const [params, setParams] = useSearchParams();

  const available = useMemo(
    () => fleet.filter((c) => c.available !== false && c.status !== 'maintenance'),
    [fleet]
  );

  const [carId, setCarId] = useState(params.get('car') || '');
  const [months, setMonths] = useState(Number(params.get('months')) || 24);
  const [packId, setPackId] = useState(params.get('pack') || 'k2000');

  const car = useMemo(
    () => available.find((c) => c.id === carId) || available[0],
    [available, carId]
  );

  const quote = useMemo(
    () => (car ? subscriptionQuote({ car, months, packId, settings }) : null),
    [car, months, packId, settings]
  );

  if (!ready) return <Spinner label="Loading subscription plans" />;
  if (!car) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h2 className="text-xl">No cars available to subscribe to</h2>
        <Button as={Link} to="/fleet" className="mt-5">
          Browse the fleet
        </Button>
      </div>
    );
  }

  const pick = (id) => {
    setCarId(id);
    const next = new URLSearchParams(params);
    next.set('car', id);
    setParams(next, { replace: true });
  };

  const enquire = () => {
    const msg = [
      '*SUBSCRIPTION ENQUIRY — DELHIDRIVE*',
      '',
      `Car: ${car.name}`,
      `Tenure: ${quote.tenure.label}`,
      `Km pack: ${quote.pack.label}`,
      `Monthly: ${inr(quote.monthlyWithGst)} (incl. GST)`,
      `Refundable deposit: ${inr(quote.refundableDeposit)}`,
      `First payment: ${inr(quote.firstPayment)}`,
      '',
      user ? `Customer: ${user.name} (${user.email})` : 'Customer: not signed in',
    ].join('\n');
    window.open(supportWhatsappUrl(msg), '_blank', 'noopener,noreferrer');
    toast('Opening WhatsApp with your subscription enquiry.', { type: 'success' });
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* hero */}
      <div className="mb-8">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-300">
          Smart Subscription
        </p>
        <h1 className="text-2xl sm:text-3xl">Drive it like you own it. Without owning it.</h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-slate-400">
          Zero down payment, one monthly fee that already includes insurance, servicing and roadside
          assistance. Swap the car after 6 months, walk away after 12.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_23rem]">
        <div className="space-y-6">
          {/* car picker */}
          <section className="panel p-5">
            <SectionHeading eyebrow="Step 1" title="Choose your car" />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {available.slice(0, 12).map((c) => {
                const q = subscriptionQuote({ car: c, months, packId, settings });
                const on = c.id === car.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => pick(c.id)}
                    className={cx(
                      'overflow-hidden rounded-xl border text-left transition',
                      on ? 'border-brand-400/60 bg-brand-500/10' : 'border-white/10 hover:border-white/25'
                    )}
                  >
                    <div className="aspect-[16/9]">
                      <CarArt car={c} />
                    </div>
                    <div className="p-3">
                      <p className="truncate text-[13px] font-semibold text-white">{c.name}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {c.transmission} · {c.fuel} · {c.seats} seats
                      </p>
                      <p className="mt-1.5 font-display text-[15px] font-bold text-brand-300">
                        {inr(q.monthly)}
                        <span className="ml-1 text-[11px] font-normal text-slate-500">/month</span>
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
            {available.length > 12 && (
              <p className="mt-3 text-[12px] text-slate-500">
                Showing 12 of {available.length}.{' '}
                <Link to="/fleet" className="text-brand-300 underline">
                  See the whole fleet
                </Link>
                .
              </p>
            )}
          </section>

          {/* tenure */}
          <section className="panel p-5">
            <SectionHeading eyebrow="Step 2" title="How long?" sub="Longer tenures unlock a deeper discount." />
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {TENURES.map((t) => {
                const q = subscriptionQuote({ car, months: t.months, packId, settings });
                const on = t.months === months;
                return (
                  <button
                    key={t.months}
                    onClick={() => setMonths(t.months)}
                    className={cx(
                      'relative rounded-xl border p-3.5 text-left transition',
                      on ? 'border-brand-400/60 bg-brand-500/12' : 'border-white/10 hover:border-white/25'
                    )}
                  >
                    {t.badge && (
                      <span className="absolute -top-2 right-2">
                        <Badge tone={on ? 'brand' : 'neutral'}>{t.badge}</Badge>
                      </span>
                    )}
                    <p className="text-[13px] font-semibold text-white">{t.label}</p>
                    <p className="mt-1 font-display text-[17px] font-bold text-brand-300">
                      {inr(q.monthly)}
                    </p>
                    <p className="text-[10.5px] text-slate-500">per month + GST</p>
                    {t.discount > 0 && (
                      <p className="mt-1 text-[10.5px] text-emerald-400">
                        {Math.round(t.discount * 100)}% off the 12-month price
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* km pack */}
          <section className="panel p-5">
            <SectionHeading
              eyebrow="Step 3"
              title="How far do you drive?"
              sub={`Beyond the allowance it is ₹${quote.extraKmCharge}/km.`}
            />
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {KM_PACKS.map((p) => {
                const q = subscriptionQuote({ car, months, packId: p.id, settings });
                const on = p.id === packId;
                return (
                  <button
                    key={p.id}
                    onClick={() => setPackId(p.id)}
                    className={cx(
                      'rounded-xl border p-3.5 text-left transition',
                      on ? 'border-brand-400/60 bg-brand-500/12' : 'border-white/10 hover:border-white/25'
                    )}
                  >
                    <Gauge size={15} className={on ? 'text-brand-300' : 'text-slate-500'} />
                    <p className="mt-2 text-[12.5px] font-semibold text-white">{p.label}</p>
                    <p className="mt-1 font-display text-[15px] font-bold text-brand-300">
                      {inr(q.monthly)}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* inclusions */}
          <section className="panel p-5">
            <SectionHeading title="What the monthly fee already covers" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SUBSCRIPTION_INCLUSIONS.map((i) => {
                const Icon = ICONS[i.icon] || Check;
                return (
                  <div key={i.label} className="panel-tight p-3.5">
                    <span className="inline-grid h-9 w-9 place-items-center rounded-xl bg-brand-500/15 text-brand-300">
                      <Icon size={16} />
                    </span>
                    <p className="mt-2.5 text-[13.5px] font-semibold text-white">{i.label}</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-slate-400">{i.note}</p>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* quote panel */}
        <aside>
          <div className="panel sticky top-20 p-5">
            <div className="mb-3 h-28 overflow-hidden rounded-xl border border-white/10">
              <CarArt car={car} />
            </div>
            <h2 className="text-[16px] leading-tight">{car.name}</h2>
            <p className="mt-0.5 text-[12px] text-slate-500">
              {quote.tenure.label} · {quote.pack.label}
            </p>

            <div className="mt-4 rounded-xl bg-brand-500/12 px-4 py-3.5 text-center">
              <p className="font-display text-3xl font-bold text-white">{inr(quote.monthly)}</p>
              <p className="mt-0.5 text-[11.5px] text-brand-200">per month + {quote.gstRate}% GST</p>
            </div>

            <div className="mt-4 divide-y divide-white/[0.06]">
              <div className="pb-2">
                <Row k="Monthly fee" v={inr(quote.monthly)} />
                <Row k={`GST @ ${quote.gstRate}%`} v={inr(quote.gst)} />
                <Row k="Monthly total" v={inr(quote.monthlyWithGst)} />
              </div>
              <div className="py-2">
                <Row k="Refundable deposit" v={inr(quote.refundableDeposit)} tone="text-slate-300" />
                <Row k="Pay to start" v={inr(quote.firstPayment)} />
              </div>
              <div className="py-2">
                <Row k={`Total over ${quote.months} months`} v={inr(quote.totalCommitment)} />
              </div>
            </div>

            <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/[0.08] px-3.5 py-3">
              <TrendingDown size={15} className="mt-0.5 shrink-0 text-emerald-400" />
              <p className="text-[12px] leading-relaxed text-emerald-100">
                <strong>{quote.savingsPercent}% cheaper</strong> than renting this car daily for a month
                ({inr(quote.rentalEquivalent)}). You save {inr(quote.savingsPerMonth)} every month.
              </p>
            </div>

            <Button size="lg" className="mt-4 w-full" iconRight={ArrowRight} onClick={enquire}>
              Enquire on WhatsApp
            </Button>
            <Button as={Link} to={`/checkout/${car.id}`} variant="secondary" className="mt-2 w-full">
              Rent it by the day instead
            </Button>

            <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-500">
              Zero down payment. Swap after 6 months, exit after 12. Subject to KYC and a credit check.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
