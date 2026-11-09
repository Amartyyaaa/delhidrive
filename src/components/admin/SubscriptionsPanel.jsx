// Subscription pricing — set the monthly fee of each car for each tenure by
// hand, the extra cost of each km pack, and correct the amount on a customer's
// subscription. Blank fields fall back to the automatic price, worked out
// from the car's daily rate.

import { useEffect, useMemo, useState } from 'react';
import { Save, RotateCcw, Repeat, Pencil, Check, X, Search } from 'lucide-react';
import { useStore } from '../../lib/store';
import { useAuth } from '../../lib/auth';
import { useNotify } from '../../lib/notify';
import { TENURES, KM_PACKS, formulaMonthly, packSurcharge } from '../../lib/subscription';
import { inr, fmtDateTime, cx } from '../../lib/format';
import { Button, Badge, Empty, Field, Input } from '../ui';

const priceDraft = (car) =>
  Object.fromEntries(TENURES.map((t) => [t.months, car.subPrices?.[t.months] ? String(car.subPrices[t.months]) : '']));

export default function SubscriptionsPanel() {
  const { fleet, settings, saveCar, saveSettings, subscriptions, patchSubscription } = useStore();
  const { user } = useAuth();
  const { push, toast } = useNotify();
  const [drafts, setDrafts] = useState({});
  const [packs, setPacks] = useState({});
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingSub, setEditingSub] = useState(null);
  const [subAmount, setSubAmount] = useState('');

  // Start each car's row from its saved prices, without wiping a row being edited
  // when the fleet updates underneath.
  useEffect(() => {
    setDrafts((all) => ({
      ...Object.fromEntries(fleet.map((c) => [c.id, priceDraft(c)])),
      ...Object.fromEntries(Object.entries(all).filter(([id]) => fleet.some((c) => c.id === id))),
    }));
  }, [fleet]);

  useEffect(() => {
    setPacks(Object.fromEntries(KM_PACKS.slice(1).map((p) => [p.id, String(packSurcharge(p, settings))])));
  }, [settings]);

  const changedCars = useMemo(
    () =>
      fleet.filter((c) => {
        const d = drafts[c.id];
        return d && TENURES.some((t) => (d[t.months] || '') !== (priceDraft(c)[t.months] || ''));
      }),
    [fleet, drafts]
  );

  const packsChanged = KM_PACKS.slice(1).some((p) => String(packSurcharge(p, settings)) !== (packs[p.id] ?? ''));

  const savePrices = async () => {
    const bad = changedCars.find((c) => TENURES.some((t) => drafts[c.id][t.months] && !(Number(drafts[c.id][t.months]) > 0)));
    if (bad) {
      toast(`Check the prices for ${bad.name} — use whole rupees, or leave blank for automatic.`, { type: 'warning' });
      return;
    }
    setBusy(true);
    try {
      await Promise.all(
        changedCars.map((c) => {
          const d = drafts[c.id];
          const subPrices = Object.fromEntries(
            TENURES.filter((t) => Number(d[t.months]) > 0).map((t) => [t.months, Math.round(Number(d[t.months]))])
          );
          return saveCar({ id: c.id, subPrices });
        })
      );
      push('Subscription prices saved', `${changedCars.length} car(s) updated. The Subscribe page shows them now.`, {
        type: 'success',
      });
    } catch (err) {
      toast(err.message || 'Could not save the prices.', { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const savePacks = async () => {
    const parsed = Object.fromEntries(Object.entries(packs).map(([k, v]) => [k, Number(v)]));
    if (Object.values(parsed).some((v) => Number.isNaN(v) || v < 0)) {
      toast('Km pack surcharges must be 0 or more.', { type: 'warning' });
      return;
    }
    try {
      await saveSettings({ subPackSurcharge: parsed });
      push('Km pack prices saved', 'Every subscription quote uses the new surcharges.', { type: 'success' });
    } catch (err) {
      toast(err.message || 'Could not save the km packs.', { type: 'error' });
    }
  };

  const saveSubAmount = async (sub) => {
    const monthly = Math.round(Number(subAmount));
    if (!(monthly > 0)) {
      toast('Enter the monthly fee before GST, in rupees.', { type: 'warning' });
      return;
    }
    const gstRate = Number(sub.gstRate ?? settings.gstRate ?? 18);
    const gst = Math.round((monthly * gstRate) / 100);
    try {
      await patchSubscription(sub.id, {
        monthly,
        gst,
        gstRate,
        monthlyWithGst: monthly + gst,
        amountEditedAt: Date.now(),
        amountEditedBy: user?.email || user?.name || 'console',
      });
      push('Subscription amount updated', `${sub.ref || sub.customerName}: ${inr(monthly + gst)}/month incl. GST.`, {
        type: 'success',
      });
      setEditingSub(null);
    } catch (err) {
      toast(err.message || 'Could not update this subscription.', { type: 'error' });
    }
  };

  const visibleCars = fleet.filter((c) =>
    `${c.name} ${c.brand} ${c.plate}`.toLowerCase().includes(q.trim().toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-[16px]">
            <Repeat size={15} className="text-brand-300" />
            Subscription pricing
          </h3>
          <p className="mt-0.5 text-[12.5px] text-slate-400">
            Monthly fee before GST on the 1,200 km pack. Leave a box blank for the automatic price shown in grey.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cars" className="w-44 pl-9" />
          </div>
          <Button icon={Save} onClick={savePrices} loading={busy} disabled={busy || !changedCars.length}>
            {changedCars.length ? `Save ${changedCars.length} car(s)` : 'Saved'}
          </Button>
        </div>
      </div>

      <div className="panel overflow-x-auto p-0">
        <table className="w-full min-w-[40rem] text-left text-[12.5px]">
          <thead>
            <tr className="border-b border-white/[0.07] text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-semibold">Car</th>
              {TENURES.map((t) => (
                <th key={t.months} className="px-2 py-3 font-semibold">
                  {t.label}
                </th>
              ))}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {visibleCars.map((c) => {
              const d = drafts[c.id] || {};
              const custom = TENURES.some((t) => c.subPrices?.[t.months]);
              return (
                <tr key={c.id} className="border-b border-white/[0.05] last:border-0">
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-white">{c.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {inr(c.rate)}/day · {c.seats} seats {custom && <Badge tone="brand">Custom</Badge>}
                    </p>
                  </td>
                  {TENURES.map((t) => (
                    <td key={t.months} className="px-2 py-2.5">
                      <Input
                        type="number"
                        min="0"
                        step="100"
                        value={d[t.months] ?? ''}
                        placeholder={String(formulaMonthly(c, t.months))}
                        onChange={(e) =>
                          setDrafts((all) => ({ ...all, [c.id]: { ...all[c.id], [t.months]: e.target.value } }))
                        }
                        className={cx('w-28', d[t.months] && 'border-brand-400/40')}
                      />
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right">
                    {TENURES.some((t) => d[t.months]) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={RotateCcw}
                        onClick={() =>
                          setDrafts((all) => ({
                            ...all,
                            [c.id]: Object.fromEntries(TENURES.map((t) => [t.months, ''])),
                          }))
                        }
                      >
                        Automatic
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="panel p-5">
        <h4 className="text-[14.5px]">Km packs</h4>
        <p className="mt-0.5 text-[12.5px] text-slate-400">
          How much more each pack costs than the 1,200 km pack, as a percentage of the monthly fee.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {KM_PACKS.slice(1).map((p) => (
            <Field key={p.id} label={`${p.label} (+%)`}>
              <Input
                type="number"
                min="0"
                step="1"
                value={packs[p.id] ?? ''}
                onChange={(e) => setPacks((all) => ({ ...all, [p.id]: e.target.value }))}
              />
            </Field>
          ))}
        </div>
        <Button className="mt-4" icon={Save} onClick={savePacks} disabled={!packsChanged}>
          {packsChanged ? 'Save km packs' : 'Saved'}
        </Button>
      </div>

      <div className="panel p-5">
        <h4 className="text-[14.5px]">Customer subscriptions</h4>
        <p className="mt-0.5 text-[12.5px] text-slate-400">
          Change the monthly amount on a running subscription, for example after agreeing a discount.
        </p>
        {subscriptions.length === 0 ? (
          <div className="mt-4">
            <Empty
              icon={Repeat}
              title="No subscriptions yet"
              body="Subscriptions customers take in the DelhiDrive app appear here."
            />
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {subscriptions.map((sub) => (
              <div key={sub.id} className="panel-tight flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-white">
                    {sub.carName || 'Subscription'}{' '}
                    <span className="font-mono text-[11px] font-normal text-slate-500">{sub.ref}</span>
                  </p>
                  <p className="text-[11.5px] text-slate-500">
                    {sub.customerName} · {sub.customerPhone} · {sub.months ? `${sub.months} months` : '—'}
                    {sub.amountEditedAt && ` · amount changed ${fmtDateTime(sub.amountEditedAt)}`}
                  </p>
                </div>
                {editingSub === sub.id ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      min="0"
                      value={subAmount}
                      onChange={(e) => setSubAmount(e.target.value)}
                      placeholder="Monthly before GST"
                      className="w-40"
                      autoFocus
                    />
                    <Button size="sm" icon={Check} onClick={() => saveSubAmount(sub)}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" icon={X} onClick={() => setEditingSub(null)} aria-label="Cancel" />
                  </div>
                ) : (
                  <>
                    <p className="text-right">
                      <span className="block font-display text-[15px] font-bold text-white tabular-nums">
                        {inr(sub.monthlyWithGst)}
                      </span>
                      <span className="text-[10.5px] text-slate-500">per month incl. GST</span>
                    </p>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={Pencil}
                      onClick={() => {
                        const gstRate = Number(sub.gstRate ?? settings.gstRate ?? 18);
                        const before = sub.monthly || Math.round((Number(sub.monthlyWithGst) || 0) / (1 + gstRate / 100));
                        setSubAmount(before ? String(before) : '');
                        setEditingSub(sub.id);
                      }}
                    >
                      Edit amount
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
