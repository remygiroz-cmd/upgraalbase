/**
 * Centralized shift fetching service
 * 
 * RULE: Every UI that shows shifts MUST use one of these helpers.
 * Only the "Historique" screen is allowed to bypass these filters.
 * 
 * Debug logging is controlled by the PLANNING_DEBUG env-like flag:
 *   localStorage.setItem('PLANNING_DEBUG', '1') → enable
 *   localStorage.removeItem('PLANNING_DEBUG')   → disable
 */

import { base44 } from '@/api/base44Client';

const DEBUG = () => localStorage.getItem('PLANNING_DEBUG') === '1';

function log(...args) {
  if (DEBUG()) console.log('[ShiftService]', ...args);
}

function warn(...args) {
  if (DEBUG()) console.warn('[ShiftService]', ...args);
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Fetch all pages of a filtered entity query (handles Base44 pagination).
 * Base44 returns up to `limit` records per call; we loop until exhausted.
 */
async function fetchAllPages(filterFn, pageSize = 500) {
  const results = [];
  let skip = 0;
  let requests = 0;
  while (true) {
    const page = await filterFn(skip, pageSize);
    requests++;
    results.push(...page);
    if (page.length < pageSize) break; // last page
    skip += pageSize;
  }
  return { results, requests };
}

/**
 * Fetch all shifts for the active planning context of a given month.
 *
 * ✅ Uses server-side filters (month_key + reset_version) — NO global Shift.list().
 * ✅ Handles pagination in case count > pageSize.
 * ✅ Fallback: if the requested reset_version has 0 shifts, queries each candidate
 *    version (descending) until one is non-empty — still server-filtered.
 *
 * @param {string} monthKey      - "YYYY-MM" of the month to load
 * @param {number} resetVersion  - active reset_version for this month (from PlanningMonth)
 * @param {object} [options]
 * @param {string} [options.employeeId]  - restrict to a single employee
 * @returns {Promise<Array>}  array of shifts
 */
export async function getActiveShiftsForMonth(monthKey, resetVersion, options = {}) {
  const t0 = performance.now();

  console.log(`[ShiftService] ▶ Fetching | month_key=${monthKey} | reset_version=${resetVersion}`);

  // Build server-side filter (month_key + reset_version)
  const buildFilter = (mk, rv) => {
    const f = { month_key: mk, reset_version: rv };
    if (options.employeeId) f.employee_id = options.employeeId;
    return f;
  };

  // Primary fetch: exact version requested
  const primaryFilter = buildFilter(monthKey, resetVersion);
  const { results: primaryShifts, requests: req1 } = await fetchAllPages(
    (skip, limit) => base44.entities.Shift.filter(primaryFilter, '-date', limit, skip),
  );

  const elapsed1 = (performance.now() - t0).toFixed(0);
  console.log(
    `[ShiftService] Primary fetch | ${primaryShifts.length} shifts | ${req1} req | ${elapsed1}ms`
  );

  if (primaryShifts.length > 0) {
    log(`✅ month_key=${monthKey} v${resetVersion} → ${primaryShifts.length} shifts`);
    return primaryShifts;
  }

  // --- FALLBACK: v0 has 0 shifts → scan candidate versions server-side ---
  // First, discover which versions exist for this month_key (without loading all shifts)
  console.warn(`[ShiftService] ⚠️ v${resetVersion} has 0 shifts for ${monthKey} — checking fallback versions`);

  // Fetch a small sample of ANY version for this month_key to discover candidates
  const { results: anySample } = await fetchAllPages(
    (skip, limit) => base44.entities.Shift.filter({ month_key: monthKey }, '-reset_version', limit, skip),
  );

  const versionCounts = {};
  for (const s of anySample) {
    const v = s.reset_version ?? 0;
    versionCounts[v] = (versionCounts[v] || 0) + 1;
  }

  const candidateVersions = Object.entries(versionCounts)
    .filter(([v, count]) => Number(v) !== resetVersion && count > 0)
    .map(([v]) => Number(v))
    .sort((a, b) => b - a); // highest first

  if (candidateVersions.length === 0) {
    console.warn(`[ShiftService] ⚠️ No other version found for ${monthKey} — returning []`);
    return [];
  }

  // Use the sample data we already have for the best candidate (avoid extra fetch)
  const fallbackVersion = candidateVersions[0];
  const fallbackShifts = anySample.filter(s => {
    const v = s.reset_version ?? 0;
    return v === fallbackVersion && (!options.employeeId || s.employee_id === options.employeeId);
  });

  const elapsed2 = (performance.now() - t0).toFixed(0);
  console.warn(
    `[ShiftService] ⚠️ FALLBACK | month_key=${monthKey}` +
    ` | requested v${resetVersion} (0 shifts)` +
    ` | using v${fallbackVersion} (${fallbackShifts.length} shifts)` +
    ` | candidates: [${candidateVersions.join(', ')}]` +
    ` | total elapsed: ${elapsed2}ms`
  );

  return fallbackShifts;
}

/**
 * Quick helper to build the React Query key for active shifts.
 * Use this everywhere so invalidation works globally.
 */
export function shiftsQueryKey(year, month, resetVersion) {
  return ['shifts', year, month, resetVersion];
}

// ---------------------------------------------------------------------------
// UPSERT — dedupe-key based shift creation
// ---------------------------------------------------------------------------

/**
 * Build a stable deduplication key for a shift payload.
 * Components of the key: employee_id | date | start_time | end_time | month_key | reset_version
 */
export function buildDedupeKey(payload) {
  const { employee_id, date, start_time, end_time, month_key, reset_version } = payload;
  return [employee_id, date, start_time, end_time, month_key ?? '', reset_version ?? 0].join('|');
}

/**
 * Upsert a shift by dedupe_key.
 *
 * Algorithm:
 *  1. Look for an existing shift with the same dedupe_key and status != 'archived'
 *  2. If found → update it (preserves the id, avoids a duplicate)
 *  3. If not found → create it with the dedupe_key stamped on the payload
 *
 * @param {object} payload  - shift data (without id)
 * @param {Array}  [cache]  - optional pre-fetched list of shifts to avoid an extra DB call
 * @returns {Promise<object>}  the created or updated shift
 */
export async function upsertShiftByDedupeKey(payload, cache = null) {
  const dedupeKey = buildDedupeKey(payload);
  const payloadWithKey = { ...payload, dedupe_key: dedupeKey };

  // Resolve the candidate list
  let candidates;
  if (cache) {
    candidates = cache;
  } else {
    // Fetch only by dedupe_key for this specific shift (server-filtered)
    const { results } = await fetchAllPages(
      (skip, limit) => base44.entities.Shift.filter({ dedupe_key: dedupeKey }, '-created_date', limit, skip)
    );
    candidates = results;
  }

  const existing = candidates.find(
    s => s.dedupe_key === dedupeKey && s.status !== 'archived'
  );

  if (existing) {
    log(`upsert: UPDATE existing shift ${existing.id} (dedupe_key=${dedupeKey})`);
    return base44.entities.Shift.update(existing.id, payloadWithKey);
  }

  log(`upsert: CREATE new shift (dedupe_key=${dedupeKey})`);
  return base44.entities.Shift.create(payloadWithKey);
}

/**
 * Bulk upsert using a pre-fetched cache — much more efficient than calling
 * upsertShiftByDedupeKey() one by one for large batches.
 *
 * @param {object[]} payloads - array of shift payloads
 * @param {object[]} cache    - pre-fetched shifts list (used for conflict detection)
 * @returns {Promise<{created: number, updated: number}>}
 */
export async function bulkUpsertShifts(payloads, cache) {
  const cacheByKey = {};
  for (const s of cache) {
    if (s.dedupe_key && s.status !== 'archived') {
      cacheByKey[s.dedupe_key] = s;
    }
  }

  const toCreate = [];
  const toUpdate = []; // { id, payload }

  for (const payload of payloads) {
    const dedupeKey = buildDedupeKey(payload);
    const payloadWithKey = { ...payload, dedupe_key: dedupeKey };
    const existing = cacheByKey[dedupeKey];
    if (existing) {
      toUpdate.push({ id: existing.id, payload: payloadWithKey });
    } else {
      toCreate.push(payloadWithKey);
      // Add to cacheByKey immediately so same key in this batch doesn't create twice
      cacheByKey[dedupeKey] = { dedupe_key: dedupeKey, status: 'planned' };
    }
  }

  log(`bulkUpsert: ${toCreate.length} creates, ${toUpdate.length} updates`);

  const ops = [];
  if (toCreate.length > 0) {
    ops.push(base44.entities.Shift.bulkCreate(toCreate));
  }
  for (const { id, payload } of toUpdate) {
    ops.push(base44.entities.Shift.update(id, payload));
  }
  await Promise.all(ops);

  return { created: toCreate.length, updated: toUpdate.length };
}