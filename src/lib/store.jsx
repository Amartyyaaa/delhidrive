// App-wide data store. Subscribes to every collection once and hands the data
// down, so screens stay declarative and database reads stay minimal.

import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { COL, watchCollection, watchDoc, addItem, setItem, updateItem, deleteItem, seedIfEmpty } from './db';
import { supabaseReady } from './supabase';
import { DEFAULT_SETTINGS } from './pricing';
import { FLEET_SEED, COUPONS_SEED } from '../data/fleet';
import { useAuth } from './auth';

const StoreCtx = createContext(null);
const SETTINGS_DOC = 'platform';

export function StoreProvider({ children }) {
  const { user, isAdmin } = useAuth();
  const [fleet, setFleet] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [kycDocs, setKycDocs] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const seeded = useRef({ fleet: false, coupons: false });

  // Seed local store immediately so the app is never empty on first load.
  useEffect(() => {
    if (supabaseReady) return;
    seedIfEmpty(COL.fleet, FLEET_SEED);
    seedIfEmpty(COL.coupons, COUPONS_SEED);
  }, []);

  useEffect(() => {
    const unsubs = [
      watchCollection(COL.fleet, (rows) => {
        setFleet(rows);
        setReady(true);
        if (supabaseReady && rows.length === 0 && !seeded.current.fleet) {
          seeded.current.fleet = true;
          Promise.all(FLEET_SEED.map((c) => setItem(COL.fleet, c.id, c))).catch((e) =>
            console.warn('[DelhiDrive] fleet seed skipped', e)
          );
        }
      }),
      watchCollection(COL.coupons, (rows) => {
        setCoupons(rows);
        if (supabaseReady && rows.length === 0 && !seeded.current.coupons) {
          seeded.current.coupons = true;
          Promise.all(COUPONS_SEED.map((c) => setItem(COL.coupons, c.id, c))).catch(() => {});
        }
      }),
      watchCollection(COL.bookings, setBookings),
      watchCollection(COL.tickets, setTickets),
      watchCollection(COL.kyc, setKycDocs),
      watchDoc(COL.settings, SETTINGS_DOC, (d) => setSettings({ ...DEFAULT_SETTINGS, ...(d || {}) })),
    ];
    return () => unsubs.forEach((u) => typeof u === 'function' && u());
  }, []);

  /* ---------------- derived ---------------- */
  const myBookings = useMemo(
    () => (user ? bookings.filter((b) => b.userId === user.uid) : []),
    [bookings, user]
  );
  const visibleBookings = isAdmin ? bookings : myBookings;
  const myTickets = useMemo(() => (user ? tickets.filter((t) => t.userId === user.uid) : []), [tickets, user]);
  const myKyc = useMemo(
    () => (user ? kycDocs.find((k) => k.userId === user.uid) || null : null),
    [kycDocs, user]
  );
  const activeCoupons = useMemo(() => coupons.filter((c) => c.active !== false), [coupons]);

  /* ---------------- actions ---------------- */
  const createBooking = useCallback((data) => addItem(COL.bookings, data), []);
  const patchBooking = useCallback((id, patch) => updateItem(COL.bookings, id, patch), []);

  const saveCar = useCallback(
    (car) => (car.id ? setItem(COL.fleet, car.id, car) : addItem(COL.fleet, car)),
    []
  );
  const removeCar = useCallback((id) => deleteItem(COL.fleet, id), []);

  const saveCoupon = useCallback(
    (c) => (c.id ? setItem(COL.coupons, c.id, c) : addItem(COL.coupons, c)),
    []
  );
  const removeCoupon = useCallback((id) => deleteItem(COL.coupons, id), []);

  const createTicket = useCallback((data) => addItem(COL.tickets, data), []);
  const patchTicket = useCallback((id, patch) => updateItem(COL.tickets, id, patch), []);

  const saveKyc = useCallback((uid, data) => setItem(COL.kyc, uid, data), []);
  const patchKyc = useCallback((id, patch) => updateItem(COL.kyc, id, patch), []);

  const saveSettings = useCallback((patch) => setItem(COL.settings, SETTINGS_DOC, patch), []);

  const value = useMemo(
    () => ({
      ready,
      fleet,
      bookings,
      myBookings,
      visibleBookings,
      coupons,
      activeCoupons,
      tickets,
      myTickets,
      kycDocs,
      myKyc,
      settings,
      createBooking,
      patchBooking,
      saveCar,
      removeCar,
      saveCoupon,
      removeCoupon,
      createTicket,
      patchTicket,
      saveKyc,
      patchKyc,
      saveSettings,
    }),
    [
      ready,
      fleet,
      bookings,
      myBookings,
      visibleBookings,
      coupons,
      activeCoupons,
      tickets,
      myTickets,
      kycDocs,
      myKyc,
      settings,
      createBooking,
      patchBooking,
      saveCar,
      removeCar,
      saveCoupon,
      removeCoupon,
      createTicket,
      patchTicket,
      saveKyc,
      patchKyc,
      saveSettings,
    ]
  );

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
