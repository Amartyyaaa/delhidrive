// Toast alerts + real browser push notifications (module 8).

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, XCircle, X, BellRing } from 'lucide-react';
import { cx } from './format';

const NotifyCtx = createContext(null);
const ICONS = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info, push: BellRing };
const TONES = {
  success: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
  error: 'border-rose-400/30 bg-rose-500/10 text-rose-200',
  warning: 'border-amber-400/30 bg-amber-500/10 text-amber-200',
  info: 'border-brand-300/30 bg-brand-500/10 text-brand-200',
  push: 'border-sky-400/30 bg-sky-500/10 text-sky-200',
};

export function NotifyProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback(
    (message, opts = {}) => {
      const id = Math.random().toString(36).slice(2);
      const entry = {
        id,
        message,
        title: opts.title || '',
        type: opts.type || 'info',
        ttl: opts.ttl ?? 5200,
      };
      setToasts((t) => [entry, ...t].slice(0, 4));
      if (entry.ttl) setTimeout(() => dismiss(id), entry.ttl);
      return id;
    },
    [dismiss]
  );

  /** Ask the browser for push permission (must be triggered by a user click). */
  const requestPush = useCallback(async () => {
    if (typeof Notification === 'undefined') {
      toast('This browser does not support push notifications.', { type: 'warning' });
      return 'unsupported';
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') {
      toast('Push notifications enabled — booking and payment alerts will reach you.', {
        type: 'success',
        title: 'Notifications on',
      });
      new Notification('DelhiDrive alerts are live', {
        body: 'You will now get booking confirmations, payment receipts and inspection updates.',
        icon: '/vite.svg',
      });
    } else if (result === 'denied') {
      toast('Push notifications blocked. You can re-enable them in browser site settings.', {
        type: 'warning',
      });
    }
    return result;
  }, [toast]);

  /**
   * Fire a real OS notification when permitted, and always mirror it as an
   * in-app toast so the alert is never silently lost.
   */
  const push = useCallback(
    (title, body, opts = {}) => {
      toast(body, { title, type: opts.type || 'push', ttl: opts.ttl ?? 6000 });
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification(title, { body, icon: '/vite.svg', tag: opts.tag, silent: false });
        } catch {
          /* some browsers require a service worker; the toast already covered it */
        }
      }
    },
    [toast]
  );

  useEffect(() => {
    if (typeof Notification !== 'undefined') setPermission(Notification.permission);
  }, []);

  const value = useMemo(
    () => ({ toast, push, requestPush, permission, dismiss }),
    [toast, push, requestPush, permission, dismiss]
  );

  return (
    <NotifyCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex w-[min(94vw,26rem)] -translate-x-1/2 flex-col gap-2 sm:bottom-6 sm:left-6 sm:translate-x-0">
        {toasts.map((t) => {
          const Icon = ICONS[t.type] || Info;
          return (
            <div
              key={t.id}
              role="status"
              className={cx(
                'pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 backdrop-blur-xl animate-pop-in shadow-card',
                TONES[t.type] || TONES.info
              )}
            >
              <Icon size={18} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                {t.title && <p className="text-sm font-semibold leading-tight">{t.title}</p>}
                <p className="text-[13px] leading-snug text-slate-200/90">{t.message}</p>
              </div>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </NotifyCtx.Provider>
  );
}

export function useNotify() {
  const ctx = useContext(NotifyCtx);
  if (!ctx) throw new Error('useNotify must be used inside <NotifyProvider>');
  return ctx;
}
