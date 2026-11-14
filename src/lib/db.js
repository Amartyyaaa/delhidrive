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
  // Created by supabase/functions/notify-telegram/webhooks.sql — the app
  // writes customer subscriptions here.
  subscriptions: 'subscriptions',
  // Created by supabase-host-your-car.sql — a vendor's offer of a car. It
  // becomes a `fleet` row only when an admin approves it.
  hostApplications: 'host_applications',
};

/** Tables whose rows belong to a specific signed-in user. */
const OWNED = new Set([
  COL.bookings,
  COL.tickets,
  COL.kyc,
  COL.users,
  COL.subscriptions,
  COL.hostApplications,
]);

/** The script that creates each table, for the "run this first" message. */
const SETUP_SCRIPT = { [COL.hostApplications]: 'supabase-host-your-car.sql' };

/** PostgREST and Postgres each have their own code for "no such table". */
const isMissingTable = (error) => error?.code === 'PGRST205' || error?.code === '42P01';

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
      // Merge, as the Supabase path does, so a partial save keeps the rest.
      lsWrite(`${name}/${id}`, { ...(lsRead(`${name}/${id}`) || {}), id, ...data });
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
/* Availability                                                        */
/* ------------------------------------------------------------------ */

let busySlotsWarned = false;

/**
 * Busy windows for every car — car id and times only, nobody's details — from
 * the `car_busy_slots` function in supabase-booking-rules.sql. Returns null
 * without Supabase, or before that script has been run, so the caller falls
 * back to the bookings it can read itself.
 */
export async function loadBusySlots() {
  if (!supabaseReady) return null;
  const { data, error } = await supabase.rpc('car_busy_slots');
  if (error) {
    if (!busySlotsWarned) {
      busySlotsWarned = true;
      console.warn(
        '[DelhiDrive] car_busy_slots is not available, so other customers’ bookings cannot be seen. ' +
          'Run supabase-booking-rules.sql in the Supabase SQL Editor.',
        error.message
      );
    }
    return null;
  }
  return (data || []).map((r) => ({
    bookingId: r.booking_id,
    carId: r.car_id,
    start: Number(r.pickup_ms),
    end: Number(r.return_ms),
  }));
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
/* Private files kept by reference                                     */
/* ------------------------------------------------------------------ */

// A vendor's RC, insurance and car photos are stored as a reference —
// "bucket:key" — rather than a link. A link to a private file has to expire,
// and one saved in a row would be dead by the time a dispute needs it; a
// reference is swapped for a short-lived link whenever a screen shows the file.
//
// Without Supabase the "reference" is the file itself, inlined, so the local
// store stays self-contained.

const isInlineFile = (ref) => /^(data:|blob:)/i.test(String(ref || ''));

function splitFileRef(ref) {
  const value = String(ref || '');
  const at = value.indexOf(':');
  if (at < 1) return null;
  const bucket = value.slice(0, at);
  const key = value.slice(at + 1);
  if (!Object.values(BUCKETS).includes(bucket) || !key || key.startsWith('/')) return null;
  return { bucket, key };
}

/** Say what went wrong with an upload in words a vendor can act on. */
function friendlyUpload(error) {
  const msg = error?.message || 'Upload failed.';
  if (/bucket not found/i.test(msg))
    return 'Uploads are not switched on yet. Run supabase-host-your-car.sql in the Supabase SQL Editor.';
  if (/mime type/i.test(msg)) return 'Only JPG, PNG or PDF files can be uploaded.';
  if (/maximum allowed size|too large/i.test(msg)) return 'That file is too large — the limit is 10 MB.';
  if (/row-level security|unauthorized|jwt/i.test(msg)) return 'Your session expired — please sign in again.';
  // What each browser says when the connection dropped mid-upload.
  if (/failed to fetch|load failed|networkerror|network request failed/i.test(msg))
    return 'Upload failed — check your connection and try again.';
  return msg;
}

/**
 * Upload to a private bucket and return the file's reference. Unlike
 * uploadFile there is no inline fallback when Supabase is on: a failed upload
 * is reported, so a document is never silently swapped for a shrunken copy
 * squeezed into the database row.
 *
 * `path` is "<bucket prefix>/<key>", e.g. "hosts/<uid>/HST1A2B3C/rc-x.jpg".
 */
export async function uploadPrivateFile(path, file) {
  if (!supabaseReady) return await inlineImage(file);

  const [prefix, ...rest] = String(path).split('/');
  const bucket = BUCKETS[prefix];
  const key = rest.join('/');
  if (!bucket || !key) throw new Error('That upload has nowhere to go.');

  const { error } = await supabase.storage
    .from(bucket)
    .upload(key, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
  if (error) throw new Error(friendlyUpload(error));
  return `${bucket}:${key}`;
}

const LINK_SECONDS = 60 * 60;
const LINK_REUSE_MS = 40 * 60 * 1000;
const linkCache = new Map(); // ref -> { url, until }

/**
 * Short-lived links for a list of private file references, as { ref: url }.
 * A reference this account may not open is simply left out.
 */
export async function privateFileUrls(refs) {
  const out = {};
  const wanted = new Map(); // bucket -> [{ ref, key }]
  const now = Date.now();

  for (const ref of new Set((refs || []).filter(Boolean))) {
    if (isInlineFile(ref)) {
      // Only the local store keeps files inline. With Supabase on, a record
      // claiming to is not one of ours, and is not shown.
      if (!supabaseReady) out[ref] = ref;
      continue;
    }
    const cached = linkCache.get(ref);
    if (cached && cached.until > now) {
      out[ref] = cached.url;
      continue;
    }
    const parts = supabaseReady ? splitFileRef(ref) : null;
    if (!parts) continue;
    if (!wanted.has(parts.bucket)) wanted.set(parts.bucket, []);
    wanted.get(parts.bucket).push({ ref, key: parts.key });
  }

  await Promise.all(
    [...wanted].map(async ([bucket, items]) => {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrls(
        items.map((it) => it.key),
        LINK_SECONDS
      );
      if (error) {
        console.warn('[DelhiDrive] could not open private files:', error.message);
        return;
      }
      items.forEach((it, i) => {
        const row = (data || []).find((d) => d?.path === it.key) || data?.[i];
        if (!row?.signedUrl) return;
        out[it.ref] = row.signedUrl;
        // Hand out a fresh link well before this one lapses, so a screen
        // that re-asks every 45 minutes (useFileUrls) never holds a dead one.
        linkCache.set(it.ref, { url: row.signedUrl, until: now + LINK_REUSE_MS });
      });
    })
  );
  return out;
}

/**
 * Copy a private file into the public fleet bucket and return its public
 * address — how the photos an admin approves become the listing's photos.
 * Only an admin's session is allowed to do either half of this.
 */
export async function publishPrivateFile(ref, destKey) {
  if (!supabaseReady) return ref;

  const parts = splitFileRef(ref);
  if (!parts) throw new Error('That photo could not be found.');

  const { data: blob, error } = await supabase.storage.from(parts.bucket).download(parts.key);
  if (error) throw new Error(`Could not read the photo: ${error.message}`);

  const { error: upErr } = await supabase.storage
    .from(BUCKETS.fleet)
    .upload(destKey, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
  if (upErr) throw new Error(`Could not publish the photo: ${upErr.message}`);

  return supabase.storage.from(BUCKETS.fleet).getPublicUrl(destKey).data.publicUrl;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Has this table been created yet? Lets a screen say "not switched on yet"
 * up front instead of failing when someone presses Submit. Always true on the
 * local store, and true when the answer is anything but "no such table".
 */
export async function tableExists(name) {
  if (!supabaseReady) return true;
  const { error } = await supabase.from(name).select('id').limit(1);
  return !isMissingTable(error);
}

/** Turn a Postgres/PostgREST error into something a person can act on. */
function friendly(error, table) {
  const msg = error?.message || 'Unknown database error';
  if (isMissingTable(error))
    return `The "${table}" table does not exist yet. Run ${SETUP_SCRIPT[table] || 'supabase-setup.sql'} in the Supabase SQL Editor.`;
  if (error?.code === '42501' || /row-level security/i.test(msg))
    return `You do not have permission to change "${table}". Sign in with an admin account, or check the policies from supabase-setup.sql.`;  if (/JWT|not authenticated/i.test(msg)) return 'Your session expired — please sign in again.';
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
