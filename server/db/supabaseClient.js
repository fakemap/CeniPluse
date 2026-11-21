const config = require('../config');

const DEFAULT_TIMEOUT_MS = 10000;
const PAGE_SIZE = 1000;
const UPSERT_BATCH_SIZE = 80;
const DELETE_BATCH_SIZE = 50;
const AUTH_CACHE_TTL_MS = 30 * 1000;
const verifiedUserCache = new Map();

function getCredentials() {
  const url = String(process.env.SUPABASE_URL || config.SUPABASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const serviceKey = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY || config.SUPABASE_SERVICE_ROLE_KEY || ''
  ).trim();
  const anonKey = String(
    process.env.SUPABASE_ANON_KEY || config.SUPABASE_ANON_KEY || ''
  ).trim();
  return { url, serviceKey, anonKey };
}

/**
 * Verifies a Supabase Auth access_token (JWT) by calling Supabase Auth `/auth/v1/user`.
 * Uses a 30s in-memory cache per token to avoid hitting Supabase on every admin poll.
 */
async function verifySupabaseUser(accessToken) {
  const token = String(accessToken || '').trim();
  if (!token || token.split('.').length !== 3) return null;

  const cached = verifiedUserCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }

  const { url, serviceKey, anonKey } = getCredentials();
  const apiKey = serviceKey || anonKey;
  if (!url || !apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      verifiedUserCache.delete(token);
      return null;
    }
    const user = await res.json();
    if (!user || !user.id || !user.email) return null;

    if (verifiedUserCache.size > 200) {
      const now = Date.now();
      for (const [k, v] of verifiedUserCache.entries()) {
        if (v.expiresAt <= now) verifiedUserCache.delete(k);
      }
    }
    verifiedUserCache.set(token, { user, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
    return user;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Checks whether a verified Supabase user has administrator privileges
 * via `app_metadata.role === 'admin'` OR the `ADMIN_EMAILS` env var allowlist.
 */
function isSupabaseAdminUser(user) {
  if (!user || !user.email) return false;
  if (String(user.app_metadata?.role || '').toLowerCase() === 'admin') {
    return true;
  }
  const allowlist = String(process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(String(user.email).trim().toLowerCase());
}

function isEnabled() {
  const { url, serviceKey } = getCredentials();
  return Boolean(url && serviceKey);
}

async function supabaseFetch(endpoint, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const { url, serviceKey } = getCredentials();
  if (!url || !serviceKey) {
    throw new Error('Supabase credentials are not configured.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${url}/rest/v1/${endpoint}`, {
      ...options,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Supabase REST error (${res.status}): ${errText.slice(0, 220)}`);
    }

    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches all rows from a Supabase table using 1000-row range pagination.
 */
async function fetchAllRows(table, orderBy = '') {
  const all = [];
  let start = 0;

  while (true) {
    const end = start + PAGE_SIZE - 1;
    const qs = new URLSearchParams({ select: '*' });
    if (orderBy) qs.set('order', orderBy);

    const res = await supabaseFetch(`${table}?${qs.toString()}`, {
      method: 'GET',
      headers: {
        'Range-Unit': 'items',
        Range: `${start}-${end}`,
      },
    });

    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;

    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
  }

  return all;
}

/**
 * Upserts rows into Supabase in batches of 80 with merge-duplicates semantics.
 */
async function upsertRows(table, rows, onConflict = 'id') {
  if (!Array.isArray(rows) || rows.length === 0) return;

  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const chunk = rows.slice(i, i + UPSERT_BATCH_SIZE);
    await supabaseFetch(`${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(chunk),
    });
  }
}

/**
 * Deletes rows from Supabase by primary ID in batches of 50.
 */
async function deleteByIds(table, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;

  for (let i = 0; i < ids.length; i += DELETE_BATCH_SIZE) {
    const chunk = ids.slice(i, i + DELETE_BATCH_SIZE);
    const inList = chunk
      .map((id) => `"${encodeURIComponent(String(id).replace(/"/g, ''))}"`)
      .join(',');
    await supabaseFetch(`${table}?id=in.(${inList})`, {
      method: 'DELETE',
      headers: {
        Prefer: 'return=minimal',
      },
    });
  }
}

/**
 * Inserts one or more rows into a Supabase table.
 */
async function insertRows(table, rows, returnRepresentation = false) {
  const payload = Array.isArray(rows) ? rows : [rows];
  if (payload.length === 0) return [];
  const res = await supabaseFetch(table, {
    method: 'POST',
    headers: {
      Prefer: returnRepresentation ? 'return=representation' : 'return=minimal',
    },
    body: JSON.stringify(payload),
  });
  return returnRepresentation ? res.json() : [];
}

/**
 * Queries rows from a Supabase table with optional PostgREST filter params & limit.
 */
async function queryRows(table, queryString = '') {
  const endpoint = queryString ? `${table}?${queryString}` : `${table}?select=*`;
  const res = await supabaseFetch(endpoint, { method: 'GET' });
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Deletes rows matching a PostgREST filter query (e.g., "created_at=lt.2026-01-01T00:00:00Z").
 */
async function deleteWhere(table, filterQuery) {
  if (!filterQuery) return;
  await supabaseFetch(`${table}?${filterQuery}`, {
    method: 'DELETE',
    headers: {
      Prefer: 'return=minimal',
    },
  });
}

module.exports = {
  isEnabled,
  getCredentials,
  verifySupabaseUser,
  isSupabaseAdminUser,
  fetchAllRows,
  upsertRows,
  deleteByIds,
  deleteWhere,
  insertRows,
  queryRows,
};
