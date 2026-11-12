// Smart Subscription engine — the long-term half of the business, modelled on
// the "subscribe for 12–60 months, zero down payment" product VCars runs
// alongside its hourly/daily rentals.
//
// By default a subscription is priced off the same daily rate the rental
// engine uses, so one fleet edit moves both products. Operations can instead set
// a car's monthly fee for each tenure by hand (Admin > Subscriptions), and the
// extra cost of each km pack. Longer tenures unlock a deeper discount; the
// monthly fee bundles insurance, servicing and roadside assistance.

export const TENURES = [
  { months: 12, label: '12 months', discount: 0.0, badge: '' },
  { months: 24, label: '24 months', discount: 0.08, badge: 'Popular' },
  { months: 36, label: '36 months', discount: 0.14, badge: 'Best value' },
  { months: 60, label: '60 months', discount: 0.2, badge: 'Lowest EMI' },
];

/** `surcharge` is the default extra cost over the 1,200 km pack, in %. The console can change it. */
export const KM_PACKS = [
  { id: 'k1200', kmPerMonth: 1200, label: '1,200 km / month', surcharge: 0 },
  { id: 'k2000', kmPerMonth: 2000, label: '2,000 km / month', surcharge: 12 },
  { id: 'k3000', kmPerMonth: 3000, label: '3,000 km / month', surcharge: 26 },
  { id: 'kunl', kmPerMonth: 4500, label: 'Unlimited (4,500 km fair use)', surcharge: 44 },
];

/** Extra cost of a km pack over the base pack, in %, as set in the console. */
export function packSurcharge(pack, settings) {
  const set = settings?.subPackSurcharge?.[pack.id];
  return set === undefined || set === null || set === '' ? pack.surcharge : Number(set) || 0;
}

/** The formula's monthly fee on the base 1,200 km pack: 30 days at ~44% of the daily rate. */
export function formulaMonthly(car, months) {
  const tenure = TENURES.find((t) => t.months === months) || TENURES[1];
  const daily = Number(car?.rate) || 0;
  return Math.round((daily * 30 * 0.44 * (1 - tenure.discount)) / 100) * 100;
}

/** The monthly fee operations set by hand for this car and tenure, or 0 if none. */
export function customMonthly(car, months) {
  const set = Number(car?.subPrices?.[months]);
  return set > 0 ? set : 0;
}

export const SUBSCRIPTION_INCLUSIONS = [
  { icon: 'ShieldCheck', label: 'Zero down payment', note: 'No lump sum, no loan paperwork.' },
  { icon: 'Wrench', label: 'Servicing included', note: 'Scheduled service, wear parts and labour.' },
  { icon: 'Umbrella', label: 'Insurance included', note: 'Comprehensive cover with zero-dep on eligible cars.' },
  { icon: 'CarFront', label: 'Roadside assistance', note: '24×7 across Delhi NCR and highways.' },
  { icon: 'Repeat', label: 'Swap or exit', note: 'Swap the car after 6 months, exit after 12.' },
  { icon: 'FileText', label: 'Minimal paperwork', note: 'DL + Aadhaar, verified inside the app.' },
];

/**
 * Monthly fee for a subscription.
 *
 * A price set in the console for this car and tenure is used as it stands on
 * the base pack. Otherwise the base is 30 days at ~44% of the daily rental
 * rate — long tenures cost far less per day than a weekend rental — less the
 * tenure discount. The km pack's surcharge applies on top of either.
 */
export function subscriptionQuote({ car, months = 24, packId = 'k2000', settings = {} }) {
  const daily = Number(car?.rate) || 0;
  const tenure = TENURES.find((t) => t.months === months) || TENURES[1];
  const pack = KM_PACKS.find((p) => p.id === packId) || KM_PACKS[1];

  const factor = 1 + packSurcharge(pack, settings) / 100;
  const custom = customMonthly(car, tenure.months);
  const monthly = custom
    ? factor === 1
      ? custom
      : Math.round((custom * factor) / 10) * 10
    : Math.round((daily * 30 * 0.44 * (1 - tenure.discount) * factor) / 100) * 100; // clean hundreds

  const gstRate = Number(settings.gstRate ?? 18);
  const gst = Math.round((monthly * gstRate) / 100);
  const refundableDeposit = Math.round((Number(car?.deposit) || 5000) * 2);
  const firstPayment = monthly + gst + refundableDeposit;

  const rentalEquivalent = daily * 30;
  const savingsPerMonth = Math.max(0, rentalEquivalent - monthly);

  return {
    months,
    custom: Boolean(custom),
    tenure,
    pack,
    monthly,
    gstRate,
    gst,
    monthlyWithGst: monthly + gst,
    refundableDeposit,
    firstPayment,
    totalCommitment: (monthly + gst) * months,
    extraKmCharge: Number(car?.extraKmCharge) || 10,
    rentalEquivalent,
    savingsPerMonth,
    savingsPercent: rentalEquivalent ? Math.round((savingsPerMonth / rentalEquivalent) * 100) : 0,
  };
}

/** Human-readable state of a live subscription. */
export function subscriptionStatus(sub) {
  if (!sub) return null;
  const start = Number(sub.startMs) || Date.now();
  const monthsElapsed = Math.max(0, Math.floor((Date.now() - start) / (30 * 86400000)));
  const monthsLeft = Math.max(0, (sub.months || 0) - monthsElapsed);
  const nextBillingMs = start + (monthsElapsed + 1) * 30 * 86400000;
  return {
    monthsElapsed,
    monthsLeft,
    nextBillingMs,
    canSwap: monthsElapsed >= 6,
    canExit: monthsElapsed >= 12,
    kmUsed: Number(sub.kmUsed) || 0,
    kmAllowance: (Number(sub.kmPerMonth) || 0) * Math.max(1, monthsElapsed + 1),
  };
}
