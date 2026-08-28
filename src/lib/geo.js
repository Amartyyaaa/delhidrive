// Location capture for home delivery.
//
// The phone app reads the GPS through expo-location and the OS geocoder. In a
// browser the equivalent is navigator.geolocation plus Google's geocoding API
// (we already load Maps for the telematics view). If the key is missing or the
// lookup fails, the coordinates are still captured and the customer can type
// the address — a driver can navigate from coordinates alone.

import { GOOGLE_MAPS_KEY, mapsReady } from './config';

/** Roughly the centre of Delhi — used only to sanity-check the service area. */
const DELHI = { lat: 28.6139, lng: 77.209 };

/** How far from that centre we still deliver. NCR is about 50 km across. */
export const SERVICE_RADIUS_KM = 70;

/** Great-circle distance in kilometres. */
export function distanceKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Is this coordinate inside the area we deliver to? */
export function withinServiceArea(coords) {
  if (!coords) return { ok: true, km: 0 };
  const km = distanceKm(DELHI, coords);
  return { ok: km <= SERVICE_RADIUS_KM, km: Math.round(km) };
}

/** Tidy a Google formatted_address — drop the country and any plus-code. */
export function formatAddress(formatted) {
  if (!formatted) return '';
  return String(formatted)
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p && p !== 'India' && !/^[A-Z0-9]{4}\+[A-Z0-9]{2,3}$/i.test(p))
    .join(', ');
}

async function reverseGeocode(coords) {
  if (!mapsReady) return '';
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${coords.lat},${coords.lng}&key=${encodeURIComponent(
        GOOGLE_MAPS_KEY
      )}`
    );
    const json = await res.json();
    return formatAddress(json?.results?.[0]?.formatted_address || '');
  } catch {
    return '';
  }
}

/**
 * Ask for permission, read the GPS, and reverse-geocode it.
 *
 * Never throws — every failure path returns a reason the UI can show, because
 * "nothing happened" after tapping a location button is the worst outcome.
 *
 * @returns {Promise<{ok, coords?, address?, km?, reason?}>}
 */
export async function fetchCurrentLocation() {
  if (!navigator.geolocation) {
    return { ok: false, reason: 'This browser cannot read your location.' };
  }

  const position = await new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ ok: true, p }),
      (err) =>
        resolve({
          ok: false,
          reason:
            err.code === err.PERMISSION_DENIED
              ? 'Location permission was blocked. Allow it in your browser’s site settings, or type the address instead.'
              : err.code === err.TIMEOUT
                ? 'Could not get a GPS fix in time. Try again, or type the address.'
                : 'Could not read your location on this device.',
        }),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  });

  if (!position.ok) return { ok: false, reason: position.reason };

  const coords = {
    lat: position.p.coords.latitude,
    lng: position.p.coords.longitude,
  };
  const area = withinServiceArea(coords);
  const address = await reverseGeocode(coords);

  return {
    ok: true,
    coords,
    address,
    km: area.km,
    outsideServiceArea: !area.ok,
    reason: area.ok
      ? ''
      : `That is about ${area.km} km from central Delhi — outside our ${SERVICE_RADIUS_KM} km delivery area. Pick a hub instead, or call us.`,
  };
}

/** Link a driver can open to navigate to the drop point. */
export function mapsUrl(coords, label = 'Delivery address') {
  if (!coords) return '';
  return `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}&query_place_id=${encodeURIComponent(
    label
  )}`;
}
