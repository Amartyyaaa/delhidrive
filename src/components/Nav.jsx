import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  Car,
  LayoutGrid,
  Gauge,
  ShieldCheck,
  Menu,
  X,
  LogOut,
  Bell,
  BellRing,
  UserRound,
  Database,
  HardDrive,
  Repeat,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useNotify } from '../lib/notify';
import { supabaseReady } from '../lib/supabase';
import { cx, initials } from '../lib/format';
import { Button, Badge } from './ui';
import { LogoMark } from './Logo';

const LINKS = [
  { to: '/fleet', label: 'Fleet', icon: LayoutGrid },
  { to: '/subscribe', label: 'Subscribe', icon: Repeat },
  { to: '/dashboard', label: 'My Bookings', icon: Gauge, auth: true },
  { to: '/admin', label: 'Admin', icon: ShieldCheck, admin: true },
];

export default function Nav() {
  const { user, isAdmin, signOut } = useAuth();
  const { requestPush, permission } = useNotify();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);

  const visible = LINKS.filter((l) => (!l.auth || user) && (!l.admin || isAdmin));

  const linkClass = ({ isActive }) =>
    cx(
      'flex items-center gap-2 rounded-xl px-3 py-2 text-[13.5px] font-medium transition',
      isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'
    );

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-ink-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2.5" onClick={() => setOpen(false)}>
          <span className="h-9 w-9 shrink-0 overflow-hidden rounded-xl shadow-[0_8px_24px_-8px_rgba(18,138,75,0.9)]">
            <LogoMark />
          </span>
          <span className="leading-none">
            <span className="block font-display text-[15px] font-extrabold tracking-tight">
              <span className="text-brand-400">DELHI</span>
              <span className="text-white">DRIVE</span>
            </span>
            <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
              Move Ahead To Destiny
            </span>
          </span>
        </Link>

        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {visible.map((l) => (
            <NavLink key={l.to} to={l.to} className={linkClass}>
              <l.icon size={15} />
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Badge
            tone={supabaseReady ? 'success' : 'neutral'}
            icon={supabaseReady ? Database : HardDrive}
            className="hidden lg:inline-flex"
          >
            {supabaseReady ? 'Supabase live' : 'Local store'}
          </Badge>

          <button
            onClick={requestPush}
            title={
              permission === 'granted'
                ? 'Push notifications are enabled'
                : 'Enable browser push notifications'
            }
            className={cx(
              'rounded-xl border p-2 transition',
              permission === 'granted'
                ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
                : 'border-white/10 text-slate-400 hover:bg-white/[0.06] hover:text-white'
            )}
          >
            {permission === 'granted' ? <BellRing size={16} /> : <Bell size={16} />}
          </button>

          {user ? (
            <div className="relative">
              <button
                onClick={() => setMenu((m) => !m)}
                className="flex items-center gap-2 rounded-xl border border-white/10 py-1.5 pl-1.5 pr-2.5 transition hover:bg-white/[0.06]"
              >
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-500/25 text-[11px] font-bold text-brand-200">
                  {initials(user.name || user.email)}
                </span>
                <span className="hidden max-w-[7rem] truncate text-[13px] text-slate-300 sm:block">
                  {user.name || user.email}
                </span>
              </button>
              {menu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                  <div className="absolute right-0 z-20 mt-2 w-56 animate-pop-in overflow-hidden rounded-2xl border border-white/10 bg-ink-900/95 shadow-glow backdrop-blur-xl">
                    <div className="border-b border-white/[0.07] px-4 py-3">
                      <p className="truncate text-[13px] font-semibold text-white">{user.name}</p>
                      <p className="truncate text-[11.5px] text-slate-500">{user.email}</p>
                      {isAdmin && (
                        <Badge tone="saffron" className="mt-2">
                          Administrator
                        </Badge>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setMenu(false);
                        navigate('/dashboard');
                      }}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
                    >
                      <UserRound size={15} /> My account
                    </button>
                    <button
                      onClick={async () => {
                        setMenu(false);
                        await signOut();
                        navigate('/');
                      }}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] text-rose-300 transition hover:bg-rose-500/10"
                    >
                      <LogOut size={15} /> Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Button as={Link} to="/login" size="sm" className="hidden sm:inline-flex">
              Sign in
            </Button>
          )}

          <button
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle menu"
            className="rounded-xl border border-white/10 p-2 text-slate-300 transition hover:bg-white/[0.06] md:hidden"
          >
            {open ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-white/[0.07] bg-ink-950/95 px-4 py-3 md:hidden">
          <nav className="flex flex-col gap-1">
            {visible.map((l) => (
              <NavLink key={l.to} to={l.to} className={linkClass} onClick={() => setOpen(false)}>
                <l.icon size={15} />
                {l.label}
              </NavLink>
            ))}
            {!user && (
              <Button as={Link} to="/login" size="sm" className="mt-2" onClick={() => setOpen(false)}>
                Sign in
              </Button>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
