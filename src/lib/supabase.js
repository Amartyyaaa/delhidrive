// Supabase bootstrap.
//
// Reads config from the .env file (see .env.example). If the config is not
// filled in yet, `supabaseReady` stays false and the data layer transparently
// falls back to a localStorage-backed store with the same API, so the app is
// fully usable before/without a Supabase project.

import { createClient } from '@supabase/supabase-js';

/**
 * The Supabase dashboard shows the URL in a few places, and the Data API page
 * shows the full REST endpoint (".../rest/v1/"). The client wants only the
 * project origin, so trim the API path and any trailing slash rather than
 * failing with a confusing 404.
 */
function normaliseUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  return trimmed
    .replace(/\/(rest|auth|storage|realtime)\/v\d+\/?$/i, '')
    .replace(/\/+$/, '');
}

const url = normaliseUrl(import.meta.env.VITE_SUPABASE_URL);
// Accepts either the new publishable key (sb_publishable_...) or the legacy
// anon JWT (eyJ...). Both are safe in the browser; RLS does the protecting.
const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

const configured = Boolean(url && anonKey && /^https?:\/\//.test(url));

// A secret key in the browser bundle would hand every visitor full database
// access, bypassing every RLS policy. Refuse to start rather than expose it.
if (/^sb_secret_/i.test(anonKey) || /service_role/i.test(anonKey)) {
  throw new Error(
    '[DelhiDrive] VITE_SUPABASE_ANON_KEY looks like a SECRET key. ' +
      'Use the Publishable key (sb_publishable_...) instead — the secret key must never ' +
      'be put in a browser app, because it bypasses all row-level security.'
  );
}

let supabase = null;
let initError = null;

if (configured) {
  try {
    supabase = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  } catch (err) {
    initError = err;
    console.error('[DelhiDrive] Supabase init failed, using local store:', err);
  }
}

export const supabaseReady = configured && !initError;
export const supabaseConfigured = configured;
export { supabase, initError };

/** Storage buckets created by supabase-setup.sql */
export const BUCKETS = { kyc: 'kyc', inspections: 'kyc', fleet: 'fleet' };

export const ADMIN_EMAILS = String(import.meta.env.VITE_ADMIN_EMAILS || 'admin@delhidrive.in')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email) {
  return Boolean(email) && ADMIN_EMAILS.includes(String(email).toLowerCase());
}
