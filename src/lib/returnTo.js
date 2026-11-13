// Where to send someone once they are signed in.
//
// Google sign-in and an email confirmation link both leave the site and come
// back to whichever address Supabase is set up to allow — often just the home
// page. Remembering where they were headed gets them back there either way.

const KEY = 'delhidrive:returnTo';
const MAX_AGE_MS = 30 * 60 * 1000;

export function rememberReturnTo(path) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() }));
  } catch {
    /* private browsing — they will land on the home page instead */
  }
}

/** The remembered path, once. Null if there is none or it has gone stale. */
export function takeReturnTo() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    localStorage.removeItem(KEY);
    const { path, at } = JSON.parse(raw);
    const ok = typeof path === 'string' && /^\/(?!\/)/.test(path) && Date.now() - Number(at) < MAX_AGE_MS;
    return ok ? path : null;
  } catch {
    return null;
  }
}
