const config = require('../config');

const DEFAULT_TIMEOUT_MS = 10000;
const PAGE_SIZE = 1000;
const UPSERT_BATCH_SIZE = 80;
const DELETE_BATCH_SIZE = 50;

function getCredentials() {
  const url = String(process.env.SUPABASE_URL || config.SUPABASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const serviceKey = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY || config.SUPABASE_SERVICE_ROLE_KEY || ''
  ).trim();
  return { url, serviceKey };
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

module.exports = {
  isEnabled,
  fetchAllRows,
  upsertRows,
  deleteByIds,
};
