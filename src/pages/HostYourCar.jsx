// Host Your Car — a vendor offers their car to the fleet.
//
// One page does three jobs: it says what is needed, takes the application
// (contact details, the car, RC, insurance and 6–8 photos), and shows the
// vendor where each of their applications stands.
//
// Nothing filed here reaches the public fleet. That happens only when an
// admin approves the car in Admin → Host management.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BellRing,
  Camera,
  CarFront,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileText,
  ImagePlus,
  Info,
  Loader2,
  Lock,
  Mail,
  MessageCircle,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useStore } from '../lib/store';
import { useNotify } from '../lib/notify';
import { COL, tableExists, uploadPrivateFile } from '../lib/db';
import { loadAuthSettings, supabaseReady } from '../lib/supabase';
import { compressImage, fileKind } from '../lib/image';
import { useFileUrls } from '../lib/useFileUrls';
import { rememberReturnTo } from '../lib/returnTo';
import { hostSubmittedWhatsappUrl, supportWhatsappUrl } from '../lib/whatsapp';
import {
  BLANK_APPLICATION,
  CAR_COLOURS,
  HOST_STATUS,
  INSURANCE_TYPES,
  MAX_CAR_PHOTOS,
  MAX_FILE_BYTES,
  MIN_CAR_PHOTOS,
  PHOTO_ANGLES,
  SEAT_OPTIONS,
  carTitle,
  draftFromApplication,
  formatPlate,
  newHostRef,
  toApplicationRecord,
  validateApplication,
} from '../lib/host';
import { CATEGORIES, TRANSMISSIONS, FUELS } from '../data/fleet';
import { fmtDateTime, cx } from '../lib/format';
import { Button, Badge, Field, Input, Select, Textarea, Checkbox } from '../components/ui';

const PATH = '/host-your-car';

const STEPS = [
  {
    icon: Send,
    title: 'Send us the details',
    body: 'Your contact details, the car, its RC and insurance, and 6–8 photos.',
  },
  {
    icon: ShieldCheck,
    title: 'We review the car',
    body: 'Our team checks the documents and photos. You can follow the status on this page.',
  },
  {
    icon: CarFront,
    title: 'Your car goes live',
    body: 'Once approved, it is listed for renters on the DelhiDrive website and app.',
  },
];

// The order the form is laid out in, so "the first problem" is the topmost one.
const FIELD_ORDER = [
  'host.name',
  'host.phone',
  'host.city',
  'car.brand',
  'car.model',
  'car.year',
  'car.plate',
  'car.category',
  'car.fuel',
  'car.transmission',
  'car.seats',
  'car.kmDriven',
  'car.expectedRate',
  'docs.rc',
  'docs.insurance',
  'insurance.validTill',
  'photos',
  'uploads',
  'declared',
];

const localId = () => Math.random().toString(36).slice(2, 10);

const freshDraft = (user) => ({
  ...structuredClone(BLANK_APPLICATION),
  host: { ...BLANK_APPLICATION.host, name: user?.name || '', phone: user?.phone || '' },
  ref: newHostRef(),
  replaces: null,
});

/* ------------------------------------------------------------------ */
/* Draft — kept in this browser so a refresh does not lose the form    */
/* ------------------------------------------------------------------ */
const draftKey = (uid) => `delhidrive:hostDraft:${uid}`;

// A file is worth remembering only once it is uploaded. On the local store a
// "reference" is the whole image, far too big to keep a second copy of.
const keepFile = (f) =>
  f?.ref && !/^data:/.test(f.ref) ? { id: f.id, ref: f.ref, name: f.name, pdf: Boolean(f.pdf) } : null;

function loadDraft(user) {
  try {
    const saved = JSON.parse(localStorage.getItem(draftKey(user.uid)) || 'null');
    if (!saved?.ref) return null;
    const blank = freshDraft(user);
    return {
      ...blank,
      ref: saved.ref,
      replaces: saved.replaces || null,
      host: { ...blank.host, ...saved.host },
      car: { ...blank.car, ...saved.car },
      insurance: { ...blank.insurance, ...saved.insurance },
      docs: { ...blank.docs, ...saved.docs },
      photos: Array.isArray(saved.photos) ? saved.photos.slice(0, MAX_CAR_PHOTOS) : [],
    };
  } catch {
    return null;
  }
}

function saveDraft(uid, draft) {
  const slim = {
    ...draft,
    declared: false,
    docs: {
      rc: keepFile(draft.docs.rc),
      rcBack: keepFile(draft.docs.rcBack),
      insurance: keepFile(draft.docs.insurance),
    },
    photos: draft.photos.map(keepFile).filter(Boolean),
  };
  try {
    localStorage.setItem(draftKey(uid), JSON.stringify(slim));
  } catch {
    /* storage full or blocked — the form still works, it just will not survive a refresh */
  }
}

const clearDraft = (uid) => {
  try {
    localStorage.removeItem(draftKey(uid));
  } catch {
    /* nothing to clear */
  }
};

/* ------------------------------------------------------------------ */
/* Account — a vendor needs one to upload privately and track status   */
/* ------------------------------------------------------------------ */
function HostAccountCard() {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState('signup');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [google, setGoogle] = useState(false);

  // Offer Google only where the project has it switched on.
  useEffect(() => {
    let live = true;
    loadAuthSettings().then((s) => live && setGoogle(Boolean(s?.external?.google)));
    return () => {
      live = false;
    };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const email = form.email.trim();
    // A confirmation link or Google lands wherever Supabase allows; this brings them back here.
    rememberReturnTo(PATH);
    try {
      if (mode === 'signin') await signIn(email, form.password);
      else await signUp(form.name.trim(), email, form.password, PATH);
    } catch (err) {
      const msg = String(err?.message || err);
      if (err?.needsConfirmation) {
        setNotice(
          `We have sent a confirmation link to ${email}. Open it on this device and you will come straight back here to add your car.`
        );
      } else if (/already registered|already exists/i.test(msg)) {
        setMode('signin');
        setError('You already have a DelhiDrive account with this email. Enter its password to sign in.');
      } else if (/invalid login credentials/i.test(msg)) {
        setError('That email and password do not match. Check them, or create an account instead.');
      } else if (/email not confirmed/i.test(msg)) {
        setError('Open the confirmation link we emailed you first, then sign in here.');
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const withGoogle = async () => {
    setError('');
    rememberReturnTo(PATH);
    try {
      await signInWithGoogle(PATH);
    } catch (err) {
      setError(err.message || 'Google sign-in failed.');
    }
  };

  return (
    <div className="panel mx-auto max-w-xl p-5 sm:p-6" data-testid="host-account">
      <h2 className="text-lg">{mode === 'signup' ? 'Create your host login to start' : 'Sign in to continue'}</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-slate-400">
        It keeps your documents private to you and our team, and it is how you check your application
        status later.
      </p>

      <div className="mt-4 flex gap-1 rounded-xl border border-white/10 bg-ink-950/60 p-1">
        {[
          ['signup', 'New here'],
          ['signin', 'I have an account'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setMode(id);
              setError('');
              setNotice('');
            }}
            className={cx(
              'flex-1 rounded-lg py-2 text-[13px] font-medium transition',
              mode === id ? 'bg-brand-500 text-white shadow' : 'text-slate-400 hover:text-white'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-4 space-y-3.5">
        {mode === 'signup' && (
          <Field label="Your name">
            <div className="relative">
              <User size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
                className="pl-10"
                autoComplete="name"
                maxLength={80}
                required
              />
            </div>
          </Field>
        )}
        <Field label="Email address">
          <div className="relative">
            <Mail size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="you@example.com"
              className="pl-10"
              autoComplete="email"
              required
            />
          </div>
        </Field>
        <Field label={mode === 'signup' ? 'Choose a password' : 'Password'} hint={mode === 'signup' ? 'At least 6 characters.' : undefined}>
          <div className="relative">
            <Lock size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="••••••••"
              className="pl-10"
              minLength={mode === 'signup' ? 6 : 4}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
            />
          </div>
        </Field>

        {error && (
          <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3.5 py-2.5 text-[12.5px] text-rose-200">
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3.5 py-2.5 text-[12.5px] text-emerald-200">
            {notice}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" loading={busy} disabled={busy} iconRight={ArrowRight}>
          {mode === 'signup' ? 'Continue to the form' : 'Sign in'}
        </Button>
      </form>

      {google && (
        <>
          <div className="my-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-white/10" />
            <span className="text-[11px] uppercase tracking-wider text-slate-600">or</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>
          <Button variant="secondary" size="lg" className="w-full" onClick={withGoogle} disabled={busy}>
            Continue with Google
          </Button>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Uploads                                                             */
/* ------------------------------------------------------------------ */

/** One document: a picture or a PDF. */
function DocSlot({ name, label, hint, file, url, error, onPick, onClear }) {
  return (
    <div data-field={name} className={cx('panel-tight p-4', error && 'border-rose-400/40')}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-semibold text-white">{label}</p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-slate-500">{hint}</p>
        </div>
        {file?.ref && (
          <Badge tone="success" icon={FileCheck2}>
            Uploaded
          </Badge>
        )}
      </div>

      {file ? (
        <div className="relative mt-3 overflow-hidden rounded-xl border border-white/10 bg-ink-950">
          {file.pdf ? (
            <div className="flex h-36 flex-col items-center justify-center gap-2 px-3 text-center">
              <FileText size={26} className="text-brand-300" />
              <span className="max-w-full truncate text-[12px] text-slate-300">{file.name || 'PDF document'}</span>
              {url && (
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-[11.5px] font-medium text-brand-300 hover:text-brand-200">
                  Open PDF
                </a>
              )}
            </div>
          ) : (
            <img src={file.preview || url} alt={label} className="h-36 w-full object-cover" />
          )}
          {file.busy && (
            <div className="absolute inset-0 grid place-items-center bg-ink-950/70 text-[12px] text-slate-200">
              <span className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Uploading…
              </span>
            </div>
          )}
          {!file.busy && (
            <button
              type="button"
              onClick={onClear}
              className="absolute right-2 top-2 rounded-lg bg-ink-950/85 p-1.5 text-rose-300 transition hover:bg-ink-950"
              aria-label={`Remove ${label}`}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      ) : (
        <label className="mt-3 flex h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 text-slate-500 transition hover:border-brand-400/40 hover:text-brand-300">
          <input
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            data-testid={`file-${name}`}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) onPick(f);
            }}
          />
          <Upload size={18} />
          <span className="text-[12px]">Tap to upload</span>
          <span className="text-[10.5px] text-slate-600">Photo or PDF · up to 10 MB</span>
        </label>
      )}
      {error && <p className="mt-2 text-[11.5px] text-rose-300">{error}</p>}
    </div>
  );
}

/** The 6–8 photos of the car. */
function PhotoGrid({ photos, urls, error, onAdd, onRemove }) {
  const ready = photos.filter((p) => p.ref).length;
  const room = MAX_CAR_PHOTOS - photos.length;
  return (
    <div data-field="photos">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="text-[12.5px] leading-relaxed text-slate-400">
          Take them in daylight with the whole car in frame. Include: {PHOTO_ANGLES.join(' · ')}.
        </p>
        <Badge tone={ready >= MIN_CAR_PHOTOS ? 'success' : 'neutral'} icon={Camera}>
          {ready} of {MIN_CAR_PHOTOS}–{MAX_CAR_PHOTOS}
        </Badge>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {photos.map((p, i) => (
          <div
            key={p.id}
            className={cx(
              'group relative aspect-[4/3] overflow-hidden rounded-xl border bg-ink-950',
              p.error ? 'border-rose-400/50' : 'border-white/10'
            )}
          >
            {(p.preview || urls[p.ref]) && (
              <img src={p.preview || urls[p.ref]} alt={`Car photo ${i + 1}`} className="h-full w-full object-cover" />
            )}
            {p.busy && (
              <div className="absolute inset-0 grid place-items-center bg-ink-950/70">
                <Loader2 size={18} className="animate-spin text-slate-200" />
              </div>
            )}
            {p.error && (
              <div className="absolute inset-0 flex items-center justify-center bg-ink-950/85 p-2 text-center text-[11px] leading-snug text-rose-200">
                {p.error}
              </div>
            )}
            {!p.busy && (
              <button
                type="button"
                onClick={() => onRemove(p.id)}
                className="absolute right-1.5 top-1.5 rounded-lg bg-ink-950/85 p-1.5 text-rose-300 transition hover:bg-ink-950"
                aria-label={`Remove photo ${i + 1}`}
              >
                <Trash2 size={12} />
              </button>
            )}
            <span className="absolute bottom-1.5 left-1.5 rounded bg-ink-950/85 px-1.5 py-0.5 text-[9.5px] font-semibold text-slate-300">
              {i + 1}
            </span>
          </div>
        ))}

        {room > 0 && (
          <label className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/15 text-slate-500 transition hover:border-brand-400/40 hover:text-brand-300">
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              data-testid="file-photos"
              onChange={(e) => {
                const list = [...(e.target.files || [])];
                e.target.value = '';
                if (list.length) onAdd(list);
              }}
            />
            <ImagePlus size={20} />
            <span className="text-[12px] font-medium">Add photos</span>
            <span className="text-[10.5px] text-slate-600">{room} more allowed</span>
          </label>
        )}
      </div>
      {error && <p className="mt-2 text-[11.5px] text-rose-300">{error}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */
const STATUS_VIEW = {
  [HOST_STATUS.pending]: {
    tone: 'warning',
    icon: Clock3,
    label: 'Under review',
    box: 'border-amber-400/25 bg-amber-500/[0.07]',
    note: 'Our team is checking your documents and photos. The decision will show here, and we will message you on WhatsApp.',
  },
  [HOST_STATUS.approved]: {
    tone: 'success',
    icon: CheckCircle2,
    label: 'Approved · live',
    box: 'border-emerald-400/25 bg-emerald-500/[0.07]',
    note: 'Your car is live on the DelhiDrive website and app.',
  },
  [HOST_STATUS.rejected]: {
    tone: 'danger',
    icon: XCircle,
    label: 'Not approved',
    box: 'border-rose-400/25 bg-rose-500/[0.07]',
    note: 'We could not approve this car.',
  },
};

function ApplicationCard({ app, cover, onResubmit }) {
  const view = STATUS_VIEW[app.status] || STATUS_VIEW[HOST_STATUS.pending];
  const done = app.status !== HOST_STATUS.pending;
  const stages = [
    { label: 'Submitted', on: true },
    { label: 'Under review', on: true },
    {
      label: app.status === HOST_STATUS.rejected ? 'Not approved' : 'Live',
      on: done,
      bad: app.status === HOST_STATUS.rejected,
    },
  ];

  return (
    <article className={cx('rounded-2xl border p-4 sm:p-5', view.box)} data-testid="host-application" data-status={app.status}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="h-20 w-28 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-ink-950">
          {cover ? (
            <img src={cover} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full place-items-center text-slate-700">
              <CarFront size={22} />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] leading-tight">{carTitle(app)}</h3>
            <Badge tone={view.tone} icon={view.icon}>
              {view.label}
            </Badge>
          </div>
          <p className="mt-1 text-[12px] text-slate-400">
            {app.car?.plate} · Reference <span className="font-mono text-slate-200">{app.ref}</span>
            {app.submittedAt ? ` · Sent ${fmtDateTime(app.submittedAt)}` : ''}
          </p>

          <ol className="mt-3 flex items-center gap-1.5 text-[11px]">
            {stages.map((s, i) => (
              <li key={s.label} className="flex items-center gap-1.5">
                {i > 0 && <span className={cx('h-px w-4 sm:w-7', s.on ? 'bg-white/40' : 'bg-white/10')} />}
                <span
                  className={cx(
                    'rounded-full border px-2 py-0.5 font-medium',
                    !s.on
                      ? 'border-white/10 text-slate-600'
                      : s.bad
                        ? 'border-rose-400/40 text-rose-200'
                        : 'border-emerald-400/40 text-emerald-200'
                  )}
                >
                  {s.label}
                </span>
              </li>
            ))}
          </ol>

          <p className="mt-3 text-[12.5px] leading-relaxed text-slate-300">{view.note}</p>
          {app.status === HOST_STATUS.rejected && app.rejectionReason && (
            <p className="mt-1 text-[12.5px] text-rose-200">Reason: {app.rejectionReason}</p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {app.status === HOST_STATUS.approved && (
              <Button as={Link} to={`/fleet?q=${encodeURIComponent(carTitle(app))}`} size="sm" iconRight={ArrowRight}>
                See it in the fleet
              </Button>
            )}
            {app.status === HOST_STATUS.rejected && (
              <Button size="sm" icon={RotateCcw} onClick={() => onResubmit(app)}>
                Fix and send again
              </Button>
            )}
            <Button
              as="a"
              href={supportWhatsappUrl(`Hello DelhiDrive, this is about my host application ${app.ref}.`)}
              target="_blank"
              rel="noopener noreferrer"
              size="sm"
              variant="secondary"
              icon={MessageCircle}
            >
              Ask us on WhatsApp
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function HostYourCar() {
  const { user, loading: authLoading, isAdmin } = useAuth();
  const { myHostApplications, createHostApplication } = useStore();
  const { toast, push, requestPush, permission } = useNotify();

  const [draft, setDraft] = useState(() => freshDraft(null));
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [sent, setSent] = useState(null); // reference of the application just filed
  const [switchedOn, setSwitchedOn] = useState(true);
  const formRef = useRef(null);
  const draftOwner = useRef(null);

  useEffect(() => {
    document.title = 'Host your car · DelhiDrive';
    return () => {
      document.title = 'DelhiDrive · Self-Drive Car Rentals in Delhi NCR';
    };
  }, []);

  // If the database half has not been set up yet, say so now rather than
  // letting someone fill the whole form in and fail on Submit.
  useEffect(() => {
    let live = true;
    tableExists(COL.hostApplications).then((ok) => live && setSwitchedOn(ok));
    return () => {
      live = false;
    };
  }, []);

  // Pick up this person's unfinished form when they arrive or sign in.
  useEffect(() => {
    if (!user) {
      draftOwner.current = null;
      return;
    }
    if (draftOwner.current === user.uid) return;
    draftOwner.current = user.uid;
    setDraft(loadDraft(user) || freshDraft(user));
    setErrors({});
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user || draftOwner.current !== user.uid) return undefined;
    const t = setTimeout(() => saveDraft(user.uid, draft), 400);
    return () => clearTimeout(t);
  }, [draft, user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------- the vendor's applications ---------------- */
  const applications = useMemo(() => {
    // A rejected application that has been fixed and re-sent is history.
    const replaced = new Set(myHostApplications.map((a) => a.replaces).filter(Boolean));
    return myHostApplications
      .filter((a) => !replaced.has(a.id))
      .sort((a, b) => (b.submittedAt || b.createdAt || 0) - (a.submittedAt || a.createdAt || 0));
  }, [myHostApplications]);

  const fileRefs = useMemo(
    () => [
      ...applications.map((a) => a.photos?.[0]?.ref),
      ...draft.photos.map((p) => p.ref),
      ...Object.values(draft.docs).map((d) => d?.ref),
    ],
    [applications, draft.photos, draft.docs]
  );
  const urls = useFileUrls(fileRefs);

  const formOpen = Boolean(user) && (showForm || applications.length === 0);
  // The "one last step" banner has done its job once that application is decided.
  const sentPending = sent && !myHostApplications.some((a) => a.ref === sent && a.status !== HOST_STATUS.pending);
  const pending = applications.filter((a) => a.status === HOST_STATUS.pending).length;

  /* ---------------- editing ---------------- */
  const set = (group, key, value) => {
    setDraft((d) => ({ ...d, [group]: { ...d[group], [key]: value } }));
    setErrors((e) => {
      if (!e[`${group}.${key}`]) return e;
      const { [`${group}.${key}`]: _gone, ...rest } = e;
      return rest;
    });
  };

  const upload = async (kind, file) => {
    const type = fileKind(file);
    if (kind === 'photo' && type !== 'image') throw new Error('Car photos must be pictures (JPG or PNG).');
    if (!type) throw new Error('Upload a photo (JPG or PNG) or a PDF.');
    if (type === 'pdf' && file.size > MAX_FILE_BYTES) {
      throw new Error('That PDF is over 10 MB. Upload a smaller one, or a photo of the document.');
    }
    const ready =
      type === 'pdf'
        ? new File([file], file.name, { type: 'application/pdf' })
        : await compressImage(file, kind === 'photo' ? {} : { maxEdge: 2200, quality: 0.86 });
    const name = `${kind}-${Date.now().toString(36)}${localId().slice(0, 4)}.${type === 'pdf' ? 'pdf' : 'jpg'}`;
    return uploadPrivateFile(`hosts/${user.uid}/${draft.ref}/${name}`, ready);
  };

  const pickDoc = async (slot, kind, file) => {
    const id = localId();
    const isImage = fileKind(file) === 'image';
    const item = {
      id,
      name: file.name,
      pdf: !isImage,
      preview: isImage ? URL.createObjectURL(file) : '',
      busy: true,
    };
    setDraft((d) => ({ ...d, docs: { ...d.docs, [slot]: item } }));
    setErrors((e) => ({ ...e, [`docs.${slot}`]: undefined, uploads: undefined }));
    try {
      const ref = await upload(kind, file);
      setDraft((d) =>
        d.docs[slot]?.id === id ? { ...d, docs: { ...d.docs, [slot]: { ...d.docs[slot], ref, busy: false } } } : d
      );
    } catch (err) {
      setDraft((d) => (d.docs[slot]?.id === id ? { ...d, docs: { ...d.docs, [slot]: null } } : d));
      toast(err.message || 'Upload failed. Please try again.', { type: 'error' });
    }
  };

  const clearDoc = (slot) => setDraft((d) => ({ ...d, docs: { ...d.docs, [slot]: null } }));

  const patchPhoto = (id, patch) =>
    setDraft((d) => ({ ...d, photos: d.photos.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));

  const addPhotos = async (files) => {
    const room = MAX_CAR_PHOTOS - draft.photos.length;
    if (files.length > room) {
      toast(`${MAX_CAR_PHOTOS} photos is the limit — the first ${room} were added.`, { type: 'info' });
    }
    const batch = files.slice(0, room).map((file) => ({
      file,
      item: { id: localId(), name: file.name, pdf: false, preview: URL.createObjectURL(file), busy: true },
    }));
    if (!batch.length) return;
    setDraft((d) => ({ ...d, photos: [...d.photos, ...batch.map((b) => b.item)] }));
    setErrors((e) => ({ ...e, photos: undefined, uploads: undefined }));

    // Three at a time: quick on a good connection, gentle on a poor one.
    const queue = [...batch];
    const worker = async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        try {
          const ref = await upload('photo', job.file);
          patchPhoto(job.item.id, { ref, busy: false });
        } catch (err) {
          patchPhoto(job.item.id, { busy: false, error: err.message || 'Upload failed' });
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  };

  const removePhoto = (id) => setDraft((d) => ({ ...d, photos: d.photos.filter((p) => p.id !== id) }));

  const startAnother = () => {
    setDraft(freshDraft(user));
    setErrors({});
    setShowForm(true);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const resubmit = (app) => {
    setDraft({ ...draftFromApplication(app), ref: newHostRef(), replaces: app.id });
    setErrors({});
    setShowForm(true);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  /* ---------------- submit ---------------- */
  const submit = async () => {
    const found = validateApplication(draft);
    setErrors(found);
    const first = FIELD_ORDER.find((k) => found[k]);
    if (first) {
      toast(found[first], { type: 'warning' });
      const target = first === 'uploads' ? 'photos' : first;
      document.querySelector(`[data-field="${target}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // Open the WhatsApp tab now, while the tap still counts as the vendor's
    // own, and point it at the chat once the application is saved. Opened
    // after the save instead, most browsers would block it as a pop-up.
    const tab = window.open('', '_blank');
    try {
      tab?.document.write(
        '<title>WhatsApp</title><p style="font:16px system-ui,sans-serif;padding:32px;color:#333">Opening WhatsApp…</p>'
      );
    } catch {
      /* the blank tab is enough */
    }

    setSubmitting(true);
    try {
      const record = toApplicationRecord(draft, { user, ref: draft.ref, replaces: draft.replaces });
      await createHostApplication(record);

      clearDraft(user.uid);
      setSent(record.ref);
      setShowForm(false);
      setDraft(freshDraft(user));
      setErrors({});
      push('Application received · ' + record.ref, `${carTitle(record)} is with our team for review.`, {
        type: 'success',
        tag: 'host-' + record.ref,
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });

      const url = hostSubmittedWhatsappUrl();
      if (tab && !tab.closed) {
        tab.opener = null;
        tab.location.href = url;
      } else {
        // Pop-ups are blocked outright, so take this tab to WhatsApp. The
        // application is saved — its status is here when they come back.
        window.location.assign(url);
      }
    } catch (err) {
      tab?.close();
      console.error(err);
      toast(err.message || 'We could not save your application. Please try again.', { type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const err = (name) => errors[name] || '';

  /* ---------------- render ---------------- */
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      {/* hero */}
      <header className="animate-fade-up">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-300">Host your car</p>
        <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
          List your car on{' '}
          <span className="bg-gradient-to-r from-brand-300 to-saffron-400 bg-clip-text text-transparent">
            DelhiDrive
          </span>
        </h1>
        <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-slate-400">
          Have a car that sits idle? Send us its details, documents and photos. Our team checks every car,
          and once yours is approved it goes live for renters on the DelhiDrive website and app.
        </p>

        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="panel p-4">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500/15 text-brand-300">
                  <s.icon size={17} />
                </span>
                <span className="font-display text-2xl font-extrabold text-white/[0.08]">0{i + 1}</span>
              </div>
              <h2 className="mt-3 text-[14.5px]">{s.title}</h2>
              <p className="mt-1 text-[12.5px] leading-relaxed text-slate-400">{s.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-2xl border border-white/10 bg-ink-950/50 px-4 py-3 text-[12.5px] text-slate-300">
          <span className="font-semibold text-white">Keep these ready:</span>
          <span>RC (photo or PDF)</span>
          <span>Valid insurance policy</span>
          <span>
            {MIN_CAR_PHOTOS}–{MAX_CAR_PHOTOS} clear photos of the car
          </span>
        </div>
      </header>

      <div className="mt-8 space-y-6">
        {!switchedOn ? (
          <div className="panel mx-auto max-w-xl p-6 text-center" data-testid="host-closed">
            <Info size={22} className="mx-auto text-brand-300" />
            <h2 className="mt-3 text-lg">Host registration opens here shortly</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">
              Until then, message us on WhatsApp and we will take your car&rsquo;s details there.
            </p>
            <Button
              as="a"
              href={supportWhatsappUrl('Hello DelhiDrive, I would like to list my car with you.')}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4"
              icon={MessageCircle}
            >
              Message us on WhatsApp
            </Button>
            {isAdmin && (
              <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3.5 py-2.5 text-left text-[12px] leading-relaxed text-amber-200">
                Admin: this page is switched off because the database has not been set up for it. Run{' '}
                <code className="text-amber-100">supabase-host-your-car.sql</code> in the Supabase SQL Editor,
                then reload.
              </p>
            )}
          </div>
        ) : authLoading ? null : !user ? (
          <HostAccountCard />
        ) : (
          <>
            {sentPending && (
              <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 sm:p-5" data-testid="host-sent">
                <div className="flex flex-wrap items-start gap-3">
                  <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-300" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-semibold text-white">
                      Application received — reference <span className="font-mono">{sent}</span>
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-emerald-100/90">
                      One last step: send us the WhatsApp message so our team knows it is in. If WhatsApp did
                      not open by itself, tap the button.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        as="a"
                        href={hostSubmittedWhatsappUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="success"
                        icon={MessageCircle}
                        data-testid="host-whatsapp"
                      >
                        Open WhatsApp
                      </Button>
                      {permission !== 'granted' && permission !== 'unsupported' && (
                        <Button variant="secondary" icon={BellRing} onClick={requestPush}>
                          Notify me on this device
                        </Button>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSent(null)}
                    aria-label="Dismiss"
                    className="rounded-lg p-1 text-emerald-200/70 transition hover:bg-white/10 hover:text-white"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
            )}

            {applications.length > 0 && (
              <section>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-xl">Your applications</h2>
                    <p className="mt-0.5 text-[12.5px] text-slate-400">
                      {pending > 0
                        ? `${pending} under review. This page updates by itself when we decide.`
                        : 'This is where each car you have offered stands.'}
                    </p>
                  </div>
                  {!formOpen && (
                    <Button icon={Plus} onClick={startAnother} data-testid="host-another">
                      List another car
                    </Button>
                  )}
                </div>
                <div className="space-y-3">
                  {applications.map((app) => (
                    <ApplicationCard
                      key={app.id}
                      app={app}
                      cover={urls[app.photos?.[0]?.ref]}
                      onResubmit={resubmit}
                    />
                  ))}
                </div>
              </section>
            )}

            {formOpen && (
              <section ref={formRef} className="scroll-mt-24 space-y-5" data-testid="host-form">
                {applications.length > 0 && (
                  <div className="flex items-end justify-between gap-3">
                    <h2 className="text-xl">{draft.replaces ? 'Fix and send again' : 'List another car'}</h2>
                    <Button variant="ghost" size="sm" icon={X} onClick={() => setShowForm(false)}>
                      Close
                    </Button>
                  </div>
                )}

                {/* 1 — the owner */}
                <div className="panel p-5 sm:p-6">
                  <h3 className="text-[16px]">1 · Your details</h3>
                  <p className="mt-0.5 text-[12.5px] text-slate-400">
                    Signed in as <span className="text-slate-200">{user.email}</span>. We will contact you on the
                    number below.
                  </p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div data-field="host.name">
                      <Field label="Full name" error={err('host.name')}>
                        <Input
                          value={draft.host.name}
                          onChange={(e) => set('host', 'name', e.target.value)}
                          placeholder="As on the RC"
                          autoComplete="name"
                          maxLength={80}
                        />
                      </Field>
                    </div>
                    <div data-field="host.phone">
                      <Field label="Mobile number (WhatsApp)" error={err('host.phone')}>
                        <Input
                          value={draft.host.phone}
                          onChange={(e) => set('host', 'phone', e.target.value.replace(/[^\d+\s-]/g, '').slice(0, 16))}
                          placeholder="98765 43210"
                          inputMode="tel"
                          autoComplete="tel"
                        />
                      </Field>
                    </div>
                    <div data-field="host.city">
                      <Field label="Where is the car parked?" error={err('host.city')}>
                        <Input
                          value={draft.host.city}
                          onChange={(e) => set('host', 'city', e.target.value)}
                          placeholder="Area and city — Vaishali, Ghaziabad"
                          maxLength={80}
                        />
                      </Field>
                    </div>
                    <Field label="Full address (optional)">
                      <Input
                        value={draft.host.address}
                        onChange={(e) => set('host', 'address', e.target.value)}
                        placeholder="House, street, landmark"
                        autoComplete="street-address"
                        maxLength={160}
                      />
                    </Field>
                  </div>
                </div>

                {/* 2 — the car */}
                <div className="panel p-5 sm:p-6">
                  <h3 className="text-[16px]">2 · Your car</h3>
                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <div data-field="car.brand">
                      <Field label="Make" error={err('car.brand')}>
                        <Input
                          value={draft.car.brand}
                          onChange={(e) => set('car', 'brand', e.target.value)}
                          placeholder="Maruti Suzuki"
                          maxLength={40}
                        />
                      </Field>
                    </div>
                    <div data-field="car.model">
                      <Field label="Model" error={err('car.model')}>
                        <Input
                          value={draft.car.model}
                          onChange={(e) => set('car', 'model', e.target.value)}
                          placeholder="Swift"
                          maxLength={40}
                        />
                      </Field>
                    </div>
                    <Field label="Variant (optional)">
                      <Input
                        value={draft.car.variant}
                        onChange={(e) => set('car', 'variant', e.target.value)}
                        placeholder="VXI"
                        maxLength={30}
                      />
                    </Field>

                    <div data-field="car.plate">
                      <Field label="Registration number" error={err('car.plate')}>
                        <Input
                          value={draft.car.plate}
                          onChange={(e) => set('car', 'plate', e.target.value.toUpperCase().slice(0, 16))}
                          onBlur={(e) => set('car', 'plate', formatPlate(e.target.value))}
                          placeholder="DL 3C AB 1234"
                          autoCapitalize="characters"
                        />
                      </Field>
                    </div>
                    <div data-field="car.year">
                      <Field label="Year of manufacture" error={err('car.year')}>
                        <Input
                          value={draft.car.year}
                          onChange={(e) => set('car', 'year', e.target.value.replace(/\D/g, '').slice(0, 4))}
                          placeholder={String(new Date().getFullYear() - 3)}
                          inputMode="numeric"
                        />
                      </Field>
                    </div>
                    <div data-field="car.kmDriven">
                      <Field label="Kilometres driven" error={err('car.kmDriven')}>
                        <Input
                          value={draft.car.kmDriven}
                          onChange={(e) => set('car', 'kmDriven', e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="34000"
                          inputMode="numeric"
                        />
                      </Field>
                    </div>

                    <div data-field="car.category">
                      <Field label="Type of car" error={err('car.category')}>
                        <Select value={draft.car.category} onChange={(e) => set('car', 'category', e.target.value)}>
                          <option value="">Choose…</option>
                          {CATEGORIES.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    <div data-field="car.fuel">
                      <Field label="Fuel" error={err('car.fuel')}>
                        <Select value={draft.car.fuel} onChange={(e) => set('car', 'fuel', e.target.value)}>
                          <option value="">Choose…</option>
                          {FUELS.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    <div data-field="car.transmission">
                      <Field label="Gearbox" error={err('car.transmission')}>
                        <Select
                          value={draft.car.transmission}
                          onChange={(e) => set('car', 'transmission', e.target.value)}
                        >
                          <option value="">Choose…</option>
                          {TRANSMISSIONS.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </Select>
                      </Field>
                    </div>

                    <div data-field="car.seats">
                      <Field label="Seats" error={err('car.seats')}>
                        <Select value={draft.car.seats} onChange={(e) => set('car', 'seats', e.target.value)}>
                          {SEAT_OPTIONS.map((n) => (
                            <option key={n} value={n}>
                              {n} seats
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    <Field label="Colour (optional)">
                      <Select value={draft.car.colour} onChange={(e) => set('car', 'colour', e.target.value)}>
                        <option value="">Choose…</option>
                        {CAR_COLOURS.map((c) => (
                          <option key={c.name}>{c.name}</option>
                        ))}
                      </Select>
                    </Field>
                    <div data-field="car.expectedRate">
                      <Field
                        label="Rent you expect per day (optional)"
                        error={err('car.expectedRate')}
                        hint="In rupees. Our team sets the final price."
                      >
                        <Input
                          value={draft.car.expectedRate}
                          onChange={(e) => set('car', 'expectedRate', e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="1800"
                          inputMode="numeric"
                        />
                      </Field>
                    </div>
                  </div>
                  <Field label="Features worth mentioning (optional)" className="mt-4">
                    <Textarea
                      rows={2}
                      value={draft.car.features}
                      onChange={(e) => set('car', 'features', e.target.value)}
                      placeholder="Sunroof, touchscreen, rear camera, new tyres"
                      maxLength={300}
                    />
                  </Field>
                </div>

                {/* 3 — documents */}
                <div className="panel p-5 sm:p-6">
                  <h3 className="text-[16px]">3 · Documents</h3>
                  <p className="mt-0.5 text-[12.5px] text-slate-400">
                    A clear photo or a PDF of each. Only you and the DelhiDrive team can see them.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <DocSlot
                      name="docs.rc"
                      label="RC — front"
                      hint="Registration certificate, owner name readable"
                      file={draft.docs.rc}
                      url={urls[draft.docs.rc?.ref]}
                      error={err('docs.rc')}
                      onPick={(f) => pickDoc('rc', 'rc', f)}
                      onClear={() => clearDoc('rc')}
                    />
                    <DocSlot
                      name="docs.rcBack"
                      label="RC — back (optional)"
                      hint="If your RC is a card with two sides"
                      file={draft.docs.rcBack}
                      url={urls[draft.docs.rcBack?.ref]}
                      onPick={(f) => pickDoc('rcBack', 'rc-back', f)}
                      onClear={() => clearDoc('rcBack')}
                    />
                    <DocSlot
                      name="docs.insurance"
                      label="Insurance policy"
                      hint="Current policy, first page with the dates"
                      file={draft.docs.insurance}
                      url={urls[draft.docs.insurance?.ref]}
                      error={err('docs.insurance')}
                      onPick={(f) => pickDoc('insurance', 'insurance', f)}
                      onClear={() => clearDoc('insurance')}
                    />
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div data-field="insurance.validTill">
                      <Field label="Insurance valid till" error={err('insurance.validTill')}>
                        <Input
                          type="date"
                          value={draft.insurance.validTill}
                          onChange={(e) => set('insurance', 'validTill', e.target.value)}
                        />
                      </Field>
                    </div>
                    <Field label="Type of cover (optional)">
                      <Select value={draft.insurance.type} onChange={(e) => set('insurance', 'type', e.target.value)}>
                        <option value="">Choose…</option>
                        {INSURANCE_TYPES.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                </div>

                {/* 4 — photos */}
                <div className="panel p-5 sm:p-6">
                  <h3 className="mb-3 text-[16px]">4 · Photos of the car</h3>
                  <PhotoGrid
                    photos={draft.photos}
                    urls={urls}
                    error={err('photos') || err('uploads')}
                    onAdd={addPhotos}
                    onRemove={removePhoto}
                  />
                </div>

                {/* submit */}
                <div className="panel p-5 sm:p-6">
                  <div data-field="declared">
                    <Checkbox
                      checked={draft.declared}
                      onChange={(v) => {
                        setDraft((d) => ({ ...d, declared: v }));
                        setErrors((e) => ({ ...e, declared: undefined }));
                      }}
                      label={
                        <>
                          I am the registered owner of this car, or have the owner&rsquo;s permission to list it, and
                          these details and documents are genuine. I agree to DelhiDrive storing them to review my
                          application and contacting me about it, as described in the{' '}
                          <a
                            href={`${import.meta.env.BASE_URL}privacy.html`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-300 underline-offset-2 hover:underline"
                          >
                            privacy policy
                          </a>
                          .
                        </>
                      }
                    />
                    {err('declared') && <p className="mt-1.5 text-[11.5px] text-rose-300">{err('declared')}</p>}
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <Button
                      size="lg"
                      icon={Send}
                      onClick={submit}
                      loading={submitting}
                      disabled={submitting}
                      data-testid="host-submit"
                    >
                      {draft.replaces ? 'Send again for review' : 'Submit application'}
                    </Button>
                    <p className="text-[12px] leading-relaxed text-slate-500">
                      WhatsApp opens next, with a message to our team ready to send.
                    </p>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {!supabaseReady && (
        <p className="mt-8 flex items-start gap-2 text-[11.5px] leading-relaxed text-slate-600">
          <Info size={13} className="mt-0.5 shrink-0" />
          Supabase is not configured, so applications on this page are kept in this browser only.
        </p>
      )}
    </div>
  );
}
