// Firebase bootstrap.
//
// Reads config from the .env file (see .env.example). If the config is not
// filled in yet, `firebaseReady` stays false and the data layer transparently
// falls back to a localStorage-backed store with the same API, so the app is
// fully usable before/without a Firebase project.

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const configured = Boolean(cfg.apiKey && cfg.projectId && cfg.appId);

let app = null;
let auth = null;
let db = null;
let storage = null;
let initError = null;

if (configured) {
  try {
    app = initializeApp(cfg);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
  } catch (err) {
    initError = err;
    console.error('[DelhiDrive] Firebase init failed, using local store:', err);
  }
}

export const firebaseReady = configured && !initError;
export const firebaseConfigured = configured;
export { app, auth, db, storage, initError };

export const ADMIN_EMAILS = String(import.meta.env.VITE_ADMIN_EMAILS || 'admin@delhidrive.in')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email) {
  return Boolean(email) && ADMIN_EMAILS.includes(String(email).toLowerCase());
}
