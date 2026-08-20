// Shared primitives. Everything visual in the app is composed from these so
// spacing, radii and focus states stay consistent.

import { useEffect, useRef } from 'react';
import { X, Loader2, Inbox } from 'lucide-react';
import { cx } from '../lib/format';

/* ----------------------------- Button ----------------------------- */
const BTN_VARIANTS = {
  primary:
    'bg-brand-500 text-white hover:bg-brand-400 shadow-[0_10px_30px_-12px_rgba(79,70,229,0.9)] disabled:hover:bg-brand-500',
  secondary: 'bg-white/[0.06] text-white border border-white/10 hover:bg-white/[0.12]',
  ghost: 'text-slate-300 hover:bg-white/[0.07] hover:text-white',
  outline: 'border border-brand-400/40 text-brand-200 hover:bg-brand-500/10',
  danger: 'bg-rose-500/90 text-white hover:bg-rose-500',
  success: 'bg-emerald-500/90 text-white hover:bg-emerald-500',
  saffron: 'bg-saffron-500 text-ink-950 font-semibold hover:bg-saffron-400',
};
const BTN_SIZES = {
  sm: 'h-8 px-3 text-[12px] rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm rounded-xl gap-2',
  lg: 'h-12 px-6 text-[15px] rounded-xl gap-2',
};

export function Button({
  as: Tag = 'button',
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  className,
  children,
  ...rest
}) {
  return (
    <Tag
      className={cx(
        'inline-flex select-none items-center justify-center font-medium transition-all duration-150 active:scale-[0.98]',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
        BTN_SIZES[size],
        BTN_VARIANTS[variant],
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 size={size === 'sm' ? 13 : 15} className="animate-spin" /> : Icon ? <Icon size={size === 'sm' ? 13 : 16} /> : null}
      {children}
      {IconRight && <IconRight size={size === 'sm' ? 13 : 16} />}
    </Tag>
  );
}

/* ----------------------------- Badge ------------------------------ */
const BADGE_TONES = {
  neutral: 'border-white/12 bg-white/[0.05] text-slate-300',
  brand: 'border-brand-400/30 bg-brand-500/15 text-brand-200',
  success: 'border-emerald-400/30 bg-emerald-500/15 text-emerald-300',
  warning: 'border-amber-400/30 bg-amber-500/15 text-amber-300',
  danger: 'border-rose-400/30 bg-rose-500/15 text-rose-300',
  info: 'border-sky-400/30 bg-sky-500/15 text-sky-300',
  saffron: 'border-saffron-400/30 bg-saffron-500/15 text-saffron-400',
};

export function Badge({ tone = 'neutral', icon: Icon, className, children }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide',
        BADGE_TONES[tone],
        className
      )}
    >
      {Icon && <Icon size={11} />}
      {children}
    </span>
  );
}

/* ----------------------------- Modal ------------------------------ */
export function Modal({ open, onClose, title, subtitle, children, footer, size = 'lg' }) {
  const ref = useRef(null);
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-6">
      <div
        className="fixed inset-0 bg-ink-950/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'relative z-10 my-auto w-full animate-pop-in overflow-hidden rounded-t-3xl border border-white/10',
          'bg-ink-900/95 shadow-glow backdrop-blur-2xl sm:rounded-3xl',
          widths[size]
        )}
      >
        {(title || subtitle) && (
          <div className="flex items-start gap-4 border-b border-white/[0.07] px-5 py-4 sm:px-6">
            <div className="min-w-0 flex-1">
              {title && <h3 className="truncate text-lg">{title}</h3>}
              {subtitle && <p className="mt-0.5 text-[13px] text-slate-400">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-xl border border-white/10 p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="max-h-[min(74vh,44rem)] overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && <div className="border-t border-white/[0.07] bg-ink-950/50 px-5 py-4 sm:px-6">{footer}</div>}
      </div>
    </div>
  );
}

/* ----------------------------- Inputs ----------------------------- */
export function Field({ label, hint, error, children, className }) {
  return (
    <div className={className}>
      {label && <label className="label">{label}</label>}
      {children}
      {error ? (
        <p className="mt-1 text-[11.5px] text-rose-300">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[11.5px] text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...rest }) {
  return <input className={cx('field', className)} {...rest} />;
}

export function Textarea({ className, ...rest }) {
  return <textarea className={cx('field resize-y', className)} {...rest} />;
}

export function Select({ className, children, ...rest }) {
  return (
    <select className={cx('field appearance-none pr-9', className)} {...rest}>
      {children}
    </select>
  );
}

export function Slider({ value, min, max, step = 1, onChange, className }) {
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ '--pct': `${pct}%` }}
      className={cx('w-full cursor-pointer', className)}
    />
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition',
        checked
          ? 'border-brand-400/40 bg-brand-500/10'
          : 'border-white/10 bg-ink-950/50 hover:border-white/20',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <span
        className={cx(
          'relative h-5 w-9 shrink-0 rounded-full transition',
          checked ? 'bg-brand-500' : 'bg-slate-600'
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all',
            checked ? 'left-[1.15rem]' : 'left-0.5'
          )}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-white">{label}</span>
        {hint && <span className="block text-[11.5px] leading-snug text-slate-400">{hint}</span>}
      </span>
    </button>
  );
}

export function Checkbox({ checked, onChange, label, className }) {
  return (
    <label className={cx('flex cursor-pointer items-start gap-2.5 text-sm text-slate-300', className)}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-white/20 bg-ink-950 text-brand-500 accent-brand-500"
      />
      <span className="leading-snug">{label}</span>
    </label>
  );
}

/* ----------------------------- Tabs ------------------------------- */
export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div
      role="tablist"
      className={cx(
        'flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-ink-950/60 p-1 scrollbar-none',
        className
      )}
    >
      {tabs.map((t) => {
        const active = t.id === value;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cx(
              'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-medium transition',
              active ? 'bg-brand-500 text-white shadow' : 'text-slate-400 hover:bg-white/5 hover:text-white'
            )}
          >
            {Icon && <Icon size={14} />}
            {t.label}
            {t.count != null && (
              <span
                className={cx(
                  'rounded-full px-1.5 text-[10px] font-bold tabular-nums',
                  active ? 'bg-white/25' : 'bg-white/10 text-slate-400'
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------- Misc ------------------------------- */
export function Stat({ label, value, sub, icon: Icon, tone = 'brand' }) {
  const tones = {
    brand: 'text-brand-300 bg-brand-500/15',
    success: 'text-emerald-300 bg-emerald-500/15',
    warning: 'text-amber-300 bg-amber-500/15',
    danger: 'text-rose-300 bg-rose-500/15',
    info: 'text-sky-300 bg-sky-500/15',
  };
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        {Icon && (
          <span className={cx('rounded-lg p-1.5', tones[tone])}>
            <Icon size={14} />
          </span>
        )}
      </div>
      <p className="stat-num mt-2">{value}</p>
      {sub && <p className="mt-0.5 text-[11.5px] text-slate-500">{sub}</p>}
    </div>
  );
}

export function Empty({ icon: Icon = Inbox, title, body, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center">
      <span className="rounded-2xl bg-white/[0.05] p-3.5 text-slate-500">
        <Icon size={22} />
      </span>
      <p className="mt-3 font-display text-[15px] font-semibold text-white">{title}</p>
      {body && <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-slate-400">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function SectionHeading({ eyebrow, title, sub, right }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-300">{eyebrow}</p>
        )}
        <h2 className="text-xl sm:text-2xl">{title}</h2>
        {sub && <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-slate-400">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Spinner({ label = 'Loading' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
      <Loader2 size={16} className="animate-spin" />
      {label}
    </div>
  );
}

/** Small labelled key/value row used across detail panels. */
export function Row({ k, v, tone }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-[12.5px] text-slate-400">{k}</span>
      <span className={cx('text-right text-[13px] font-semibold tabular-nums', tone || 'text-white')}>{v}</span>
    </div>
  );
}
