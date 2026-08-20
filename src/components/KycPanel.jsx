// Customer-facing KYC upload (module 6).

import { useState } from 'react';
import { IdCard, Upload, ShieldCheck, Clock3, XCircle, FileCheck2, Trash2 } from 'lucide-react';
import { uploadFile } from '../lib/db';
import { useAuth } from '../lib/auth';
import { useStore } from '../lib/store';
import { useNotify } from '../lib/notify';
import { fmtDateTime, cx } from '../lib/format';
import { Button, Badge, Field, Input } from './ui';

export const KYC_STATES = {
  Verified: { tone: 'success', icon: ShieldCheck, note: 'Your profile is cleared for handover.' },
  'Pending Review': { tone: 'warning', icon: Clock3, note: 'Our team is reviewing your documents.' },
  Rejected: { tone: 'danger', icon: XCircle, note: 'A document needs to be re-uploaded.' },
};

function DocSlot({ label, hint, value, onPick, onClear, disabled }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="panel-tight p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-semibold text-white">{label}</p>
          <p className="mt-0.5 text-[11.5px] text-slate-500">{hint}</p>
        </div>
        {value && <Badge tone="success" icon={FileCheck2}>Uploaded</Badge>}
      </div>

      {value ? (
        <div className="group relative mt-3 overflow-hidden rounded-xl border border-white/10">
          <img src={value} alt={label} className="h-36 w-full object-cover" />
          {!disabled && (
            <button
              onClick={onClear}
              className="absolute right-2 top-2 rounded-lg bg-ink-950/85 p-1.5 text-rose-300 opacity-0 transition group-hover:opacity-100"
              aria-label={`Remove ${label}`}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      ) : (
        <label
          className={cx(
            'mt-3 flex h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15',
            'text-slate-500 transition hover:border-brand-400/40 hover:text-brand-300',
            (disabled || busy) && 'pointer-events-none opacity-60'
          )}
        >
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusy(true);
              await onPick(f);
              setBusy(false);
            }}
          />
          <Upload size={18} />
          <span className="text-[12px]">{busy ? 'Uploading…' : 'Click to upload'}</span>
          <span className="text-[10.5px] text-slate-600">JPG or PNG · max 8 MB</span>
        </label>
      )}
    </div>
  );
}

export default function KycPanel() {
  const { user } = useAuth();
  const { myKyc, saveKyc } = useStore();
  const { toast, push } = useNotify();
  const [licenceNo, setLicenceNo] = useState(myKyc?.licenceNo || '');
  const [aadhaarNo, setAadhaarNo] = useState(myKyc?.aadhaarNo || '');
  const [docs, setDocs] = useState({ licence: myKyc?.licence || '', aadhaar: myKyc?.aadhaar || '' });
  const [busy, setBusy] = useState(false);

  const status = myKyc?.status || 'Not submitted';
  const meta = KYC_STATES[status];
  const locked = status === 'Verified' || status === 'Pending Review';

  const pick = async (key, file) => {
    try {
      const url = await uploadFile(`kyc/${user.uid}/${key}-${Date.now()}-${file.name}`, file);
      setDocs((d) => ({ ...d, [key]: url }));
    } catch {
      toast('Upload failed. Try a smaller image.', { type: 'error' });
    }
  };

  const validLicence = /^[A-Z]{2}[-\s]?\d{2}[-\s]?\d{4}[-\s]?\d{7}$/i.test(licenceNo.trim());
  const validAadhaar = /^\d{4}\s?\d{4}\s?\d{4}$/.test(aadhaarNo.trim());

  const submit = async () => {
    if (!docs.licence || !docs.aadhaar) {
      toast('Upload both the driving licence and the Aadhaar card.', { type: 'warning' });
      return;
    }
    if (!validLicence) {
      toast('Licence number looks wrong. Format: DL-0420110149646', { type: 'warning' });
      return;
    }
    if (!validAadhaar) {
      toast('Aadhaar number must be 12 digits.', { type: 'warning' });
      return;
    }
    setBusy(true);
    try {
      await saveKyc(user.uid, {
        userId: user.uid,
        name: user.name,
        email: user.email,
        licenceNo: licenceNo.trim().toUpperCase(),
        aadhaarNo: aadhaarNo.trim(),
        licence: docs.licence,
        aadhaar: docs.aadhaar,
        status: 'Pending Review',
        submittedAt: Date.now(),
        reviewedAt: null,
        reason: '',
      });
      push('KYC submitted for review', 'Verification usually completes within 20 minutes during working hours.', {
        type: 'success',
      });
    } catch (err) {
      toast(err.message || 'Could not submit your documents.', { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div
        className={cx(
          'flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3.5',
          status === 'Verified'
            ? 'border-emerald-400/25 bg-emerald-500/[0.08]'
            : status === 'Rejected'
              ? 'border-rose-400/25 bg-rose-500/[0.08]'
              : status === 'Pending Review'
                ? 'border-amber-400/25 bg-amber-500/[0.08]'
                : 'border-white/10 bg-ink-950/50'
        )}
      >
        <span
          className={cx(
            'grid h-10 w-10 place-items-center rounded-xl',
            status === 'Verified'
              ? 'bg-emerald-500/20 text-emerald-300'
              : status === 'Rejected'
                ? 'bg-rose-500/20 text-rose-300'
                : status === 'Pending Review'
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'bg-white/[0.06] text-slate-400'
          )}
        >
          {meta ? <meta.icon size={19} /> : <IdCard size={19} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-white">
            Verification status: {status}
          </p>
          <p className="mt-0.5 text-[12.5px] text-slate-400">
            {meta?.note || 'Upload your driving licence and Aadhaar to unlock vehicle handover.'}
          </p>
          {myKyc?.reason && status === 'Rejected' && (
            <p className="mt-1.5 text-[12px] text-rose-300">Reason: {myKyc.reason}</p>
          )}
          {myKyc?.submittedAt && (
            <p className="mt-1 text-[11px] text-slate-600">Submitted {fmtDateTime(myKyc.submittedAt)}</p>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <DocSlot
          label="Driving Licence"
          hint="Front side, clearly readable, not expired"
          value={docs.licence}
          disabled={locked}
          onPick={(f) => pick('licence', f)}
          onClear={() => setDocs((d) => ({ ...d, licence: '' }))}
        />
        <DocSlot
          label="Aadhaar Card"
          hint="Front side — used as address proof"
          value={docs.aadhaar}
          disabled={locked}
          onPick={(f) => pick('aadhaar', f)}
          onClear={() => setDocs((d) => ({ ...d, aadhaar: '' }))}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Licence number"
          error={licenceNo && !validLicence ? 'Format: DL-0420110149646' : ''}
        >
          <Input
            value={licenceNo}
            disabled={locked}
            onChange={(e) => setLicenceNo(e.target.value.toUpperCase())}
            placeholder="DL-0420110149646"
          />
        </Field>
        <Field label="Aadhaar number" error={aadhaarNo && !validAadhaar ? 'Must be 12 digits.' : ''}>
          <Input
            value={aadhaarNo}
            disabled={locked}
            onChange={(e) => setAadhaarNo(e.target.value.replace(/[^\d\s]/g, ''))}
            placeholder="1234 5678 9012"
            inputMode="numeric"
          />
        </Field>
      </div>

      {!locked && (
        <Button onClick={submit} loading={busy} disabled={busy} icon={ShieldCheck}>
          Submit for verification
        </Button>
      )}

      <p className="text-[11px] leading-relaxed text-slate-600">
        Documents are stored against your account only and are visible to DelhiDrive operations staff for
        verification. We never share them with third parties.
      </p>
    </div>
  );
}
