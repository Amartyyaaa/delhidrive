import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ShieldCheck,
  MapPin,
  Clock,
  Sparkles,
  Gauge,
  FileText,
  BadgeIndianRupee,
  KeyRound,
  CarFront,
  Star,
  Search,
} from 'lucide-react';
import { useStore } from '../lib/store';
import { LOCATIONS } from '../lib/pricing';
import { CATEGORIES } from '../data/fleet';
import { inr, cx } from '../lib/format';
import { Button, Badge } from '../components/ui';
import CarCard from '../components/CarCard';
import CarModal from '../components/CarModal';

const PROMISES = [
  {
    icon: ShieldCheck,
    title: 'Zero-dep cover included',
    body: 'Claims settled with no depreciation cut on plastic, rubber or fibre parts.',
  },
  {
    icon: MapPin,
    title: '5 handover points',
    body: 'Airport T3, Connaught Place, Cyber City, Noida 18 — or your doorstep.',
  },
  {
    icon: Gauge,
    title: 'Live GPS telematics',
    body: 'Speed, fuel, diagnostics and over-speed alerts streaming to your dashboard.',
  },
  {
    icon: FileText,
    title: 'Paperwork that writes itself',
    body: 'Rental agreements and GST invoices generated as PDFs the moment you pay.',
  },
];

const STEPS = [
  { icon: Search, title: 'Choose your car', body: 'Filter by category, fuel, transmission, seats and budget.' },
  { icon: KeyRound, title: 'Verify once', body: 'Upload licence and Aadhaar. Verification clears in ~20 minutes.' },
  { icon: CarFront, title: 'Collect or get it delivered', body: 'Pick a hub, or have it dropped anywhere in NCR.' },
  { icon: BadgeIndianRupee, title: 'Return and get refunded', body: 'Deposit back in 7 working days, itemised.' },
];

export default function Home() {
  const { fleet } = useStore();
  const navigate = useNavigate();
  const [active, setActive] = useState(null);
  const [quick, setQuick] = useState({ category: '', hub: 'cp', seats: '' });

  const featured = useMemo(
    () =>
      [...fleet]
        .filter((c) => c.available !== false && c.status !== 'maintenance')
        .sort((a, b) => b.rating * 20 + b.reviewCount * 0.05 - (a.rating * 20 + a.reviewCount * 0.05))
        .slice(0, 6),
    [fleet]
  );

  const cheapest = useMemo(
    () => [...fleet].sort((a, b) => a.rate - b.rate)[0],
    [fleet]
  );

  const catCounts = useMemo(
    () =>
      CATEGORIES.map((c) => ({
        name: c,
        count: fleet.filter((f) => f.category === c).length,
        from: Math.min(...fleet.filter((f) => f.category === c).map((f) => f.rate), Infinity),
      })),
    [fleet]
  );

  const submitQuick = (e) => {
    e.preventDefault();
    const p = new URLSearchParams();
    if (quick.category) p.set('category', quick.category);
    if (quick.seats) p.set('seats', quick.seats);
    navigate(`/fleet?${p.toString()}`);
  };

  return (
    <div>
      {/* ---------------- hero ---------------- */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 h-[34rem] w-[64rem] -translate-x-1/2 rounded-full bg-brand-500/10 blur-3xl" />
        </div>

        <div className="mx-auto max-w-7xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
            <div className="animate-fade-up">
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-400/25 bg-brand-500/10 px-3.5 py-1.5 text-[12px] font-medium text-brand-200">
                <Sparkles size={13} />
                {fleet.length} cars live across Delhi NCR
              </span>

              <h1 className="mt-5 font-display text-4xl font-extrabold leading-[1.06] tracking-tight sm:text-5xl lg:text-6xl">
                Delhi is yours.
                <br />
                <span className="bg-gradient-to-r from-brand-300 via-brand-400 to-saffron-400 bg-clip-text text-transparent">
                  Take the wheel.
                </span>
              </h1>

              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-slate-400">
                Self-drive rentals with zero-depreciation insurance, transparent GST billing and no
                per-kilometre charges. Collect from five NCR hubs or have the car delivered to your gate.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <Button as={Link} to="/fleet" size="lg" iconRight={ArrowRight}>
                  Browse the fleet
                </Button>
                <Button as={Link} to="/dashboard" size="lg" variant="secondary">
                  My bookings
                </Button>
              </div>

              <dl className="mt-9 grid max-w-lg grid-cols-3 gap-4 border-t border-white/[0.07] pt-6">
                {[
                  ['From', cheapest ? `${inr(cheapest.rate)}/day` : '—'],
                  ['Deposit refund', '7 working days'],
                  ['Roadside help', '24×7'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">{k}</dt>
                    <dd className="mt-1 font-display text-[15px] font-bold text-white">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* quick search card */}
            <div className="animate-fade-up panel p-5 sm:p-6" style={{ animationDelay: '120ms' }}>
              <h2 className="text-lg">Find a car in 10 seconds</h2>
              <p className="mt-1 text-[13px] text-slate-400">
                Tell us the shape of the trip — we will filter the fleet for you.
              </p>

              <form onSubmit={submitQuick} className="mt-5 space-y-4">
                <div>
                  <p className="label">Vehicle type</p>
                  <div className="grid grid-cols-2 gap-2">
                    {CATEGORIES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setQuick((s) => ({ ...s, category: s.category === c ? '' : c }))}
                        className={cx(
                          'rounded-xl border px-3 py-2.5 text-[13px] font-medium transition',
                          quick.category === c
                            ? 'border-brand-400/50 bg-brand-500/20 text-white'
                            : 'border-white/10 text-slate-400 hover:border-white/25 hover:text-white'
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="label">Group size</p>
                  <div className="flex gap-2">
                    {[
                      ['', 'Any'],
                      ['4', '4+'],
                      ['5', '5+'],
                      ['7', '7'],
                    ].map(([v, label]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setQuick((s) => ({ ...s, seats: v }))}
                        className={cx(
                          'flex-1 rounded-xl border py-2.5 text-[13px] font-medium transition',
                          quick.seats === v
                            ? 'border-brand-400/50 bg-brand-500/20 text-white'
                            : 'border-white/10 text-slate-400 hover:border-white/25 hover:text-white'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="label">Pickup hub</p>
                  <select
                    value={quick.hub}
                    onChange={(e) => setQuick((s) => ({ ...s, hub: e.target.value }))}
                    className="field"
                  >
                    {LOCATIONS.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label}
                        {l.fee ? ` (+${inr(l.fee)})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <Button type="submit" size="lg" className="w-full" iconRight={ArrowRight}>
                  Show matching cars
                </Button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- promises ---------------- */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PROMISES.map((p) => (
            <div key={p.title} className="panel p-5 transition hover:border-brand-400/30">
              <span className="inline-grid h-10 w-10 place-items-center rounded-xl bg-brand-500/15 text-brand-300">
                <p.icon size={18} />
              </span>
              <h3 className="mt-3.5 text-[14.5px]">{p.title}</h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-400">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- categories ---------------- */}
      <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-300">Categories</p>
            <h2 className="text-2xl">Every kind of drive</h2>
          </div>
          <Link to="/fleet" className="link-quiet inline-flex items-center gap-1.5 text-[13px]">
            See all {fleet.length} cars <ArrowRight size={14} />
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {catCounts.map((c) => (
            <Link
              key={c.name}
              to={`/fleet?category=${encodeURIComponent(c.name)}`}
              className="panel group flex items-center justify-between p-5 transition hover:-translate-y-0.5 hover:border-brand-400/40"
            >
              <div>
                <h3 className="text-[15px]">{c.name}</h3>
                <p className="mt-1 text-[12px] text-slate-500">
                  {c.count} car{c.count !== 1 ? 's' : ''} · from{' '}
                  <span className="font-semibold text-brand-200">{inr(c.from)}</span>/day
                </p>
              </div>
              <ArrowRight size={16} className="text-slate-600 transition group-hover:translate-x-1 group-hover:text-brand-300" />
            </Link>
          ))}
        </div>
      </section>

      {/* ---------------- featured ---------------- */}
      <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-300">
              Most booked
            </p>
            <h2 className="text-2xl">Customer favourites</h2>
          </div>
          <Button as={Link} to="/fleet" variant="secondary" size="sm" iconRight={ArrowRight}>
            View all
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {featured.map((car) => (
            <CarCard key={car.id} car={car} onOpen={setActive} />
          ))}
        </div>
      </section>

      {/* ---------------- how it works ---------------- */}
      <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6">
        <div className="panel overflow-hidden">
          <div className="border-b border-white/[0.07] px-6 py-5">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-300">
              How it works
            </p>
            <h2 className="text-2xl">Four steps, no counter queue</h2>
          </div>
          <div className="grid divide-y divide-white/[0.07] sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
            {STEPS.map((s, i) => (
              <div key={s.title} className="p-6">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500/15 text-brand-300">
                    <s.icon size={17} />
                  </span>
                  <span className="font-display text-3xl font-extrabold text-white/[0.08]">0{i + 1}</span>
                </div>
                <h3 className="mt-3.5 text-[14.5px]">{s.title}</h3>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-400">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- hubs ---------------- */}
      <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6">
        <div className="mb-5">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-300">Hubs</p>
          <h2 className="text-2xl">Collect from anywhere in NCR</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {LOCATIONS.map((l) => (
            <div key={l.id} className="panel p-4">
              <MapPin size={16} className="text-brand-300" />
              <h3 className="mt-2.5 text-[13.5px] leading-tight">{l.label}</h3>
              <p className="mt-1 text-[11.5px] leading-snug text-slate-500">{l.note}</p>
              <div className="mt-3">
                {l.fee ? (
                  <Badge tone="warning">+{inr(l.fee)} fee</Badge>
                ) : (
                  <Badge tone="success">No fee</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- closing CTA ---------------- */}
      <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-brand-400/25 bg-gradient-to-br from-brand-600/25 via-ink-900 to-ink-950 p-8 sm:p-12">
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-brand-500/20 blur-3xl" />
          <div className="relative max-w-2xl">
            <div className="mb-3 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} size={14} className="fill-saffron-400 text-saffron-400" />
              ))}
              <span className="ml-2 text-[12.5px] text-slate-400">4.7 average across 2,400+ rentals</span>
            </div>
            <h2 className="text-2xl sm:text-3xl">Your car is ready when you are</h2>
            <p className="mt-3 text-[14px] leading-relaxed text-slate-300">
              Book in under two minutes. Free cancellation up to 24 hours before pickup, and the deposit is
              always refunded in full unless the return inspection says otherwise.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button as={Link} to="/fleet" size="lg" iconRight={ArrowRight}>
                Start booking
              </Button>
              <span className="inline-flex items-center gap-2 text-[13px] text-slate-400">
                <Clock size={14} /> Average handover time: 6 minutes
              </span>
            </div>
          </div>
        </div>
      </section>

      <CarModal car={active} open={Boolean(active)} onClose={() => setActive(null)} />
    </div>
  );
}
