// Fleet peak-demand heatmap, slot calendar and per-vehicle timelines (module 4).

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, Flame } from 'lucide-react';
import { ymd, cx, inr } from '../../lib/format';
import { Badge } from '../ui';

export const TIERS = [
  { id: 'peak', label: 'Peak 75%+', min: 0.75, cls: 'bg-rose-500/85 text-white', dot: 'bg-rose-500' },
  { id: 'high', label: 'High 50%+', min: 0.5, cls: 'bg-orange-500/80 text-white', dot: 'bg-orange-500' },
  { id: 'moderate', label: 'Moderate 25%+', min: 0.25, cls: 'bg-amber-400/75 text-ink-950', dot: 'bg-amber-400' },
  { id: 'low', label: 'Low', min: 0.0001, cls: 'bg-emerald-500/60 text-white', dot: 'bg-emerald-500' },
  { id: 'available', label: 'Available', min: -1, cls: 'bg-white/[0.04] text-slate-500', dot: 'bg-slate-600' },
];

export const tierFor = (ratio) => TIERS.find((t) => ratio >= t.min) || TIERS[TIERS.length - 1];

/** Days in a month as Date objects, padded to whole weeks (Mon-first). */
function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  start.setDate(first.getDate() - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

const overlapsDay = (b, dayStart, dayEnd) =>
  b.status !== 'Cancelled' && b.pickupMs <= dayEnd && b.returnMs >= dayStart;

export default function Heatmap({ bookings, fleet, onPickDay, selectedDay }) {
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });

  const grid = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);
  const fleetSize = Math.max(1, fleet.length);

  const dayStats = useMemo(() => {
    const map = new Map();
    grid.forEach((d) => {
      const start = new Date(d).setHours(0, 0, 0, 0);
      const end = new Date(d).setHours(23, 59, 59, 999);
      const active = bookings.filter((b) => overlapsDay(b, start, end));
      const pickups = bookings.filter(
        (b) => b.status !== 'Cancelled' && b.pickupMs >= start && b.pickupMs <= end
      );
      const revenue = pickups.reduce((s, b) => s + ((b.quote?.taxable || 0) + (b.quote?.gst || 0)), 0);
      map.set(ymd(d), {
        active: active.length,
        pickups: pickups.length,
        revenue,
        ratio: active.length / fleetSize,
      });
    });
    return map;
  }, [grid, bookings, fleetSize]);

  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

  const monthTotals = useMemo(() => {
    let pickups = 0;
    let revenue = 0;
    let peakDays = 0;
    grid.forEach((d) => {
      if (d.getMonth() !== cursor.m) return;
      const s = dayStats.get(ymd(d));
      if (!s) return;
      pickups += s.pickups;
      revenue += s.revenue;
      if (s.ratio >= 0.75) peakDays += 1;
    });
    return { pickups, revenue, peakDays };
  }, [grid, dayStats, cursor.m]);

  const shift = (delta) => {
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  // Per-vehicle occupancy across the visible month
  const vehicleRows = useMemo(() => {
    const days = grid.filter((d) => d.getMonth() === cursor.m);
    return fleet.map((car) => {
      const cells = days.map((d) => {
        const start = new Date(d).setHours(0, 0, 0, 0);
        const end = new Date(d).setHours(23, 59, 59, 999);
        const hit = bookings.find((b) => b.carId === car.id && overlapsDay(b, start, end));
        return { day: d, booking: hit };
      });
      const bookedDays = cells.filter((c) => c.booking).length;
      return { car, cells, bookedDays, utilisation: bookedDays / Math.max(1, days.length) };
    });
  }, [fleet, bookings, grid, cursor.m]);

  return (
    <div className="space-y-5">
      {/* calendar */}
      <div className="panel p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-[16px]">
              <Flame size={15} className="text-rose-400" />
              Peak demand heatmap
            </h3>
            <p className="mt-0.5 text-[12.5px] text-slate-400">
              Fleet occupancy per day. Click a date to open the slot inspector.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => shift(-1)}
              className="rounded-lg border border-white/10 p-2 text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
              aria-label="Previous month"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="min-w-[9rem] text-center text-[13.5px] font-semibold text-white">
              {monthLabel}
            </span>
            <button
              onClick={() => shift(1)}
              className="rounded-lg border border-white/10 p-2 text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
              aria-label="Next month"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>

        <div className="mb-3 grid grid-cols-3 gap-2 sm:max-w-md">
          {[
            ['Pickups', monthTotals.pickups],
            ['Revenue', inr(monthTotals.revenue)],
            ['Peak days', monthTotals.peakDays],
          ].map(([k, v]) => (
            <div key={k} className="panel-tight px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{k}</p>
              <p className="font-display text-[15px] font-bold text-white tabular-nums">{v}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              {d}
            </div>
          ))}
          {grid.map((d) => {
            const key = ymd(d);
            const s = dayStats.get(key) || { active: 0, pickups: 0, revenue: 0, ratio: 0 };
            const tier = tierFor(s.ratio);
            const otherMonth = d.getMonth() !== cursor.m;
            const isToday = ymd(d) === ymd(today);
            const isSelected = selectedDay === key;
            return (
              <button
                key={key}
                onClick={() => onPickDay?.(key)}
                title={`${d.toLocaleDateString('en-IN')} — ${s.active}/${fleetSize} cars out · ${
                  s.pickups
                } pickups · ${inr(s.revenue)}`}
                className={cx(
                  'relative aspect-square rounded-lg p-1.5 text-left transition',
                  tier.cls,
                  otherMonth && 'opacity-25',
                  isSelected && 'ring-2 ring-brand-300',
                  'hover:ring-2 hover:ring-white/40'
                )}
              >
                <span className="block text-[11px] font-bold tabular-nums">{d.getDate()}</span>
                {s.active > 0 && (
                  <span className="absolute bottom-1 left-1.5 text-[9.5px] font-semibold opacity-90">
                    {s.active}/{fleetSize}
                  </span>
                )}
                {isToday && (
                  <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-white shadow" />
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-3 border-t border-white/[0.07] pt-3.5">
          {TIERS.map((t) => (
            <span key={t.id} className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <span className={cx('h-2.5 w-2.5 rounded-sm', t.dot)} />
              {t.label}
            </span>
          ))}
        </div>
      </div>

      {/* per-vehicle timelines */}
      <div className="panel p-5">
        <h3 className="flex items-center gap-2 text-[16px]">
          <CalendarDays size={15} className="text-brand-300" />
          Per-vehicle occupancy timeline
        </h3>
        <p className="mt-0.5 text-[12.5px] text-slate-400">
          Every car in the fleet across {monthLabel}. Filled blocks are booked days.
        </p>

        <div className="mt-4 overflow-x-auto">
          <div className="min-w-[46rem] space-y-1.5">
            {vehicleRows.map(({ car, cells, bookedDays, utilisation }) => (
              <div key={car.id} className="flex items-center gap-3">
                <div className="w-44 shrink-0">
                  <p className="truncate text-[12.5px] font-medium text-white">{car.name}</p>
                  <p className="truncate text-[10.5px] text-slate-500">
                    {car.plate} · {car.category}
                  </p>
                </div>
                <div className="flex flex-1 gap-[2px]">
                  {cells.map(({ day, booking }) => (
                    <div
                      key={ymd(day)}
                      title={
                        booking
                          ? `${day.toLocaleDateString('en-IN')} — ${booking.ref} · ${booking.customerName}`
                          : `${day.toLocaleDateString('en-IN')} — available`
                      }
                      className={cx(
                        'h-6 flex-1 rounded-[3px] transition',
                        booking
                          ? booking.status === 'Cancelled'
                            ? 'bg-slate-700'
                            : 'bg-brand-500/85 hover:bg-brand-400'
                          : 'bg-white/[0.05] hover:bg-white/10'
                      )}
                    />
                  ))}
                </div>
                <div className="w-20 shrink-0 text-right">
                  <Badge
                    tone={utilisation >= 0.6 ? 'danger' : utilisation >= 0.3 ? 'warning' : 'neutral'}
                  >
                    {Math.round(utilisation * 100)}%
                  </Badge>
                  <p className="mt-0.5 text-[10px] text-slate-600">{bookedDays}d booked</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
