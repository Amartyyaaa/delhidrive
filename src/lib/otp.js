// MSG91 phone verification.
//
// Loads the OTP widget script once and drives it with exposeMethods so the app
// keeps its own UI rather than handing the page over to MSG91's popup.

import { MSG91, msg91Ready } from './config';

let loader = null;

/** Injects the MSG91 script a single time; resolves when initSendOTP exists. */
export function loadOtpScript() {
  if (!msg91Ready) return Promise.reject(new Error('MSG91 is not configured.'));
  if (typeof window.initSendOTP === 'function') return Promise.resolve();
  if (loader) return loader;

  loader = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${MSG91.scriptUrl}"]`);
    const script = existing || document.createElement('script');
    const done = () =>
      typeof window.initSendOTP === 'function'
        ? resolve()
        : reject(new Error('MSG91 loaded but initSendOTP is missing.'));

    script.addEventListener('load', done);
    script.addEventListener('error', () => {
      loader = null;
      reject(new Error('Could not reach the MSG91 verification service.'));
    });

    if (!existing) {
      script.src = MSG91.scriptUrl;
      script.async = true;
      document.head.appendChild(script);
    } else if (typeof window.initSendOTP === 'function') {
      done();
    }
  });

  return loader;
}

let initialised = false;

/** Boots the widget with exposeMethods so we can call sendOtp/verifyOtp ourselves. */
async function ensureInit() {
  await loadOtpScript();
  if (initialised) return;
  await new Promise((resolve) => {
    window.initSendOTP({
      widgetId: MSG91.widgetId,
      tokenAuth: MSG91.tokenAuth,
      exposeMethods: true,
      captchaRenderId: '',
      success: () => {},
      failure: () => {},
    });
    // initSendOTP attaches the methods synchronously in practice, but give the
    // script a tick so a slow attach does not look like a failure.
    setTimeout(resolve, 60);
  });
  initialised = true;
}

const errText = (e) =>
  (typeof e === 'string' && e) ||
  e?.message ||
  e?.msg ||
  e?.data?.message ||
  'Verification failed. Please try again.';

/** Send an OTP to a 10-digit Indian mobile number. */
export async function sendOtp(mobile10) {
  await ensureInit();
  const identifier = '91' + String(mobile10).replace(/\D/g, '').slice(-10);
  return new Promise((resolve, reject) => {
    if (typeof window.sendOtp !== 'function')
      return reject(new Error('Verification service is not ready yet.'));
    window.sendOtp(
      identifier,
      (data) => resolve(data),
      (err) => reject(new Error(errText(err)))
    );
  });
}

/** Verify the code the customer typed. */
export async function verifyOtp(code) {
  await ensureInit();
  return new Promise((resolve, reject) => {
    if (typeof window.verifyOtp !== 'function')
      return reject(new Error('Verification service is not ready yet.'));
    window.verifyOtp(
      String(code).trim(),
      (data) => resolve(data),
      (err) => reject(new Error(errText(err)))
    );
  });
}

/** Resend, for when the first message does not arrive. */
export async function retryOtp(channel = 11) {
  await ensureInit();
  return new Promise((resolve, reject) => {
    if (typeof window.retryOtp !== 'function')
      return reject(new Error('Verification service is not ready yet.'));
    window.retryOtp(
      channel,
      (data) => resolve(data),
      (err) => reject(new Error(errText(err)))
    );
  });
}

export { msg91Ready };
