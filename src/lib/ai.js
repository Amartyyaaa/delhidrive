// DelhiDrive Copilot — the context-aware support brain (module 5).
//
// Intents are matched against live platform data (the actual fleet, the actual
// coupon table, the actual admin settings) so answers always reflect the
// current configuration rather than hard-coded copy.

import { ADDONS, LOCATIONS, DEFAULT_SETTINGS } from './pricing';
import { inr } from './format';

const has = (q, ...words) => words.some((w) => q.includes(w));

/* ------------------------------------------------------------------ */
/* Smart recommendations                                               */
/* ------------------------------------------------------------------ */
export function recommendCars({ fleet, passengers, budget, terrain, transmission, fuel }, limit = 3) {
  const usable = fleet.filter((c) => {
    if (c.available === false || c.status === 'maintenance') return false;
    // A stated budget is a near-hard constraint — allow a small stretch so a
    // slightly-over car can still be suggested, but never a different tier.
    if (budget && c.rate > budget * 1.15) return false;
    if (passengers && c.seats < passengers) return false;
    return true;
  });
  const scored = usable.map((car) => {
    let score = 0;
    const reasons = [];

    if (passengers) {
      if (car.seats >= passengers) {
        score += 30;
        const slack = car.seats - passengers;
        if (slack <= 1) {
          score += 12;
          reasons.push(`${car.seats} seats — right-sized for ${passengers}`);
        } else {
          reasons.push(`${car.seats} seats with room to spare`);
        }
      } else {
        score -= 60;
      }
    }

    if (budget) {
      if (car.rate <= budget) {
        score += 28 - Math.min(20, ((budget - car.rate) / budget) * 20);
        reasons.push(`${inr(car.rate)}/day fits your ${inr(budget)} budget`);
      } else {
        score -= Math.min(70, ((car.rate - budget) / budget) * 90);
      }
    }

    if (terrain) {
      if ((car.terrain || []).includes(terrain)) {
        score += 26;
        reasons.push(`Rated for ${terrain.toLowerCase()} driving`);
      } else if (terrain === 'Off-road' || terrain === 'Hills') {
        score -= 30;
      }
    }

    if (transmission && car.transmission === transmission) {
      score += 12;
      reasons.push(`${transmission} gearbox`);
    }
    if (fuel && car.fuel === fuel) {
      score += 12;
      reasons.push(`${fuel} as requested`);
    }

    score += (Number(car.rating) || 4) * 4;
    if (car.zeroDep) {
      score += 6;
      reasons.push('Zero-dep insurance included');
    }

    return { car, score, reasons: reasons.slice(0, 3) };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Pull structured slots out of free text: "4 people, 3000 budget, hills". */
export function parseSlots(text) {
  const q = text.toLowerCase();
  const slots = {};

  const people = q.match(/(\d+)\s*(people|person|passenger|pax|adults|of us|seater|seats)/);
  if (people) slots.passengers = Math.min(9, parseInt(people[1], 10));
  else if (/\bfamily\b/.test(q)) slots.passengers = 5;
  else if (/\bcouple\b|\bsolo\b|\bjust me\b/.test(q)) slots.passengers = 2;

  const budget = q.match(/(?:under|below|max|budget|upto|up to|within)\s*(?:rs\.?|₹|inr)?\s*([\d,]{3,7})/);
  if (budget) slots.budget = parseInt(budget[1].replace(/,/g, ''), 10);
  else {
    const bare = q.match(/(?:rs\.?|₹)\s*([\d,]{3,7})/);
    if (bare) slots.budget = parseInt(bare[1].replace(/,/g, ''), 10);
  }

  if (has(q, 'off-road', 'offroad', 'trail', 'sand', 'rough road')) slots.terrain = 'Off-road';
  else if (has(q, 'hill', 'mountain', 'manali', 'mussoorie', 'shimla', 'nainital', 'ghat', 'leh'))
    slots.terrain = 'Hills';
  else if (has(q, 'highway', 'expressway', 'road trip', 'long drive', 'jaipur', 'agra', 'chandigarh'))
    slots.terrain = 'Highway';
  else if (has(q, 'city', 'office', 'commute', 'traffic', 'daily')) slots.terrain = 'City';

  if (has(q, 'automatic', 'auto ', 'amt', 'cvt', 'dsg')) slots.transmission = 'Automatic';
  else if (has(q, 'manual', 'stick')) slots.transmission = 'Manual';

  if (has(q, 'electric', ' ev', 'battery car')) slots.fuel = 'EV';
  else if (has(q, 'diesel')) slots.fuel = 'Diesel';
  else if (has(q, 'cng')) slots.fuel = 'CNG';

  return slots;
}

/* ------------------------------------------------------------------ */
/* Intent answering                                                    */
/* ------------------------------------------------------------------ */
export const SUGGESTED_PROMPTS = [
  'Best car for 6 people going to the hills under ₹4000',
  'How does zero-dep insurance work?',
  'Where exactly do I collect the car at Airport T3?',
  'What documents do I need to rent?',
  'Which coupon saves me the most right now?',
  'What happens if I return the car late?',
];

/**
 * @returns {{text: string, cards?: Array, chips?: string[]}}
 */
export function answer(question, ctx) {
  const q = String(question || '').toLowerCase().trim();
  const fleet = ctx.fleet || [];
  const coupons = (ctx.coupons || []).filter((c) => c.active !== false);
  const s = { ...DEFAULT_SETTINGS, ...(ctx.settings || {}) };
  const cheapest = [...fleet].filter((c) => c.available !== false).sort((a, b) => a.rate - b.rate)[0];
  const dearest = [...fleet].sort((a, b) => b.rate - a.rate)[0];

  if (!q) return { text: 'Ask me anything about the fleet, pricing, insurance or your booking.' };

  /* -- greetings -- */
  if (/^(hi|hey|hello|namaste|yo|good (morning|evening|afternoon))\b/.test(q)) {
    return {
      text: `Namaste! I'm the DelhiDrive Copilot. I know every car in the fleet, the live tariffs, the insurance small print and all ${LOCATIONS.length} pickup hubs. What are you planning?`,
      chips: ['Recommend a car for me', 'Explain zero-dep', 'Airport T3 pickup point'],
    };
  }

  /* -- recommendation -- */
  const slots = parseSlots(q);
  const wantsRec =
    has(q, 'recommend', 'suggest', 'which car', 'what car', 'best car', 'best for', 'good for', 'ideal') ||
    Object.keys(slots).length >= 2;
  if (wantsRec) {
    const picks = recommendCars({ fleet, ...slots });
    if (!picks.length) {
      return {
        text: `I could not find a match for that combination. Our cheapest car is the ${cheapest?.name} at ${inr(
          cheapest?.rate
        )}/day, and our largest options seat 7. Try relaxing the budget or the seat count.`,
      };
    }
    const bits = [];
    if (slots.passengers) bits.push(`${slots.passengers} passengers`);
    if (slots.budget) bits.push(`under ${inr(slots.budget)}/day`);
    if (slots.terrain) bits.push(`${slots.terrain.toLowerCase()} driving`);
    if (slots.transmission) bits.push(slots.transmission.toLowerCase());
    return {
      text: `Based on ${bits.length ? bits.join(', ') : 'your request'}, here is what I would book — ranked best first.`,
      cards: picks,
      chips: ['Explain zero-dep', 'What documents do I need?', 'Cheapest option overall'],
    };
  }

  /* -- zero depreciation -- */
  if (has(q, 'zero dep', 'zero-dep', 'zerodep', 'insurance', 'damage cover', 'accident')) {
    const zd = fleet.filter((c) => c.zeroDep).length;
    return {
      text: `Zero-depreciation cover means that when a claim is settled we do not deduct depreciation on replaced parts — plastics, rubber and fibre components are reimbursed at full value instead of the usual 30–50% write-down. ${zd} of our ${fleet.length} cars ship with it included at no extra cost (look for the "Zero Dep" badge on the card).\n\nWhat it does NOT cover: tyres and rims, glass, undercarriage scraping, interior damage, lost keys, and any incident where the driver was under the influence. Those are billed at actuals against your ${inr(
        s.securityDeposit
      )} refundable deposit.\n\nEvery claim needs a photo of the damage logged in the handover checklist and a call to our 24x7 helpline before any repair is authorised.`,
      chips: ['What is the security deposit?', 'What if I damage a tyre?'],
    };
  }

  /* -- airport pickup -- */
  if (has(q, 'airport', 't3', 'terminal', 'igi', 'flight')) {
    return {
      text: `Airport T3 pickups happen kerbside at Arrivals Gate 5, in the pre-paid mobility bay just past the taxi counters.\n\nHow it works: once you clear baggage, tap "I've landed" in My Bookings (or call the number in your confirmation SMS). Your executive brings the car to Gate 5 within 8 minutes. Airport handover carries a ${inr(
        LOCATIONS.find((l) => l.id === 'airport').fee
      )} facility fee, which is shown as a line item before you pay.\n\nWe track your flight number, so a delayed landing does not eat into your rental hours — the clock starts at handover, not at your original booked time. Free waiting is 60 minutes past the scheduled slot.`,
      chips: ['What are the other pickup hubs?', 'Do you deliver to my address?'],
    };
  }

  /* -- locations -- */
  if (has(q, 'hub', 'location', 'pickup point', 'where do i', 'doorstep', 'delivery', 'drop off', 'drop-off')) {
    return {
      text:
        `We operate ${LOCATIONS.length} handover options across Delhi NCR:\n\n` +
        LOCATIONS.map(
          (l) => `• ${l.label} — ${l.note}${l.fee ? ` (+${inr(l.fee)} fee)` : ' (no fee)'}`
        ).join('\n') +
        `\n\nYou can return the car to a different hub from the one you picked up at; the destination hub's fee applies. Doorstep delivery covers anywhere inside NCR and arrives in a 30-minute window you choose.`,
      chips: ['Airport T3 pickup point', 'Recommend a car for me'],
    };
  }

  /* -- documents / KYC -- */
  if (has(q, 'document', 'kyc', 'licence', 'license', 'aadhaar', 'aadhar', 'id proof', 'verification')) {
    return {
      text: `You need exactly two documents, both uploaded from the Dashboard > KYC tab:\n\n1. Driving licence — a valid Indian DL held for at least 12 months. Both sides, readable, not expired.\n2. Aadhaar card — front and back, as address proof.\n\nVerification is usually done within 20 minutes during operating hours. Your profile shows one of three flags: Pending Review while our team checks it, Verified once cleared, or Rejected with a reason if a scan is unreadable. A booking can be created any time, but handover only happens on a Verified profile — so upload early.\n\nForeign nationals: bring your passport plus an International Driving Permit and we will verify manually.`,
      chips: ['Upload my documents', 'How long does verification take?'],
    };
  }

  /* -- coupons -- */
  if (has(q, 'coupon', 'promo', 'discount', 'offer', 'code', 'save', 'cheaper', 'deal')) {
    if (!coupons.length) return { text: 'There are no active promo codes right now. Check back on Friday.' };
    return {
      text:
        `Here are the live promo codes:\n\n` +
        coupons
          .map(
            (c) =>
              `• ${c.code} — ${
                c.type === 'percent' ? `${c.value}% off` : `${inr(c.value)} off`
              }${c.minOrder ? `, min cart ${inr(c.minOrder)}` : ''}${
                c.maxDiscount && c.type === 'percent' ? `, capped at ${inr(c.maxDiscount)}` : ''
              }`
          )
          .join('\n') +
        `\n\nRule of thumb: on carts above ${inr(10000)} the percentage codes win; below that the flat ₹500 code usually beats them. Only one code applies per booking — enter it on the checkout page and the savings appear instantly in the fare breakdown.`,
      chips: ['What is included in the price?', 'Cheapest option overall'],
    };
  }

  /* -- price / cost -- */
  if (has(q, 'price', 'cost', 'rate', 'charge', 'how much', 'tariff', 'fare', 'gst', 'tax', 'cheap')) {
    return {
      text: `Tariffs run from ${inr(cheapest?.rate)}/day for the ${cheapest?.name} up to ${inr(
        dearest?.rate
      )}/day for the ${dearest?.name}.\n\nYour final bill is built like this:\n• Daily rate × number of days (part-days round up)\n• Weekend surge of ×${Number(
        s.weekendSurge
      ).toFixed(2)} on Friday, Saturday and Sunday pickups\n• Any add-ons you tick (${ADDONS.map((a) => a.label)
        .slice(0, 3)
        .join(', ')} and more)\n• Hub or doorstep delivery fee, if applicable\n• Minus your promo discount\n• Plus ${
        s.gstRate
      }% GST on that net amount\n• Plus a fully refundable ${inr(
        s.securityDeposit
      )} security deposit\n\nThere is no per-kilometre charge and no hidden fuel surcharge — the fare you see at checkout is the fare you pay.`,
      chips: ['Which coupon saves me the most right now?', 'What is the security deposit?'],
    };
  }

  /* -- deposit -- */
  if (has(q, 'deposit', 'refund', 'money back', 'security')) {
    return {
      text: `The refundable security deposit is ${inr(
        s.securityDeposit
      )} by default; premium and luxury cars carry a higher figure shown on the car's card. It is collected with the rental and is not taxed.\n\nRefunds go back to the source account within 7 working days of return. We deduct only what the post-return inspection records: fuel or charge shortfall, unreported damage, traffic challans (plus ₹250 admin per notice) and late-return penalties at ${inr(
        s.latePenaltyPerHour
      )}/hour.\n\nYou can watch the deduction breakdown live in My Bookings once the return inspection is filed.`,
      chips: ['What happens if I return the car late?', 'Cancellation policy'],
    };
  }

  /* -- cancellation -- */
  if (has(q, 'cancel', 'reschedule', 'change my booking', 'postpone')) {
    return {
      text: `Cancel free of charge any time up to ${s.cancellationWindowHours} hours before pickup — you get 100% of the rent and the full deposit back.\n\nInside that window:\n• ${s.cancellationWindowHours}h to 6h before pickup — we retain 25% of the rent\n• Under 6h before pickup — we retain 50% of the rent\n• The security deposit is always refunded in full\n\nRescheduling is free and unlimited up to 6 hours before pickup, subject to that car being available on the new dates. Do it from My Bookings > Manage.`,
      chips: ['What is the security deposit?', 'How do I extend my trip?'],
    };
  }

  /* -- late return / extension -- */
  if (has(q, 'late', 'extend', 'overdue', 'more time', 'return late', 'penalty')) {
    return {
      text: `Late return is billed at ${inr(
        s.latePenaltyPerHour
      )} per hour, charged in full-hour blocks after a 29-minute grace period. Past 12 hours overdue without an approved extension the booking is treated as a breach and the car can be recovered.\n\nThe cheaper path is an extension: raise a "Extend ongoing trip" support ticket (Dashboard > Support) or call the helpline. If nobody has booked the car after you, we extend it at the normal daily rate — no penalty at all. Approvals usually come back within 15 minutes.`,
      chips: ['Raise a support ticket', 'What is the security deposit?'],
    };
  }

  /* -- fuel policy -- */
  if (has(q, 'fuel', 'petrol', 'diesel', 'tank', 'charge', 'charging', 'battery', 'range')) {
    const evs = fleet.filter((c) => c.fuel === 'EV');
    const fullTank = ADDONS.find((a) => a.id === 'fullTank');
    return {
      text: `Fuel policy is same-to-same: the car goes out at a level recorded in the handover checklist and must come back at that level. Any shortfall is billed at retail rate plus a ₹300 service charge.\n\nIf you would rather not think about it, tick ${
        fullTank.label
      } (${inr(
        fullTank.price
      )}) at checkout — you start full and return it however empty you like.\n\n${
        evs.length
          ? `On the EV side we run the ${evs
              .map((c) => c.name)
              .join(', ')} with ${evs[0].mileage} km of ARAI range and 50 kW DC fast charging. Return an EV above 20% charge; below that a ₹500 recovery-charge fee applies. There are fast chargers at Cyber Hub, Select Citywalk and CP's Baba Kharak Singh Marg.`
          : ''
      }`,
      chips: ['Recommend an electric car', 'What is included in the price?'],
    };
  }

  /* -- add-ons -- */
  if (has(q, 'add-on', 'addon', 'extra', 'fastag', 'fast tag', 'child seat', 'baby', 'gps', 'additional driver')) {
    return {
      text:
        `Optional extras at checkout:\n\n` +
        ADDONS.map((a) => `• ${a.label} — ${inr(a.price)} per ${a.unit} · ${a.desc}`).join('\n') +
        `\n\nFASTag is the one I would always tick for a highway trip — cash lanes at the Kherki Daula and Yamuna Expressway plazas can cost you 20 minutes each way.`,
      chips: ['Recommend a car for me', 'Which coupon saves me the most right now?'],
    };
  }

  /* -- breakdown / roadside -- */
  if (has(q, 'breakdown', 'break down', 'accident', 'towing', 'flat tyre', 'puncture', 'help on road', 'stranded')) {
    return {
      text: `Call the 24x7 helpline on +91 11 4000 8080 first — before arranging any repair yourself, or the cost may not be reimbursable.\n\nRoadside assistance is included on every rental across Delhi NCR and up to 250 km beyond: puncture help, jump start, key lockout, fuel delivery and flatbed towing. Median response inside NCR is 42 minutes.\n\nIf the car cannot be made roadworthy the same day, we send a replacement of the same or higher category at no extra charge, and the unused hours are credited back. Log it as a Breakdown assistance ticket too so the operations team has a written trail.`,
      chips: ['Raise a support ticket', 'How does zero-dep insurance work?'],
    };
  }

  /* -- interstate -- */
  if (has(q, 'interstate', 'outside delhi', 'other state', 'permit', 'state border', 'take it to')) {
    return {
      text: `Yes — all our cars carry all-India tourist permits, so you can drive anywhere in the country. There is no kilometre cap.\n\nWhat you pay directly at the border: state entry tax, green tax and any toll not covered by FASTag. Keep the receipts if you want them itemised on your final statement.\n\nTwo practical notes: tell us in advance for trips beyond 500 km so we can schedule the service interval around your dates, and for Ladakh, Spiti or Sikkim book one of the 4WD options (Thar, Scorpio-N or Fortuner).`,
      chips: ['Recommend a car for the hills', 'FASTag details'],
    };
  }

  /* -- telematics -- */
  if (has(q, 'track', 'gps', 'telematics', 'speed', 'monitor', 'location of car')) {
    return {
      text: `Every car has an OBD-II GPS unit streaming to your dashboard. Open an active booking and you get a live map trace, a speed gauge, fuel or state-of-charge, coolant temperature, tyre pressures and battery voltage.\n\nOver-speed alerts fire above ${
        s.overspeedLimitKph
      } kph and are logged against the trip — they are visible to you and to our operations team, and repeated violations can affect the deposit. It exists for safety and for accident reconstruction, not to police your route.`,
      chips: ['Over-speed policy', 'View my bookings'],
    };
  }

  /* -- ticket -- */
  if (has(q, 'ticket', 'complaint', 'support', 'contact', 'talk to', 'human', 'agent', 'billing issue')) {
    return {
      text: `For anything I cannot settle, raise a ticket from Dashboard > Support. Pick one of Breakdown assistance, Billing query or Extend ongoing trip, describe the problem, and our operations team replies in the same thread — you will see the status move through Open, In Progress and Resolved.\n\nUrgent and on the road? Call +91 11 4000 8080, staffed 24x7. Billing disputes are usually settled within one working day.`,
      chips: ['Raise a support ticket', 'What happens if I return the car late?'],
    };
  }

  /* -- age / eligibility -- */
  if (has(q, 'age', 'how old', 'eligible', 'minimum age', 'years old')) {
    return {
      text: `Minimum age is 21 for hatchbacks and sedans, and 25 for SUVs and the luxury fleet. You must have held a valid Indian driving licence for at least 12 months. There is no upper age limit as long as the licence is current.`,
      chips: ['What documents do I need?', 'Recommend a car for me'],
    };
  }

  /* -- fleet list -- */
  if (has(q, 'what cars', 'fleet', 'list of cars', 'available cars', 'inventory', 'how many cars')) {
    const byCat = fleet.reduce((acc, c) => {
      acc[c.category] = (acc[c.category] || 0) + 1;
      return acc;
    }, {});
    return {
      text:
        `We run ${fleet.length} cars right now:\n\n` +
        Object.entries(byCat)
          .map(([k, v]) => `• ${k} — ${v} car${v > 1 ? 's' : ''}`)
          .join('\n') +
        `\n\nFrom ${inr(cheapest?.rate)}/day (${cheapest?.name}) to ${inr(dearest?.rate)}/day (${
          dearest?.name
        }). Tell me your group size, budget and where you are heading and I will narrow it to three.`,
      chips: ['Best car for 5 people under ₹3500', 'Cheapest option overall'],
    };
  }

  /* -- cheapest -- */
  if (has(q, 'cheapest', 'lowest price', 'budget car', 'most affordable')) {
    const picks = [...fleet]
      .filter((c) => c.available !== false && c.status !== 'maintenance')
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 3)
      .map((car) => ({ car, reasons: [`${inr(car.rate)}/day`, `${car.mileage} kmpl`, `${car.seats} seats`] }));
    return {
      text: `Cheapest three in the fleet right now — the CNG option has the lowest running cost per kilometre by a wide margin.`,
      cards: picks,
      chips: ['Which coupon saves me the most right now?'],
    };
  }

  /* -- fallback -- */
  return {
    text: `I did not catch that one. I can help with:\n\n• Picking a car for your group size, budget and terrain\n• Pricing, GST, deposits and promo codes\n• Zero-dep insurance and what it excludes\n• Pickup hubs, airport handover and doorstep delivery\n• KYC documents and verification status\n• Cancellations, extensions and late returns\n• Breakdown assistance and support tickets\n\nTry rephrasing, or tap one of the suggestions below.`,
    chips: SUGGESTED_PROMPTS.slice(0, 3),
  };
}
