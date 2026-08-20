import { useMemo, useState } from 'react';
import {
  LayoutDashboard,
  Flame,
  CalendarSearch,
  Car,
  IdCard,
  Tag,
  LifeBuoy,
  SlidersHorizontal,
  IndianRupee,
  TrendingUp,
  Users,
  AlertTriangle,
  Wrench,
} from 'lucide-react';
import { useStore } from '../lib/store';
import { ymd, inr, cx } from '../lib/format';
import { Tabs, Stat, Badge } from '../components/ui';
import Heatmap, { tierFor } from '../components/admin/Heatmap';
import SlotInspector from '../components/admin/SlotInspector';
import InventoryManager from '../components/admin/InventoryManager';
import KycPortal from '../components/admin/KycPortal';
import CouponCreator from '../components/admin/CouponCreator';
import SettingsPanel from '../components/admin/SettingsPanel';
import AdminTickets from '../components/admin/AdminTickets';

function Overview({ bookings, fleet, kycDocs, tickets }) {
  const live = bookings.filter((b) => b.status !== 'Cancelled');
  const now = Date.now();

  const revenue = live.reduce((s, b) => s + ((b.quote?.taxable || 0) + (b.quote?.gst || 0)), 0);
  const onRoad = live.filter((b) => b.pickupMs <= now && b.returnMs >= now).length;
  const upcoming = live.filter((b) => b.pickupMs > now).length;
  const pendingKyc = kycDocs.filter((k) => k.status === 'Pending Review').length;
  const openTickets = tickets.filter((t) => t.status !== 'Resolved' && t.status !== 'Closed').length;
  const maintenance = fleet.filter((c) => c.status === 'maintenance').length;
  const utilisation = fleet.length ? onRoad / fleet.length : 0;

  // Revenue for the trailing 12 months.
  const monthly = useMemo(() => {
    const buckets = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).getTime();
      const total = live
        .filter((b) => b.pickupMs >= start && b.pickupMs <= end)
        .reduce((s, b) => s + ((b.quote?.taxable || 0) + (b.quote?.gst || 0)), 0);
      buckets.push({
        label: d.toLocaleDateString('en-IN', { month: 'short' }),
        total,
        count: live.filter((b) => b.pickupMs >= start && b.pickupMs <= end).length,
      });
    }
    return buckets;
  }, [live]);

  const maxMonth = Math.max(1, ...monthly.map((m) => m.total));

  const topCars = useMemo(() => {
    const map = new Map();
    live.forEach((b) => {
      const cur = map.get(b.carId) || { count: 0, revenue: 0, name: b.carName };
      cur.count += 1;
      cur.revenue += (b.quote?.taxable || 0) + (b.quote?.gst || 0);
      map.set(b.carId, cur);
    });
    return [...map.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [live]);

  const byCategory = useMemo(() => {
    const map = {};
    live.forEach((b) => {
      const cat = fleet.find((c) => c.id === b.carId)?.category || b.carCategory || 'Other';
      map[cat] = (map[cat] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [live, fleet]);

  const tier = tierFor(utilisation);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Gross revenue" value={inr(revenue)} sub={`${live.length} bookings`} icon={IndianRupee} tone="success" />
        <Stat
          label="Cars on road now"
          value={`${onRoad} / ${fleet.length}`}
          sub={`${Math.round(utilisation * 100)}% utilisation · ${tier.label}`}
          icon={TrendingUp}
          tone="brand"
        />
        <Stat label="Upcoming pickups" value={upcoming} sub="Reserved and paid" icon={Users} tone="info" />
        <Stat
          label="Needs attention"
          value={pendingKyc + openTickets + maintenance}
          sub={`${pendingKyc} KYC · ${openTickets} tickets · ${maintenance} in service`}
          icon={AlertTriangle}
          tone="warning"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="panel p-5">
          <h3 className="text-[16px]">Revenue · trailing 12 months</h3>
          <p className="mt-0.5 text-[12.5px] text-slate-400">Net of discounts, inclusive of GST, excludes deposits.</p>
          <div className="mt-5 flex h-44 items-end gap-1.5">
            {monthly.map((m, i) => (
              <div key={i} className="group flex flex-1 flex-col items-center gap-1.5">
                <span className="text-[9.5px] font-semibold text-slate-500 opacity-0 transition group-hover:opacity-100">
                  {m.total ? inr(m.total) : '—'}
                </span>
                <div
                  className={cx(
                    'w-full rounded-t transition',
                    m.total ? 'bg-brand-500/75 group-hover:bg-brand-400' : 'bg-white/[0.05]'
                  )}
                  style={{ height: `${Math.max(3, (m.total / maxMonth) * 130)}px` }}
                  title={`${m.label}: ${inr(m.total)} from ${m.count} booking(s)`}
                />
                <span className="text-[9.5px] text-slate-600">{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <div className="panel p-5">
            <h3 className="text-[16px]">Top earners</h3>
            {topCars.length === 0 ? (
              <p className="mt-2 text-[12.5px] text-slate-500">No bookings recorded yet.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {topCars.map((c, i) => (
                  <li key={c.id} className="flex items-center gap-3">
                    <span className="font-display text-[13px] font-bold text-slate-600">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium text-white">{c.name}</span>
                      <span className="mt-1 block h-1 rounded-full bg-white/[0.06]">
                        <span
                          className="block h-1 rounded-full bg-brand-500"
                          style={{ width: `${(c.revenue / topCars[0].revenue) * 100}%` }}
                        />
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[12px] font-bold text-white tabular-nums">
                        {inr(c.revenue)}
                      </span>
                      <span className="block text-[10px] text-slate-600">{c.count} trips</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel p-5">
            <h3 className="text-[16px]">Bookings by category</h3>
            {byCategory.length === 0 ? (
              <p className="mt-2 text-[12.5px] text-slate-500">No data yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {byCategory.map(([cat, n]) => (
                  <div key={cat} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-[12px] text-slate-400">{cat}</span>
                    <span className="h-2 flex-1 rounded-full bg-white/[0.06]">
                      <span
                        className="block h-2 rounded-full bg-saffron-500"
                        style={{ width: `${(n / byCategory[0][1]) * 100}%` }}
                      />
                    </span>
                    <span className="w-6 shrink-0 text-right text-[12px] font-bold text-white tabular-nums">
                      {n}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Admin() {
  const { bookings, fleet, kycDocs, tickets, patchBooking } = useStore();
  const [tab, setTab] = useState('overview');
  const [day, setDay] = useState(ymd(new Date()));

  const pendingKyc = kycDocs.filter((k) => k.status === 'Pending Review').length;
  const openTickets = tickets.filter((t) => t.status !== 'Resolved' && t.status !== 'Closed').length;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'demand', label: 'Demand heatmap', icon: Flame },
    { id: 'slots', label: 'Slot inspector', icon: CalendarSearch },
    { id: 'fleet', label: 'Fleet inventory', icon: Car, count: fleet.length },
    { id: 'kyc', label: 'KYC portal', icon: IdCard, count: pendingKyc || undefined },
    { id: 'coupons', label: 'Promotions', icon: Tag },
    { id: 'tickets', label: 'Support', icon: LifeBuoy, count: openTickets || undefined },
    { id: 'settings', label: 'Settings', icon: SlidersHorizontal },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-saffron-400">
            Operations console
          </p>
          <h1 className="text-2xl sm:text-3xl">Admin dashboard</h1>
          <p className="mt-1.5 text-[13.5px] text-slate-400">
            Fleet operations, demand planning, verification and policy — the whole platform from one screen.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {pendingKyc > 0 && (
            <Badge tone="warning" icon={IdCard}>
              {pendingKyc} KYC pending
            </Badge>
          )}
          {openTickets > 0 && (
            <Badge tone="danger" icon={LifeBuoy}>
              {openTickets} open tickets
            </Badge>
          )}
          {fleet.some((c) => c.status === 'maintenance') && (
            <Badge tone="info" icon={Wrench}>
              {fleet.filter((c) => c.status === 'maintenance').length} in maintenance
            </Badge>
          )}
        </div>
      </div>

      <Tabs className="mb-6" tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'overview' && (
        <Overview bookings={bookings} fleet={fleet} kycDocs={kycDocs} tickets={tickets} />
      )}
      {tab === 'demand' && (
        <Heatmap
          bookings={bookings}
          fleet={fleet}
          selectedDay={day}
          onPickDay={(d) => {
            setDay(d);
            setTab('slots');
          }}
        />
      )}
      {tab === 'slots' && (
        <SlotInspector day={day} bookings={bookings} fleet={fleet} onPatchBooking={patchBooking} />
      )}
      {tab === 'fleet' && <InventoryManager />}
      {tab === 'kyc' && <KycPortal />}
      {tab === 'coupons' && <CouponCreator />}
      {tab === 'tickets' && <AdminTickets />}
      {tab === 'settings' && <SettingsPanel />}
    </div>
  );
}
