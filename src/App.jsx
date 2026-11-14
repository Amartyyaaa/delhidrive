import { useEffect } from 'react';
import { Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { Car, Github, ShieldCheck, FileText } from 'lucide-react';
import Nav from './components/Nav';
import Copilot from './components/Copilot';
import Home from './pages/Home';
import Fleet from './pages/Fleet';
import Subscribe from './pages/Subscribe';
import Checkout from './pages/Checkout';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';
import Login from './pages/Login';
import HostYourCar from './pages/HostYourCar';
import { useAuth } from './lib/auth';
import { useStore } from './lib/store';
import { useNotify } from './lib/notify';
import { takeReturnTo } from './lib/returnTo';
import { HOST_STATUS, carTitle } from './lib/host';
import { Spinner, Button } from './components/ui';
import { featureAuditPdf } from './lib/pdf';
import { supabaseReady } from './lib/supabase';
import { Logo } from './components/Logo';
import { supportWhatsappUrl } from './lib/whatsapp';
import { COMPANY_PHONE } from './lib/config';

function Protected({ children, adminOnly }) {
  const { user, isAdmin, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner label="Checking your session" />;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (adminOnly && !isAdmin)
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <ShieldCheck size={30} className="mx-auto text-slate-600" />
        <h2 className="mt-4 text-xl">Admin access only</h2>
        <p className="mt-2 text-sm text-slate-400">
          This console is limited to operations staff. Sign in with an account listed in{' '}
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-[12px] text-brand-200">VITE_ADMIN_EMAILS</code>.
        </p>
        <Button as={Link} to="/dashboard" className="mt-5">
          Back to my bookings
        </Button>
      </div>
    );
  return children;
}

/**
 * Finishes a sign-in that left the site — Google, or an email confirmation
 * link — by returning the person to the page they started it from.
 */
function ResumeAfterSignIn() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (loading || !user) return;
    const path = takeReturnTo();
    if (path && path !== pathname) navigate(path, { replace: true });
  }, [user?.uid, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

/**
 * Tells a vendor what was decided about a car they offered — the moment it
 * happens if the site is open, otherwise the next time they visit. Each
 * decision is announced once per browser.
 */
function HostDecisionNotifier() {
  const { myHostApplications } = useStore();
  const { push } = useNotify();

  useEffect(() => {
    myHostApplications.forEach((app) => {
      if (app.status === HOST_STATUS.pending || !app.reviewedAt) return;
      const key = `delhidrive:hostDecision:${app.id}`;
      const stamp = `${app.status}:${app.reviewedAt}`;
      try {
        if (localStorage.getItem(key) === stamp) return;
        localStorage.setItem(key, stamp);
      } catch {
        return; // no storage to remember with — better silent than repeating on every page
      }
      if (app.status === HOST_STATUS.approved) {
        push('Your car is live on DelhiDrive', `${carTitle(app)} (${app.car?.plate}) has been approved.`, {
          type: 'success',
          tag: 'host-' + app.ref,
          ttl: 12000,
        });
      } else {
        push(
          app.delistedAt ? 'Your car is no longer listed on DelhiDrive' : 'Your host application was not approved',
          `${carTitle(app)}: ${app.rejectionReason || 'see the details on the Host your car page'}.`,
          { type: 'warning', tag: 'host-' + app.ref, ttl: 12000 }
        );
      }
    });
  }, [myHostApplications, push]);

  return null;
}

function Footer() {
  const { fleet, bookings, activeCoupons, tickets } = useStore();
  return (
    <footer className="mt-20 border-t border-white/[0.07] bg-ink-950/60">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo className="max-w-[15rem]" />
          <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-slate-400">
            Self-drive car rentals across Delhi NCR. Zero-depreciation cover, doorstep delivery, live GPS
            telematics and paperwork that generates itself.
          </p>
          <p className="mt-4 text-[11.5px] text-slate-600">
            NCR Drive Rental Cars · GSTIN 09DZGPM3676G3ZV
          </p>
        </div>

        <div>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Platform</p>
          <ul className="space-y-2 text-[13px]">
            <li>
              <Link to="/fleet" className="link-quiet">
                Browse the fleet
              </Link>
            </li>
            <li>
              <Link to="/subscribe" className="link-quiet">
                Smart Subscription
              </Link>
            </li>
            <li>
              <Link to="/host-your-car" className="link-quiet">
                Host your car
              </Link>
            </li>
            <li>
              <Link to="/dashboard" className="link-quiet">
                My bookings
              </Link>
            </li>
            <li>
              <Link to="/login" className="link-quiet">
                Sign in
              </Link>
            </li>
            <li>
              <button
                className="link-quiet inline-flex items-center gap-1.5"
                onClick={() =>
                  featureAuditPdf({
                    fleetCount: fleet.length,
                    bookingCount: bookings.length,
                    couponCount: activeCoupons.length,
                    openTickets: tickets.filter((t) => t.status !== 'Resolved').length,
                    backend: supabaseReady ? 'Supabase Postgres' : 'Local browser store',
                  })
                }
              >
                <FileText size={13} /> Feature specification PDF
              </button>
            </li>
          </ul>
        </div>

        <div>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Support</p>
          <ul className="space-y-2 text-[13px] text-slate-400">
            <li>24×7 helpline · {COMPANY_PHONE}</li>
            <li>
              <a href={supportWhatsappUrl()} target="_blank" rel="noopener noreferrer" className="link-quiet">
                Chat with us on WhatsApp →
              </a>
            </li>
            <li>support@delhidrive.in</li>
            <li>Cyber Hub, Gurugram 122002</li>
            <li>
              <a href={`${import.meta.env.BASE_URL}terms.html`} className="link-quiet">
                Terms & conditions
              </a>
              {' · '}
              <a href={`${import.meta.env.BASE_URL}privacy.html`} className="link-quiet">
                Privacy policy
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/[0.05] px-4 py-5 text-center text-[11.5px] text-slate-600 sm:px-6">
        © {new Date().getFullYear()} DelhiDrive Mobility. Built with Vite, React, Tailwind CSS and Supabase.
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <ResumeAfterSignIn />
      <HostDecisionNotifier />
      <Nav />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/fleet" element={<Fleet />} />
          <Route path="/subscribe" element={<Subscribe />} />
          <Route path="/host-your-car" element={<HostYourCar />} />
          <Route path="/checkout/:carId" element={<Checkout />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/dashboard"
            element={
              <Protected>
                <Dashboard />
              </Protected>
            }
          />
          <Route
            path="/admin"
            element={
              <Protected adminOnly>
                <Admin />
              </Protected>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
      <Copilot />
    </div>
  );
}
