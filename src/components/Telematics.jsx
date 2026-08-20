// Live GPS telematics panel (module 3).

import {
  Gauge,
  Fuel,
  BatteryCharging,
  Thermometer,
  CircleDot,
  Zap,
  Lock,
  Snowflake,
  Satellite,
  TriangleAlert,
  Activity,
  Navigation2,
} from 'lucide-react';
import { useTelematics, ROUTE, ROUTE_D } from '../lib/telematics';
import { cx } from '../lib/format';
import { Badge } from './ui';
import LiveMap from './LiveMap';

function SpeedGauge({ speed, limit }) {
  const max = 160;
  const pct = Math.min(1, speed / max);
  const R = 52;
  const circumference = Math.PI * R; // half circle
  const over = speed > limit;

  return (
    <div className="relative">
      <svg viewBox="0 0 140 82" className="w-full">
        <defs>
          <linearGradient id="speedGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="62%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#f43f5e" />
          </linearGradient>
        </defs>
        <path
          d={`M 18 70 A ${R} ${R} 0 0 1 122 70`}
          fill="none"
          stroke="rgba(148,163,184,0.16)"
          strokeWidth="11"
          strokeLinecap="round"
        />
        <path
          d={`M 18 70 A ${R} ${R} 0 0 1 122 70`}
          fill="none"
          stroke="url(#speedGrad)"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
          style={{ transition: 'stroke-dashoffset .9s cubic-bezier(.16,1,.3,1)' }}
        />
        {/* limit tick */}
        <g transform={`rotate(${-180 + (limit / max) * 180} 70 70)`}>
          <line x1="12" y1="70" x2="24" y2="70" stroke="#f43f5e" strokeWidth="2" opacity="0.8" />
        </g>
        <text
          x="70"
          y="60"
          textAnchor="middle"
          className={cx('font-bold', over ? 'fill-rose-400' : 'fill-white')}
          style={{ fontSize: 26, fontFamily: 'Sora, Inter, sans-serif' }}
        >
          {Math.round(speed)}
        </text>
        <text x="70" y="72" textAnchor="middle" className="fill-slate-500" style={{ fontSize: 8.5 }}>
          km / h
        </text>
      </svg>
      {over && (
        <span className="absolute right-0 top-0">
          <Badge tone="danger" icon={TriangleAlert}>
            Over limit
          </Badge>
        </span>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value, sub, tone = 'text-white' }) {
  return (
    <div className="panel-tight p-3">
      <div className="flex items-center gap-1.5 text-slate-500">
        <Icon size={12} />
        <span className="truncate text-[10px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className={cx('mt-1 font-display text-[15px] font-bold tabular-nums', tone)}>{value}</p>
      {sub && <p className="text-[10px] text-slate-600">{sub}</p>}
    </div>
  );
}

/** Schematic route map, used when Google Maps is unavailable. */
function SchematicMap({ t }) {
  return (
    <svg viewBox="0 0 100 70" className="h-56 w-full sm:h-72">
      <defs>
        <pattern id="grid" width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M6 0 L0 0 0 6" fill="none" stroke="rgba(148,163,184,0.08)" strokeWidth="0.3" />
        </pattern>
        <radialGradient id="pulse" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#2FAE6A" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#2FAE6A" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="100" height="70" fill="#0b0d0c" />
      <rect width="100" height="70" fill="url(#grid)" />

      {/* the Yamuna, for orientation */}
      <path
        d="M92 2 C 88 14, 94 24, 89 34 C 85 44, 90 56, 86 68"
        fill="none"
        stroke="#12372a"
        strokeWidth="2.2"
        opacity="0.8"
      />

      <path d={ROUTE_D} fill="none" stroke="#1d2320" strokeWidth="3.4" strokeLinejoin="round" />
      <path d={ROUTE_D} fill="none" stroke="#128A4B" strokeWidth="1.1" strokeDasharray="2.5 2" opacity="0.85" />

      {ROUTE.map((p) => (
        <circle key={p.name} cx={p.x} cy={p.y} r="1.05" fill="#64748b" />
      ))}

      <g transform={`translate(${t.position.x} ${t.position.y})`}>
        <circle r="6" fill="url(#pulse)" />
        <circle r="2.9" fill="#128A4B" opacity="0.28" />
        <g transform={`rotate(${t.heading})`}>
          <path d="M0 -2.6 L1.9 2.2 L0 1.2 L-1.9 2.2 Z" fill="#ffffff" />
        </g>
      </g>
    </svg>
  );
}

export default function Telematics({ booking, car, settings }) {
  const limit = settings?.overspeedLimitKph || 100;
  const t = useTelematics({ car, seed: booking.id || booking.ref, live: true, speedLimit: limit });

  const energyTone =
    t.energy < 15 ? 'text-rose-400' : t.energy < 30 ? 'text-amber-400' : 'text-emerald-400';

  return (
    <div className="space-y-4">
      {/* map — real Google Map when a key is set, schematic SVG otherwise */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-ink-950">
        <LiveMap
          position={{ lat: t.position.lat, lng: t.position.lng }}
          heading={t.heading}
          trail={t.trail}
          className="h-56 w-full sm:h-72"
          fallback={<SchematicMap t={t} />}
        />

        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
          <Badge tone="success" icon={Satellite}>
            GPS locked
          </Badge>
          <Badge tone="neutral">
            {t.position.lat?.toFixed(4)}° N, {t.position.lng?.toFixed(4)}° E
          </Badge>
        </div>
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-xl border border-white/10 bg-ink-950/85 px-3 py-2 backdrop-blur">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <Navigation2 size={10} /> Current position
          </p>
          <p className="mt-0.5 text-[13px] font-semibold text-white">{t.nearest}</p>
        </div>
        <div className="pointer-events-none absolute bottom-3 right-3 rounded-xl border border-white/10 bg-ink-950/85 px-3 py-2 text-right backdrop-blur">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Trip so far</p>
          <p className="mt-0.5 font-display text-[13px] font-bold text-white tabular-nums">
            {t.tripKm.toFixed(1)} km
          </p>
        </div>
      </div>

      {/* gauge + diagnostics */}
      <div className="grid gap-4 sm:grid-cols-[13rem_1fr]">
        <div className="panel p-4">
          <SpeedGauge speed={t.speed} limit={limit} />
          <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/[0.07] pt-3 text-center">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Peak</p>
              <p className="font-display text-[14px] font-bold text-white tabular-nums">
                {Math.round(t.maxSpeed)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Limit</p>
              <p className="font-display text-[14px] font-bold text-slate-300 tabular-nums">{limit}</p>
            </div>
          </div>
        </div>

        <div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Metric
              icon={t.isEv ? BatteryCharging : Fuel}
              label={t.isEv ? 'State of charge' : 'Fuel level'}
              value={`${Math.round(t.energy)}%`}
              sub={t.isEv ? `≈ ${Math.round((t.energy / 100) * (car?.mileage || 400))} km left` : undefined}
              tone={energyTone}
            />
            <Metric
              icon={Thermometer}
              label="Coolant"
              value={`${Math.round(t.coolant)}°C`}
              tone={t.coolant > 104 ? 'text-amber-400' : 'text-white'}
            />
            <Metric
              icon={t.isEv ? Zap : Activity}
              label={t.isEv ? 'Pack voltage' : 'Battery'}
              value={`${t.voltage.toFixed(1)} V`}
            />
            <Metric
              icon={Gauge}
              label="Odometer"
              value={Math.round(t.odometer).toLocaleString('en-IN')}
              sub="km total"
            />
            <Metric
              icon={CircleDot}
              label="Tyre pressure"
              value={`${t.tyres[0].toFixed(1)} psi`}
              sub={`RL ${t.tyres[2].toFixed(1)} · RR ${t.tyres[3].toFixed(1)}`}
              tone={t.tyres.some((v) => v < 29.5) ? 'text-amber-400' : 'text-white'}
            />
            <Metric
              icon={Activity}
              label="Engine health"
              value={t.engineHealth}
              tone={t.engineHealth === 'Optimal' ? 'text-emerald-400' : 'text-amber-400'}
            />
          </div>

          {/* speed history sparkline */}
          <div className="panel-tight mt-2 p-3">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Speed trace · last {t.samples.length} samples
            </p>
            <svg viewBox="0 0 200 34" className="h-9 w-full" preserveAspectRatio="none">
              <line
                x1="0"
                y1={34 - (limit / 160) * 34}
                x2="200"
                y2={34 - (limit / 160) * 34}
                stroke="#f43f5e"
                strokeWidth="0.6"
                strokeDasharray="3 3"
                opacity="0.6"
              />
              {t.samples.length > 1 && (
                <polyline
                  points={t.samples
                    .map((s, i) => `${(i / (t.samples.length - 1)) * 200},${34 - (Math.min(s, 160) / 160) * 32}`)
                    .join(' ')}
                  fill="none"
                  stroke="#2FAE6A"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              )}
            </svg>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <span className="chip">
              <Lock size={11} className="text-emerald-400" /> Doors {t.doorsLocked ? 'locked' : 'unlocked'}
            </span>
            <span className="chip">
              <Snowflake size={11} className="text-sky-400" /> Cabin {t.ac}°C
            </span>
            <span className="chip">
              <CircleDot size={11} className="text-emerald-400" /> Ignition {t.ignition ? 'on' : 'off'}
            </span>
          </div>
        </div>
      </div>

      {/* alerts */}
      <div className="panel p-4">
        <h4 className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-white">
          <TriangleAlert size={14} className="text-amber-400" />
          Vehicle alerts
        </h4>
        {t.alerts.length === 0 ? (
          <p className="text-[12.5px] text-slate-500">
            No alerts. Speed, temperature and tyre pressures are all within limits.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {t.alerts.map((a) => (
              <li
                key={a.id}
                className={cx(
                  'flex items-start gap-2.5 rounded-xl border px-3 py-2 text-[12px]',
                  a.level === 'critical'
                    ? 'border-rose-400/25 bg-rose-500/10 text-rose-200'
                    : 'border-amber-400/25 bg-amber-500/10 text-amber-200'
                )}
              >
                <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                <span className="flex-1">{a.text}</span>
                <span className="shrink-0 text-[10px] text-slate-500">
                  {new Date(a.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
