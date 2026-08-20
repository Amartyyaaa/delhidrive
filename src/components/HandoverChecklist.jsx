// Digital handover checklist — pre-pickup and post-return damage inspection
// with photo upload and odometer verification (module 3).

import { useState } from 'react';
import { Camera, Trash2, FileDown, Check, X, ClipboardCheck, Gauge } from 'lucide-react';
import { uploadFile } from '../lib/db';
import { useNotify } from '../lib/notify';
import { useAuth } from '../lib/auth';
import { handoverReportPdf } from '../lib/pdf';
import { fmtDateTime, cx } from '../lib/format';
import { Button, Badge, Field, Input, Textarea, Slider } from './ui';

const CHECKLIST_ITEMS = [
  'Front bumper and grille free of damage',
  'Rear bumper and boot lid intact',
  'All four alloy wheels unscratched',
  'Windscreen and windows crack-free',
  'Headlamps and tail lamps working',
  'Interior clean, no stains or tears',
  'Spare wheel, jack and toolkit present',
  'Documents folder and FASTag in glovebox',
];

export default function HandoverChecklist({ booking, car, phase, onSave }) {
  const { toast, push } = useNotify();
  const { user } = useAuth();
  const existing = booking.inspections?.[phase];

  const [checklist, setChecklist] = useState(
    existing?.checklist || CHECKLIST_ITEMS.map((label) => ({ label, ok: true }))
  );
  const [odometer, setOdometer] = useState(existing?.odometer || '');
  const [fuelLevel, setFuelLevel] = useState(existing?.fuelLevel ?? 100);
  const [notes, setNotes] = useState(existing?.notes || '');
  const [photos, setPhotos] = useState(existing?.photos || []);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const locked = Boolean(existing);
  const issues = checklist.filter((c) => !c.ok).length;

  const addPhotos = async (files) => {
    const list = Array.from(files).slice(0, 6 - photos.length);
    if (!list.length) return;
    setUploading(true);
    try {
      const urls = await Promise.all(
        list.map((f) =>
          uploadFile(`inspections/${user.uid}/${booking.id}/${phase}-${Date.now()}-${f.name}`, f)
        )
      );
      setPhotos((p) => [...p, ...urls]);
    } catch (err) {
      toast('Could not attach that photo. Try a smaller image.', { type: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!odometer) {
      toast('Enter the odometer reading to file this inspection.', { type: 'warning' });
      return;
    }
    setBusy(true);
    try {
      const record = {
        checklist,
        odometer: Number(odometer),
        fuelLevel: Number(fuelLevel),
        notes: notes.trim(),
        photos,
        at: Date.now(),
        by: booking.customerName || user?.name || '',
      };
      await onSave({ ...(booking.inspections || {}), [phase]: record });
      push(
        phase === 'pickup' ? 'Handover checklist filed' : 'Return inspection filed',
        `${issues ? `${issues} issue(s) recorded` : 'No damage recorded'} · odometer ${Number(
          odometer
        ).toLocaleString('en-IN')} km`,
        { type: 'success', tag: `insp-${booking.ref}-${phase}` }
      );
    } catch (err) {
      toast(err.message || 'Could not save the inspection.', { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 text-[14px]">
            <ClipboardCheck size={15} className="text-brand-300" />
            {phase === 'pickup' ? 'Pre-pickup handover' : 'Post-return inspection'}
          </h4>
          <p className="mt-0.5 text-[12px] text-slate-400">
            {locked
              ? `Filed ${fmtDateTime(existing.at)} by ${existing.by || '—'}`
              : 'Walk around the car, tick what is intact and photograph anything that is not.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {locked && (
            <Badge tone={existing.checklist?.some((c) => !c.ok) ? 'warning' : 'success'}>
              {existing.checklist?.filter((c) => !c.ok).length || 0} issues
            </Badge>
          )}
          {locked && (
            <Button
              size="sm"
              variant="secondary"
              icon={FileDown}
              onClick={() => handoverReportPdf(booking, car, phase)}
            >
              Report PDF
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {checklist.map((c, i) => (
          <button
            key={c.label}
            type="button"
            disabled={locked}
            onClick={() =>
              setChecklist((list) => list.map((x, j) => (i === j ? { ...x, ok: !x.ok } : x)))
            }
            className={cx(
              'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-[12.5px] transition',
              c.ok
                ? 'border-emerald-400/25 bg-emerald-500/[0.07] text-slate-300'
                : 'border-rose-400/30 bg-rose-500/10 text-rose-200',
              locked && 'cursor-default opacity-90'
            )}
          >
            <span
              className={cx(
                'grid h-5 w-5 shrink-0 place-items-center rounded-md',
                c.ok ? 'bg-emerald-500/25 text-emerald-300' : 'bg-rose-500/25 text-rose-300'
              )}
            >
              {c.ok ? <Check size={12} /> : <X size={12} />}
            </span>
            <span className="flex-1 leading-snug">{c.label}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Odometer reading (km)">
          <div className="relative">
            <Gauge size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input
              type="number"
              value={odometer}
              disabled={locked}
              onChange={(e) => setOdometer(e.target.value)}
              placeholder="e.g. 24380"
              className="pl-9"
            />
          </div>
        </Field>
        <Field label={`${car?.fuel === 'EV' ? 'State of charge' : 'Fuel level'} — ${fuelLevel}%`}>
          <div className="pt-2.5">
            <Slider min={0} max={100} step={5} value={fuelLevel} onChange={setFuelLevel} />
          </div>
        </Field>
      </div>

      <Field label="Damage notes">
        <Textarea
          rows={3}
          value={notes}
          disabled={locked}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Describe any scratch, dent or missing item, with its location on the car."
        />
      </Field>

      <div>
        <p className="label">Photos ({photos.length}/6)</p>
        <div className="flex flex-wrap gap-2">
          {photos.map((src, i) => (
            <div key={i} className="group relative h-20 w-28 overflow-hidden rounded-xl border border-white/10">
              <img src={src} alt={`Inspection ${i + 1}`} className="h-full w-full object-cover" />
              {!locked && (
                <button
                  onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 rounded-lg bg-ink-950/80 p-1 text-rose-300 opacity-0 transition group-hover:opacity-100"
                  aria-label="Remove photo"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          ))}
          {!locked && photos.length < 6 && (
            <label
              className={cx(
                'grid h-20 w-28 cursor-pointer place-items-center rounded-xl border border-dashed border-white/15',
                'text-slate-500 transition hover:border-brand-400/40 hover:text-brand-300',
                uploading && 'pointer-events-none opacity-60'
              )}
            >
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => addPhotos(e.target.files)}
              />
              <span className="flex flex-col items-center gap-1">
                <Camera size={16} />
                <span className="text-[10.5px]">{uploading ? 'Uploading…' : 'Add photo'}</span>
              </span>
            </label>
          )}
        </div>
      </div>

      {!locked && (
        <Button onClick={save} loading={busy} disabled={busy} icon={ClipboardCheck}>
          File {phase === 'pickup' ? 'handover' : 'return'} inspection
        </Button>
      )}
    </div>
  );
}
