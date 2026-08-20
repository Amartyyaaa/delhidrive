// System settings & policy controls (module 4).

import { useEffect, useState } from 'react';
import { Save, RotateCcw, SlidersHorizontal, Database, HardDrive, FileDown } from 'lucide-react';
import { useStore } from '../../lib/store';
import { useNotify } from '../../lib/notify';
import { DEFAULT_SETTINGS } from '../../lib/pricing';
import { supabaseReady } from '../../lib/supabase';
import { featureAuditPdf } from '../../lib/pdf';
import { inr } from '../../lib/format';
import { Button, Field, Input, Badge, Checkbox } from '../ui';

const FIELDS = [
  {
    key: 'gstRate',
    label: 'GST rate (%)',
    hint: 'Applied to the net taxable value on every invoice.',
    step: '0.5',
  },
  {
    key: 'securityDeposit',
    label: 'Default security deposit (₹)',
    hint: 'Used when a vehicle has no deposit of its own.',
    step: '500',
  },
  {
    key: 'latePenaltyPerHour',
    label: 'Late return penalty (₹ / hour)',
    hint: 'Charged in full-hour blocks after a 29-minute grace period.',
    step: '50',
  },
  {
    key: 'weekendSurge',
    label: 'Weekend surge multiplier',
    hint: 'Applies to Friday, Saturday and Sunday pickups.',
    step: '0.05',
  },
  {
    key: 'festiveSurge',
    label: 'Festive surge multiplier',
    hint: 'Stacks on top of the weekend multiplier when enabled.',
    step: '0.05',
  },
  {
    key: 'cancellationWindowHours',
    label: 'Free cancellation window (hours)',
    hint: 'Full refund when cancelling at least this long before pickup.',
    step: '1',
  },
  {
    key: 'minRentalHours',
    label: 'Minimum rental duration (hours)',
    hint: 'Checkout blocks anything shorter than this.',
    step: '1',
  },
  {
    key: 'overspeedLimitKph',
    label: 'Over-speed alert threshold (kph)',
    hint: 'Telematics raises a critical alert above this speed.',
    step: '5',
  },
];

export default function SettingsPanel() {
  const { settings, saveSettings, fleet, bookings, activeCoupons, tickets } = useStore();
  const { push, toast } = useNotify();
  const [draft, setDraft] = useState(settings);
  const [busy, setBusy] = useState(false);

  useEffect(() => setDraft(settings), [settings]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  const save = async () => {
    setBusy(true);
    try {
      const numeric = Object.fromEntries(
        FIELDS.map((f) => [f.key, Number(draft[f.key])])
      );
      await saveSettings({ ...numeric, festiveEnabled: Boolean(draft.festiveEnabled) });
      push('Platform settings saved', 'New rates apply to every quote from now on.', { type: 'success' });
    } catch (err) {
      toast(err.message || 'Could not save settings.', { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const sample = 3000;
  const previewSurge =
    Number(draft.weekendSurge || 1) * (draft.festiveEnabled ? Number(draft.festiveSurge || 1) : 1);
  const previewBase = Math.round(sample * previewSurge);
  const previewGst = Math.round((previewBase * Number(draft.gstRate || 0)) / 100);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-[16px]">
            <SlidersHorizontal size={15} className="text-brand-300" />
            System settings & policy controls
          </h3>
          <p className="mt-0.5 text-[12.5px] text-slate-400">
            These values feed the pricing engine, the invoices and the telematics thresholds.
          </p>
        </div>
        <Badge tone={supabaseReady ? 'success' : 'neutral'} icon={supabaseReady ? Database : HardDrive}>
          {supabaseReady ? 'Saving to Supabase' : 'Saving to local store'}
        </Badge>
      </div>

      <div className="panel p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FIELDS.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint}>
              <Input
                type="number"
                step={f.step}
                value={draft[f.key] ?? ''}
                onChange={(e) => setDraft((s) => ({ ...s, [f.key]: e.target.value }))}
              />
            </Field>
          ))}
        </div>

        <div className="mt-4 border-t border-white/[0.07] pt-4">
          <Checkbox
            checked={Boolean(draft.festiveEnabled)}
            onChange={(v) => setDraft((s) => ({ ...s, festiveEnabled: v }))}
            label="Enable festive surge — stacks on top of the weekend multiplier for the whole fleet"
          />
        </div>

        <div className="mt-4 rounded-xl border border-brand-400/25 bg-brand-500/10 px-4 py-3.5">
          <p className="text-[12px] font-semibold text-brand-200">Live pricing preview</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-slate-300">
            A {inr(sample)}/day car booked for a Saturday pickup bills{' '}
            <strong className="text-white">{inr(previewBase)}</strong> before add-ons (surge ×
            {previewSurge.toFixed(2)}), plus <strong className="text-white">{inr(previewGst)}</strong> GST, plus a{' '}
            <strong className="text-white">{inr(draft.securityDeposit)}</strong> refundable deposit. Late return
            costs <strong className="text-white">{inr(draft.latePenaltyPerHour)}</strong> per hour.
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button icon={Save} onClick={save} loading={busy} disabled={!dirty || busy}>
            {dirty ? 'Save settings' : 'Saved'}
          </Button>
          <Button variant="secondary" icon={RotateCcw} onClick={() => setDraft(DEFAULT_SETTINGS)}>
            Restore defaults
          </Button>
          <Button
            variant="ghost"
            icon={FileDown}
            onClick={() =>
              featureAuditPdf({
                fleetCount: fleet.length,
                bookingCount: bookings.length,
                couponCount: activeCoupons.length,
                openTickets: tickets.filter((t) => t.status !== 'Resolved').length,
                backend: supabaseReady ? 'Supabase Postgres' : 'Local browser store',
              })
            }
          >
            Export feature audit PDF
          </Button>
        </div>
      </div>

      <div className="panel p-5">
        <h4 className="text-[14.5px]">Data backend</h4>
        {supabaseReady ? (
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-400">
            Connected to Supabase Postgres. Bookings, fleet, coupons, tickets, KYC and these settings are all
            persisted server-side behind row-level security, and stream live to every signed-in device.
          </p>
        ) : (
          <div className="mt-1.5 space-y-2 text-[12.5px] leading-relaxed text-slate-400">
            <p>
              Supabase is not configured, so everything is persisting to this browser's local storage. The app
              is fully functional — it just is not shared across devices.
            </p>
            <p>
              To switch it on: copy{' '}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-brand-200">.env.example</code> to{' '}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-brand-200">.env</code> and paste your
              project URL and anon key, run{' '}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-brand-200">supabase-setup.sql</code> in
              the Supabase SQL Editor, then restart the dev server. The seed fleet writes itself on first
              connect.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
