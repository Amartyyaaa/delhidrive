// Admin resolution workflow for support tickets (module 7).

import { useState } from 'react';
import { Wrench, Receipt, CalendarPlus, CircleHelp, MessageSquare, Search } from 'lucide-react';
import { useStore } from '../../lib/store';
import { useNotify } from '../../lib/notify';
import { toMillis } from '../../lib/db';
import { fmtDateTime, cx } from '../../lib/format';
import { Badge, Button, Empty, Input, Select, Tabs } from '../ui';
import { TicketThread, STATUS_TONE } from '../TicketsPanel';

const TYPE_ICON = { breakdown: Wrench, billing: Receipt, extend: CalendarPlus, other: CircleHelp };
const STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];

export default function AdminTickets() {
  const { tickets, patchTicket } = useStore();
  const { push, toast } = useNotify();
  const [filter, setFilter] = useState('Open');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);

  const counts = {
    all: tickets.length,
    Open: tickets.filter((t) => t.status === 'Open').length,
    'In Progress': tickets.filter((t) => t.status === 'In Progress').length,
    Resolved: tickets.filter((t) => t.status === 'Resolved').length,
  };

  const visible = tickets
    .filter((t) => (filter === 'all' ? true : t.status === filter))
    .filter((t) =>
      `${t.subject} ${t.customerName} ${t.customerEmail} ${t.bookingRef}`
        .toLowerCase()
        .includes(q.toLowerCase())
    )
    .sort((a, b) => {
      const pri = (t) => (t.priority === 'High' ? 0 : 1);
      return pri(a) - pri(b) || toMillis(b.createdAt) - toMillis(a.createdAt);
    });

  const reply = async (ticket, text) => {
    try {
      await patchTicket(ticket.id, {
        messages: [...(ticket.messages || []), { from: 'admin', author: 'DelhiDrive Ops', text, at: Date.now() }],
        status: ticket.status === 'Open' ? 'In Progress' : ticket.status,
      });
      push('Reply sent', `Responded to ${ticket.customerName} on "${ticket.subject}".`, { type: 'success' });
    } catch (err) {
      toast(err.message || 'Could not send the reply.', { type: 'error' });
    }
  };

  const setStatus = async (ticket, status) => {
    try {
      await patchTicket(ticket.id, { status, resolvedAt: status === 'Resolved' ? Date.now() : null });
    } catch (err) {
      toast(err.message || 'Could not update the status.', { type: 'error' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[16px]">Support ticket queue</h3>
          <p className="mt-0.5 text-[12.5px] text-slate-400">
            {counts.Open} open · {counts['In Progress']} in progress. High-priority breakdowns sort first.
          </p>
        </div>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tickets" className="w-56 pl-9" />
        </div>
      </div>

      <Tabs
        className="max-w-2xl"
        value={filter}
        onChange={setFilter}
        tabs={[
          { id: 'Open', label: 'Open', count: counts.Open },
          { id: 'In Progress', label: 'In progress', count: counts['In Progress'] },
          { id: 'Resolved', label: 'Resolved', count: counts.Resolved },
          { id: 'all', label: 'All', count: counts.all },
        ]}
      />

      {visible.length === 0 ? (
        <Empty
          icon={MessageSquare}
          title="Queue is clear"
          body="No tickets match this filter. Customer submissions appear here instantly."
        />
      ) : (
        <div className="space-y-2.5">
          {visible.map((t) => {
            const Icon = TYPE_ICON[t.type] || CircleHelp;
            const open = openId === t.id;
            return (
              <div key={t.id} className={cx('panel overflow-hidden', t.priority === 'High' && t.status !== 'Resolved' && 'border-rose-400/25')}>
                <button
                  onClick={() => setOpenId(open ? null : t.id)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-white/[0.03]"
                >
                  <span
                    className={cx(
                      'grid h-9 w-9 shrink-0 place-items-center rounded-xl',
                      t.priority === 'High' ? 'bg-rose-500/15 text-rose-300' : 'bg-white/[0.06] text-slate-400'
                    )}
                  >
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[13.5px] font-semibold text-white">{t.subject}</span>
                      <Badge tone={STATUS_TONE[t.status] || 'neutral'}>{t.status}</Badge>
                      {t.priority === 'High' && <Badge tone="danger">High</Badge>}
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-slate-500">
                      {t.customerName} · {t.customerEmail}
                      {t.bookingRef && ` · ${t.bookingRef} · ${t.carName}`}
                    </span>
                  </span>
                  <span className="hidden shrink-0 text-[11px] text-slate-600 sm:block">
                    {fmtDateTime(toMillis(t.createdAt))}
                  </span>
                </button>

                {open && (
                  <div className="border-t border-white/[0.07] bg-ink-950/40 px-4 py-4">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="text-[11.5px] text-slate-500">Set status</span>
                      <Select
                        value={t.status}
                        onChange={(e) => setStatus(t, e.target.value)}
                        className="w-auto py-1.5 text-[12px]"
                      >
                        {STATUSES.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </Select>
                      {t.status !== 'Resolved' && (
                        <Button size="sm" variant="success" onClick={() => setStatus(t, 'Resolved')}>
                          Mark resolved
                        </Button>
                      )}
                    </div>
                    <TicketThread ticket={t} onReply={(text) => reply(t, text)} asAdmin />
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
