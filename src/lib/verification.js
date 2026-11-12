// Renter verification — the checks that run at booking time, on top of the
// licence/Aadhaar KYC.
//
// Two things are collected before a booking can be placed:
//   1. a LIVE selfie (camera only — never the gallery, or the whole point of
//      "live" is lost), timestamped so ops can see it was taken at booking
//   2. at least one social profile, which gives operations a real, traceable
//      identity to check against the name on the licence
//
// And one thing before the keys change hands: at least five photographs of the
// car — all four sides plus the dashboard — so any damage, fuel or odometer
// dispute afterwards has a timestamped baseline.

/* ------------------------------------------------------------------ */
/* Social profiles                                                     */
/* ------------------------------------------------------------------ */
export const SOCIAL_PLATFORMS = [
  {
    id: 'instagram',
    label: 'Instagram',
    icon: 'Instagram',
    color: '#e1306c',
    placeholder: 'instagram.com/yourhandle',
    host: 'instagram.com',
    prefix: 'https://instagram.com/',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    icon: 'Facebook',
    color: '#1877f2',
    placeholder: 'facebook.com/yourprofile',
    host: 'facebook.com',
    prefix: 'https://facebook.com/',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    icon: 'Linkedin',
    color: '#0a66c2',
    placeholder: 'linkedin.com/in/yourname',
    host: 'linkedin.com',
    prefix: 'https://linkedin.com/in/',
  },
];

/** How many social profiles a renter must supply. */
export const MIN_SOCIAL_PROFILES = 1;

const SITE_HOSTS = [...SOCIAL_PLATFORMS.map((p) => p.host), 'fb.com'];

/**
 * Is this a link rather than a bare username? Usernames on all three sites may
 * contain dots ("ravi.k"), so a dot alone proves nothing: a link has a slash or
 * a scheme, starts with "www.", or is one of the sites' own addresses.
 */
function looksLikeLink(value) {
  const v = value.toLowerCase();
  return /[/:]/.test(v) || v.startsWith('www.') || SITE_HOSTS.some((h) => v === h || v.endsWith(`.${h}`));
}

/**
 * Turn whatever the renter typed into a canonical profile URL.
 *
 * Accepts "@handle", "handle", "instagram.com/handle", or a full URL with or
 * without the scheme — people paste all four.
 *
 * @returns {{ok: boolean, url?: string, handle?: string, reason?: string}}
 */
export function normaliseSocial(platformId, raw) {
  const platform = SOCIAL_PLATFORMS.find((p) => p.id === platformId);
  if (!platform) return { ok: false, reason: 'Unknown platform.' };

  const value = String(raw || '').trim();
  if (!value) return { ok: false, reason: '' };

  // A full or partial URL — pull the path out and check the host matches.
  if (looksLikeLink(value)) {
    const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    let parsed;
    try {
      parsed = new URL(withScheme);
    } catch {
      return { ok: false, reason: 'That does not look like a valid link.' };
    }
    const host = parsed.hostname.replace(/^(www\.|m\.)/i, '').toLowerCase();
    const allowed =
      host === platform.host ||
      host.endsWith(`.${platform.host}`) ||
      (platform.id === 'facebook' && host === 'fb.com');
    if (!allowed) {
      // "an Instagram link", "a Facebook link" — the article has to agree.
      const article = /^[AEIOU]/i.test(platform.label) ? 'an' : 'a';
      return { ok: false, reason: `That is not ${article} ${platform.label} link.` };
    }
    const handle = parsed.pathname.replace(/^\/+|\/+$/g, '');
    if (!handle) return { ok: false, reason: `Add your ${platform.label} profile, not just the site.` };
    return { ok: true, url: `https://${host}/${handle}`, handle: handle.split('/').pop() };
  }

  // Bare handle, with or without the @.
  const handle = value.replace(/^@/, '');
  if (!/^[A-Za-z0-9._-]{2,}$/.test(handle)) {
    return { ok: false, reason: 'Enter your profile link or username.' };
  }
  return { ok: true, url: platform.prefix + handle, handle };
}

/**
 * Validate the whole social block.
 * @returns {{ok: boolean, profiles: object, count: number, errors: object}}
 */
export function validateSocials(input = {}) {
  const profiles = {};
  const errors = {};
  let count = 0;

  for (const platform of SOCIAL_PLATFORMS) {
    const raw = input[platform.id];
    if (!String(raw || '').trim()) continue;
    const res = normaliseSocial(platform.id, raw);
    if (res.ok) {
      profiles[platform.id] = { url: res.url, handle: res.handle };
      count += 1;
    } else if (res.reason) {
      errors[platform.id] = res.reason;
    }
  }

  return {
    ok: count >= MIN_SOCIAL_PROFILES && Object.keys(errors).length === 0,
    profiles,
    count,
    errors,
  };
}

/* ------------------------------------------------------------------ */
/* Vehicle condition capture                                           */
/* ------------------------------------------------------------------ */

/**
 * The photos every inspection must have, in the order the renter walks round
 * the car and then climbs in. Each carries the framing instruction shown next
 * to it so the photos are usable as evidence rather than blurry close-ups.
 */
export const REQUIRED_PHOTOS = [
  {
    id: 'front',
    label: 'Front',
    short: 'Front',
    hint: 'Stand about 2 metres back. Bumper, both headlights and the number plate in frame.',
    icon: 'CarFront',
  },
  {
    id: 'right',
    label: 'Right side (driver)',
    short: 'Right',
    hint: 'Full side profile — both doors, both wheels and the mirror.',
    icon: 'ArrowRight',
  },
  {
    id: 'rear',
    label: 'Rear',
    short: 'Rear',
    hint: 'Boot, tail lights and the rear number plate.',
    icon: 'Car',
  },
  {
    id: 'left',
    label: 'Left side (passenger)',
    short: 'Left',
    hint: 'Full side profile from the kerb side, both wheels visible.',
    icon: 'ArrowLeft',
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    short: 'Dashboard',
    hint: 'Ignition on — odometer and fuel gauge readable in the same shot.',
    icon: 'Gauge',
  },
];

/** Fewest photos an inspection can be filed with. */
export const MIN_INSPECTION_PHOTOS = REQUIRED_PHOTOS.length;

/** Which required photos are still missing from an inspection record. */
export function missingPhotos(shots = {}) {
  return REQUIRED_PHOTOS.filter((s) => !shots[s.id]);
}

export function photosComplete(shots = {}) {
  return missingPhotos(shots).length === 0;
}

/* ------------------------------------------------------------------ */
/* Booking gate                                                        */
/* ------------------------------------------------------------------ */

/**
 * Where a renter's KYC stands, as far as booking is concerned. Documents must
 * be submitted before a booking can be placed at all; until operations verify
 * them, the booking waits under review instead of being confirmed.
 *
 * @returns {{submitted: boolean, verified: boolean, status: string, blocker: string}}
 */
export function kycGate(kyc) {
  const status = kyc?.status || 'Not submitted';
  if (status === 'Verified') return { submitted: true, verified: true, status, blocker: '' };
  if (status === 'Pending Review') return { submitted: true, verified: false, status, blocker: '' };
  return {
    submitted: false,
    verified: false,
    status,
    blocker:
      status === 'Rejected'
        ? 'Your KYC was rejected — upload your documents again before booking.'
        : 'Upload your driving licence and Aadhaar (KYC) before booking.',
  };
}

/**
 * Everything that must be true before a booking may be placed.
 * Returns a list of human-readable blockers (empty means good to go).
 */
export function bookingBlockers({ selfieUri, socials, kyc }) {
  const blockers = [];
  const gate = kycGate(kyc);
  if (!gate.submitted) blockers.push(gate.blocker);
  if (!selfieUri) blockers.push('Take a live verification selfie.');
  const social = validateSocials(socials);
  if (social.count < MIN_SOCIAL_PROFILES) {
    blockers.push(
      `Add at least ${MIN_SOCIAL_PROFILES} social profile (Instagram, Facebook or LinkedIn).`
    );
  }
  for (const reason of Object.values(social.errors)) blockers.push(reason);
  return blockers;
}
