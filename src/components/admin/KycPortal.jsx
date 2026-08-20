// KYC verification portal — admin side (module 6).

import { useState } from 'react';
import { ShieldCheck, XCircle, IdCard, Clock3, Search, ExternalLink } from 'lucide-react';
import { useStore } from '../../lib/store';
import { useNotify } from '../../lib/notify';
import { fmtDateTime, cx } from '../../lib/format';
import { Button, Badge, Empty, Input, Modal, Textarea, Tabs } from '../ui';

const TONE = { Verified: 'success', 'Pending Review': 'warning', Rejected: 'danger' };

export default function KycPortal() {
  const { kycDocs, patchKyc, bookings, patchBooking } = useStore();
  const { push, toast } = useNotify();
  const [filter, setFilter] = useState('Pending Review');
  const [q, setQ] = useState('');
  const [preview, setPreview] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');

  const counts = {
    all: kycDocs.length,
    'Pending Review': kycDocs.filter((k) => k.status === 'Pending Review').length,
    Verified: kycDocs.filter((k) => k.status === 'Verified').length,
    Rejected: kycDocs.filter((k) => k.status === 'Rejected').length,
  };

  const visible = kycDocs
    .filter((k) => (filter === 'all' ? true : k.status === filter))
    .filter((k) =>
      `${k.name} ${k.email} ${k.licenceNo} ${k.aadhaarNo}`.toLowerCase().includes(q.toLowerCase())
    )
    .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));

  const decide = async (doc, status, why = '') => {
    try {
      await patchKyc(doc.id, { status, reason: why, reviewedAt: Date.now() });
      // Keep every booking's KYC snapshot in step with the profile decision.
      await Promise.all(
        bookings
          .filter((b) => b.userId === doc.userId && b.kycStatus !== status)
          .map((b) => patchBooking(b.id, { kycStatus: status }))
      );
      push(
        status === 'Verified' ? 'KYC approved' : 'KYC rejected',
        `${doc.name || doc.email} — ${status}${why ? ` · ${why}` : ''}`,
        { type: status === 'Verified' ? 'success' : 'warning' }
      );
      setRejecting(null);
      setReason('');
    } catch (err) {
      toast(err.message || 'Could not update this profile.', { type: 'error' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[16px]">KYC verification portal</h3>
          <p className="mt-0.5 text-[12.5px] text-slate-400">
            Review uploaded driving licences and Aadhaar cards. Approve or reject in one click.
          </p>
        </div>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or licence" className="w-56 pl-9" />
        </div>
      </div>

      <Tabs
        className="max-w-2xl"
        value={filter}
        onChange={setFilter}
        tabs={[
          { id: 'Pending Review', label: 'Pending', icon: Clock3, count: counts['Pending Review'] },
          { id: 'Verified', label: 'Verified', icon: ShieldCheck, count: counts.Verified },
          { id: 'Rejected', label: 'Rejected', icon: XCircle, count: counts.Rejected },
          { id: 'all', label: 'All', icon: IdCard, count: counts.all },
        ]}
      />

      {visible.length === 0 ? (
        <Empty
          icon={IdCard}
          title={filter === 'Pending Review' ? 'Nothing waiting for review' : 'No profiles here'}
          body="Customer KYC submissions land here the moment they upload their documents."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((doc) => (
            <div key={doc.id} className="panel p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-white">{doc.name || 'Unnamed'}</p>
                  <p className="truncate text-[12px] text-slate-500">{doc.email}</p>
                </div>
                <Badge tone={TONE[doc.status] || 'neutral'}>{doc.status}</Badge>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {['licence', 'aadhaar'].map((key) => (
                  <button
                    key={key}
                    onClick={() => doc[key] && setPreview({ src: doc[key], label: key, doc })}
                    className="group relative h-28 overflow-hidden rounded-xl border border-white/10 bg-ink-950"
                  >
                    {doc[key] ? (
                      <>
                        <img src={doc[key]} alt={key} className="h-full w-full object-cover" />
                        <span className="absolute inset-0 grid place-items-center bg-ink-950/60 opacity-0 transition group-hover:opacity-100">
                          <ExternalLink size={16} className="text-white" />
                        </span>
                      </>
                    ) : (
                      <span className="grid h-full place-items-center text-[11px] text-slate-600">
                        Not uploaded
                      </span>
                    )}
                    <span className="absolute bottom-1.5 left-1.5 rounded bg-ink-950/85 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-slate-300">
                      {key === 'licence' ? 'Driving licence' : 'Aadhaar'}
                    </span>
                  </button>
                ))}
              </div>

              <dl className="mt-3 space-y-1 text-[12px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Licence no.</dt>
                  <dd className="font-mono text-white">{doc.licenceNo || '—'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Aadhaar no.</dt>
                  <dd className="font-mono text-white">
                    {doc.aadhaarNo ? `XXXX XXXX ${String(doc.aadhaarNo).replace(/\s/g, '').slice(-4)}` : '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Submitted</dt>
                  <dd className="text-slate-300">{doc.submittedAt ? fmtDateTime(doc.submittedAt) : '—'}</dd>
                </div>
                {doc.reason && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Reason</dt>
                    <dd className="text-right text-rose-300">{doc.reason}</dd>
                  </div>
                )}
              </dl>

              {doc.status !== 'Verified' && (
                <div className="mt-3.5 flex gap-2 border-t border-white/[0.07] pt-3.5">
                  <Button
                    size="sm"
                    variant="success"
                    icon={ShieldCheck}
                    className="flex-1"
                    onClick={() => decide(doc, 'Verified')}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    icon={XCircle}
                    className="flex-1"
                    onClick={() => setRejecting(doc)}
                  >
                    Reject
                  </Button>
                </div>
              )}
              {doc.status === 'Verified' && (
                <div className="mt-3.5 border-t border-white/[0.07] pt-3.5">
                  <Button size="sm" variant="ghost" onClick={() => setRejecting(doc)}>
                    Revoke verification
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        size="md"
        title={preview?.label === 'licence' ? 'Driving licence' : 'Aadhaar card'}
        subtitle={preview?.doc?.name}
      >
        {preview && (
          <img src={preview.src} alt={preview.label} className="w-full rounded-xl border border-white/10" />
        )}
      </Modal>

      <Modal
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        size="sm"
        title="Reject this submission"
        subtitle={rejecting?.name || rejecting?.email}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={() => decide(rejecting, 'Rejected', reason.trim() || 'Documents could not be verified.')}
            >
              Reject
            </Button>
          </div>
        }
      >
        <p className="mb-3 text-[12.5px] text-slate-400">
          The customer sees this reason on their dashboard and can re-upload.
        </p>
        <Textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Licence scan is blurred — please re-upload in better light."
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[
            'Licence scan is unreadable',
            'Aadhaar does not match the name',
            'Licence has expired',
            'Held less than 12 months',
          ].map((r) => (
            <button
              key={r}
              onClick={() => setReason(r)}
              className="chip transition hover:border-brand-400/40 hover:text-brand-200"
            >
              {r}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
