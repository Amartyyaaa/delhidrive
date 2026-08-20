// Floating AI support widget — DelhiDrive Copilot (module 5).

import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Sparkles, X, Send, Bot, RotateCcw, ArrowRight, Star } from 'lucide-react';
import { useStore } from '../lib/store';
import { answer, SUGGESTED_PROMPTS } from '../lib/ai';
import { inr, cx } from '../lib/format';
import CarArt from './CarArt';

const GREETING = {
  role: 'bot',
  text: "Namaste! I'm the DelhiDrive Copilot.\n\nI know every car in the fleet, the live tariffs, the insurance small print and all five pickup hubs. Tell me about your trip and I'll pick the right car — or ask me anything about pricing, documents or policies.",
  chips: SUGGESTED_PROMPTS.slice(0, 3),
};

function CarSuggestion({ pick, onClose }) {
  const { car, reasons } = pick;
  return (
    <Link
      to={`/checkout/${car.id}`}
      onClick={onClose}
      className="group flex gap-3 rounded-xl border border-white/10 bg-ink-950/60 p-2.5 transition hover:border-brand-400/40"
    >
      <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg border border-white/10">
        <CarArt car={car} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[12.5px] font-semibold text-white">{car.name}</p>
          <p className="shrink-0 text-[12px] font-bold text-brand-200">{inr(car.rate)}</p>
        </div>
        <p className="flex items-center gap-1 text-[10.5px] text-slate-500">
          <Star size={9} className="fill-saffron-400 text-saffron-400" />
          {car.rating} · {car.seats} seats · {car.transmission}
        </p>
        <ul className="mt-1 space-y-0.5">
          {reasons.slice(0, 2).map((r) => (
            <li key={r} className="truncate text-[10.5px] text-slate-400">
              • {r}
            </li>
          ))}
        </ul>
      </div>
      <ArrowRight
        size={14}
        className="mt-1 shrink-0 self-start text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-brand-300"
      />
    </Link>
  );
}

export default function Copilot() {
  const { fleet, coupons, settings } = useStore();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [nudge, setNudge] = useState(false);
  const bodyRef = useRef(null);
  const inputRef = useRef(null);

  // Gentle one-time nudge, and never on top of the admin console.
  useEffect(() => {
    const t = setTimeout(() => setNudge(true), 9000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (open) {
      setNudge(false);
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [open]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typing, open]);

  const ask = (raw) => {
    const text = String(raw ?? input).trim();
    if (!text) return;
    setMessages((m) => [...m, { role: 'user', text }]);
    setInput('');
    setTyping(true);
    // Small delay so the reply reads as considered rather than instant.
    setTimeout(() => {
      const res = answer(text, { fleet, coupons, settings });
      setMessages((m) => [...m, { role: 'bot', ...res }]);
      setTyping(false);
    }, 420 + Math.min(700, text.length * 12));
  };

  if (location.pathname === '/login') return null;

  return (
    <>
      {/* launcher */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Open DelhiDrive Copilot"
        className={cx(
          'fixed bottom-5 right-5 z-[80] grid h-14 w-14 place-items-center rounded-2xl transition-all duration-300',
          'bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-[0_18px_44px_-16px_rgba(79,70,229,1)]',
          'hover:scale-105 active:scale-95',
          open && 'rotate-90 scale-90'
        )}
      >
        {open ? <X size={22} /> : <Sparkles size={22} />}
        {!open && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5">
            <span className="absolute inline-flex h-full w-full animate-ping-slow rounded-full bg-saffron-400" />
            <span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-ink-950 bg-saffron-400" />
          </span>
        )}
      </button>

      {nudge && !open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-[5.4rem] right-5 z-[80] max-w-[15rem] animate-fade-up rounded-2xl rounded-br-sm border border-white/10 bg-ink-900/95 px-3.5 py-2.5 text-left text-[12.5px] leading-snug text-slate-300 shadow-glow backdrop-blur-xl"
        >
          <span className="font-semibold text-white">Not sure which car?</span> Tell me your group size and
          budget — I'll pick three.
        </button>
      )}

      {/* panel */}
      {open && (
        <div
          className={cx(
            'fixed bottom-0 right-0 z-[85] flex h-[min(38rem,88vh)] w-full flex-col overflow-hidden',
            'border border-white/10 bg-ink-900/95 shadow-glow backdrop-blur-2xl',
            'sm:bottom-24 sm:right-5 sm:w-[24.5rem] sm:rounded-3xl'
          )}
        >
          <div className="flex items-center gap-3 border-b border-white/[0.07] bg-gradient-to-r from-brand-600/20 to-transparent px-4 py-3.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500 text-white">
              <Bot size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold text-white">DelhiDrive Copilot</p>
              <p className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Online · knows all {fleet.length} cars
              </p>
            </div>
            <button
              onClick={() => setMessages([GREETING])}
              title="Restart conversation"
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/10 hover:text-white"
            >
              <RotateCcw size={14} />
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/10 hover:text-white sm:hidden"
            >
              <X size={16} />
            </button>
          </div>

          <div ref={bodyRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((m, i) => (
              <div key={i} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cx('max-w-[88%] space-y-2', m.role === 'user' && 'items-end')}>
                  <div
                    className={cx(
                      'whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-relaxed',
                      m.role === 'user'
                        ? 'rounded-br-sm bg-brand-500 text-white'
                        : 'rounded-bl-sm border border-white/10 bg-ink-950/70 text-slate-300'
                    )}
                  >
                    {m.text}
                  </div>

                  {m.cards?.length > 0 && (
                    <div className="space-y-2">
                      {m.cards.map((pick) => (
                        <CarSuggestion key={pick.car.id} pick={pick} onClose={() => setOpen(false)} />
                      ))}
                    </div>
                  )}

                  {m.chips?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {m.chips.map((c) => (
                        <button
                          key={c}
                          onClick={() => ask(c)}
                          className="rounded-full border border-brand-400/25 bg-brand-500/10 px-2.5 py-1 text-[11px] font-medium text-brand-200 transition hover:bg-brand-500/20"
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {typing && (
              <div className="flex justify-start">
                <div className="flex gap-1 rounded-2xl rounded-bl-sm border border-white/10 bg-ink-950/70 px-3.5 py-3">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-500"
                      style={{ animationDelay: `${i * 130}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-white/[0.07] bg-ink-950/60 p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    ask();
                  }
                }}
                placeholder="Ask about cars, pricing, insurance…"
                className="field max-h-24 min-h-[2.5rem] flex-1 resize-none py-2.5 text-[12.5px]"
              />
              <button
                onClick={() => ask()}
                disabled={!input.trim()}
                aria-label="Send"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-500 text-white transition hover:bg-brand-400 disabled:opacity-40"
              >
                <Send size={15} />
              </button>
            </div>
            <p className="mt-2 text-center text-[10px] text-slate-600">
              Answers are generated from live fleet and pricing data.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
