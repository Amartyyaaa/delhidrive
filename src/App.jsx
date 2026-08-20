import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { Car, Github, ShieldCheck, FileText } from 'lucide-react';
import Nav from './components/Nav';
import Copilot from './components/Copilot';
import Home from './pages/Home';
import Fleet from './pages/Fleet';
import Checkout from './pages/Checkout';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';
import Login from './pages/Login';
import { useAuth } from './lib/auth';
import { useStore } from './lib/store';
import { Spinner, Button } from './components/ui';
import { featureAuditPdf } from './lib/pdf';
import { supabaseReady } from './lib/supabase';

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

function Footer() {
  const { fleet, bookings, activeCoupons, tickets } = useStore();
  return (
    <footer className="mt-20 border-t border-white/[0.07] bg-ink-950/60">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500">
              <Car size={18} className="text-white" />
            </span>
            <span className="font-display text-[15px] font-extrabold text-white">DelhiDrive</span>
          </div>
          <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-slate-400">
            Self-drive car rentals across Delhi NCR. Zero-depreciation cover, doorstep delivery, live GPS
            telematics and paperwork that generates itself.
          </p>
          <p className="mt-4 text-[11.5px] text-slate-600">
            DelhiDrive Mobility Pvt. Ltd. · GSTIN 07AABCD1234E1ZX · CIN U60100DL2024PTC419902
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
            <li>24×7 helpline · +91 11 4000 8080</li>
            <li>support@delhidrive.in</li>
            <li>Cyber Hub, Gurugram 122002</li>
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
      <Nav />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/fleet" element={<Fleet />} />
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
