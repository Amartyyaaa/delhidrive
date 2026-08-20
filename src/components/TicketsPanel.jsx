// In-app support tickets — customer side (module 7).

import { useState } from 'react';
import { LifeBuoy, Send, Plus, MessageSquare, Wrench, Receipt, CalendarPlus, CircleHelp } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useStore } from '../lib/store';
import { useNotify } from '../lib/notify';
import { toMillis } from '../lib/db';
import { fmtDateTime, cx } from '../lib/format';
import { Button, Badge, Field, Input, Textarea, Select, Empty } from './ui';

export const TICKET_TYPES = [
  { id: 'breakdown', label: 'Breakdown assistance', icon: Wrench, urgent: true },
  { id: 'billing', label: 'Billing query', icon: Receipt },
  { id: 'extend', label: 'Extend ongoing trip', icon: CalendarPlus },
  { id: 'other', label: 'Something else', icon: CircleHelp },
];

export const STATUS_TONE = {
  Open: 'warning',
  'In Progress': 'info',
  Resolved: 'success',
  Closed: 'neutral',
};

export function TicketThread({ ticket, onReply, canReply = true, asAdmin = false }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    await onReply(text.trim());
    setText('');
    setBusy(false);
  };

  return (
    <div className="space-y-2.5">
      <div className="max-h-64 space-y-2.5 overflow-y-auto pr-1">
        {(ticket.messages || []).map((m, i) => (
          <div key={i} className={cx('flex', m.from === 'admin' ? 'justify-start' : 'justify-end')}>
            <div
              className={cx(
                'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-relaxed',
                m.from === 'admin'
                  ? 'rounded-bl-sm border border-brand-400/25 bg-brand-500/10 text-slate-200'
                  : 'rounded-br-sm bg-white/[0.06] text-slate-300'
              )}
            >
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {m.from === 'admin' ? 'DelhiDrive operations' : m.author || 'You'}
                {' · '}
                {fmtDateTime(m.at)}
              </p>
              <p className="whitespace-pre-line">{m.text}</p>
            </div>
          </div>
        ))}
      </div>

      {canReply && ticket.status !== 'Closed' && (
        <div className="flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder={asAdmin ? 'Reply to the customer…' : 'Add a message…'}
          />
          <Button onClick={send} loading={busy} disabled={!text.trim() || busy} icon={Send}>
            Send
          </Button>
        </div>
      )}
    </div>
  );
}

export default function TicketsPanel() {
  const { user } = useAuth();
  const { myTickets, myBookings, createTicket, patchTicket } = useStore();
  const { toast, push } = useNotify();
  const [composing, setComposing] = useState(false);
  const [form, setForm] = useState({ type: 'breakdown', bookingId: '', subject: '', body: '' });
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState(null);

  const sorted = [...myTickets].sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

  const submit = async () => {
    if (!form.subject.trim() || !form.body.trim()) {
      toast('Add a subject and a description.', { type: 'warning' });
      return;
    }
    setBusy(true);
    try {
      const booking = myBookings.find((b) => b.id === form.bookingId);
      await createTicket({
        userId: user.uid,
        customerName: user.name,
        customerEmail: user.email,
        type: form.type,
        typeLabel: TICKET_TYPES.find((t) => t.id === form.type)?.label || 'Support',
        bookingId: form.bookingId || '',
        bookingRef: booking?.ref || '',
        carName: booking?.carName || '',
        subject: form.subject.trim(),
        status: 'Open',
        priority: form.type === 'breakdown' ? 'High' : 'Normal',
        messages: [
          { from: 'customer', author: user.name, text: form.body.trim(), at: Date.now() },
        ],
      });
      push('Support ticket raised', `We have logged "${form.subject.trim()}" and will respond shortly.`, {
        type: 'success',
      });
      setComposing(false);
      setForm({ type: 'breakdown', bookingId: '', subject: '', body: '' });
    } catch (err) {
      toast(err.message || 'Could not raise the ticket.', { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const reply = async (ticket, text) => {
    await patchTicket(ticket.id, {
      messages: [...(ticket.messages || []), { from: 'customer', author: user.name, text, at: Date.now() }],
      status: ticket.status === 'Resolved' ? 'Open' : ticket.status,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[16px]">Support tickets</h3>
          <p className="mt-0.5 text-[12.5px] text-slate-400">
            Breakdown help, billing questions or a trip extension — our operations team replies in the thread.
          </p>
        </div>
        <Button icon={Plus} onClick={() => setComposing((c) => !c)} variant={composing ? 'secondary' : 'primary'}>
          {composing ? 'Cancel' : 'New ticket'}
        </Button>
      </div>

      {composing && (
        <div className="panel space-y-4 p-5">
          <div>
            <p className="label">What do you need help with?</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {TICKET_TYPES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setForm((f) => ({ ...f, type: t.id }))}
                  className={cx(
                    'flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left transition',
                    form.type === t.id
                      ? 'border-brand-400/50 bg-brand-500/12'
                      : 'border-white/10 hover:border-white/25'
                  )}
                >
                  <t.icon size={15} className={form.type === t.id ? 'text-brand-300' : 'text-slate-500'} />
                  <span className="text-[13px] font-medium text-white">{t.label}</span>
                  {t.urgent && <Badge tone="danger" className="ml-auto">Urgent</Badge>}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Related booking (optional)">
              <Select
                value={form.bookingId}
                onChange={(e) => setForm((f) => ({ ...f, bookingId: e.target.value }))}
              >
                <option value="">Not about a specific booking</option>
                {myBookings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.ref} — {b.carName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Subject">
              <Input
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="Flat tyre near Dhaula Kuan"
              />
            </Field>
          </div>

          <Field label="Describe the issue">
            <Textarea
              rows={4}
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="Include your location, what happened and anything we should bring."
            />
          </Field>

          <div className="flex items-center gap-3">
            <Button onClick={submit} loading={busy} disabled={busy} icon={LifeBuoy}>
              Raise ticket
            </Button>
            {form.type === 'breakdown' && (
              <p className="text-[12px] text-amber-300">
                On the road right now? Call +91 11 4000 8080 as well — median response is 42 minutes.
              </p>
            )}
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <Empty
          icon={MessageSquare}
          title="No support tickets"
          body="When something needs attention — a breakdown, a billing question, an extension — raise it here and it stays tracked."
        />
      ) : (
        <div className="space-y-2.5">
          {sorted.map((t) => {
            const Icon = TICKET_TYPES.find((x) => x.id === t.type)?.icon || CircleHelp;
            const open = openId === t.id;
            return (
              <div key={t.id} className="panel overflow-hidden">
                <button
                  onClick={() => setOpenId(open ? null : t.id)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-white/[0.03]"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-slate-400">
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[13.5px] font-semibold text-white">{t.subject}</span>
                      <Badge tone={STATUS_TONE[t.status] || 'neutral'}>{t.status}</Badge>
                      {t.priority === 'High' && <Badge tone="danger">High priority</Badge>}
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-slate-500">
                      {t.typeLabel}
                      {t.bookingRef && ` · ${t.bookingRef} · ${t.carName}`}
                      {' · '}
                      {(t.messages || []).length} message{(t.messages || []).length !== 1 ? 's' : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-600">
                    {fmtDateTime(toMillis(t.createdAt))}
                  </span>
                </button>
                {open && (
                  <div className="border-t border-white/[0.07] bg-ink-950/40 px-4 py-4">
                    <TicketThread ticket={t} onReply={(text) => reply(t, text)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
