import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, X, RotateCcw, Car as CarIcon, CalendarClock } from 'lucide-react';
import { useStore } from '../lib/store';
import { CATEGORIES, TRANSMISSIONS, FUELS } from '../data/fleet';
import { minRentalHours } from '../lib/pricing';
import { clashesFor, parseWindow } from '../lib/availability';
import { inr, cx, toLocalInput } from '../lib/format';
import { Button, Badge, Empty, Slider, Select, Spinner, Input } from '../components/ui';
import CarCard from '../components/CarCard';
import CarModal from '../components/CarModal';

const SORTS = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
  { id: 'rating', label: 'Top rated' },
  { id: 'seats', label: 'Most seats' },
];

function Pills({ options, value, onChange, allLabel = 'All' }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        onClick={() => onChange('')}
        className={cx(
          'rounded-full border px-3 py-1.5 text-[12px] font-medium transition',
          !value
            ? 'border-brand-400/50 bg-brand-500/20 text-brand-100'
            : 'border-white/10 text-slate-400 hover:border-white/25 hover:text-white'
        )}
      >
        {allLabel}
      </button>
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(value === o ? '' : o)}
          className={cx(
            'rounded-full border px-3 py-1.5 text-[12px] font-medium transition',
            value === o
              ? 'border-brand-400/50 bg-brand-500/20 text-brand-100'
              : 'border-white/10 text-slate-400 hover:border-white/25 hover:text-white'
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export default function Fleet() {
  const { fleet, ready, busySlots, settings } = useStore();
  const [params, setParams] = useSearchParams();
  const [active, setActive] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  const priceCeiling = useMemo(
    () => Math.max(12000, ...fleet.map((c) => Number(c.rate) || 0)),
    [fleet]
  );

  const [q, setQ] = useState(params.get('q') || '');
  const [category, setCategory] = useState(params.get('category') || '');
  const [transmission, setTransmission] = useState(params.get('transmission') || '');
  const [fuel, setFuel] = useState(params.get('fuel') || '');
  const [maxPrice, setMaxPrice] = useState(Number(params.get('maxPrice')) || priceCeiling);
  const [minSeats, setMinSeats] = useState(Number(params.get('seats')) || 0);
  const [zeroDepOnly, setZeroDepOnly] = useState(params.get('zeroDep') === '1');
  const [availableOnly, setAvailableOnly] = useState(params.get('available') !== '0');
  const [sort, setSort] = useState(params.get('sort') || 'recommended');
  // The trip dates, as datetime-local strings. With both set, every car already
  // booked over that window shows as sold out.
  const [pickup, setPickup] = useState(params.get('pickup') || '');
  const [ret, setRet] = useState(params.get('return') || '');
  const hub = params.get('hub') || '';

  const dates = parseWindow(pickup, ret);
  const dateError =
    pickup && ret && !dates
      ? 'Return must be after pickup.'
      : dates && (dates.end - dates.start) / 3600000 < minRentalHours(settings)
        ? `Minimum rental is ${minRentalHours(settings)} hours.`
        : '';

  // Carried to checkout so the customer does not enter the dates twice.
  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (dates) {
      p.set('pickup', pickup);
      p.set('return', ret);
    }
    if (hub) p.set('hub', hub);
    const str = p.toString();
    return str ? `?${str}` : '';
  }, [dates?.start, dates?.end, pickup, ret, hub]); // eslint-disable-line react-hooks/exhaustive-deps

  const soldOut = useMemo(() => {
    const map = new Map();
    if (!dates) return map;
    fleet.forEach((c) => {
      const clashes = clashesFor(busySlots, c.id, dates.start, dates.end);
      if (clashes.length) map.set(c.id, { end: Math.max(...clashes.map((x) => x.end)) });
    });
    return map;
  }, [fleet, busySlots, dates?.start, dates?.end]); // eslint-disable-line react-hooks/exhaustive-deps

  const changePickup = (value) => {
    setPickup(value);
    const start = new Date(value).getTime();
    const end = new Date(ret).getTime();
    // A fresh pickup with no sensible return yet gets a one-day trip to start from.
    if (!Number.isNaN(start) && (Number.isNaN(end) || end <= start)) setRet(toLocalInput(start + 86400000));
  };

  // Keep the slider ceiling in step with the live fleet.
  useEffect(() => {
    if (!params.get('maxPrice')) setMaxPrice(priceCeiling);
  }, [priceCeiling]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filters are URL state, so a filtered view is shareable and survives reload.
  useEffect(() => {
    const next = {};
    if (q) next.q = q;
    if (category) next.category = category;
    if (transmission) next.transmission = transmission;
    if (fuel) next.fuel = fuel;
    if (maxPrice < priceCeiling) next.maxPrice = String(maxPrice);
    if (minSeats) next.seats = String(minSeats);
    if (zeroDepOnly) next.zeroDep = '1';
    if (!availableOnly) next.available = '0';
    if (sort !== 'recommended') next.sort = sort;
    if (pickup) next.pickup = pickup;
    if (ret) next.return = ret;
    if (hub) next.hub = hub;
    setParams(next, { replace: true });
  }, [q, category, transmission, fuel, maxPrice, minSeats, zeroDepOnly, availableOnly, sort, priceCeiling, pickup, ret, hub, setParams]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = fleet.filter((c) => {
      if (needle) {
        const hay = `${c.name} ${c.brand} ${c.category} ${c.fuel} ${(c.features || []).join(' ')}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (category && c.category !== category) return false;
      if (transmission && c.transmission !== transmission) return false;
      if (fuel && c.fuel !== fuel) return false;
      if (Number(c.rate) > maxPrice) return false;
      if (minSeats && Number(c.seats) < minSeats) return false;
      if (zeroDepOnly && !c.zeroDep) return false;
      if (availableOnly && (c.available === false || c.status === 'maintenance')) return false;
      return true;
    });

    const cmp = {
      'price-asc': (a, b) => a.rate - b.rate,
      'price-desc': (a, b) => b.rate - a.rate,
      rating: (a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount,
      seats: (a, b) => b.seats - a.seats || a.rate - b.rate,
      recommended: (a, b) =>
        b.rating * 20 + b.reviewCount * 0.05 - (a.rating * 20 + a.reviewCount * 0.05),
    }[sort];
    // Sold-out cars stay visible, so the customer can see the car exists, but sink to the end.
    return [...list].sort((a, b) => soldOut.has(a.id) - soldOut.has(b.id) || cmp(a, b));
  }, [fleet, q, category, transmission, fuel, maxPrice, minSeats, zeroDepOnly, availableOnly, sort, soldOut]);

  const activeCount =
    (category ? 1 : 0) +
    (transmission ? 1 : 0) +
    (fuel ? 1 : 0) +
    (maxPrice < priceCeiling ? 1 : 0) +
    (minSeats ? 1 : 0) +
    (zeroDepOnly ? 1 : 0) +
    (!availableOnly ? 1 : 0);

  const reset = () => {
    setQ('');
    setCategory('');
    setTransmission('');
    setFuel('');
    setMaxPrice(priceCeiling);
    setMinSeats(0);
    setZeroDepOnly(false);
    setAvailableOnly(true);
    setSort('recommended');
  };

  const FilterPanel = (
    <div className="space-y-5">
      <div>
        <p className="label">Category</p>
        <Pills options={CATEGORIES} value={category} onChange={setCategory} allLabel="All types" />
      </div>
      <div>
        <p className="label">Transmission</p>
        <Pills options={TRANSMISSIONS} value={transmission} onChange={setTransmission} allLabel="Any" />
      </div>
      <div>
        <p className="label">Fuel</p>
        <Pills options={FUELS} value={fuel} onChange={setFuel} allLabel="Any" />
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="label mb-0">Max price / day</span>
          <span className="text-[13px] font-bold text-brand-200 tabular-nums">{inr(maxPrice)}</span>
        </div>
        <Slider min={1000} max={priceCeiling} step={100} value={maxPrice} onChange={setMaxPrice} />
        <div className="mt-1 flex justify-between text-[10.5px] text-slate-600">
          <span>{inr(1000)}</span>
          <span>{inr(priceCeiling)}</span>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="label mb-0">Minimum seats</span>
          <span className="text-[13px] font-bold text-brand-200 tabular-nums">
            {minSeats ? `${minSeats}+` : 'Any'}
          </span>
        </div>
        <Slider min={0} max={7} step={1} value={minSeats} onChange={setMinSeats} />
        <div className="mt-1 flex justify-between text-[10.5px] text-slate-600">
          <span>Any</span>
          <span>7 seats</span>
        </div>
      </div>

      <div className="space-y-2 border-t border-white/[0.07] pt-4">
        <label className="flex cursor-pointer items-center justify-between gap-3 text-[13px] text-slate-300">
          Zero-dep insurance only
          <input
            type="checkbox"
            checked={zeroDepOnly}
            onChange={(e) => setZeroDepOnly(e.target.checked)}
            className="h-4 w-4 accent-brand-500"
          />
        </label>
        <label className="flex cursor-pointer items-center justify-between gap-3 text-[13px] text-slate-300">
          Available cars only
          <input
            type="checkbox"
            checked={availableOnly}
            onChange={(e) => setAvailableOnly(e.target.checked)}
            className="h-4 w-4 accent-brand-500"
          />
        </label>
      </div>

      {activeCount > 0 && (
        <Button variant="ghost" size="sm" icon={RotateCcw} onClick={reset} className="w-full">
          Reset all filters
        </Button>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-300">The fleet</p>
        <h1 className="text-2xl sm:text-3xl">Pick your car</h1>
        <p className="mt-1.5 max-w-2xl text-[13.5px] text-slate-400">
          {fleet.length} self-drive vehicles across Delhi NCR — hatchbacks for the daily commute, 7-seat SUVs
          for the hills, and a luxury line for the days that matter.
        </p>
      </div>

      <div className="panel mb-5 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2 self-center pr-1">
            <CalendarClock size={16} className="text-brand-300" />
            <div>
              <p className="text-[13.5px] font-semibold text-white">When do you need it?</p>
              <p className="text-[11.5px] text-slate-500">Cars already booked on your dates show as sold out.</p>
            </div>
          </div>
          <label className="min-w-[12rem] flex-1">
            <span className="label">Pickup</span>
            <Input type="datetime-local" value={pickup} onChange={(e) => changePickup(e.target.value)} />
          </label>
          <label className="min-w-[12rem] flex-1">
            <span className="label">Return</span>
            <Input type="datetime-local" value={ret} min={pickup || undefined} onChange={(e) => setRet(e.target.value)} />
          </label>
          {(pickup || ret) && (
            <Button
              variant="ghost"
              icon={X}
              onClick={() => {
                setPickup('');
                setRet('');
              }}
            >
              Any dates
            </Button>
          )}
        </div>
        {dateError && <p className="mt-2 text-[12px] font-medium text-rose-300">{dateError}</p>}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[14rem] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by model, brand or feature — try “sunroof” or “Creta”"
            className="field pl-10"
          />
          {q && (
            <button
              onClick={() => setQ('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-auto min-w-[11rem]">
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>

        <Button
          variant="secondary"
          icon={SlidersHorizontal}
          onClick={() => setShowFilters((v) => !v)}
          className="lg:hidden"
        >
          Filters
          {activeCount > 0 && (
            <span className="ml-1 rounded-full bg-brand-500 px-1.5 text-[10px] font-bold">{activeCount}</span>
          )}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <aside className={cx('lg:block', showFilters ? 'block' : 'hidden')}>
          <div className="panel sticky top-20 p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px]">Filters</h2>
              {activeCount > 0 && <Badge tone="brand">{activeCount} active</Badge>}
            </div>
            {FilterPanel}
          </div>
        </aside>

        <section>
          <div className="mb-3.5 flex items-center justify-between">
            <p className="text-[13px] text-slate-400">
              <span className="font-bold text-white tabular-nums">{results.length}</span> of {fleet.length} cars
              {activeCount > 0 && ' match your filters'}
              {dates && (
                <>
                  {' · '}
                  <span className="font-semibold text-emerald-300 tabular-nums">
                    {results.filter((c) => !soldOut.has(c.id)).length} free
                  </span>{' '}
                  on your dates
                </>
              )}
            </p>
          </div>

          {!ready ? (
            <Spinner label="Loading the fleet" />
          ) : results.length === 0 ? (
            <Empty
              icon={CarIcon}
              title="No cars match those filters"
              body="Try widening the price range, lowering the seat requirement, or clearing a category."
              action={
                <Button icon={RotateCcw} onClick={reset}>
                  Reset filters
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {results.map((car) => (
                <CarCard
                  key={car.id}
                  car={car}
                  onOpen={setActive}
                  soldOut={soldOut.get(car.id) || null}
                  query={query}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <CarModal
        car={active}
        open={Boolean(active)}
        onClose={() => setActive(null)}
        soldOut={active ? soldOut.get(active.id) || null : null}
        query={query}
      />
    </div>
  );
}
