// Vehicle artwork. Uses the uploaded/linked photo when a car has one
// (Admin > Fleet Inventory can set `photo`), and otherwise draws a clean
// category-specific side profile so every card looks intentional.

import { useState } from 'react';
import { cx } from '../lib/format';

const SILHOUETTES = {
  Hatchback: {
    body: 'M14 62 L22 44 Q26 36 36 34 L74 32 Q86 32 94 40 L110 55 L146 59 Q158 61 158 70 L158 78 Q158 82 152 82 L16 82 Q10 82 10 76 L10 68 Q10 63 14 62 Z',
    glass: 'M30 45 Q33 39 41 38 L70 36.5 Q79 36.5 85 42 L96 53 L34 55 Z',
    wheels: [46, 128],
    roofLen: 0.62,
  },
  Sedan: {
    body: 'M10 64 L20 46 Q24 38 34 36 L78 33 Q92 33 101 41 L120 57 L162 61 Q174 63 174 72 L174 79 Q174 83 168 83 L14 83 Q8 83 8 77 L8 69 Q8 65 10 64 Z',
    glass: 'M28 47 Q31 41 39 40 L74 37.5 Q84 37.5 91 44 L105 55 L32 57 Z',
    wheels: [46, 142],
    roofLen: 0.55,
  },
  SUV: {
    body: 'M12 58 L20 36 Q24 27 36 25 L92 23 Q106 23 114 31 L132 50 L166 54 Q178 56 178 66 L178 79 Q178 84 172 84 L16 84 Q9 84 9 77 L9 64 Q9 59 12 58 Z',
    glass: 'M30 39 Q33 32 42 31 L88 29 Q98 29 105 36 L120 49 L34 51 Z',
    wheels: [48, 146],
    roofLen: 0.7,
  },
  Luxury: {
    body: 'M8 63 L18 44 Q22 35 33 33 L82 30 Q97 30 107 39 L128 56 L170 60 Q184 62 184 72 L184 80 Q184 84 177 84 L12 84 Q5 84 5 77 L5 68 Q5 64 8 63 Z',
    glass: 'M27 45 Q30 38 39 37 L78 34.5 Q89 34.5 97 42 L112 54 L31 56 Z',
    wheels: [48, 150],
    roofLen: 0.58,
  },
};

export function CarArt({ car, className, showPlate = false }) {
  const [broken, setBroken] = useState(false);
  const shape = SILHOUETTES[car?.category] || SILHOUETTES.Sedan;
  const paint = car?.colorHex || '#4f46e5';
  const uid = (car?.id || 'x').replace(/[^a-z0-9]/gi, '');

  if (car?.photo && !broken) {
    return (
      <img
        src={car.photo}
        alt={car.name}
        loading="lazy"
        onError={() => setBroken(true)}
        className={cx('h-full w-full object-cover', className)}
      />
    );
  }

  return (
    <svg
      viewBox="0 0 200 110"
      className={cx('h-full w-full', className)}
      role="img"
      aria-label={`${car?.name || 'Vehicle'} illustration`}
    >
      <defs>
        <linearGradient id={`bg-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#141a30" />
          <stop offset="100%" stopColor="#0a0e1c" />
        </linearGradient>
        <linearGradient id={`paint-${uid}`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor={paint} stopOpacity="1" />
          <stop offset="55%" stopColor={paint} stopOpacity="0.86" />
          <stop offset="100%" stopColor="#05070f" stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id={`glass-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#cfe4ff" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#5b7bb5" stopOpacity="0.22" />
        </linearGradient>
        <radialGradient id={`glow-${uid}`} cx="50%" cy="115%" r="60%">
          <stop offset="0%" stopColor={paint} stopOpacity="0.35" />
          <stop offset="100%" stopColor={paint} stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="200" height="110" fill={`url(#bg-${uid})`} />
      <ellipse cx="100" cy="104" rx="86" ry="16" fill={`url(#glow-${uid})`} />

      {/* faint road grid */}
      <g opacity="0.16" stroke="#8ea2c9" strokeWidth="0.5">
        <line x1="0" y1="92" x2="200" y2="92" />
        <line x1="0" y1="99" x2="200" y2="99" strokeDasharray="7 9" />
      </g>

      <g transform="translate(6,6)">
        {/* ground shadow */}
        <ellipse cx="92" cy="88" rx="82" ry="6.5" fill="#000" opacity="0.45" />

        <path d={shape.body} fill={`url(#paint-${uid})`} />
        <path d={shape.body} fill="none" stroke="#ffffff" strokeOpacity="0.16" strokeWidth="0.9" />
        <path d={shape.glass} fill={`url(#glass-${uid})`} stroke="#ffffff" strokeOpacity="0.2" strokeWidth="0.7" />

        {/* body crease + door line */}
        <path
          d={`M28 ${shape.wheels[0] > 46 ? 70 : 68} L${shape.wheels[1] + 14} ${shape.wheels[0] > 46 ? 72 : 70}`}
          stroke="#fff"
          strokeOpacity="0.13"
          strokeWidth="1"
          fill="none"
        />
        <path d="M86 40 L88 80" stroke="#000" strokeOpacity="0.28" strokeWidth="0.8" fill="none" />

        {/* lamps */}
        <rect x="164" y="62" width="12" height="5.5" rx="2.5" fill="#ffe9a8" opacity="0.9" />
        <rect x="8" y="66" width="8" height="4.5" rx="2" fill="#ff6b6b" opacity="0.85" />

        {/* wheels */}
        {shape.wheels.map((wx) => (
          <g key={wx}>
            <circle cx={wx} cy="82" r="13" fill="#0b0f1b" />
            <circle cx={wx} cy="82" r="12" fill="none" stroke="#1c2438" strokeWidth="2.4" />
            <circle cx={wx} cy="82" r="6.4" fill="#39445f" />
            <circle cx={wx} cy="82" r="2.4" fill="#8ea2c9" opacity="0.75" />
            {[0, 60, 120, 180, 240, 300].map((deg) => (
              <line
                key={deg}
                x1={wx}
                y1="82"
                x2={wx + 5.6 * Math.cos((deg * Math.PI) / 180)}
                y2={82 + 5.6 * Math.sin((deg * Math.PI) / 180)}
                stroke="#0b0f1b"
                strokeWidth="1.5"
              />
            ))}
          </g>
        ))}
      </g>

      {showPlate && car?.plate && (
        <g>
          <rect x="132" y="88" width="58" height="13" rx="3" fill="#f8fafc" />
          <text
            x="161"
            y="97.5"
            textAnchor="middle"
            fontSize="8"
            fontWeight="700"
            fontFamily="monospace"
            fill="#0d1120"
          >
            {car.plate}
          </text>
        </g>
      )}
    </svg>
  );
}

export default CarArt;
