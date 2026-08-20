// Third-party integration settings.
//
// These all come from .env so keys can be rotated without touching code, but
// every value here ends up in the browser bundle — that is unavoidable for a
// front-end-only app. Restrict them at the provider instead:
//   • Google Maps  — restrict the key to your domains in Google Cloud Console
//   • MSG91 widget — the widget id/token are meant to be public, but keep the
//     widget locked to your domain in the MSG91 dashboard

export const MSG91 = {
  widgetId: import.meta.env.VITE_MSG91_WIDGET_ID || '',
  tokenAuth: import.meta.env.VITE_MSG91_TOKEN_AUTH || '',
  scriptUrl: 'https://verify.msg91.com/otp-provider.js',
};
export const msg91Ready = Boolean(MSG91.widgetId && MSG91.tokenAuth);

export const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';
export const mapsReady = Boolean(GOOGLE_MAPS_KEY);

/** WhatsApp number that receives booking notifications (digits only, with country code). */
export const WHATSAPP_NUMBER = String(import.meta.env.VITE_WHATSAPP_NUMBER || '919911205522').replace(
  /\D/g,
  ''
);

export const COMPANY_PHONE = '+91 99112 05522';
