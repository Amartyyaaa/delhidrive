// Smart Subscription engine — the long-term half of the business, modelled on
// the "subscribe for 12–60 months, zero down payment" product VCars runs
// alongside its hourly/daily rentals.
//
// A subscription is priced off the same daily rate the rental engine uses, so
// one fleet edit moves both products. Longer tenures unlock a deeper discount;
// the monthly fee bundles insurance, servicing and roadside assistance.

export const TENURES = [
  { months: 12, label: '12 months', discount: 0.0, badge: '' },
  { months: 24, label: '24 months', discount: 0.08, badge: 'Popular' },
  { months: 36, label: '36 months', discount: 0.14, badge: 'Best value' },
  { months: 60, label: '60 months', discount: 0.2, badge: 'Lowest EMI' },
];

export const KM_PACKS = [
  { id: 'k1200', kmPerMonth: 1200, label: '1,200 km / month', multiplier: 1.0 },
  { id: 'k2000', kmPerMonth: 2000, label: '2,000 km / month', multiplier: 1.12 },
  { id: 'k3000', kmPerMonth: 3000, label: '3,000 km / month', multiplier: 1.26 },
  { id: 'kunl', kmPerMonth: 4500, label: 'Unlimited (4,500 km fair use)', multiplier: 1.44 },
];

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
 * The base is 30 days at ~44% of the daily rental rate — long tenures cost far
 * less per day than a weekend rental — then tenure discount and km pack apply.
 */
export function subscriptionQuote({ car, months = 24, packId = 'k2000', settings = {} }) {
  const daily = Number(car?.rate) || 0;
  const tenure = TENURES.find((t) => t.months === months) || TENURES[1];
  const pack = KM_PACKS.find((p) => p.id === packId) || KM_PACKS[1];

  const baseMonthly = daily * 30 * 0.44;
  const afterTenure = baseMonthly * (1 - tenure.discount);
  const monthlyRaw = afterTenure * pack.multiplier;
  const monthly = Math.round(monthlyRaw / 100) * 100; // quote in clean hundreds

  const gstRate = Number(settings.gstRate ?? 18);
  const gst = Math.round((monthly * gstRate) / 100);
  const refundableDeposit = Math.round((Number(car?.deposit) || 5000) * 2);
  const firstPayment = monthly + gst + refundableDeposit;

  const rentalEquivalent = daily * 30;
  const savingsPerMonth = Math.max(0, rentalEquivalent - monthly);

  return {
    months,
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
