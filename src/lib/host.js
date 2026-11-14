// Host Your Car — what a vendor's application has to contain, and how an
// approved one becomes a car in the fleet.
//
// The rules that matter for safety (a vendor cannot approve their own car, an
// application needs the RC, the insurance and 6–8 photos) are enforced in the
// database by supabase-host-your-car.sql. These are the friendly versions that
// tell a vendor what is missing before they press Submit.

import { CATEGORIES, TRANSMISSIONS, FUELS } from '../data/fleet';
import { SELF_PICKUP_HUB } from './pricing';
import { supabaseReady } from './supabase';

export const HOST_STATUS = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };

export const MIN_CAR_PHOTOS = 6;
export const MAX_CAR_PHOTOS = 8;

/** The storage bucket refuses anything larger; say so before uploading. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** The message a vendor sends operations once they have submitted. */
export const HOST_SUBMITTED_MESSAGE = 'I have just uploaded my car pictures and details for Delhi Drive.';

/** The angles that make a listing — shown as a checklist, not enforced one by one. */
export const PHOTO_ANGLES = ['Front', 'Rear', 'Left side', 'Right side', 'Dashboard', 'Seats'];

export const INSURANCE_TYPES = ['Comprehensive', 'Zero depreciation', 'Third party only'];

export const SEAT_OPTIONS = [4, 5, 6, 7, 8];

export const CAR_COLOURS = [
  { name: 'White', hex: '#ecf0f1' },
  { name: 'Silver', hex: '#bdc3c7' },
  { name: 'Grey', hex: '#7f8c8d' },
  { name: 'Black', hex: '#1c1c1c' },
  { name: 'Red', hex: '#c0392b' },
  { name: 'Blue', hex: '#2980b9' },
  { name: 'Brown', hex: '#7b5a44' },
  { name: 'Orange', hex: '#d35400' },
  { name: 'Green', hex: '#16a085' },
  { name: 'Other', hex: '#34495e' },
];

export const REJECTION_REASONS = [
  'Photos are unclear — please retake them in daylight',
  'RC is unreadable or does not match the car',
  'Insurance has expired or is third-party only',
  'Registration number does not match the documents',
  'We are not onboarding this model right now',
];

/* ------------------------------------------------------------------ */
/* Registration number and phone                                       */
/* ------------------------------------------------------------------ */

/** "dl-3c ab 1234" -> "DL3CAB1234" — the form two plates are compared in. */
export const plateKey = (raw) =>
  String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

// State, RTO, series, number — and the Bharat series (22 BH 1234 AA).
const PLATE_STANDARD = /^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/;
const PLATE_BHARAT = /^(\d{2})(BH)(\d{4})([A-Z]{1,2})$/;

export function isValidPlate(raw) {
  const key = plateKey(raw);
  return key.length >= 6 && (PLATE_STANDARD.test(key) || PLATE_BHARAT.test(key));
}

/** Space a registration number the way it is painted on the plate. */
export function formatPlate(raw) {
  const key = plateKey(raw);
  const bharat = key.match(PLATE_BHARAT);
  if (bharat) return bharat.slice(1).join(' ');
  const m = key.match(PLATE_STANDARD);
  if (!m) return key;
  const [, state, rto, series, number] = m;
  // Delhi folds the vehicle class into the RTO code: DL 3C AB 1234.
  if (state === 'DL' && series) {
    return [state, rto + series[0], series.slice(1), number].filter(Boolean).join(' ');
  }
  return [state, rto, series, number].filter(Boolean).join(' ');
}

/** The ten digits of an Indian mobile number, however it was typed. */
export const mobileDigits = (raw) =>
  String(raw || '')
    .replace(/\D/g, '')
    .slice(-10);

export const isValidMobile = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '');
  return /^(91|0)?[6-9]\d{9}$/.test(digits);
};

/* ------------------------------------------------------------------ */
/* The application form                                                */
/* ------------------------------------------------------------------ */

export const BLANK_APPLICATION = {
  host: { name: '', phone: '', city: '', address: '' },
  car: {
    brand: '',
    model: '',
    variant: '',
    year: '',
    plate: '',
    category: '',
    fuel: '',
    transmission: '',
    seats: '5',
    colour: '',
    kmDriven: '',
    expectedRate: '',
    features: '',
  },
  insurance: { type: '', validTill: '' },
  docs: { rc: null, rcBack: null, insurance: null },
  photos: [],
  declared: false,
};

const todayYmd = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * Everything wrong with a draft, keyed by field ("host.phone", "docs.rc",
 * "photos"…). An empty object means it can be submitted.
 */
export function validateApplication(draft) {
  const e = {};
  const { host, car, insurance, docs, photos } = draft;
  const thisYear = new Date().getFullYear();

  if (host.name.trim().length < 3) e['host.name'] = 'Enter your full name, as on the RC.';
  if (!isValidMobile(host.phone)) e['host.phone'] = 'Enter a valid 10-digit mobile number.';
  if (host.city.trim().length < 2) e['host.city'] = 'Tell us where the car is parked.';

  if (!car.brand.trim()) e['car.brand'] = 'Enter the make — Maruti Suzuki, Hyundai…';
  if (!car.model.trim()) e['car.model'] = 'Enter the model — Swift, Creta…';
  const year = Number(car.year);
  if (!Number.isInteger(year) || year < 1995 || year > thisYear) {
    e['car.year'] = `Enter the year of manufacture, up to ${thisYear}.`;
  }
  if (!isValidPlate(car.plate)) e['car.plate'] = 'Enter the registration number, like DL 3C AB 1234.';
  if (!CATEGORIES.includes(car.category)) e['car.category'] = 'Choose the type of car.';
  if (!FUELS.includes(car.fuel)) e['car.fuel'] = 'Choose the fuel.';
  if (!TRANSMISSIONS.includes(car.transmission)) e['car.transmission'] = 'Choose the gearbox.';
  if (!SEAT_OPTIONS.includes(Number(car.seats))) e['car.seats'] = 'Choose the number of seats.';
  const km = Number(car.kmDriven);
  if (car.kmDriven === '' || !Number.isFinite(km) || km < 0 || km > 999999) {
    e['car.kmDriven'] = 'Enter the odometer reading in km.';
  }
  if (car.expectedRate !== '' && !(Number(car.expectedRate) >= 300 && Number(car.expectedRate) <= 100000)) {
    e['car.expectedRate'] = 'Enter a daily rent in rupees, or leave it blank.';
  }

  if (!docs.rc?.ref) e['docs.rc'] = 'Upload the RC.';
  if (!docs.insurance?.ref) e['docs.insurance'] = 'Upload the insurance policy.';
  if (!insurance.validTill) e['insurance.validTill'] = 'Enter the date the insurance runs to.';
  else if (insurance.validTill < todayYmd()) e['insurance.validTill'] = 'This insurance has expired. Renew it before listing the car.';

  const ready = photos.filter((p) => p.ref).length;
  if (ready < MIN_CAR_PHOTOS) {
    e.photos = `Add at least ${MIN_CAR_PHOTOS} photos of the car — you have ${ready}.`;
  }

  const busy = photos.some((p) => p.busy) || Object.values(docs).some((d) => d?.busy);
  if (busy) e.uploads = 'Wait for the uploads to finish.';

  if (!draft.declared) e.declared = 'Please confirm the declaration.';
  return e;
}

/** A short code a vendor can quote: HST + six characters. */
export const newHostRef = () => 'HST' + Date.now().toString(36).toUpperCase().slice(-6);

/** The row that is written when a vendor submits. */
export function toApplicationRecord(draft, { user, ref, replaces }) {
  const { host, car, insurance, docs, photos } = draft;
  const colour = CAR_COLOURS.find((c) => c.name === car.colour);
  return {
    ref,
    userId: user.uid,
    status: HOST_STATUS.pending,
    submittedAt: Date.now(),
    ...(replaces ? { replaces } : {}),
    host: {
      name: host.name.trim(),
      phone: mobileDigits(host.phone),
      email: user.email || '',
      city: host.city.trim(),
      address: host.address.trim(),
    },
    car: {
      brand: car.brand.trim(),
      model: car.model.trim(),
      variant: car.variant.trim(),
      year: Number(car.year),
      plate: formatPlate(car.plate),
      category: car.category,
      fuel: car.fuel,
      transmission: car.transmission,
      seats: Number(car.seats),
      colour: car.colour,
      colourHex: colour?.hex || '',
      kmDriven: Number(car.kmDriven),
      expectedRate: car.expectedRate === '' ? null : Math.round(Number(car.expectedRate)),
      features: car.features.trim(),
    },
    insurance: { type: insurance.type, validTill: insurance.validTill },
    docs: {
      rc: docs.rc.ref,
      ...(docs.rcBack?.ref ? { rcBack: docs.rcBack.ref } : {}),
      insurance: docs.insurance.ref,
    },
    photos: photos.filter((p) => p.ref).map((p) => ({ ref: p.ref })),
    declaration: { accepted: true, at: Date.now() },
  };
}

/** Load a rejected application back into the form, files and all, to fix and re-send. */
export function draftFromApplication(app) {
  const file = (ref, name) => (ref ? { id: `kept-${name}`, ref, name, pdf: isPdfRef(ref) } : null);
  return {
    host: {
      name: app.host?.name || '',
      phone: app.host?.phone || '',
      city: app.host?.city || '',
      address: app.host?.address || '',
    },
    car: {
      brand: app.car?.brand || '',
      model: app.car?.model || '',
      variant: app.car?.variant || '',
      year: String(app.car?.year || ''),
      plate: app.car?.plate || '',
      category: app.car?.category || '',
      fuel: app.car?.fuel || '',
      transmission: app.car?.transmission || '',
      seats: String(app.car?.seats || '5'),
      colour: app.car?.colour || '',
      kmDriven: app.car?.kmDriven == null ? '' : String(app.car.kmDriven),
      expectedRate: app.car?.expectedRate == null ? '' : String(app.car.expectedRate),
      features: app.car?.features || '',
    },
    insurance: { type: app.insurance?.type || '', validTill: app.insurance?.validTill || '' },
    docs: {
      rc: file(app.docs?.rc, 'RC'),
      rcBack: file(app.docs?.rcBack, 'RC (back)'),
      insurance: file(app.docs?.insurance, 'Insurance'),
    },
    photos: (app.photos || []).map((p, i) => file(p.ref, `Photo ${i + 1}`)).filter(Boolean),
    declared: false,
  };
}

/**
 * An application with only the files that are really its owner's — in the
 * hosts bucket, under their own folder. The database refuses anything else
 * when an application is filed; the console checks again before it shows or
 * publishes a file, so a record that slipped past could never get someone
 * else's document opened or put on a public listing.
 */
export function withOwnFiles(app) {
  if (!supabaseReady) return app; // the local store keeps the files inline
  const own = (ref) => typeof ref === 'string' && ref.startsWith(`hosts:${app.userId}/`);
  return {
    ...app,
    photos: (app.photos || []).filter((p) => own(p?.ref)),
    docs: Object.fromEntries(Object.entries(app.docs || {}).filter(([, ref]) => own(ref))),
  };
}

/** "Maruti Suzuki Swift VXI" */
export const carTitle = (app) =>
  [app?.car?.brand, app?.car?.model, app?.car?.variant]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Car';

/** Is this reference (or inlined file) a PDF rather than a picture? */
export const isPdfRef = (ref) => /\.pdf$/i.test(String(ref || '')) || /^data:application\/pdf/i.test(String(ref || ''));

/* ------------------------------------------------------------------ */
/* From approved application to fleet car                              */
/* ------------------------------------------------------------------ */

const DEPOSIT_BY_CATEGORY = { Hatchback: 3000, Sedan: 3000, SUV: 4000, Luxury: 15000 };

// Short slabs are priced off the day rate, rounded up to the next ₹10 — the
// same sums as every car already in the fleet (₹1,499 a day is ₹900 for 12h).
const ceil10 = (n) => Math.ceil(n) * 10;
export const slab12h = (rate) => ceil10(((Number(rate) || 0) * 6) / 100);
export const slab6h = (rate) => ceil10(((Number(rate) || 0) * 4) / 100);

/**
 * The fleet id for an application. Derived from the application, so approving
 * twice — a retry after a dropped connection, say — updates the one listing
 * instead of creating a second.
 */
export const fleetIdFor = (app) =>
  'host-' +
  String(app.id)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 12);

const splitFeatures = (text) =>
  String(text || '')
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);

/** Starting values for the listing an admin publishes. They can change any of them. */
export function listingDefaults(app) {
  const car = app.car || {};
  const category = CATEGORIES.includes(car.category) ? car.category : 'Hatchback';
  const fuel = FUELS.includes(car.fuel) ? car.fuel : 'Petrol';
  const rate = Number(car.expectedRate) > 0 ? Math.round(Number(car.expectedRate)) : '';
  return {
    name: carTitle(app),
    brand: car.brand || '',
    category,
    transmission: TRANSMISSIONS.includes(car.transmission) ? car.transmission : 'Manual',
    fuel,
    seats: Number(car.seats) || 5,
    mileage: fuel === 'EV' ? 300 : 18,
    rate,
    rate12h: rate ? slab12h(rate) : '',
    deposit: DEPOSIT_BY_CATEGORY[category],
    extraKmCharge: 10,
    engineCc: fuel === 'EV' ? 0 : 1200,
    bootLitres: 300,
    plate: formatPlate(car.plate),
    hub: SELF_PICKUP_HUB.id,
    colorHex: car.colourHex || '#34495e',
    terrain: ['City', 'Highway'],
    zeroDep: app.insurance?.type === 'Zero depreciation',
    featuresText: splitFeatures(car.features).join('\n'),
  };
}

/**
 * The `fleet` row for an approved car — the same shape as a car added in
 * Admin → Fleet inventory, so the website and the app treat it like any other.
 *
 * The fleet table is public. Nothing about the owner goes in here: only the
 * application's id, which means something to an admin and nobody else.
 */
export function toFleetCar(listing, { id, applicationId, photos }) {
  const { featuresText, ...rest } = listing;
  const rate = Math.round(Number(rest.rate));
  return {
    ...rest,
    id,
    name: String(rest.name).trim(),
    brand: String(rest.brand).trim(),
    seats: Number(rest.seats),
    mileage: Number(rest.mileage) || 0,
    rate,
    // Every seeded car carries a 6-hour figure too; keep hosted cars in step.
    rate6h: slab6h(rate),
    rate12h: Math.round(Number(rest.rate12h)) || slab12h(rate),
    deposit: Math.round(Number(rest.deposit)) || 0,
    extraKmCharge: Number(rest.extraKmCharge) || 0,
    engineCc: Number(rest.engineCc) || 0,
    bootLitres: Number(rest.bootLitres) || 0,
    available: true,
    status: 'active',
    rating: 4.5,
    reviewCount: 0,
    reviews: [],
    features: splitFeatures(featuresText),
    photo: photos[0] || '',
    photos,
    hosted: true,
    hostApplicationId: applicationId,
  };
}
