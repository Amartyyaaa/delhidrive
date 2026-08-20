import { Link } from 'react-router-dom';
import { Users, Fuel, Cog, Gauge, Star, ShieldCheck, Wrench, Zap } from 'lucide-react';
import { inr, cx } from '../lib/format';
import { Badge, Button } from './ui';
import CarArt from './CarArt';

const FUEL_ICON = { EV: Zap, Petrol: Fuel, Diesel: Fuel, CNG: Fuel };

export default function CarCard({ car, onOpen }) {
  const unavailable = car.available === false || car.status === 'maintenance';
  const FuelIcon = FUEL_ICON[car.fuel] || Fuel;

  const specs = [
    { icon: Users, label: `${car.seats} seats` },
    { icon: Cog, label: car.transmission },
    { icon: FuelIcon, label: car.fuel },
    {
      icon: Gauge,
      label: car.fuel === 'EV' ? `${car.mileage} km range` : `${car.mileage} kmpl`,
    },
  ];

  return (
    <article
      className={cx(
        'group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-900/70',
        'shadow-card backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-brand-400/40',
        'hover:shadow-glow',
        unavailable && 'opacity-70'
      )}
    >
      <button
        onClick={() => onOpen(car)}
        className="relative block aspect-[16/9] w-full overflow-hidden text-left"
        aria-label={`View details for ${car.name}`}
      >
        <CarArt car={car} className="transition duration-500 group-hover:scale-[1.06]" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <Badge tone="brand">{car.category}</Badge>
          {car.zeroDep && (
            <Badge tone="success" icon={ShieldCheck}>
              Zero Dep
            </Badge>
          )}
        </div>
        {unavailable && (
          <div className="absolute inset-0 grid place-items-center bg-ink-950/70 backdrop-blur-[2px]">
            <Badge tone="warning" icon={Wrench}>
              {car.status === 'maintenance' ? 'In maintenance' : 'Unavailable'}
            </Badge>
          </div>
        )}
        <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full border border-white/10 bg-ink-950/80 px-2.5 py-1 backdrop-blur">
          <Star size={11} className="fill-saffron-400 text-saffron-400" />
          <span className="text-[11.5px] font-bold text-white tabular-nums">{car.rating}</span>
          <span className="text-[10.5px] text-slate-500">({car.reviewCount})</span>
        </div>
      </button>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{car.brand}</p>
            <h3 className="truncate text-[15px] font-semibold leading-tight">{car.name}</h3>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-display text-lg font-bold leading-none text-white">{inr(car.rate)}</p>
            <p className="text-[10.5px] text-slate-500">per day</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {specs.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5 text-[11.5px] text-slate-400">
              <s.icon size={12.5} className="shrink-0 text-slate-500" />
              <span className="truncate">{s.label}</span>
            </span>
          ))}
        </div>

        <div className="mt-4 flex gap-2 border-t border-white/[0.07] pt-3.5">
          <Button variant="secondary" size="sm" className="flex-1" onClick={() => onOpen(car)}>
            Details
          </Button>
          <Button
            as={unavailable ? 'button' : Link}
            to={unavailable ? undefined : `/checkout/${car.id}`}
            size="sm"
            className="flex-1"
            disabled={unavailable}
          >
            Book now
          </Button>
        </div>
      </div>
    </article>
  );
}
