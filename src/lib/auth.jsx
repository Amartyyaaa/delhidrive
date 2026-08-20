// Auth context: real Supabase Auth when configured, local session otherwise.

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { supabase, supabaseReady, isAdminEmail } from './supabase';
import { COL, setItem } from './db';

const AuthCtx = createContext(null);
const LOCAL_KEY = 'delhidrive:session';

function readLocalSession() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Supabase user -> the shape the rest of the app expects. */
function shape(u) {
  if (!u) return null;
  const meta = u.user_metadata || {};
  return {
    uid: u.id,
    email: u.email,
    name: meta.name || meta.full_name || (u.email ? u.email.split('@')[0] : 'Guest'),
    phone: u.phone || meta.phone || '',
    photoURL: meta.avatar_url || '',
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabaseReady) {
      setUser(readLocalSession());
      setLoading(false);
      return;
    }

    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(shape(data.session?.user));
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = shape(session?.user);
      setUser(next);
      setLoading(false);
      if (next) {
        // Keep a profile row so admin screens can list customers.
        setItem(COL.users, next.uid, {
          userId: next.uid,
          email: next.email,
          name: next.name,
          role: isAdminEmail(next.email) ? 'admin' : 'customer',
          lastSeen: Date.now(),
        }).catch(() => {});
      }
    });

    return () => {
      active = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  const persistLocal = useCallback((u) => {
    if (u) localStorage.setItem(LOCAL_KEY, JSON.stringify(u));
    else localStorage.removeItem(LOCAL_KEY);
    setUser(u);
  }, []);

  const signIn = useCallback(
    async (email, password) => {
      if (!supabaseReady) {
        if (!email || password.length < 4)
          throw new Error('Enter an email and a password of 4+ characters.');
        persistLocal({
          uid: 'local_' + btoa(email).replace(/=/g, '').slice(0, 14),
          email,
          name: email.split('@')[0],
        });
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    [persistLocal]
  );

  const signUp = useCallback(
    async (name, email, password) => {
      if (!supabaseReady) {
        if (!email || password.length < 4)
          throw new Error('Enter an email and a password of 4+ characters.');
        persistLocal({
          uid: 'local_' + btoa(email).replace(/=/g, '').slice(0, 14),
          email,
          name: name || email.split('@')[0],
        });
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name: name || email.split('@')[0] } },
      });
      if (error) throw error;

      // With "Confirm email" switched on, Supabase returns a user but no
      // session — say so plainly rather than looking like a silent failure.
      if (data.user && !data.session) {
        throw new Error(
          'Account created. Check your inbox and click the confirmation link, then sign in. ' +
            '(To skip this, turn off "Confirm email" in Supabase > Authentication > Sign In / Providers.)'
        );
      }
    },
    [persistLocal]
  );

  const signInWithGoogle = useCallback(async () => {
    if (!supabaseReady)
      throw new Error('Google sign-in needs Supabase configured in your .env file.');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/dashboard' },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    if (!supabaseReady) return persistLocal(null);
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, [persistLocal]);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAdmin: Boolean(user && isAdminEmail(user.email)),
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
    }),
    [user, loading, signIn, signUp, signInWithGoogle, signOut]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
