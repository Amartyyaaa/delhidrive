// Host management — the admin side of Host Your Car.
//
// Every car a vendor offers lands here as Pending. An admin looks over the
// details, documents and photos, then approves it — which publishes it to the
// fleet, and so to the website and the app — or rejects it with a reason the
// vendor sees. Until it is approved, nothing about the car is public.

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CarFront,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  FileText,
  ImageOff,
  Inbox,
  MessageCircle,
  Phone,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useStore } from '../../lib/store';
import { useAuth } from '../../lib/auth';
import { useNotify } from '../../lib/notify';
import { COL, publishPrivateFile, tableExists } from '../../lib/db';
import { useFileUrls, openFile } from '../../lib/useFileUrls';
import { customerWhatsappUrl, hostDecisionMessage } from '../../lib/whatsapp';
import {
  HOST_STATUS,
  REJECTION_REASONS,
  carTitle,
  fleetIdFor,
  isPdfRef,
  listingDefaults,
  plateKey,
  slab12h,
  toFleetCar,
  withOwnFiles,
} from '../../lib/host';
import { CATEGORIES, TRANSMISSIONS, FUELS, TERRAINS } from '../../data/fleet';
import { LOCATIONS } from '../../lib/pricing';
import { fmtDate, fmtDateTime, inr, cx } from '../../lib/format';
import { Button, Badge, Checkbox, Empty, Field, Input, Modal, Row, Select, Tabs, Textarea } from '../ui';

const TONE = {
  [HOST_STATUS.pending]: 'warning',
  [HOST_STATUS.approved]: 'success',
  [HOST_STATUS.rejected]: 'danger',
};

const DAY = 86400000;

/** Problems worth an admin's attention before they decide. */
function warningsFor(app, { fleet, applications }) {
  const out = [];
  const till = app.insurance?.validTill ? new Date(`${app.insurance.validTill}T23:59:59`).getTime() : 0;
  if (till && till < Date.now()) {
    out.push({ tone: 'danger', text: `Insurance expired on ${fmtDate(till)}` });
  } else if (till && till - Date.now() < 30 * DAY) {
    out.push({ tone: 'warning', text: `Insurance runs out on ${fmtDate(till)}` });
  }
  if (app.insurance?.type === 'Third party only') {
    out.push({ tone: 'warning', text: 'Third-party cover only' });
  }

  const key = plateKey(app.car?.plate);
  const inFleet = fleet.find((c) => plateKey(c.plate) === key && c.id !== app.fleetId);
  if (key && inFleet) out.push({ tone: 'warning', text: `Same registration number as ${inFleet.name} in the fleet` });
  const twin = applications.find(
    (a) =>
      a.id !== app.id &&
      a.id !== app.replaces &&
      a.replaces !== app.id &&
      a.status !== HOST_STATUS.rejected &&
      plateKey(a.car?.plate) === key
  );
  if (key && twin) out.push({ tone: 'warning', text: `Also offered in ${twin.ref} by ${twin.host?.name || 'another account'}` });
  return out;
}

/** A photo or document tile. Pictures open in the viewer, PDFs in a new tab. */
function FileTile({ refId, url, label, onOpen, className }) {
  const pdf = isPdfRef(refId);
  return (
    <button
      type="button"
      onClick={() => (pdf ? openFile(url) : onOpen?.())}
      disabled={!url}
      className={cx(
        'group relative block overflow-hidden rounded-xl border border-white/10 bg-ink-950 text-left',
        'transition hover:border-brand-400/40 disabled:cursor-default',
        className
      )}
      title={pdf ? `Open ${label} (PDF)` : `View ${label}`}
    >
      {pdf ? (
        <span className="flex h-full flex-col items-center justify-center gap-1 pb-6 text-brand-300">
          <FileText size={20} />
          <span className="text-[11px] font-medium">Open PDF</span>
        </span>
      ) : url ? (
        <img src={url} alt={label} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span className="grid h-full place-items-center text-slate-700">
          <ImageOff size={18} />
        </span>
      )}
      <span className="absolute bottom-1.5 left-1.5 rounded bg-ink-950/85 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-slate-300">
        {label}
      </span>
    </button>
  );
}

export default function HostManager() {
  const { hostApplications: stored, patchHostApplication, fleet, saveCar, removeCar, bookings } = useStore();
  // Everything below works from applications whose files have been checked.
  const hostApplications = useMemo(() => stored.map(withOwnFiles), [stored]);
  const { user } = useAuth();
  const { toast, push } = useNotify();
  const who = user?.email || 'admin';

  const [filter, setFilter] = useState(HOST_STATUS.pending);
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const [viewer, setViewer] = useState(null); // { items: [{ ref, label }], index }
  const [approving, setApproving] = useState(null); // { id, listing, picked: [ref], cover: ref, rate12hSet }
  const [rejecting, setRejecting] = useState(null); // { id, reason, delist }
  const [toldAbout, setToldAbout] = useState(null); // { id, decided: { status, rejectionReason } }
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(true);

  useEffect(() => {
    let live = true;
    tableExists(COL.hostApplications).then((ok) => live && setReady(ok));
    return () => {
      live = false;
    };
  }, []);

  const byId = (id) => hostApplications.find((a) => a.id === id) || null;
  const open = byId(openId);
  const approvingApp = approving ? byId(approving.id) : null;
  const rejectingApp = rejecting ? byId(rejecting.id) : null;
  // The message is written from the decision just taken, not from the copy of
  // the application on screen — that takes a moment to catch up after saving.
  const telling = toldAbout && byId(toldAbout.id) ? { ...byId(toldAbout.id), ...toldAbout.decided } : null;

  const counts = useMemo(
    () => ({
      all: hostApplications.length,
      [HOST_STATUS.pending]: hostApplications.filter((a) => a.status === HOST_STATUS.pending).length,
      [HOST_STATUS.approved]: hostApplications.filter((a) => a.status === HOST_STATUS.approved).length,
      [HOST_STATUS.rejected]: hostApplications.filter((a) => a.status === HOST_STATUS.rejected).length,
    }),
    [hostApplications]
  );

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const plateNeedle = plateKey(needle);
    return hostApplications
      .filter((a) => filter === 'all' || a.status === filter)
      .filter((a) => {
        if (!needle) return true;
        const hay = `${a.ref} ${a.host?.name} ${a.host?.phone} ${a.host?.email} ${a.host?.city} ${carTitle(a)}`.toLowerCase();
        return hay.includes(needle) || (plateNeedle.length > 2 && plateKey(a.car?.plate).includes(plateNeedle));
      })
      .sort((a, b) => (b.submittedAt || b.createdAt || 0) - (a.submittedAt || a.createdAt || 0));
  }, [hostApplications, filter, q]);

  // Links for the cards on screen, plus every file of the application being read.
  const refs = useMemo(() => {
    const list = visible.map((a) => a.photos?.[0]?.ref);
    [open, approvingApp].filter(Boolean).forEach((a) => {
      list.push(...(a.photos || []).map((p) => p.ref), ...Object.values(a.docs || {}));
    });
    return list;
  }, [visible, open, approvingApp]);
  const urls = useFileUrls(refs);

  const listingOf = (app) => (app?.fleetId ? fleet.find((c) => c.id === app.fleetId) : null);
  const liveBookingsOn = (carId) =>
    bookings.filter(
      (b) => b.carId === carId && !['Cancelled', 'Rejected', 'Returned'].includes(b.status) && b.returnMs > Date.now()
    ).length;

  /* ---------------- approve ---------------- */
  const startApprove = (app) => {
    const photoRefs = (app.photos || []).map((p) => p.ref).filter((r) => !isPdfRef(r));
    setApproving({
      id: app.id,
      // Re-approving a car whose listing still exists starts from that listing.
      listing: listingOf(app)
        ? { ...listingDefaults(app), ...pickListing(listingOf(app)) }
        : listingDefaults(app),
      picked: photoRefs,
      cover: photoRefs[0] || '',
      rate12hSet: Boolean(listingOf(app)),
    });
  };

  const setListing = (key, value) =>
    setApproving((s) => {
      const listing = { ...s.listing, [key]: value };
      // Until someone types a 12-hour price, it follows the day rate.
      if (key === 'rate' && !s.rate12hSet) listing.rate12h = Number(value) > 0 ? slab12h(value) : '';
      return { ...s, listing, rate12hSet: s.rate12hSet || key === 'rate12h' };
    });

  const togglePhoto = (ref) =>
    setApproving((s) => {
      const picked = s.picked.includes(ref) ? s.picked.filter((r) => r !== ref) : [...s.picked, ref];
      return { ...s, picked, cover: picked.includes(s.cover) ? s.cover : picked[0] || '' };
    });

  const approve = async () => {
    const app = approvingApp;
    const { listing, picked, cover } = approving;
    const rate = Number(listing.rate);
    const problem = !String(listing.name).trim()
      ? 'Give the listing a name.'
      : !String(listing.brand).trim()
        ? 'Enter the brand.'
        : !(rate >= 100)
          ? 'Set the price per day.'
          : !(Number(listing.rate12h) > 0 && Number(listing.rate12h) <= rate)
            ? 'The 12-hour price must be above zero and no more than the day price.'
            : !(Number(listing.deposit) >= 0)
              ? 'Enter the refundable deposit.'
              : !picked.length
                ? 'Choose at least one photo for the listing.'
                : '';
    if (problem) {
      toast(problem, { type: 'warning' });
      return;
    }

    setBusy(true);
    try {
      const id = fleetIdFor(app);
      const ordered = [cover, ...picked.filter((r) => r !== cover)];
      // A fresh folder each time, so a re-approved car never shows a cached old photo.
      const stamp = Date.now().toString(36);
      const photos = await Promise.all(
        ordered.map((ref, i) => publishPrivateFile(ref, `hosted/${id}/${stamp}-${i + 1}.jpg`))
      );

      await saveCar(toFleetCar(listing, { id, applicationId: app.id, photos }));
      await patchHostApplication(app.id, {
        status: HOST_STATUS.approved,
        fleetId: id,
        reviewedAt: Date.now(),
        reviewedBy: who,
        listedAt: Date.now(),
        rejectionReason: '',
        delistedAt: null,
      });

      push('Car approved · now live', `${listing.name} · ${inr(rate)}/day is on the website and the app.`, {
        type: 'success',
      });
      setApproving(null);
      setOpenId(null);
      setToldAbout({ id: app.id, decided: { status: HOST_STATUS.approved, rejectionReason: '', delistedAt: null } });
    } catch (err) {
      console.error(err);
      toast(err.message || 'Could not publish this car. Nothing was changed — try again.', { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  /* ---------------- reject / take down ---------------- */
  const reject = async () => {
    const app = rejectingApp;
    const why = rejecting.reason.trim();
    if (!why) {
      toast('Give the host a reason — they will see it.', { type: 'warning' });
      return;
    }
    setBusy(true);
    try {
      // Take the listing down first: if the second step fails the car is at
      // least no longer public, and pressing the button again finishes the job.
      if (app.fleetId && listingOf(app)) await removeCar(app.fleetId);
      const delistedAt = rejecting.delist ? Date.now() : null;
      await patchHostApplication(app.id, {
        status: HOST_STATUS.rejected,
        rejectionReason: why,
        reviewedAt: Date.now(),
        reviewedBy: who,
        fleetId: '',
        delistedAt,
      });
      push(
        rejecting.delist ? 'Car taken off DelhiDrive' : 'Application rejected',
        `${carTitle(app)} · ${app.ref}. Tell the host next.`,
        { type: 'warning' }
      );
      setRejecting(null);
      setOpenId(null);
      setToldAbout({ id: app.id, decided: { status: HOST_STATUS.rejected, rejectionReason: why, delistedAt } });
    } catch (err) {
      toast(err.message || 'Could not update this application.', { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  /* ---------------- tell the host ---------------- */
  const copyMessage = async (app) => {
    try {
      await navigator.clipboard.writeText(hostDecisionMessage(app));
      toast('Message copied — paste it into WhatsApp or SMS.', { type: 'success' });
    } catch {
      toast('Could not copy. Select the text and copy it by hand.', { type: 'error' });
    }
  };

  const markTold = (app) => {
    patchHostApplication(app.id, { notifiedAt: Date.now(), notifiedBy: who }).catch(() => {
      /* the message went out; the timestamp is only a convenience */
    });
    setToldAbout(null);
  };

  const openViewer = (app, ref) => {
    const items = [
      ...(app.photos || []).map((p, i) => ({ ref: p.ref, label: `Photo ${i + 1}` })),
      { ref: app.docs?.rc, label: 'RC — front' },
      { ref: app.docs?.rcBack, label: 'RC — back' },
      { ref: app.docs?.insurance, label: 'Insurance' },
    ].filter((it) => it.ref && !isPdfRef(it.ref));
    setViewer({ items, index: Math.max(0, items.findIndex((it) => it.ref === ref)) });
  };

  const openWarnings = open ? warningsFor(open, { fleet, applications: hostApplications }) : [];
  const openListing = listingOf(open);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[16px]">Host management</h3>
          <p className="mt-0.5 text-[12.5px] text-slate-400">
            Cars offered at <span className="text-slate-300">/host-your-car</span>. Approving one puts it live on the
            website and the app; pending and rejected cars are never public.
          </p>
        </div>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, phone, number plate, ref"
            className="w-64 pl-9"
          />
        </div>
      </div>

      {!ready && (
        <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-[12.5px] leading-relaxed text-amber-200">
          Host registration is switched off: the database has not been set up for it yet. Run{' '}
          <code className="text-amber-100">supabase-host-your-car.sql</code> in the Supabase SQL Editor, then reload
          this page.
        </p>
      )}

      <Tabs
        className="max-w-2xl"
        value={filter}
        onChange={setFilter}
        tabs={[
          { id: HOST_STATUS.pending, label: 'Pending', icon: Clock3, count: counts[HOST_STATUS.pending] },
          { id: HOST_STATUS.approved, label: 'Approved', icon: ShieldCheck, count: counts[HOST_STATUS.approved] },
          { id: HOST_STATUS.rejected, label: 'Rejected', icon: XCircle, count: counts[HOST_STATUS.rejected] },
          { id: 'all', label: 'All', icon: Inbox, count: counts.all },
        ]}
      />

      {visible.length === 0 ? (
        <Empty
          icon={CarFront}
          title={
            q
              ? 'No applications match that search'
              : filter === HOST_STATUS.pending
                ? 'Nothing waiting for review'
                : 'No applications here'
          }
          body="A car offered on the Host your car page appears here the moment it is submitted."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {visible.map((app) => {
            const warnings = warningsFor(app, { fleet, applications: hostApplications });
            const gone = app.status === HOST_STATUS.approved && !listingOf(app);
            return (
              <article key={app.id} className="panel flex gap-3.5 p-3.5" data-testid="host-row" data-ref={app.ref}>
                <button
                  type="button"
                  onClick={() => setOpenId(app.id)}
                  className="h-20 w-24 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-ink-950 sm:h-24 sm:w-32"
                  aria-label={`Review ${carTitle(app)}`}
                >
                  {urls[app.photos?.[0]?.ref] ? (
                    <img src={urls[app.photos[0].ref]} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full place-items-center text-slate-700">
                      <CarFront size={22} />
                    </span>
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-white">
                        {carTitle(app)}
                        {app.car?.year ? <span className="font-normal text-slate-400"> · {app.car.year}</span> : null}
                      </p>
                      <p className="truncate text-[12px] text-slate-400">
                        <span className="font-mono text-slate-300">{app.car?.plate}</span> · {app.car?.fuel} ·{' '}
                        {app.car?.transmission}
                      </p>
                    </div>
                    <Badge tone={TONE[app.status] || 'neutral'}>{app.status}</Badge>
                  </div>

                  <p className="mt-1.5 truncate text-[12px] text-slate-300">
                    {app.host?.name} · {app.host?.phone}
                    {app.host?.city ? <span className="text-slate-500"> · {app.host.city}</span> : null}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {app.ref} · {fmtDateTime(app.submittedAt || app.createdAt)}
                    {app.replaces ? ' · re-submission' : ''}
                  </p>

                  {(warnings.length > 0 || gone) && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {gone && (
                        <Badge tone="danger" icon={AlertTriangle}>
                          Listing missing from the fleet
                        </Badge>
                      )}
                      {warnings.map((w) => (
                        <Badge key={w.text} tone={w.tone} icon={AlertTriangle}>
                          {w.text}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <Button size="sm" onClick={() => setOpenId(app.id)}>
                      {app.status === HOST_STATUS.pending ? 'Review' : 'View'}
                    </Button>
                    <Button
                      as="a"
                      href={customerWhatsappUrl(app.host?.phone, `Hello ${String(app.host?.name || '').split(' ')[0]}, this is DelhiDrive about your host application ${app.ref}.`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      size="sm"
                      variant="ghost"
                      icon={MessageCircle}
                    >
                      WhatsApp
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ---------------- the application ---------------- */}
      <Modal
        open={Boolean(open)}
        onClose={() => setOpenId(null)}
        size="xl"
        title={open ? `${carTitle(open)} · ${open.car?.plate || ''}` : ''}
        subtitle={open ? `${open.ref} · offered by ${open.host?.name} · ${fmtDateTime(open.submittedAt || open.createdAt)}` : ''}
        footer={
          open && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                as="a"
                href={customerWhatsappUrl(open.host?.phone, `Hello ${String(open.host?.name || '').split(' ')[0]}, this is DelhiDrive about your host application ${open.ref}.`)}
                target="_blank"
                rel="noopener noreferrer"
                variant="ghost"
                icon={MessageCircle}
                aria-label="Message host on WhatsApp"
              >
                <span className="hidden sm:inline">Message host</span>
              </Button>
              <div className="flex flex-wrap gap-2">
                {open.status === HOST_STATUS.approved ? (
                  <>
                    {!openListing && (
                      <Button variant="success" icon={ShieldCheck} onClick={() => startApprove(open)}>
                        Publish again
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      icon={Trash2}
                      onClick={() => setRejecting({ id: open.id, reason: 'This car is no longer listed on DelhiDrive', delist: true })}
                    >
                      Take off DelhiDrive
                    </Button>
                  </>
                ) : (
                  <>
                    {open.status === HOST_STATUS.pending && (
                      <Button
                        variant="danger"
                        icon={XCircle}
                        onClick={() => setRejecting({ id: open.id, reason: '', delist: false })}
                        data-testid="host-reject"
                      >
                        Reject
                      </Button>
                    )}
                    <Button variant="success" icon={ShieldCheck} onClick={() => startApprove(open)} data-testid="host-approve">
                      Approve…
                    </Button>
                  </>
                )}
              </div>
            </div>
          )
        }
      >
        {open && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.25fr_1fr]">
            <div className="space-y-5">
              <section>
                <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                  Car photos · {(open.photos || []).length}
                </h4>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {(open.photos || []).map((p, i) => (
                    <FileTile
                      key={p.ref}
                      refId={p.ref}
                      url={urls[p.ref]}
                      label={`${i + 1}`}
                      className="aspect-[4/3]"
                      onOpen={() => openViewer(open, p.ref)}
                    />
                  ))}
                </div>
              </section>

              <section>
                <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-400">Documents</h4>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ['rc', 'RC — front'],
                    ['rcBack', 'RC — back'],
                    ['insurance', 'Insurance'],
                  ]
                    .filter(([key]) => open.docs?.[key])
                    .map(([key, label]) => (
                      <FileTile
                        key={key}
                        refId={open.docs[key]}
                        url={urls[open.docs[key]]}
                        label={label}
                        className="aspect-[4/3]"
                        onOpen={() => openViewer(open, open.docs[key])}
                      />
                    ))}
                </div>
              </section>
            </div>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={TONE[open.status] || 'neutral'}>{open.status}</Badge>
                {open.replaces && <Badge tone="info">Re-submission</Badge>}
                {open.status === HOST_STATUS.approved &&
                  (openListing ? (
                    <Badge tone="success" icon={CheckCircle2}>
                      Live · {inr(openListing.rate)}/day
                    </Badge>
                  ) : (
                    <Badge tone="danger" icon={AlertTriangle}>
                      Listing missing from the fleet
                    </Badge>
                  ))}
              </div>

              {openWarnings.map((w) => (
                <p
                  key={w.text}
                  className={cx(
                    'flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-[12.5px]',
                    w.tone === 'danger'
                      ? 'border-rose-400/30 bg-rose-500/10 text-rose-200'
                      : 'border-amber-400/30 bg-amber-500/10 text-amber-200'
                  )}
                >
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {w.text}
                </p>
              ))}

              {open.status === HOST_STATUS.rejected && open.rejectionReason && (
                <p className="rounded-xl border border-rose-400/25 bg-rose-500/[0.08] px-3.5 py-2.5 text-[12.5px] text-rose-200">
                  Rejected: {open.rejectionReason}
                </p>
              )}

              <section className="panel-tight p-4">
                <h4 className="mb-1 text-[13px] font-semibold text-white">Host</h4>
                <Row k="Name" v={open.host?.name || '—'} />
                <Row
                  k="Mobile"
                  v={
                    <a href={`tel:+91${open.host?.phone}`} className="inline-flex items-center gap-1.5 text-brand-200 hover:text-brand-100">
                      <Phone size={12} /> {open.host?.phone}
                    </a>
                  }
                />
                <Row k="Email" v={<span className="break-all font-normal">{open.host?.email || '—'}</span>} />
                <Row k="Car parked at" v={open.host?.city || '—'} />
                {open.host?.address && <Row k="Address" v={<span className="font-normal">{open.host.address}</span>} />}
              </section>

              <section className="panel-tight p-4">
                <h4 className="mb-1 text-[13px] font-semibold text-white">Car</h4>
                <Row k="Make and model" v={carTitle(open)} />
                <Row k="Registration" v={<span className="font-mono">{open.car?.plate}</span>} />
                <Row k="Year" v={open.car?.year || '—'} />
                <Row k="Type" v={open.car?.category || '—'} />
                <Row k="Fuel · gearbox" v={`${open.car?.fuel || '—'} · ${open.car?.transmission || '—'}`} />
                <Row k="Seats" v={open.car?.seats || '—'} />
                <Row k="Colour" v={open.car?.colour || '—'} />
                <Row k="Driven" v={open.car?.kmDriven != null ? `${Number(open.car.kmDriven).toLocaleString('en-IN')} km` : '—'} />
                <Row k="Rent the host expects" v={open.car?.expectedRate ? `${inr(open.car.expectedRate)}/day` : 'Not said'} />
                {open.car?.features && (
                  <p className="mt-2 border-t border-white/[0.07] pt-2 text-[12.5px] leading-relaxed text-slate-400">
                    {open.car.features}
                  </p>
                )}
              </section>

              <section className="panel-tight p-4">
                <h4 className="mb-1 text-[13px] font-semibold text-white">Insurance</h4>
                <Row k="Cover" v={open.insurance?.type || 'Not said'} />
                <Row k="Valid till" v={open.insurance?.validTill ? fmtDate(`${open.insurance.validTill}T12:00:00`) : '—'} />
              </section>

              {open.reviewedAt && (
                <p className="text-[11.5px] text-slate-500">
                  Decided {fmtDateTime(open.reviewedAt)} by {open.reviewedBy || 'admin'}
                  {open.notifiedAt ? ` · host told ${fmtDateTime(open.notifiedAt)}` : ' · host not told yet'}
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ---------------- photo viewer ---------------- */}
      <Modal
        open={Boolean(viewer)}
        onClose={() => setViewer(null)}
        size="xl"
        title={viewer ? viewer.items[viewer.index]?.label : ''}
        subtitle={viewer ? `${viewer.index + 1} of ${viewer.items.length}` : ''}
      >
        {viewer && viewer.items[viewer.index] && (
          <div className="relative">
            <img
              src={urls[viewer.items[viewer.index].ref]}
              alt={viewer.items[viewer.index].label}
              className="mx-auto max-h-[66vh] rounded-xl border border-white/10 object-contain"
            />
            {viewer.items.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous"
                  onClick={() => setViewer((v) => ({ ...v, index: (v.index - 1 + v.items.length) % v.items.length }))}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-ink-950/85 p-2 text-white transition hover:bg-ink-900"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  aria-label="Next"
                  onClick={() => setViewer((v) => ({ ...v, index: (v.index + 1) % v.items.length }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-ink-950/85 p-2 text-white transition hover:bg-ink-900"
                >
                  <ChevronRight size={18} />
                </button>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* ---------------- approve and publish ---------------- */}
      <Modal
        open={Boolean(approvingApp)}
        onClose={() => !busy && setApproving(null)}
        size="lg"
        title="Approve and publish"
        subtitle={approvingApp ? `${carTitle(approvingApp)} · ${approvingApp.car?.plate} · ${approvingApp.ref}` : ''}
        footer={
          <div className="flex flex-wrap items-center justify-end gap-3 sm:justify-between">
            <p className="hidden text-[12px] text-slate-500 sm:block">Goes live on the website and the app straight away.</p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setApproving(null)} disabled={busy}>
                Cancel
              </Button>
              <Button variant="success" icon={ShieldCheck} onClick={approve} loading={busy} disabled={busy} data-testid="host-publish">
                Approve and go live
              </Button>
            </div>
          </div>
        }
      >
        {approvingApp && approving && (
          <div className="space-y-5">
            <section>
              <p className="label">Price</p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div data-field="listing.rate">
                  <Field label="Per day / 24h (₹)" hint={approvingApp.car?.expectedRate ? `Host expects ${inr(approvingApp.car.expectedRate)}` : 'Host gave no figure'}>
                    <Input type="number" min="0" value={approving.listing.rate} onChange={(e) => setListing('rate', e.target.value)} />
                  </Field>
                </div>
                <div data-field="listing.rate12h">
                  <Field label="12-hour slab (₹)">
                    <Input type="number" min="0" value={approving.listing.rate12h} onChange={(e) => setListing('rate12h', e.target.value)} />
                  </Field>
                </div>
                <Field label="Deposit (₹)">
                  <Input type="number" min="0" value={approving.listing.deposit} onChange={(e) => setListing('deposit', e.target.value)} />
                </Field>
                <Field label="Extra km (₹/km)">
                  <Input type="number" min="0" value={approving.listing.extraKmCharge} onChange={(e) => setListing('extraKmCharge', e.target.value)} />
                </Field>
              </div>
            </section>

            <section>
              <div className="mb-1.5 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
                <p className="label mb-0">Photos for the listing</p>
                <p className="text-[11.5px] text-slate-500">
                  {approving.picked.length} of {(approvingApp.photos || []).length} chosen · tap to leave one out · the star is
                  the cover
                </p>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {(approvingApp.photos || []).map((p, i) => {
                  const on = approving.picked.includes(p.ref);
                  const cover = approving.cover === p.ref;
                  return (
                    <div
                      key={p.ref}
                      className={cx(
                        'relative aspect-[4/3] overflow-hidden rounded-xl border transition',
                        on ? 'border-brand-400/60' : 'border-white/10 opacity-40'
                      )}
                    >
                      <button type="button" onClick={() => togglePhoto(p.ref)} className="block h-full w-full" aria-label={`${on ? 'Leave out' : 'Include'} photo ${i + 1}`}>
                        {urls[p.ref] && <img src={urls[p.ref]} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />}
                      </button>
                      {on && (
                        <button
                          type="button"
                          onClick={() => setApproving((s) => ({ ...s, cover: p.ref }))}
                          aria-label={`Make photo ${i + 1} the cover`}
                          className={cx(
                            'absolute right-1.5 top-1.5 rounded-lg p-1.5 transition',
                            cover ? 'bg-saffron-500 text-ink-950' : 'bg-ink-950/85 text-slate-400 hover:text-white'
                          )}
                        >
                          <Star size={12} className={cover ? 'fill-current' : ''} />
                        </button>
                      )}
                      {cover && (
                        <span className="absolute bottom-1.5 left-1.5 rounded bg-saffron-500 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-ink-950">
                          Cover
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section>
              <p className="label">Listing</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Name on the site" className="sm:col-span-2">
                  <Input value={approving.listing.name} onChange={(e) => setListing('name', e.target.value)} maxLength={60} />
                </Field>
                <Field label="Brand">
                  <Input value={approving.listing.brand} onChange={(e) => setListing('brand', e.target.value)} maxLength={40} />
                </Field>
                <Field label="Category">
                  <Select value={approving.listing.category} onChange={(e) => setListing('category', e.target.value)}>
                    {CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Transmission">
                  <Select value={approving.listing.transmission} onChange={(e) => setListing('transmission', e.target.value)}>
                    {TRANSMISSIONS.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Fuel">
                  <Select value={approving.listing.fuel} onChange={(e) => setListing('fuel', e.target.value)}>
                    {FUELS.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Registration plate">
                  <Input value={approving.listing.plate} onChange={(e) => setListing('plate', e.target.value.toUpperCase())} />
                </Field>
                <Field label="Home hub">
                  <Select value={approving.listing.hub} onChange={(e) => setListing('hub', e.target.value)}>
                    {LOCATIONS.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Seats">
                  <Input type="number" min="2" max="9" value={approving.listing.seats} onChange={(e) => setListing('seats', e.target.value)} />
                </Field>
                <Field label={approving.listing.fuel === 'EV' ? 'Range (km)' : 'Mileage (kmpl)'}>
                  <Input type="number" step="0.1" min="0" value={approving.listing.mileage} onChange={(e) => setListing('mileage', e.target.value)} />
                </Field>
                <Field label="Engine (cc)">
                  <Input type="number" min="0" value={approving.listing.engineCc} onChange={(e) => setListing('engineCc', e.target.value)} />
                </Field>
                <Field label="Boot (litres)">
                  <Input type="number" min="0" value={approving.listing.bootLitres} onChange={(e) => setListing('bootLitres', e.target.value)} />
                </Field>
              </div>
            </section>

            <Field label="Key features" hint="One per line — shown on the car's details.">
              <Textarea rows={3} value={approving.listing.featuresText} onChange={(e) => setListing('featuresText', e.target.value)} />
            </Field>

            <div>
              <p className="label">Suited terrain</p>
              <div className="flex flex-wrap gap-1.5">
                {TERRAINS.map((t) => {
                  const on = (approving.listing.terrain || []).includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() =>
                        setListing('terrain', on ? approving.listing.terrain.filter((x) => x !== t) : [...(approving.listing.terrain || []), t])
                      }
                      className={cx(
                        'rounded-full border px-3 py-1.5 text-[12px] font-medium transition',
                        on ? 'border-brand-400/50 bg-brand-500/20 text-brand-100' : 'border-white/10 text-slate-400 hover:text-white'
                      )}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            <Checkbox
              checked={Boolean(approving.listing.zeroDep)}
              onChange={(v) => setListing('zeroDep', v)}
              label={`Zero-depreciation cover included${approvingApp.insurance?.type ? ` — the host says: ${approvingApp.insurance.type}` : ''}`}
            />

            <p className="text-[11.5px] leading-relaxed text-slate-500">
              The owner&rsquo;s name, phone and documents stay private. Everything here can be changed later in Fleet
              inventory.
            </p>
          </div>
        )}
      </Modal>

      {/* ---------------- reject / take down ---------------- */}
      <Modal
        open={Boolean(rejectingApp)}
        onClose={() => !busy && setRejecting(null)}
        size="sm"
        title={rejecting?.delist ? 'Take this car off DelhiDrive?' : 'Reject this application'}
        subtitle={rejectingApp ? `${carTitle(rejectingApp)} · ${rejectingApp.ref}` : ''}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setRejecting(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" className="flex-1" onClick={reject} loading={busy} disabled={busy} data-testid="host-reject-confirm">
              {rejecting?.delist ? 'Take it down' : 'Reject'}
            </Button>
          </div>
        }
      >
        {rejectingApp && rejecting && (
          <>
            {rejecting.delist ? (
              <p className="mb-3 text-[12.5px] leading-relaxed text-slate-400">
                It disappears from the website and the app straight away and the application is marked rejected. The
                host can apply again.
                {liveBookingsOn(rejectingApp.fleetId) > 0 && (
                  <strong className="mt-2 block text-amber-200">
                    {liveBookingsOn(rejectingApp.fleetId)} booking(s) for this car are still open — sort those out first.
                  </strong>
                )}
              </p>
            ) : (
              <p className="mb-3 text-[12.5px] text-slate-400">
                The host sees this reason on their status page and can fix it and apply again.
              </p>
            )}
            <Textarea
              rows={3}
              value={rejecting.reason}
              onChange={(e) => setRejecting((s) => ({ ...s, reason: e.target.value }))}
              placeholder="Why this car cannot be listed"
              maxLength={300}
            />
            {!rejecting.delist && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {REJECTION_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRejecting((s) => ({ ...s, reason: r }))}
                    className="chip text-left transition hover:border-brand-400/40 hover:text-brand-200"
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </Modal>

      {/* ---------------- tell the host ---------------- */}
      <Modal
        open={Boolean(telling)}
        onClose={() => setToldAbout(null)}
        size="lg"
        title="Tell the host"
        subtitle={telling ? `${telling.ref} · to ${telling.host?.name} on ${telling.host?.phone}` : ''}
        footer={
          telling && (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setToldAbout(null)}>
                Later
              </Button>
              <Button variant="secondary" icon={Copy} onClick={() => copyMessage(telling)}>
                Copy message
              </Button>
              <Button
                as="a"
                href={customerWhatsappUrl(telling.host?.phone, hostDecisionMessage(telling))}
                target="_blank"
                rel="noopener noreferrer"
                icon={MessageCircle}
                onClick={() => markTold(telling)}
                data-testid="host-tell"
              >
                Send on WhatsApp
              </Button>
            </div>
          )
        }
      >
        {telling && (
          <>
            <p className="mb-3 text-[12.5px] text-slate-400">
              Their status page has already updated. WhatsApp opens with this message ready to send to them.
            </p>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-ink-950/70 p-4 font-sans text-[12.5px] leading-relaxed text-slate-300">
              {hostDecisionMessage(telling)}
            </pre>
          </>
        )}
      </Modal>
    </div>
  );
}

/** The fields of an existing fleet car that the approve form edits. */
function pickListing(car) {
  const keys = [
    'name',
    'brand',
    'category',
    'transmission',
    'fuel',
    'seats',
    'mileage',
    'rate',
    'rate12h',
    'deposit',
    'extraKmCharge',
    'engineCc',
    'bootLitres',
    'plate',
    'hub',
    'colorHex',
    'terrain',
    'zeroDep',
  ];
  const out = {};
  keys.forEach((k) => {
    if (car[k] !== undefined) out[k] = car[k];
  });
  out.featuresText = (car.features || []).join('\n');
  return out;
}
