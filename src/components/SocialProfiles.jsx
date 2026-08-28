// Social profile capture — gives operations a real, traceable identity to
// check against the name on the licence.

import { Instagram, Facebook, Linkedin, Check, Link2 } from 'lucide-react';
import { SOCIAL_PLATFORMS, MIN_SOCIAL_PROFILES, normaliseSocial } from '../lib/verification';
import { cx } from '../lib/format';
import { Input, Badge } from './ui';

const ICONS = { Instagram, Facebook, Linkedin };

export default function SocialProfiles({ value = {}, onChange }) {
  const results = SOCIAL_PLATFORMS.map((p) => ({
    platform: p,
    raw: value[p.id] || '',
    result: normaliseSocial(p.id, value[p.id]),
  }));
  const valid = results.filter((r) => r.result.ok).length;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] text-slate-400">
          Add at least {MIN_SOCIAL_PROFILES} profile so we can confirm you are a real person.
        </p>
        <Badge tone={valid >= MIN_SOCIAL_PROFILES ? 'success' : 'neutral'}>
          {valid} of {MIN_SOCIAL_PROFILES} required
        </Badge>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-3">
        {results.map(({ platform, raw, result }) => {
          const Icon = ICONS[platform.icon] || Link2;
          const good = result.ok;
          const bad = Boolean(raw.trim()) && !good && result.reason;
          return (
            <div key={platform.id}>
              <div
                className={cx(
                  'flex items-center gap-2 rounded-xl border px-3 transition',
                  good
                    ? 'border-emerald-400/35 bg-emerald-500/[0.07]'
                    : bad
                      ? 'border-rose-400/35 bg-rose-500/[0.07]'
                      : 'border-white/10 bg-ink-950/60'
                )}
              >
                <Icon size={15} style={{ color: good ? undefined : platform.color }} className={good ? 'text-emerald-400' : ''} />
                <input
                  value={raw}
                  onChange={(e) => onChange({ ...value, [platform.id]: e.target.value })}
                  placeholder={platform.placeholder}
                  className="w-full bg-transparent py-2.5 text-[12.5px] text-white placeholder:text-slate-600 focus:outline-none"
                />
                {good && <Check size={14} className="shrink-0 text-emerald-400" />}
              </div>
              {bad && <p className="mt-1 text-[11px] text-rose-300">{result.reason}</p>}
              {good && (
                <p className="mt-1 truncate text-[11px] text-emerald-400/80">{result.url}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
