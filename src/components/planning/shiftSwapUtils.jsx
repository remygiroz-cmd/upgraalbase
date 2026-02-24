/**
 * Utility functions for shift swap operations
 * EXIGENCE A: Conflict detection by employee only (no team-wide checks)
 * EXIGENCE B: Use timestamps/date strings, never UI-formatted dates
 * EXIGENCE C: Single centralized swapHasConflict function
 */

/**
 * Extract local day key (YYYY-MM-DD) from a date string
 * @param dateStr - Date string in format YYYY-MM-DD
 * @returns {string} Day key in format YYYY-MM-DD
 */
export function getLocalDayKey(dateStr) {
  if (!dateStr) return null;
  // dateStr is already in YYYY-MM-DD format from Shift entity
  return dateStr.substring(0, 10);
}

/**
 * Extract local month key (YYYY-MM) from a date string
 * @param dateStr - Date string in format YYYY-MM-DD
 * @returns {string} Month key in format YYYY-MM
 */
export function getLocalMonthKey(dateStr) {
  if (!dateStr) return null;
  return dateStr.substring(0, 7);
}

/**
 * Convert time string HH:mm to minutes since midnight
 * @param timeStr - Time string in format HH:mm
 * @returns {number} Minutes since midnight
 */
export function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Check if two time ranges overlap
 * @param start1, end1 - Time strings in HH:mm format
 * @param start2, end2 - Time strings in HH:mm format
 * @returns {boolean} True if ranges overlap
 */
export function timesOverlap(start1, end1, start2, end2) {
  const s1 = timeToMinutes(start1);
  const e1 = timeToMinutes(end1);
  const s2 = timeToMinutes(start2);
  const e2 = timeToMinutes(end2);
  
  // Handle overnight shifts: if end < start, it crosses midnight
  // For simplicity: assume same-day or overnight shifts within same date
  // Overlap if: s1 < e2 AND s2 < e1
  return s1 < e2 && s2 < e1;
}

/**
 * Get shifts for a specific employee on a specific date
 * EXIGENCE A: Filter by employee_id only, no team-wide queries
 * @param allShifts - All shifts in month
 * @param employeeId - Target employee ID
 * @param dateStr - Target date (YYYY-MM-DD)
 * @param excludeShiftIds - Set of shift IDs to exclude (shift A and B)
 * @returns {array} Filtered shifts
 */
export function getShiftsForEmployeeOnDate(allShifts, employeeId, dateStr, excludeShiftIds = new Set()) {
  if (!employeeId || !dateStr || !allShifts) return [];
  
  return allShifts.filter(shift =>
    shift.employee_id === employeeId &&           // EXIGENCE A: Employee filter mandatory
    shift.date === dateStr &&                     // Same day (YYYY-MM-DD)
    !excludeShiftIds.has(shift.id)                // Exclude swap participants
  );
}

/**
 * EXIGENCE C: Single centralized conflict detection function
 * Check if swapping shiftA and shiftB would create a schedule conflict
 * 
 * Simulation: After swap, shiftA goes to employeeBId on dayA, shiftB goes to employeeAId on dayB
 * 
 * @param shiftA - First shift to swap
 * @param shiftB - Second shift to swap
 * @param employeeAId - Employee A ID (who will receive shiftB)
 * @param employeeBId - Employee B ID (who will receive shiftA)
 * @param allShifts - All shifts in month
 * @returns {boolean} True if conflict detected, false if swap is safe
 */
export function swapHasConflict(shiftA, shiftB, employeeAId, employeeBId, allShifts) {
  if (!shiftA || !shiftB || !employeeAId || !employeeBId) return false;

  const excludeIds = new Set([shiftA.id, shiftB.id]);
  
  // Calculate day keys from source date fields (EXIGENCE B: use date, not UI text)
  const dayA = getLocalDayKey(shiftA.date);
  const dayB = getLocalDayKey(shiftB.date);
  
  if (!dayA || !dayB) return false;

  // DEBUG: Log conflict check details
  const DEBUG = false; // Set to true to enable debugging
  if (DEBUG) {
    console.log(`[swapHasConflict] Checking swap:`, {
      shiftA_id: shiftA.id,
      shiftB_id: shiftB.id,
      employeeAId,
      employeeBId,
      dayA,
      dayB
    });
  }

  // EXIGENCE A: Get shifts for employee A on day B only (not all shifts)
  // After swap, shiftB will go to employeeA, so check if it conflicts on dayB
  const existingA_on_dayB = getShiftsForEmployeeOnDate(allShifts, employeeAId, dayB, excludeIds);
  
  if (DEBUG) {
    console.log(`[swapHasConflict] existingA_on_dayB (employee ${employeeAId} on ${dayB}):`, 
      existingA_on_dayB.length, existingA_on_dayB.map(s => `${s.start_time}-${s.end_time}`));
  }

  for (const existingShift of existingA_on_dayB) {
    if (timesOverlap(shiftB.start_time, shiftB.end_time, existingShift.start_time, existingShift.end_time)) {
      if (DEBUG) {
        console.log(`[swapHasConflict] ❌ Conflict: shiftB (${shiftB.start_time}-${shiftB.end_time}) overlaps with existing (${existingShift.start_time}-${existingShift.end_time})`);
      }
      return true;
    }
  }

  // EXIGENCE A: Get shifts for employee B on day A only (not all shifts)
  // After swap, shiftA will go to employeeB, so check if it conflicts on dayA
  const existingB_on_dayA = getShiftsForEmployeeOnDate(allShifts, employeeBId, dayA, excludeIds);
  
  if (DEBUG) {
    console.log(`[swapHasConflict] existingB_on_dayA (employee ${employeeBId} on ${dayA}):`, 
      existingB_on_dayA.length, existingB_on_dayA.map(s => `${s.start_time}-${s.end_time}`));
  }

  for (const existingShift of existingB_on_dayA) {
    if (timesOverlap(shiftA.start_time, shiftA.end_time, existingShift.start_time, existingShift.end_time)) {
      if (DEBUG) {
        console.log(`[swapHasConflict] ❌ Conflict: shiftA (${shiftA.start_time}-${shiftA.end_time}) overlaps with existing (${existingShift.start_time}-${existingShift.end_time})`);
      }
      return true;
    }
  }

  if (DEBUG) {
    console.log(`[swapHasConflict] ✅ No conflict detected`);
  }

  return false;
}