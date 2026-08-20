// Fleet inventory manager (module 4).

import { useState } from 'react';
import { Plus, Pencil, Trash2, Wrench, CheckCircle2, Search, ImagePlus } from 'lucide-react';
import { useStore } from '../../lib/store';
import { useNotify } from '../../lib/notify';
import { uploadFile } from '../../lib/db';
import { CATEGORIES, TRANSMISSIONS, FUELS, TERRAINS } from '../../data/fleet';
import { LOCATIONS } from '../../lib/pricing';
import { inr, cx } from '../../lib/format';
import { Button, Badge, Modal, Field, Input, Select, Textarea, Checkbox, Empty } from '../ui';
import CarArt from '../CarArt';

const BLANK = {
  name: '',
  brand: '',
  category: 'Hatchback',
  transmission: 'Manual',
  fuel: 'Petrol',
  seats: 5,
  mileage: 18,
  rate: 1500,
  engineCc: 1200,
  bootLitres: 300,
  deposit: 3000,
  plate: '',
  hub: 'cp',
  colorHex: '#128A4B',
  terrain: ['City'],
  zeroDep: true,
  available: true,
  status: 'active',
  rating: 4.5,
  reviewCount: 0,
  features: [],
  reviews: [],
  photo: '',
};

export default function InventoryManager() {
  const { fleet, saveCar, removeCar, bookings } = useStore();
  const { toast, push } = useNotify();
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  const filtered = fleet.filter((c) =>
    `${c.name} ${c.brand} ${c.plate} ${c.category}`.toLowerCase().includes(q.toLowerCase())
  );

  const openNew = () => setEditing({ ...BLANK, featuresText: '' });
  const openEdit = (car) =>
    setEditing({ ...car, featuresText: (car.features || []).join('\n') });

  const save = async () => {
    if (!editing.name.trim() || !editing.brand.trim()) {
      toast('Model name and brand are required.', { type: 'warning' });
      return;
    }
    setBusy(true);
    try {
      const { featuresText, ...rest } = editing;
      const payload = {
        ...rest,
        seats: Number(rest.seats),
        mileage: Number(rest.mileage),
        rate: Number(rest.rate),
        engineCc: Number(rest.engineCc),
        bootLitres: Number(rest.bootLitres),
        deposit: Number(rest.deposit),
        rating: Number(rest.rating),
        reviewCount: Number(rest.reviewCount),
        features: String(featuresText || '')
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      };
      await saveCar(payload);
      push(
        editing.id ? 'Vehicle updated' : 'Vehicle added to fleet',
        `${payload.name} · ${inr(payload.rate)}/day · ${payload.plate || 'no plate yet'}`,
        { type: 'success' }
      );
      setEditing(null);
    } catch (err) {
      toast(err.message || 'Could not save the vehicle.', { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async (car, patch) => {
    try {
      await saveCar({ ...car, ...patch });
    } catch (err) {
      toast(err.message || 'Update failed.', { type: 'error' });
    }
  };

  const doDelete = async () => {
    try {
      await removeCar(confirmDelete.id);
      toast(`${confirmDelete.name} removed from the fleet.`, { type: 'success' });
      setConfirmDelete(null);
    } catch (err) {
      toast(err.message || 'Could not remove the vehicle.', { type: 'error' });
    }
  };

  const pickPhoto = async (file) => {
    try {
      const url = await uploadFile(`fleet/${Date.now()}-${file.name}`, file);
      setEditing((e) => ({ ...e, photo: url }));
    } catch {
      toast('Photo upload failed.', { type: 'error' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[16px]">Fleet inventory</h3>
          <p className="mt-0.5 text-[12.5px] text-slate-400">
            {fleet.length} vehicles · {fleet.filter((c) => c.status === 'maintenance').length} in maintenance
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search fleet" className="w-48 pl-9" />
          </div>
          <Button icon={Plus} onClick={openNew}>
            Add car
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty title="No vehicles match" body="Try a different search, or add a new car to the fleet." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((car) => {
            const liveBookings = bookings.filter(
              (b) => b.carId === car.id && b.status !== 'Cancelled'
            ).length;
            return (
              <div key={car.id} className="panel overflow-hidden">
                <div className="relative aspect-[16/9]">
                  <CarArt car={car} showPlate />
                  <div className="absolute left-2.5 top-2.5 flex gap-1.5">
                    <Badge tone="brand">{car.category}</Badge>
                    {car.status === 'maintenance' ? (
                      <Badge tone="warning" icon={Wrench}>
                        Maintenance
                      </Badge>
                    ) : car.available === false ? (
                      <Badge tone="danger">Off fleet</Badge>
                    ) : (
                      <Badge tone="success" icon={CheckCircle2}>
                        Active
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="truncate text-[14px] leading-tight">{car.name}</h4>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        {car.plate} · {car.transmission} · {car.fuel}
                      </p>
                    </div>
                    <p className="shrink-0 font-display text-[15px] font-bold text-white">{inr(car.rate)}</p>
                  </div>

                  <p className="mt-2 text-[11px] text-slate-500">
                    {liveBookings} booking{liveBookings !== 1 ? 's' : ''} on record · deposit{' '}
                    {inr(car.deposit)}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Button size="sm" variant="secondary" icon={Pencil} onClick={() => openEdit(car)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Wrench}
                      onClick={() =>
                        toggleStatus(car, {
                          status: car.status === 'maintenance' ? 'active' : 'maintenance',
                        })
                      }
                    >
                      {car.status === 'maintenance' ? 'Back in service' : 'Maintenance'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleStatus(car, { available: car.available === false })}
                    >
                      {car.available === false ? 'Enable' : 'Disable'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Trash2}
                      className="text-rose-300 hover:bg-rose-500/10"
                      onClick={() => setConfirmDelete(car)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* editor */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        size="lg"
        title={editing?.id ? `Edit ${editing.name}` : 'Add a vehicle'}
        subtitle="These values drive the catalogue card, the detail modal and every quote."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} loading={busy} disabled={busy}>
              {editing?.id ? 'Save changes' : 'Add to fleet'}
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="h-28 w-44 shrink-0 overflow-hidden rounded-xl border border-white/10">
                <CarArt car={editing} />
              </div>
              <div className="flex-1 space-y-2">
                <Field label="Photo URL (optional)" hint="Leave blank to use the generated illustration.">
                  <Input
                    value={editing.photo || ''}
                    onChange={(e) => setEditing((s) => ({ ...s, photo: e.target.value }))}
                    placeholder="https://…"
                  />
                </Field>
                <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] text-slate-400 transition hover:text-brand-300">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && pickPhoto(e.target.files[0])}
                  />
                  <ImagePlus size={14} /> Upload a photo instead
                </label>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Model name">
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing((s) => ({ ...s, name: e.target.value }))}
                  placeholder="Hyundai Creta SX"
                />
              </Field>
              <Field label="Brand">
                <Input
                  value={editing.brand}
                  onChange={(e) => setEditing((s) => ({ ...s, brand: e.target.value }))}
                  placeholder="Hyundai"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Category">
                <Select
                  value={editing.category}
                  onChange={(e) => setEditing((s) => ({ ...s, category: e.target.value }))}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Transmission">
                <Select
                  value={editing.transmission}
                  onChange={(e) => setEditing((s) => ({ ...s, transmission: e.target.value }))}
                >
                  {TRANSMISSIONS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Fuel">
                <Select value={editing.fuel} onChange={(e) => setEditing((s) => ({ ...s, fuel: e.target.value }))}>
                  {FUELS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              {[
                ['Daily rate (₹)', 'rate'],
                ['Deposit (₹)', 'deposit'],
                ['Seats', 'seats'],
                [editing.fuel === 'EV' ? 'Range (km)' : 'Mileage (kmpl)', 'mileage'],
                ['Engine (cc)', 'engineCc'],
                ['Boot (litres)', 'bootLitres'],
                ['Rating', 'rating'],
                ['Review count', 'reviewCount'],
              ].map(([label, key]) => (
                <Field key={key} label={label}>
                  <Input
                    type="number"
                    step={key === 'rating' || key === 'mileage' ? '0.1' : '1'}
                    value={editing[key]}
                    onChange={(e) => setEditing((s) => ({ ...s, [key]: e.target.value }))}
                  />
                </Field>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Registration plate">
                <Input
                  value={editing.plate}
                  onChange={(e) => setEditing((s) => ({ ...s, plate: e.target.value.toUpperCase() }))}
                  placeholder="DL 3C AB 1204"
                />
              </Field>
              <Field label="Home hub">
                <Select value={editing.hub} onChange={(e) => setEditing((s) => ({ ...s, hub: e.target.value }))}>
                  {LOCATIONS.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Paint colour">
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={editing.colorHex}
                    onChange={(e) => setEditing((s) => ({ ...s, colorHex: e.target.value }))}
                    className="h-10 w-14 shrink-0 cursor-pointer rounded-xl border border-white/10 bg-ink-950 p-1"
                  />
                  <Input
                    value={editing.colorHex}
                    onChange={(e) => setEditing((s) => ({ ...s, colorHex: e.target.value }))}
                  />
                </div>
              </Field>
            </div>

            <Field label="Key features" hint="One per line — these appear in the vehicle detail modal.">
              <Textarea
                rows={4}
                value={editing.featuresText}
                onChange={(e) => setEditing((s) => ({ ...s, featuresText: e.target.value }))}
                placeholder={'Panoramic sunroof\nVentilated seats\n360° camera'}
              />
            </Field>

            <div>
              <p className="label">Suited terrain</p>
              <div className="flex flex-wrap gap-1.5">
                {TERRAINS.map((t) => {
                  const on = (editing.terrain || []).includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() =>
                        setEditing((s) => ({
                          ...s,
                          terrain: on
                            ? s.terrain.filter((x) => x !== t)
                            : [...(s.terrain || []), t],
                        }))
                      }
                      className={cx(
                        'rounded-full border px-3 py-1.5 text-[12px] font-medium transition',
                        on
                          ? 'border-brand-400/50 bg-brand-500/20 text-brand-100'
                          : 'border-white/10 text-slate-400 hover:text-white'
                      )}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <Checkbox
                checked={editing.zeroDep}
                onChange={(v) => setEditing((s) => ({ ...s, zeroDep: v }))}
                label="Zero-depreciation cover included"
              />
              <Checkbox
                checked={editing.available !== false}
                onChange={(v) => setEditing((s) => ({ ...s, available: v }))}
                label="Available for booking"
              />
              <Checkbox
                checked={editing.status === 'maintenance'}
                onChange={(v) => setEditing((s) => ({ ...s, status: v ? 'maintenance' : 'active' }))}
                label="Currently in maintenance"
              />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        size="sm"
        title="Remove this vehicle?"
        subtitle={confirmDelete?.name}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmDelete(null)}>
              Keep it
            </Button>
            <Button variant="danger" className="flex-1" onClick={doDelete}>
              Delete permanently
            </Button>
          </div>
        }
      >
        <p className="text-[13px] leading-relaxed text-slate-400">
          {confirmDelete?.name} will be removed from the catalogue. Existing bookings keep their record, but the
          car can no longer be reserved. To take it off the road temporarily, use{' '}
          <strong className="text-white">Maintenance</strong> instead.
        </p>
      </Modal>
    </div>
  );
}
