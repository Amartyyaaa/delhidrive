// DelhiDrive wordmark, drawn as SVG so it stays crisp at any size and needs no
// image file. "DELHI" in the brand green, "DRIVE" in white, with the tagline
// rule underneath — matching the printed logo.

import { cx } from '../lib/format';

const GREEN = '#128A4B';

/**
 * @param {object}  props
 * @param {boolean} props.tagline  show "Move Ahead To Destiny" underneath
 * @param {string}  props.driveColor  colour of the DRIVE half (dark surfaces want white)
 */
export function Logo({ className, tagline = true, driveColor = '#ffffff' }) {
  return (
    <svg
      viewBox={tagline ? '0 0 420 108' : '0 0 420 74'}
      className={cx('h-auto w-full', className)}
      role="img"
      aria-label="DelhiDrive — Move Ahead To Destiny"
    >
      <text
        x="0"
        y="56"
        fontFamily="Sora, Inter, Arial Black, sans-serif"
        fontSize="58"
        fontWeight="800"
        letterSpacing="-1"
      >
        <tspan fill={GREEN}>DELHI</tspan>
        <tspan fill={driveColor}>DRIVE</tspan>
      </text>

      {tagline && (
        <g>
          <line x1="2" y1="82" x2="52" y2="82" stroke={driveColor} strokeWidth="4" strokeLinecap="round" />
          <text
            x="210"
            y="90"
            textAnchor="middle"
            fontFamily="Inter, Segoe UI, sans-serif"
            fontSize="20"
            fontWeight="600"
            letterSpacing="3.4"
            fill={driveColor}
          >
            Move Ahead To Destiny
          </text>
          <line x1="368" y1="82" x2="418" y2="82" stroke={driveColor} strokeWidth="4" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}

/** Square badge version for the nav, favicons and tight spaces. */
export function LogoMark({ className }) {
  return (
    <svg viewBox="0 0 100 100" className={cx('h-full w-full', className)} role="img" aria-label="DelhiDrive">
      <rect width="100" height="100" rx="24" fill={GREEN} />
      <path
        d="M20 62h60l-6.5-19a9 9 0 0 0-8.5-6H35a9 9 0 0 0-8.5 6z"
        fill="#fff"
        opacity="0.96"
      />
      <rect x="18" y="62" width="64" height="9" rx="4.5" fill="#fff" opacity="0.9" />
      <circle cx="34" cy="74" r="7" fill="#0b0b0b" />
      <circle cx="34" cy="74" r="3" fill="#fff" />
      <circle cx="66" cy="74" r="7" fill="#0b0b0b" />
      <circle cx="66" cy="74" r="3" fill="#fff" />
      <path d="M30 44h40l3.5 11H26.5z" fill={GREEN} opacity="0.35" />
    </svg>
  );
}

export default Logo;
