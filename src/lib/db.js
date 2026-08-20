// Unified data layer.
//
// Every screen talks to these functions and never to Supabase directly. When
// Supabase is configured the calls hit real Postgres tables (with realtime
// subscriptions); otherwise they hit an in-browser localStorage store that
// emits the same change events. The document shapes are identical either way,
// so switching backends is just a matter of filling in .env.
//
// Schema note: each table is `id` + `user_id` + `created_at` + a `data` jsonb
// column holding the rest of the record. That keeps the nested shapes the UI
// already uses (quote, addons, inspections, messages…) intact, while leaving
// the columns that Row Level Security needs as real, indexable columns.

import { supabase, supabaseReady, BUCKETS } from './supabase';

/* ------------------------------------------------------------------ */
/* Table names — these match supabase-setup.sql                        */
/* ------------------------------------------------------------------ */
export const COL = {
  fleet: 'fleet',
  bookings: 'bookings',
  coupons: 'coupons',
  tickets: 'tickets',
  kyc: 'kyc',
  users: 'users',
  settings: 'settings',
};

/** Tables whose rows belong to a specific signed-in user. */
const OWNED = new Set([COL.bookings, COL.tickets, COL.kyc, COL.users]);

/* ------------------------------------------------------------------ */
/* Row <-> document mapping                                            */
/* ------------------------------------------------------------------ */
const rowToDoc = (row) =>
  row
    ? {
        id: row.id,
        ...(row.data || {}),
        ...(row.user_id ? { userId: row.user_id } : {}),
        createdAt: row.created_at ? new Date(row.created_at).getTime() : row.data?.createdAt,
      }
    : null;

function docToRow(table, id, doc) {
  const { id: _ignored, createdAt, userId, ...rest } = doc || {};
  const row = { data: rest };
  if (id != null) row.id = id;
  if (OWNED.has(table) && userId) row.user_id = userId;
  return row;
}

/* ------------------------------------------------------------------ */
/* Local (fallback) store                                              */
/* ------------------------------------------------------------------ */
const LS_PREFIX = 'delhidrive:';
const listeners = new Map(); // key -> Set<fn>

function lsRead(key) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function lsWrite(key, value) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch (err) {
    console.warn('[DelhiDrive] localStorage write failed', err);
  }
  emit(key, value);
}

function emit(key, value) {
  const set = listeners.get(key);
  if (set) set.forEach((fn) => fn(value));
}

function subscribeLocal(key, cb) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(cb);
  return () => listeners.get(key)?.delete(cb);
}

function newId() {
  return 'loc_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Live-subscribe to a table. cb receives an array of documents.
 *
 * Realtime gives us the changed row, but these tables are small and the UI
 * always wants the full list, so any change simply triggers one re-read. That
 * keeps ordering and RLS filtering correct without hand-merging deltas.
 */
export function watchCollection(name, cb, sortField) {
  if (!supabaseReady) {
    cb(lsRead(name) || []);
    return subscribeLocal(name, (v) => cb(v || []));
  }

  let cancelled = false;

  const load = async () => {
    const { data, error } = await supabase
      .from(name)
      .select('*')
      .order('created_at', { ascending: false });
    if (cancelled) return;
    if (error) {
      console.error(`[DelhiDrive] load ${name} failed`, error.message);
      cb(lsRead(name) || []);
      return;
    }
    cb((data || []).map(rowToDoc));
  };

  load();

  const channel = supabase
    .channel(`realtime:${name}:${Math.random().toString(36).slice(2, 8)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: name }, load)
    .subscribe();

  return () => {
    cancelled = true;
    supabase.removeChannel(channel);
  };
}

/** Live-subscribe to a single row. cb receives the document or null. */
export function watchDoc(name, id, cb) {
  if (!supabaseReady) {
    cb(lsRead(`${name}/${id}`));
    return subscribeLocal(`${name}/${id}`, cb);
  }

  let cancelled = false;

  const load = async () => {
    const { data, error } = await supabase.from(name).select('*').eq('id', id).maybeSingle();
    if (cancelled) return;
    if (error) {
      console.error(`[DelhiDrive] load ${name}/${id} failed`, error.message);
      cb(lsRead(`${name}/${id}`));
      return;
    }
    cb(rowToDoc(data));
  };

  load();

  const channel = supabase
    .channel(`realtime:${name}:${id}:${Math.random().toString(36).slice(2, 8)}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: name, filter: `id=eq.${id}` },
      load
    )
    .subscribe();

  return () => {
    cancelled = true;
    supabase.removeChannel(channel);
  };
}

/** Create a row. Returns the new id. */
export async function addItem(name, data) {
  if (!supabaseReady) {
    const list = lsRead(name) || [];
    const id = newId();
    lsWrite(name, [{ id, ...data, createdAt: Date.now() }, ...list]);
    return id;
  }

  const row = docToRow(name, undefined, data);
  const { data: inserted, error } = await supabase.from(name).insert(row).select('id').single();
  if (error) throw new Error(friendly(error, name));
  return inserted.id;
}

/** Create or overwrite a row at a known id. */
export async function setItem(name, id, data) {
  if (!supabaseReady) {
    if (name === COL.settings || String(id).includes('/')) {
      lsWrite(`${name}/${id}`, { id, ...data });
      return id;
    }
    const list = lsRead(name) || [];
    const idx = list.findIndex((x) => x.id === id);
    if (idx === -1) lsWrite(name, [{ id, ...data }, ...list]);
    else {
      const next = [...list];
      next[idx] = { ...next[idx], ...data };
      lsWrite(name, next);
    }
    lsWrite(`${name}/${id}`, { id, ...(list[idx] || {}), ...data });
    return id;
  }

  // Merge with whatever is already stored so partial writes behave like
  // a document-store merge would.
  const { data: existing } = await supabase.from(name).select('data').eq('id', id).maybeSingle();
  const merged = { ...(existing?.data || {}), ...data };
  const row = docToRow(name, id, merged);

  const { error } = await supabase.from(name).upsert(row, { onConflict: 'id' });
  if (error) throw new Error(friendly(error, name));
  return id;
}

/** Patch a row. */
export async function updateItem(name, id, patch) {
  if (!supabaseReady) {
    const list = lsRead(name) || [];
    const idx = list.findIndex((x) => x.id === id);
    if (idx !== -1) {
      const next = [...list];
      next[idx] = { ...next[idx], ...patch };
      lsWrite(name, next);
      lsWrite(`${name}/${id}`, next[idx]);
    } else {
      const existing = lsRead(`${name}/${id}`) || { id };
      lsWrite(`${name}/${id}`, { ...existing, ...patch });
    }
    return;
  }

  const { data: existing, error: readErr } = await supabase
    .from(name)
    .select('data')
    .eq('id', id)
    .maybeSingle();
  if (readErr) throw new Error(friendly(readErr, name));

  const { id: _i, createdAt: _c, userId: _u, ...rest } = patch || {};
  const { error } = await supabase
    .from(name)
    .update({ data: { ...(existing?.data || {}), ...rest } })
    .eq('id', id);
  if (error) throw new Error(friendly(error, name));
}

/** Delete a row. */
export async function deleteItem(name, id) {
  if (!supabaseReady) {
    const list = lsRead(name) || [];
    lsWrite(
      name,
      list.filter((x) => x.id !== id)
    );
    return;
  }
  const { error } = await supabase.from(name).delete().eq('id', id);
  if (error) throw new Error(friendly(error, name));
}

/** Seed a table only if it is currently empty (idempotent). */
export async function seedIfEmpty(name, items) {
  if (supabaseReady) {
    const { count, error } = await supabase.from(name).select('id', { count: 'exact', head: true });
    if (error || count > 0) return false;
    const rows = items.map((it) => docToRow(name, it.id || newId(), it));
    const { error: insErr } = await supabase.from(name).upsert(rows, { onConflict: 'id' });
    if (insErr) {
      // Non-fatal: a non-admin visitor cannot seed, which is correct.
      console.warn(`[DelhiDrive] could not seed ${name}:`, insErr.message);
      return false;
    }
    return true;
  }

  const existing = lsRead(name);
  if (existing && existing.length) return false;
  lsWrite(
    name,
    items.map((it) => ({ ...it, id: it.id || newId(), createdAt: Date.now() }))
  );
  return true;
}

/* ------------------------------------------------------------------ */
/* File uploads                                                        */
/* ------------------------------------------------------------------ */

/**
 * Upload a file (KYC document, damage photo, fleet photo). Uses Supabase
 * Storage when available and falls back to inlining a compressed copy.
 *
 * `path` looks like "kyc/<uid>/licence-123.png" — the first segment selects
 * the bucket, the rest is the object key inside it.
 */
export async function uploadFile(path, file) {
  if (supabaseReady) {
    const [prefix, ...restParts] = String(path).split('/');
    const bucket = BUCKETS[prefix] || BUCKETS.kyc;
    const key = restParts.join('/') || `${Date.now()}-${file.name}`;

    try {
      const { error } = await supabase.storage
        .from(bucket)
        .upload(key, file, { upsert: true, contentType: file.type });
      if (error) throw error;

      if (bucket === BUCKETS.fleet) {
        return supabase.storage.from(bucket).getPublicUrl(key).data.publicUrl;
      }
      // KYC and inspection photos live in a private bucket, so hand back a
      // long-lived signed URL rather than a public one.
      const { data: signed, error: signErr } = await supabase.storage
        .from(bucket)
        .createSignedUrl(key, 60 * 60 * 24 * 365);
      if (signErr) throw signErr;
      return signed.signedUrl;
    } catch (err) {
      console.warn('[DelhiDrive] Storage upload failed, inlining locally:', err.message || err);
    }
  }
  return await inlineImage(file);
}

/**
 * Fallback used when Supabase Storage is unavailable or the upload fails. The
 * image is downscaled and re-encoded until it comfortably fits inside a single
 * database row — a raw phone photo would otherwise be many megabytes.
 */
const INLINE_MAX_EDGE = 1000; // px on the longest side
const INLINE_TARGET_BYTES = 105 * 1024; // per image; up to 6 can share one record

function inlineImage(file) {
  return new Promise((resolve, reject) => {
    if (!file.type?.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, INLINE_MAX_EDGE / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Step the JPEG quality down until the encoded size is acceptable.
      let quality = 0.72;
      let out = canvas.toDataURL('image/jpeg', quality);
      while (out.length * 0.75 > INLINE_TARGET_BYTES && quality > 0.35) {
        quality -= 0.12;
        out = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(out);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image.'));
    };

    img.src = url;
  });
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Turn a Postgres/PostgREST error into something a person can act on. */
function friendly(error, table) {
  const msg = error?.message || 'Unknown database error';
  if (error?.code === '42P01')
    return `The "${table}" table does not exist yet. Run supabase-setup.sql in the Supabase SQL Editor.`;
  if (error?.code === '42501' || /row-level security/i.test(msg))
    return `You do not have permission to change "${table}". Sign in with an admin account, or check the policies from supabase-setup.sql.`;
  if (/JWT|not authenticated/i.test(msg)) return 'Your session expired — please sign in again.';
  return msg;
}

/** Timestamp value (millis | ISO string | Date) -> millis */
export function toMillis(v) {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return new Date(v).getTime() || 0;
  if (v instanceof Date) return v.getTime();
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return 0;
}
