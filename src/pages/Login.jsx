import { useState } from 'react';
import { Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Car, Mail, Lock, User, ShieldCheck, Info } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useNotify } from '../lib/notify';
import { supabaseReady, ADMIN_EMAILS } from '../lib/supabase';
import { Button, Field, Input, Badge } from '../components/ui';
import { cx } from '../lib/format';

export default function Login() {
  const { signIn, signUp, signInWithGoogle, user } = useAuth();
  const { toast } = useNotify();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || '/dashboard';

  const [mode, setMode] = useState('signin');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Already signed in (e.g. arrived here from a bookmark) — bounce onward.
  if (user) return <Navigate to={from} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'signin') await signIn(form.email.trim(), form.password);
      else await signUp(form.name.trim(), form.email.trim(), form.password);
      toast(mode === 'signin' ? 'Welcome back.' : 'Account created. Welcome to DelhiDrive.', {
        type: 'success',
      });
      navigate(from, { replace: true });
    } catch (err) {
      const msg = String(err?.code || err?.message || err)
        .replace('auth/', '')
        .replace(/-/g, ' ');
      setError(msg.charAt(0).toUpperCase() + msg.slice(1));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    setError('');
    try {
      await signInWithGoogle();
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Google sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:py-20">
      <div className="hidden lg:block">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-500 shadow-[0_12px_36px_-12px_rgba(79,70,229,0.9)]">
          <Car size={22} className="text-white" />
        </span>
        <h1 className="mt-6 font-display text-3xl font-extrabold leading-tight">
          One account.
          <br />
          Every car in Delhi NCR.
        </h1>
        <p className="mt-4 max-w-sm text-[14px] leading-relaxed text-slate-400">
          Sign in to manage bookings, watch your car on the live telematics map, download rental agreements and
          GST invoices, and raise support tickets.
        </p>

        <ul className="mt-8 space-y-3">
          {[
            'Live GPS tracking on every active rental',
            'One-click PDF agreements and tax invoices',
            'Free cancellation up to 24 hours before pickup',
            'KYC verified once, reused on every booking',
          ].map((t) => (
            <li key={t} className="flex items-start gap-2.5 text-[13.5px] text-slate-300">
              <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-400" />
              {t}
            </li>
          ))}
        </ul>
      </div>

      <div className="panel p-6 sm:p-7">
        <div className="mb-5 flex gap-1 rounded-xl border border-white/10 bg-ink-950/60 p-1">
          {[
            ['signin', 'Sign in'],
            ['signup', 'Create account'],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => {
                setMode(id);
                setError('');
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

        <form onSubmit={submit} className="space-y-4">
          {mode === 'signup' && (
            <Field label="Full name">
              <div className="relative">
                <User size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="As printed on your licence"
                  className="pl-10"
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
                required
                autoComplete="email"
              />
            </div>
          </Field>

          <Field label="Password" hint={mode === 'signup' ? 'At least 6 characters.' : undefined}>
            <div className="relative">
              <Lock size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="••••••••"
                className="pl-10"
                required
                minLength={mode === 'signup' ? 6 : 4}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            </div>
          </Field>

          {error && (
            <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3.5 py-2.5 text-[12.5px] text-rose-200">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={busy}>
            {mode === 'signin' ? 'Sign in' : 'Create my account'}
          </Button>
        </form>

        {supabaseReady && (
          <>
            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-white/10" />
              <span className="text-[11px] uppercase tracking-wider text-slate-600">or</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
            <Button variant="secondary" size="lg" className="w-full" onClick={google} disabled={busy}>
              <svg viewBox="0 0 24 24" className="h-4 w-4">
                <path
                  fill="#4285F4"
                  d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z"
                />
                <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1z" />
                <path
                  fill="#EA4335"
                  d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"
                />
              </svg>
              Continue with Google
            </Button>
          </>
        )}

        <div className="mt-6 space-y-2 border-t border-white/[0.07] pt-5">
          {!supabaseReady && (
            <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-slate-500">
              <Info size={13} className="mt-0.5 shrink-0 text-slate-600" />
              Supabase is not configured yet, so accounts are stored in this browser. Any email and a 4+
              character password will sign you in. Add your keys to <code className="text-slate-400">.env</code>{' '}
              to switch on real Supabase Auth.
            </p>
          )}
          <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-slate-500">
            <ShieldCheck size={13} className="mt-0.5 shrink-0 text-slate-600" />
            For the admin console, sign in as{' '}
            <span className="font-semibold text-slate-400">{ADMIN_EMAILS[0]}</span>.
          </p>
        </div>

        <p className="mt-4 text-center text-[12px] text-slate-500">
          <Link to="/fleet" className="link-quiet">
            Browse the fleet without an account →
          </Link>
        </p>
      </div>
    </div>
  );
}
