// Real-time GPS telematics simulator (module 3).
//
// Drives a vehicle around a fixed Delhi NCR loop and produces the same shape of
// telemetry a real OBD-II/GPS tracker would push: position, speed, fuel or
// state-of-charge, coolant temperature, tyre pressures and fault alerts.

import { useEffect, useRef, useState } from 'react';

/** Route in SVG viewBox units (0–100 x, 0–70 y) with real-ish coordinates. */
export const ROUTE = [
  { x: 12, y: 54, name: 'Dhaula Kuan', lat: 28.5921, lng: 77.1691 },
  { x: 22, y: 44, name: 'Rao Tula Ram Marg', lat: 28.5731, lng: 77.1622 },
  { x: 31, y: 32, name: 'Ring Road · Naraina', lat: 28.6284, lng: 77.1428 },
  { x: 44, y: 24, name: 'Rajouri Garden', lat: 28.6469, lng: 77.1206 },
  { x: 58, y: 21, name: 'Punjabi Bagh Flyover', lat: 28.6742, lng: 77.1318 },
  { x: 70, y: 27, name: 'Karol Bagh', lat: 28.6519, lng: 77.1909 },
  { x: 80, y: 38, name: 'Connaught Place', lat: 28.6315, lng: 77.2167 },
  { x: 86, y: 50, name: 'India Gate', lat: 28.6129, lng: 77.2295 },
  { x: 74, y: 58, name: 'AIIMS Flyover', lat: 28.5672, lng: 77.21 },
  { x: 58, y: 62, name: 'Moti Bagh', lat: 28.575, lng: 77.1783 },
  { x: 38, y: 60, name: 'Naraina Vihar', lat: 28.6244, lng: 77.1361 },
];

export const ROUTE_D = (() => {
  // Smooth closed catmull-rom-ish path for the map background.
  const pts = ROUTE;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[(i - 1 + pts.length) % pts.length];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const p3 = pts[(i + 2) % pts.length];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x} ${p2.y}`;
  }
  return d + ' Z';
})();

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function seededProgress(seed) {
  let h = 0;
  for (let i = 0; i < String(seed).length; i++) h = (h * 31 + String(seed).charCodeAt(i)) % 100000;
  return (h % 1000) / 1000;
}

/**
 * @param {object} opts
 * @param {object} opts.car      fleet document (fuel type matters)
 * @param {string} opts.seed     booking id — keeps each car's trip distinct
 * @param {boolean} opts.live    when false, the loop is paused
 * @param {number} opts.speedLimit over-speed threshold in kph
 */
export function useTelematics({ car, seed = 'demo', live = true, speedLimit = 100 }) {
  const isEv = car?.fuel === 'EV';
  const progress = useRef(seededProgress(seed));
  const [state, setState] = useState(() => ({
    speed: 0,
    targetSpeed: 42,
    energy: isEv ? 78 : 62, // % charge or % tank
    odometer: 18400 + Math.round(seededProgress(seed) * 26000),
    tripKm: 0,
    coolant: 88,
    tyres: [32.1, 32.4, 31.8, 32.2],
    voltage: isEv ? 402 : 13.9,
    engineHealth: 'Optimal',
    ac: 22,
    doorsLocked: true,
    heading: 0,
    ignition: true,
    position: ROUTE[0],
    nearest: ROUTE[0].name,
    alerts: [],
    maxSpeed: 0,
    samples: [],
    trail: [],
  }));

  const alertGuard = useRef({ overspeed: 0, tyre: false, fuel: false });

  useEffect(() => {
    if (!live) return;
    const tick = () => {
      setState((prev) => {
        // --- speed: random walk toward a target that changes occasionally ---
        let targetSpeed = prev.targetSpeed;
        if (Math.random() < 0.14) {
          const roll = Math.random();
          targetSpeed = roll < 0.12 ? 4 : roll < 0.28 ? 108 : 30 + Math.random() * 55;
        }
        const speed = clamp(lerp(prev.speed, targetSpeed, 0.22) + (Math.random() - 0.5) * 3, 0, 132);

        // --- position along the loop ---
        const kmThisTick = (speed / 3600) * 1.6; // ~1.6 s of simulated travel
        const loopKm = 34; // approximate loop length
        let p = (progress.current + kmThisTick / loopKm) % 1;
        progress.current = p;
        const segF = p * ROUTE.length;
        const i = Math.floor(segF);
        const t = segF - i;
        const a = ROUTE[i % ROUTE.length];
        const b = ROUTE[(i + 1) % ROUTE.length];
        const position = {
          x: lerp(a.x, b.x, t),
          y: lerp(a.y, b.y, t),
          lat: lerp(a.lat, b.lat, t),
          lng: lerp(a.lng, b.lng, t),
        };
        const heading = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 90;
        const nearest = t < 0.5 ? a.name : b.name;

        // --- consumption ---
        const burn = isEv ? kmThisTick / 3.6 : kmThisTick / 6.4; // %/km approximations
        const energy = clamp(prev.energy - burn, 4, 100);

        const coolant = clamp(prev.coolant + (speed > 90 ? 0.12 : -0.08) + (Math.random() - 0.5) * 0.2, 82, 108);
        const tyres = prev.tyres.map((v) => clamp(v + (Math.random() - 0.5) * 0.06, 28.5, 34));
        const voltage = isEv
          ? clamp(prev.voltage + (Math.random() - 0.5) * 0.8, 386, 412)
          : clamp(prev.voltage + (Math.random() - 0.5) * 0.05, 13.4, 14.4);

        // --- alerts ---
        const alerts = [...prev.alerts];
        const pushAlert = (level, text) => {
          alerts.unshift({ id: Math.random().toString(36).slice(2), level, text, at: Date.now() });
          if (alerts.length > 6) alerts.pop();
        };
        const now = Date.now();
        if (speed > speedLimit && now - alertGuard.current.overspeed > 12000) {
          alertGuard.current.overspeed = now;
          pushAlert('critical', `Over-speed: ${Math.round(speed)} kph near ${nearest} (limit ${speedLimit})`);
        }
        if (tyres.some((v) => v < 29.5) && !alertGuard.current.tyre) {
          alertGuard.current.tyre = true;
          pushAlert('warning', 'Tyre pressure low on rear-left — top up at the next fuel stop');
        }
        if (energy < 15 && !alertGuard.current.fuel) {
          alertGuard.current.fuel = true;
          pushAlert('warning', isEv ? 'Battery below 15% — locate a fast charger' : 'Fuel below 15% — refuel soon');
        }
        if (coolant > 104 && Math.random() < 0.3) pushAlert('warning', 'Coolant temperature elevated — ease off');

        const engineHealth =
          coolant > 104 ? 'Check engine temp' : tyres.some((v) => v < 29.5) ? 'Tyre attention' : 'Optimal';

        return {
          ...prev,
          speed,
          targetSpeed,
          energy,
          odometer: prev.odometer + kmThisTick,
          tripKm: prev.tripKm + kmThisTick,
          coolant,
          tyres,
          voltage,
          engineHealth,
          heading,
          position,
          nearest,
          alerts,
          maxSpeed: Math.max(prev.maxSpeed, speed),
          samples: [...prev.samples, speed].slice(-48),
          trail: [...prev.trail, { lat: position.lat, lng: position.lng }].slice(-60),
        };
      });
    };
    const id = setInterval(tick, 1600);
    tick();
    return () => clearInterval(id);
  }, [live, isEv, speedLimit]);

  const setCabin = (patch) => setState((s) => ({ ...s, ...patch }));

  return { ...state, isEv, setCabin };
}
