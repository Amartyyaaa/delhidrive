import { Link } from 'react-router-dom';
import {
  Users,
  Cog,
  Fuel,
  Gauge,
  Briefcase,
  Cpu,
  Star,
  ShieldCheck,
  MapPin,
  Check,
  Mountain,
  IndianRupee,
} from 'lucide-react';
import { Modal, Badge, Button, Row } from './ui';
import CarArt from './CarArt';
import { inr, cx } from '../lib/format';
import { LOCATIONS } from '../lib/pricing';

function Stars({ value, size = 12 }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          className={cx(
            i <= Math.round(value) ? 'fill-saffron-400 text-saffron-400' : 'text-slate-700'
          )}
        />
      ))}
    </span>
  );
}

export default function CarModal({ car, open, onClose }) {
  if (!car) return null;
  const unavailable = car.available === false || car.status === 'maintenance';
  const hub = LOCATIONS.find((l) => l.id === car.hub);

  const specs = [
    { icon: Cpu, label: 'Engine', value: car.engineCc ? `${car.engineCc} cc` : 'Electric motor' },
    { icon: Cog, label: 'Transmission', value: car.transmission },
    { icon: Fuel, label: 'Fuel type', value: car.fuel },
    {
      icon: Gauge,
      label: car.fuel === 'EV' ? 'Range' : 'Mileage',
      value: car.fuel === 'EV' ? `${car.mileage} km` : `${car.mileage} kmpl`,
    },
    { icon: Users, label: 'Seating', value: `${car.seats} people` },
    { icon: Briefcase, label: 'Boot space', value: `${car.bootLitres} litres` },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={car.name}
      subtitle={`${car.brand} · ${car.category} · ${car.plate}`}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display text-2xl font-bold leading-none text-white">
              {inr(car.rate)}
              <span className="ml-1 text-[12px] font-normal text-slate-500">/ day</span>
            </p>
            <p className="mt-1 text-[11.5px] text-slate-500">
              + {inr(car.deposit)} refundable deposit · 18% GST applies
            </p>
          </div>
          <Button
            as={unavailable ? 'button' : Link}
            to={unavailable ? undefined : `/checkout/${car.id}`}
            size="lg"
            disabled={unavailable}
            onClick={onClose}
          >
            {unavailable ? 'Currently unavailable' : 'Reserve this car'}
          </Button>
        </div>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <div className="aspect-[16/9]">
              <CarArt car={car} showPlate />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
              <Stars value={car.rating} />
              <span className="text-[12px] font-bold text-white">{car.rating}</span>
              <span className="text-[11px] text-slate-500">· {car.reviewCount} reviews</span>
            </span>
            {car.zeroDep && (
              <Badge tone="success" icon={ShieldCheck}>
                Zero depreciation
              </Badge>
            )}
            {hub && (
              <span className="chip">
                <MapPin size={11} /> {hub.label}
              </span>
            )}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {specs.map((s) => (
              <div key={s.label} className="panel-tight p-3">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <s.icon size={12} />
                  <span className="text-[10.5px] font-semibold uppercase tracking-wide">{s.label}</span>
                </div>
                <p className="mt-1 text-[13.5px] font-semibold text-white">{s.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-5">
            <h4 className="mb-2.5 text-[13px] font-semibold uppercase tracking-wide text-slate-400">
              Key features
            </h4>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {(car.features || []).map((f) => (
                <li key={f} className="flex items-start gap-2 text-[13px] text-slate-300">
                  <Check size={13} className="mt-0.5 shrink-0 text-emerald-400" />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {(car.terrain || []).length > 0 && (
            <div className="mt-5">
              <h4 className="mb-2.5 text-[13px] font-semibold uppercase tracking-wide text-slate-400">
                Best suited for
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {car.terrain.map((t) => (
                  <span key={t} className="chip">
                    <Mountain size={11} /> {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <section className="panel-tight p-4">
            <h4 className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-white">
              <ShieldCheck size={14} className="text-emerald-400" />
              Insurance & protection
            </h4>
            {car.zeroDep ? (
              <p className="text-[12.5px] leading-relaxed text-slate-400">
                Zero-depreciation cover is <strong className="text-emerald-300">included</strong>. Claims are
                settled without any depreciation deduction on plastic, rubber and fibre parts — you pay only
                the standard excess.
              </p>
            ) : (
              <p className="text-[12.5px] leading-relaxed text-slate-400">
                This car carries standard comprehensive cover. Depreciation applies to replaced parts, so
                out-of-pocket costs can be higher on a claim.
              </p>
            )}
            <ul className="mt-3 space-y-1.5 border-t border-white/[0.07] pt-3 text-[12px] text-slate-400">
              <li className="flex justify-between gap-3">
                <span>Not covered</span>
                <span className="text-right text-slate-300">Tyres, glass, undercarriage, keys</span>
              </li>
              <li className="flex justify-between gap-3">
                <span>Security deposit</span>
                <span className="font-semibold text-white">{inr(car.deposit)}</span>
              </li>
              <li className="flex justify-between gap-3">
                <span>Roadside assistance</span>
                <span className="text-emerald-300">24×7 included</span>
              </li>
            </ul>
          </section>

          <section className="panel-tight p-4">
            <h4 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-white">
              <IndianRupee size={14} className="text-brand-300" />
              Indicative pricing
            </h4>
            <Row k="1 day" v={inr(car.rate)} />
            <Row k="3 days" v={inr(car.rate * 3)} />
            <Row k="7 days" v={inr(car.rate * 7)} />
            <Row k="Refundable deposit" v={inr(car.deposit)} tone="text-slate-300" />
            <p className="mt-2 border-t border-white/[0.07] pt-2 text-[11px] leading-relaxed text-slate-500">
              Excludes 18% GST, optional add-ons and hub fees. Weekend pickups carry a surge multiplier shown
              at checkout.
            </p>
          </section>

          <section>
            <h4 className="mb-2.5 text-[13px] font-semibold uppercase tracking-wide text-slate-400">
              Customer reviews
            </h4>
            <div className="space-y-2.5">
              {(car.reviews || []).map((rv, i) => (
                <div key={i} className="panel-tight p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold text-white">{rv.author}</p>
                    <Stars value={rv.rating} size={11} />
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-400">“{rv.text}”</p>
                  <p className="mt-1.5 text-[10.5px] text-slate-600">{rv.when}</p>
                </div>
              ))}
              {!(car.reviews || []).length && (
                <p className="text-[12.5px] text-slate-500">No reviews on this vehicle yet.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </Modal>
  );
}
