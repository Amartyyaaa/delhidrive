// Reservation pricing engine — the single source of truth for every rupee
// shown to a customer, on the checkout page, in the invoice PDF and in admin.

export const LOCATIONS = [
  { id: 't3', label: 'Delhi Airport T3', note: 'Kerbside pickup, Gate 5', fee: 299 },
  { id: 'cp', label: 'Connaught Place', note: 'Block N, Outer Circle', fee: 0 },
  { id: 'cyber', label: 'Cyber City Gurgaon', note: 'DLF Cyber Hub, P2 Level', fee: 0 },
  { id: 'noida18', label: 'Noida Sector 18', note: 'Atta Market, Gate B', fee: 0 },
  { id: 'door', label: 'Doorstep Delivery', note: 'Anywhere inside Delhi NCR', fee: 499 },
];

export const ADDONS = [
  {
    id: 'fasttag',
    label: 'FASTag Toll Pass',
    desc: 'Pre-loaded FASTag — no cash stops on NH-48 or the Yamuna Expressway.',
    price: 149,
    unit: 'booking',
    icon: 'Ticket',
  },
  {
    id: 'childSeat',
    label: 'Child Safety Seat',
    desc: 'ISOFIX-mounted seat, certified for 9–36 kg.',
    price: 199,
    unit: 'day',
    icon: 'Baby',
  },
  {
    id: 'gps',
    label: 'GPS Navigation Unit',
    desc: 'Dash-mounted navigator with offline Delhi NCR maps.',
    price: 99,
    unit: 'day',
    icon: 'Navigation',
  },
  {
    id: 'addDriver',
    label: 'Additional Driver Cover',
    desc: 'Adds a second licensed driver to the insurance policy.',
    price: 299,
    unit: 'booking',
    icon: 'UserPlus',
  },
  {
    id: 'fullTank',
    label: 'Full Tank Prepaid',
    desc: 'Start full, return empty. No refuelling detour before drop-off.',
    price: 3500,
    unit: 'booking',
    icon: 'Fuel',
  },
];

export const PAYMENT_METHODS = [
  { id: 'upi', label: 'UPI / QR', desc: 'GPay · PhonePe · Paytm', icon: 'QrCode' },
  { id: 'card', label: 'Credit / Debit Card', desc: 'Visa · Mastercard · RuPay', icon: 'CreditCard' },
  { id: 'netbanking', label: 'Netbanking', desc: '58 Indian banks supported', icon: 'Landmark' },
  { id: 'cod', label: 'Cash on Delivery', desc: 'Pay the delivery executive', icon: 'Banknote' },
];

export const DEFAULT_SETTINGS = {
  gstRate: 18,
  securityDeposit: 5000,
  latePenaltyPerHour: 350,
  weekendSurge: 1.15,
  festiveSurge: 1.25,
  festiveEnabled: false,
  cancellationWindowHours: 24,
  minRentalHours: 4,
  overspeedLimitKph: 100,
};

/** Number of chargeable days between two timestamps (part-days round up). */
export function rentalDays(pickupMs, returnMs) {
  const ms = Math.max(0, returnMs - pickupMs);
  return Math.max(1, Math.ceil(ms / 86400000));
}

/**
 * Short rentals are billed on 6-hour and 12-hour slabs rather than a full day,
 * matching how the fleet is actually priced. Anything longer falls back to the
 * daily rate × number of days.
 *
 * @returns {{amount, label, tier, unitRate, units}}
 */
export function baseCharge(car, pickupMs, returnMs) {
  const hours = rentalHours(pickupMs, returnMs);
  const daily = Number(car?.rate) || 0;
  const r6 = Number(car?.rate6h) || 0;
  const r12 = Number(car?.rate12h) || 0;

  if (r6 && hours > 0 && hours <= 6) {
    return { amount: r6, label: '6-hour slab', tier: '6h', unitRate: r6, units: 1 };
  }
  if (r12 && hours > 6 && hours <= 12) {
    return { amount: r12, label: '12-hour slab', tier: '12h', unitRate: r12, units: 1 };
  }
  const days = rentalDays(pickupMs, returnMs);
  return {
    amount: daily * days,
    label: `${days} day${days > 1 ? 's' : ''}`,
    tier: 'daily',
    unitRate: daily,
    units: days,
  };
}

export function rentalHours(pickupMs, returnMs) {
  return Math.max(0, (returnMs - pickupMs) / 3600000);
}

/** Weekend (Fri/Sat/Sun pickup) and festive surge stack into one multiplier. */
export function surgeFor(pickupMs, settings) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const day = new Date(pickupMs).getDay(); // 0 Sun .. 6 Sat
  const weekend = day === 0 || day === 5 || day === 6;
  let multiplier = 1;
  const reasons = [];
  if (weekend && s.weekendSurge > 1) {
    multiplier *= Number(s.weekendSurge);
    reasons.push(`Weekend demand ×${Number(s.weekendSurge).toFixed(2)}`);
  }
  if (s.festiveEnabled && s.festiveSurge > 1) {
    multiplier *= Number(s.festiveSurge);
    reasons.push(`Festive season ×${Number(s.festiveSurge).toFixed(2)}`);
  }
  return { multiplier, reasons };
}

/** Validate a promo code against the cart. Returns {ok, discount, reason}. */
export function applyCoupon(code, coupons, subtotal) {
  if (!code) return { ok: false, discount: 0, reason: '' };
  const c = coupons.find((x) => String(x.code).toUpperCase() === String(code).trim().toUpperCase());
  if (!c) return { ok: false, discount: 0, reason: 'That code does not exist.' };
  if (c.active === false) return { ok: false, discount: 0, reason: 'This code is no longer active.' };
  const now = Date.now();
  if (c.validFrom && now < new Date(c.validFrom).getTime())
    return { ok: false, discount: 0, reason: `Valid from ${new Date(c.validFrom).toLocaleDateString('en-IN')}.` };
  if (c.validTo && now > new Date(c.validTo).getTime() + 86399000)
    return { ok: false, discount: 0, reason: 'This code has expired.' };
  if (c.minOrder && subtotal < Number(c.minOrder))
    return {
      ok: false,
      discount: 0,
      reason: `Needs a cart of ₹${Number(c.minOrder).toLocaleString('en-IN')} or more.`,
    };

  let discount =
    c.type === 'percent' ? (subtotal * Number(c.value)) / 100 : Math.min(Number(c.value), subtotal);
  if (c.maxDiscount) discount = Math.min(discount, Number(c.maxDiscount));
  discount = Math.round(discount);
  return { ok: true, discount, coupon: c, reason: `${c.label || c.code} applied` };
}

/**
 * The full quote. Everything downstream (checkout summary, invoice PDF,
 * admin revenue) reads these fields, so there is one arithmetic path.
 */
export function computeQuote({
  car,
  pickupMs,
  returnMs,
  addons = {},
  locationId,
  dropLocationId,
  couponCode = '',
  coupons = [],
  settings = DEFAULT_SETTINGS,
}) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const days = rentalDays(pickupMs, returnMs);
  const hours = rentalHours(pickupMs, returnMs);
  const rate = Number(car?.rate) || 0;

  const { multiplier: surge, reasons: surgeReasons } = surgeFor(pickupMs, s);
  const charge = baseCharge(car, pickupMs, returnMs);
  const baseRaw = charge.amount;
  const base = Math.round(baseRaw * surge);
  const surgeAmount = base - baseRaw;

  // Per-day add-ons are billed for at least one day even on a short slab.
  const addonDays = charge.tier === 'daily' ? days : 1;
  const addonLines = ADDONS.filter((a) => addons[a.id]).map((a) => ({
    id: a.id,
    label: a.label,
    qty: a.unit === 'day' ? addonDays : 1,
    unitPrice: a.price,
    amount: a.unit === 'day' ? a.price * addonDays : a.price,
  }));
  const addonTotal = addonLines.reduce((sum, l) => sum + l.amount, 0);

  const pickupHub = LOCATIONS.find((l) => l.id === locationId);
  const dropHub = LOCATIONS.find((l) => l.id === dropLocationId);
  const pickupFee = pickupHub?.fee || 0;
  // A different drop hub than pickup incurs the drop hub's fee too.
  const dropFee = dropHub && dropHub.id !== pickupHub?.id ? dropHub.fee || 0 : 0;
  const logisticsFee = pickupFee + dropFee;

  const subtotal = base + addonTotal + logisticsFee;
  const couponResult = applyCoupon(couponCode, coupons, subtotal);
  const discount = couponResult.ok ? couponResult.discount : 0;

  const taxable = Math.max(0, subtotal - discount);
  const gstRate = Number(s.gstRate) || 0;
  const gst = Math.round((taxable * gstRate) / 100);
  const deposit = Number(car?.deposit ?? s.securityDeposit) || 0;
  const payable = taxable + gst + deposit;

  return {
    days,
    hours,
    rate,
    charge,
    surge,
    surgeReasons,
    surgeAmount,
    base,
    addonLines,
    addonTotal,
    pickupFee,
    dropFee,
    logisticsFee,
    subtotal,
    discount,
    couponResult,
    taxable,
    gstRate,
    gst,
    deposit,
    payable,
    latePenaltyPerHour: Number(s.latePenaltyPerHour) || 0,
  };
}

/** Refund policy: full refund if cancelling more than N hours before pickup. */
export function refundFor(booking, settings = DEFAULT_SETTINGS) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const hoursToPickup = (booking.pickupMs - Date.now()) / 3600000;
  const rentPaid = (booking.quote?.taxable || 0) + (booking.quote?.gst || 0);
  const deposit = booking.quote?.deposit || 0;
  if (hoursToPickup >= s.cancellationWindowHours) {
    return {
      tier: 'full',
      label: `Free cancellation (${s.cancellationWindowHours}h+ before pickup)`,
      rentRefund: rentPaid,
      depositRefund: deposit,
      fee: 0,
      total: rentPaid + deposit,
    };
  }
  if (hoursToPickup >= 6) {
    const fee = Math.round(rentPaid * 0.25);
    return {
      tier: 'partial',
      label: 'Late cancellation — 25% retained',
      rentRefund: rentPaid - fee,
      depositRefund: deposit,
      fee,
      total: rentPaid - fee + deposit,
    };
  }
  const fee = Math.round(rentPaid * 0.5);
  return {
    tier: 'minimal',
    label: 'Under 6h to pickup — 50% retained',
    rentRefund: rentPaid - fee,
    depositRefund: deposit,
    fee,
    total: rentPaid - fee + deposit,
  };
}
