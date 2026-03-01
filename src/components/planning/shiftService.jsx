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
 * Filter shifts for a given version (including legacy shifts without month_key/reset_version).
 */
function filterByVersion(shifts, monthKey, resetVersion) {
  return shifts.filter(s => {
    const noVersion = s.month_key === undefined || s.month_key === null;
    const noResetV  = s.reset_version === undefined || s.reset_version === null;
    if (noVersion && noResetV) return true; // legacy shift — always include
    if (s.month_key !== monthKey) return false;
    if (s.reset_version !== resetVersion) return false;
    return true;
  });
}

/**
 * Fetch all shifts for the active planning context of a given month.
 *
 * Fallback: if the requested reset_version yields 0 versioned shifts for this month,
 * automatically falls back to the highest reset_version that has at least 1 shift.
 * Logs a warning when fallback is triggered.
 *
 * @param {string} monthKey      - "YYYY-MM" of the month to load
 * @param {number} resetVersion  - active reset_version for this month (from PlanningMonth)
 * @param {object} [options]
 * @param {string} [options.employeeId]  - restrict to a single employee
 * @returns {Promise<{ shifts: Array, effectiveVersion: number }>}  NOTE: returns shifts array directly for backward compat
 */
export async function getActiveShiftsForMonth(monthKey, resetVersion, options = {}) {
  const [year, month] = monthKey.split('-').map(Number);
  const firstDay = `${monthKey}-01`;
  const lastDayDate = new Date(year, month, 0); // last day of month
  const lastDay = formatDate(lastDayDate);

  console.log(`[ShiftService] Fetching | month_key=${monthKey} | requested reset_version=${resetVersion}`);

  const allShifts = await base44.entities.Shift.list();

  // Step 1: restrict to date range
  const dateFiltered = allShifts.filter(s => s.date >= firstDay && s.date <= lastDay);

  // Step 2: restrict to active version
  let versionFiltered = filterByVersion(dateFiltered, monthKey, resetVersion);

  // --- FALLBACK: if 0 versioned shifts for this month, find last non-empty version ---
  // Count only shifts that actually have this month_key (exclude legacy)
  const versionedInMonth = versionFiltered.filter(s => s.month_key === monthKey);
  if (versionedInMonth.length === 0 && dateFiltered.some(s => s.month_key === monthKey)) {
    // Build map of reset_version → count for this month_key
    const versionCounts = {};
    for (const s of dateFiltered) {
      if (s.month_key !== monthKey) continue;
      const v = s.reset_version ?? 0;
      versionCounts[v] = (versionCounts[v] || 0) + 1;
    }

    // Find the highest version with at least 1 shift
    const nonEmptyVersions = Object.entries(versionCounts)
      .filter(([, count]) => count > 0)
      .map(([v]) => Number(v))
      .sort((a, b) => b - a); // descending

    if (nonEmptyVersions.length > 0) {
      const fallbackVersion = nonEmptyVersions[0];
      console.warn(
        `[ShiftService] ⚠️ FALLBACK TRIGGERED for month_key=${monthKey}` +
        ` | requested v${resetVersion} has 0 shifts` +
        ` | falling back to v${fallbackVersion}` +
        ` | available non-empty versions: [${nonEmptyVersions.join(', ')}]` +
        ` | version counts:`, versionCounts
      );
      versionFiltered = filterByVersion(dateFiltered, monthKey, fallbackVersion);
    } else {
      console.warn(
        `[ShiftService] ⚠️ month_key=${monthKey} has 0 shifts for v${resetVersion} and NO other non-empty version exists.`
      );
    }
  } else {
    console.log(
      `[ShiftService] ✅ month_key=${monthKey} | reset_version=${resetVersion}` +
      ` | ${versionedInMonth.length} versioned shifts loaded` +
      (versionFiltered.length > versionedInMonth.length
        ? ` + ${versionFiltered.length - versionedInMonth.length} legacy shifts`
        : '')
    );
  }

  // Step 3: optional employee filter
  const result = options.employeeId
    ? versionFiltered.filter(s => s.employee_id === options.employeeId)
    : versionFiltered;

  // Extended debug diagnostics (only when PLANNING_DEBUG=1)
  if (DEBUG()) {
    const outOfRange = allShifts.filter(s => s.date < firstDay || s.date > lastDay);
    const wrongVersion = dateFiltered.filter(s => {
      if (!s.month_key) return false;
      // After potential fallback, these are shifts with a different version than what we ended up using
      return !versionFiltered.includes(s);
    });

    log(`Total in DB: ${allShifts.length}`);
    log(`In date range [${firstDay}..${lastDay}]: ${dateFiltered.length}`);
    log(`After version filter: ${versionFiltered.length}`);
    log(`Returned to UI: ${result.length}`);

    if (wrongVersion.length > 0) {
      warn(`⚠️ ${wrongVersion.length} shifts in range but excluded (other versions):`,
        wrongVersion.map(s => ({ id: s.id, date: s.date, month_key: s.month_key, reset_version: s.reset_version }))
      );
    }
    if (outOfRange.length > 0) {
      log(`ℹ️ ${outOfRange.length} shifts outside date range — excluded`);
    }
  }

  return result;
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
    // Narrow the fetch to date + employee when possible (cheaper than list())
    candidates = await base44.entities.Shift.list();
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