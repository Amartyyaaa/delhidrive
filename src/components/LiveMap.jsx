// Google Maps view of the vehicle's live position.
//
// Falls back to the caller's SVG map when no key is configured or the Maps
// script fails to load, so telematics never shows an empty box.

import { useEffect, useRef, useState } from 'react';
import { GOOGLE_MAPS_KEY, mapsReady } from '../lib/config';

let mapsLoader = null;

function loadMaps() {
  if (!mapsReady) return Promise.reject(new Error('No Maps key'));
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (mapsLoader) return mapsLoader;

  mapsLoader = new Promise((resolve, reject) => {
    const cb = '__ddMapsReady';
    window[cb] = () => resolve(window.google.maps);
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      GOOGLE_MAPS_KEY
    )}&callback=${cb}&loading=async`;
    s.async = true;
    s.onerror = () => {
      mapsLoader = null;
      reject(new Error('Google Maps failed to load'));
    };
    document.head.appendChild(s);
  });
  return mapsLoader;
}

// Dark styling so the map sits inside the app's black theme.
const DARK_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0f1210' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f1210' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6b7d73' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1d2320' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2a332d' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#7d8f85' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a1a14' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#128A4B' }, { weight: 0.6 }] },
];

/**
 * @param {{lat:number,lng:number}} position  current vehicle position
 * @param {number} heading                    bearing in degrees
 * @param {Array<{lat:number,lng:number}>} trail  breadcrumb of recent positions
 * @param {React.ReactNode} fallback          rendered if Maps is unavailable
 */
export default function LiveMap({ position, heading = 0, trail = [], fallback = null, className }) {
  const ref = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const path = useRef(null);
  const [failed, setFailed] = useState(!mapsReady);

  useEffect(() => {
    if (!mapsReady || !ref.current) return;
    let cancelled = false;

    loadMaps()
      .then((maps) => {
        if (cancelled || !ref.current) return;
        map.current = new maps.Map(ref.current, {
          center: position,
          zoom: 13,
          styles: DARK_STYLE,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'cooperative',
        });
        marker.current = new maps.Marker({
          map: map.current,
          position,
          icon: {
            path: maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 6,
            fillColor: '#2FAE6A',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 1.5,
            rotation: heading,
          },
        });
        path.current = new maps.Polyline({
          map: map.current,
          path: trail,
          strokeColor: '#128A4B',
          strokeOpacity: 0.9,
          strokeWeight: 3,
        });
      })
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
    };
    // Set up once; live updates are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const maps = window.google?.maps;
    if (!maps || !marker.current) return;
    marker.current.setPosition(position);
    marker.current.setIcon({
      path: maps.SymbolPath.FORWARD_CLOSED_ARROW,
      scale: 6,
      fillColor: '#2FAE6A',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 1.5,
      rotation: heading,
    });
    if (path.current) path.current.setPath(trail);
    map.current?.panTo(position);
  }, [position, heading, trail]);

  if (failed) return fallback;

  return <div ref={ref} className={className} />;
}
