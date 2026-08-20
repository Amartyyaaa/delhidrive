// Promotions & coupon creator (module 4).

import { useState } from 'react';
import { Plus, Pencil, Trash2, Tag, Percent, IndianRupee, CalendarRange, Power } from 'lucide-react';
import { useStore } from '../../lib/store';
import { useNotify } from '../../lib/notify';
import { inr, fmtDate, cx } from '../../lib/format';
import { Button, Badge, Modal, Field, Input, Select, Textarea, Checkbox, Empty } from '../ui';

const BLANK = {
  code: '',
  label: '',
  type: 'percent',
  value: 10,
  minOrder: 1500,
  maxDiscount: 1000,
  validFrom: '',
  validTo: '',
  active: true,
  description: '',
};

export default function CouponCreator() {
  const { coupons, saveCoupon, removeCoupon, bookings } = useStore();
  const { push, toast } = useNotify();
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const usage = (code) =>
    bookings.filter((b) => String(b.couponCode).toUpperCase() === String(code).toUpperCase()).length;

  const save = async () => {
    const code = editing.code.trim().toUpperCase();
    if (!code) {
      toast('A promo code is required.', { type: 'warning' });
      return;
    }
    if (!Number(editing.value)) {
      toast('Set a discount value greater than zero.', { type: 'warning' });
      return;
    }
    const clash = coupons.find((c) => c.code === code && c.id !== editing.id);
    if (clash) {
      toast(`${code} already exists.`, { type: 'error' });
      return;
    }
    setBusy(true);
    try {
      await saveCoupon({
        ...editing,
        code,
        value: Number(editing.value),
        minOrder: Number(editing.minOrder) || 0,
        maxDiscount: Number(editing.maxDiscount) || 0,
      });
      push(
        editing.id ? 'Promo updated' : 'Promo code created',
        `${code} — ${editing.type === 'percent' ? `${editing.value}% off` : `${inr(editing.value)} off`}`,
        { type: 'success' }
      );
      setEditing(null);
    } catch (err) {
      toast(err.message || 'Could not save the promo code.', { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[16px]">Promotions & coupons</h3>
          <p className="mt-0.5 text-[12.5px] text-slate-400">
            {coupons.filter((c) => c.active !== false).length} active of {coupons.length} codes. Changes apply
            to checkout immediately.
          </p>
        </div>
        <Button icon={Plus} onClick={() => setEditing({ ...BLANK })}>
          New promo code
        </Button>
      </div>

      {coupons.length === 0 ? (
        <Empty icon={Tag} title="No promo codes yet" body="Create one and it becomes usable at checkout right away." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {coupons.map((c) => {
            const used = usage(c.code);
            const expired = c.validTo && Date.now() > new Date(c.validTo).getTime() + 86399000;
            return (
              <div
                key={c.id}
                className={cx('panel p-4', c.active === false && 'opacity-60')}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-display text-[17px] font-extrabold tracking-tight text-white">
                      {c.code}
                    </p>
                    <p className="truncate text-[12px] text-slate-500">{c.label || '—'}</p>
                  </div>
                  <Badge tone={c.active === false ? 'neutral' : expired ? 'warning' : 'success'}>
                    {c.active === false ? 'Paused' : expired ? 'Expired' : 'Live'}
                  </Badge>
                </div>

                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="font-display text-2xl font-bold text-brand-300">
                    {c.type === 'percent' ? `${c.value}%` : inr(c.value)}
                  </span>
                  <span className="text-[12px] text-slate-500">off</span>
                </div>

                <dl className="mt-2.5 space-y-1 text-[11.5px]">
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Minimum cart</dt>
                    <dd className="text-slate-300">{c.minOrder ? inr(c.minOrder) : 'None'}</dd>
                  </div>
                  {c.type === 'percent' && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Capped at</dt>
                      <dd className="text-slate-300">{c.maxDiscount ? inr(c.maxDiscount) : 'Uncapped'}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Validity</dt>
                    <dd className="text-slate-300">
                      {c.validFrom || c.validTo
                        ? `${c.validFrom ? fmtDate(c.validFrom) : 'now'} → ${
                            c.validTo ? fmtDate(c.validTo) : 'open'
                          }`
                        : 'Always'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Redemptions</dt>
                    <dd className="font-semibold text-white">{used}</dd>
                  </div>
                </dl>

                <div className="mt-3.5 flex flex-wrap gap-1.5 border-t border-white/[0.07] pt-3.5">
                  <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setEditing(c)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Power}
                    onClick={() => saveCoupon({ ...c, active: c.active === false })}
                  >
                    {c.active === false ? 'Activate' : 'Pause'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Trash2}
                    className="text-rose-300 hover:bg-rose-500/10"
                    onClick={() => removeCoupon(c.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        size="md"
        title={editing?.id ? `Edit ${editing.code}` : 'Create a promo code'}
        subtitle="Validated live against the customer's cart at checkout."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} loading={busy} disabled={busy}>
              {editing?.id ? 'Save changes' : 'Create code'}
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Promo code" hint="Uppercase, no spaces.">
                <Input
                  value={editing.code}
                  onChange={(e) =>
                    setEditing((s) => ({ ...s, code: e.target.value.toUpperCase().replace(/\s/g, '') }))
                  }
                  placeholder="MONSOON25"
                />
              </Field>
              <Field label="Display name">
                <Input
                  value={editing.label}
                  onChange={(e) => setEditing((s) => ({ ...s, label: e.target.value }))}
                  placeholder="Monsoon getaway"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Discount type">
                <Select
                  value={editing.type}
                  onChange={(e) => setEditing((s) => ({ ...s, type: e.target.value }))}
                >
                  <option value="percent">Percentage off</option>
                  <option value="flat">Flat amount off</option>
                </Select>
              </Field>
              <Field label={editing.type === 'percent' ? 'Percentage (%)' : 'Amount (₹)'}>
                <div className="relative">
                  {editing.type === 'percent' ? (
                    <Percent size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  ) : (
                    <IndianRupee size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  )}
                  <Input
                    type="number"
                    value={editing.value}
                    onChange={(e) => setEditing((s) => ({ ...s, value: e.target.value }))}
                    className="pl-9"
                  />
                </div>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Minimum cart value (₹)">
                <Input
                  type="number"
                  value={editing.minOrder}
                  onChange={(e) => setEditing((s) => ({ ...s, minOrder: e.target.value }))}
                />
              </Field>
              <Field
                label="Maximum discount (₹)"
                hint={editing.type === 'flat' ? 'Ignored for flat discounts.' : '0 = uncapped'}
              >
                <Input
                  type="number"
                  value={editing.maxDiscount}
                  onChange={(e) => setEditing((s) => ({ ...s, maxDiscount: e.target.value }))}
                  disabled={editing.type === 'flat'}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Valid from" hint="Leave blank to start immediately.">
                <Input
                  type="date"
                  value={editing.validFrom || ''}
                  onChange={(e) => setEditing((s) => ({ ...s, validFrom: e.target.value }))}
                />
              </Field>
              <Field label="Valid until" hint="Leave blank for no expiry.">
                <Input
                  type="date"
                  value={editing.validTo || ''}
                  onChange={(e) => setEditing((s) => ({ ...s, validTo: e.target.value }))}
                />
              </Field>
            </div>

            <Field label="Description" hint="Shown as a tooltip on the checkout chip.">
              <Textarea
                rows={2}
                value={editing.description}
                onChange={(e) => setEditing((s) => ({ ...s, description: e.target.value }))}
                placeholder="25% off all monsoon-season rentals, capped at ₹1,500."
              />
            </Field>

            <Checkbox
              checked={editing.active !== false}
              onChange={(v) => setEditing((s) => ({ ...s, active: v }))}
              label="Active — customers can redeem this code right now"
            />

            <div className="rounded-xl border border-brand-400/25 bg-brand-500/10 px-4 py-3">
              <p className="flex items-center gap-2 text-[12px] font-semibold text-brand-200">
                <CalendarRange size={13} /> Preview
              </p>
              <p className="mt-1 text-[12.5px] text-slate-300">
                On a {inr(8000)} cart, <strong className="text-white">{editing.code || 'CODE'}</strong> saves{' '}
                <strong className="text-emerald-300">
                  {Number(editing.minOrder) > 8000
                    ? '₹0 (minimum not met)'
                    : inr(
                        editing.type === 'percent'
                          ? Math.min(
                              (8000 * Number(editing.value)) / 100,
                              Number(editing.maxDiscount) || Infinity
                            )
                          : Number(editing.value)
                      )}
                </strong>
                .
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
