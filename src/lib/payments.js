// Online payments through Razorpay.
//
// The browser never holds the key secret. Orders are created — and payments
// verified — by the `razorpay` Supabase Edge Function, which keeps the secret
// and is the only thing allowed to mark a booking paid. The browser opens
// Razorpay's own checkout window in between and hands the result back to the
// function for checking. See supabase/functions/razorpay/README.md.

import { supabase, supabaseReady } from './supabase';
import { RAZORPAY_KEY_ID } from './config';

/** Online payment needs both the public key id and a backend to verify against. */
export const paymentsReady = Boolean(RAZORPAY_KEY_ID) && supabaseReady;

const CHECKOUT_JS = 'https://checkout.razorpay.com/v1/checkout.js';
let scriptPromise = null;

function loadCheckoutScript() {
  if (window.Razorpay) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = CHECKOUT_JS;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => {
        scriptPromise = null;
        el.remove();
        reject(new Error('Could not load the payment window. Check your connection and try again.'));
      };
      document.head.appendChild(el);
    });
  }
  return scriptPromise;
}

async function callGateway(body) {
  const { data, error } = await supabase.functions.invoke('razorpay', { body });
  if (error) {
    // The function answers errors as JSON; surface its message rather than
    // the generic "non-2xx status" one.
    let message = error.message;
    try {
      const detail = await error.context?.json?.();
      if (detail?.error) message = detail.error;
    } catch {
      /* not JSON — keep the generic message */
    }
    throw new Error(message || 'The payment service did not respond. Please try again.');
  }
  if (data?.ok === false) throw new Error(data.error || 'Payment could not be completed.');
  return data;
}

/**
 * Collect payment for a booking that already exists.
 *
 * Resolves once the server has verified the payment and marked the booking
 * paid. Rejects with `err.cancelled === true` when the customer closes the
 * window, or with an Error when anything else fails.
 */
export async function payForBooking(booking) {
  await loadCheckoutScript();
  const order = await callGateway({ action: 'order', bookingId: booking.id });

  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: order.keyId || RAZORPAY_KEY_ID,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency || 'INR',
      name: 'DelhiDrive',
      description: `Booking ${booking.ref} · ${booking.carName}`,
      prefill: {
        name: booking.customerName || '',
        email: booking.customerEmail || '',
        contact: booking.customerPhone || '',
      },
      notes: { bookingId: booking.id, ref: booking.ref },
      theme: { color: '#128A4B' },
      handler: async (res) => {
        try {
          resolve(
            await callGateway({
              action: 'verify',
              bookingId: booking.id,
              orderId: res.razorpay_order_id,
              paymentId: res.razorpay_payment_id,
              signature: res.razorpay_signature,
            })
          );
        } catch (err) {
          reject(err);
        }
      },
      modal: {
        // A failed attempt keeps the window open for another try, so closing
        // it is the only way out without paying.
        ondismiss: () => reject(Object.assign(new Error('Payment window closed.'), { cancelled: true })),
      },
    });
    rzp.open();
  });
}
