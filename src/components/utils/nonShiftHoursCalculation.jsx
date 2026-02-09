import { parseContractHours } from '@/lib/weeklyHoursCalculation';

/**
 * Calculate the hours for a non-shift that generates work hours
 * Formula: heuresJour = heuresContratSemaine / nbJoursTravaillésAuContrat
 * 
 * Rules:
 * 1. If real shifts exist on the same day → count only shift hours (non-shift adds nothing)
 * 2. If multiple "generates_hours" non-shifts on same day → credit only once (no stacking)
 * 3. If contract incomplete (nbJoursTravaillésAuContrat=0 or hours null) → credit 0 + warning
 * 
 * @param {Object} employee - Employee with contract info
 * @param {Array} shiftsOnDay - Shifts on the same day
 * @param {Array} nonShiftsOnDay - All non-shifts on the same day
 * @param {Object} currentNonShift - The current non-shift being evaluated
 * @param {Array} nonShiftTypes - All non-shift types
 * @returns {Object} { hours: number, warning: string|null }
 */
export function calculateNonShiftHours(employee, shiftsOnDay, nonShiftsOnDay, currentNonShift, nonShiftTypes) {
  // Rule 1: If real shifts exist on the day, non-shift doesn't add hours
  if (shiftsOnDay && shiftsOnDay.length > 0) {
    return { hours: 0, warning: null };
  }

  // Find the non-shift type
  const nonShiftType = nonShiftTypes.find(t => t.id === currentNonShift.non_shift_type_id);
  
  // Check if this non-shift generates hours
  if (!nonShiftType || !nonShiftType.generates_work_hours) {
    return { hours: 0, warning: null };
  }

  // Rule 2: If multiple "generates_hours" non-shifts on same day, credit only once
  const generatingNonShifts = nonShiftsOnDay.filter(ns => {
    const type = nonShiftTypes.find(t => t.id === ns.non_shift_type_id);
    return type && type.generates_work_hours;
  });

  // Only the first one (by id or date) should generate hours
  const firstGeneratingId = generatingNonShifts.length > 0 ? 
    generatingNonShifts.sort((a, b) => a.id.localeCompare(b.id))[0].id : 
    null;

  if (currentNonShift.id !== firstGeneratingId) {
    return { hours: 0, warning: null };
  }

  // Get contract hours per week
  const contractHoursWeekly = parseContractHours(employee?.contract_hours_weekly);
  
  if (!contractHoursWeekly || contractHoursWeekly === 0) {
    return { 
      hours: 0, 
      warning: 'Heures contractuelles hebdomadaires non définies' 
    };
  }

  // Count worked days in contract
  const weeklySchedule = employee?.weekly_schedule || {};
  const workedDaysCount = Object.values(weeklySchedule).filter(day => day?.worked === true).length;

  // Rule 3: If no worked days in contract, return 0 + warning
  if (workedDaysCount === 0) {
    return { 
      hours: 0, 
      warning: 'Aucun jour travaillé défini dans le contrat' 
    };
  }

  // Calculate hours per day
  const hoursPerDay = contractHoursWeekly / workedDaysCount;

  return { hours: hoursPerDay, warning: null };
}

/**
 * Get total hours for a day, considering both shifts and non-shifts
 * 
 * @param {Array} shifts - Shifts on the day
 * @param {Array} nonShifts - Non-shifts on the day
 * @param {Array} nonShiftTypes - All non-shift types
 * @param {Object} employee - Employee with contract info
 * @param {Function} calculateShiftDuration - Function to calculate shift duration
 * @returns {Object} { hours: number, warnings: Array }
 */
export function calculateDayHours(shifts, nonShifts, nonShiftTypes, employee, calculateShiftDuration) {
  const warnings = [];

  // If there are real shifts, count only shift hours
  if (shifts && shifts.length > 0) {
    const shiftHours = shifts.reduce((sum, shift) => sum + calculateShiftDuration(shift), 0);
    return { hours: shiftHours, warnings };
  }

  // No shifts - check for non-shifts that generate hours
  const generatingNonShifts = nonShifts.filter(ns => {
    const type = nonShiftTypes.find(t => t.id === ns.non_shift_type_id);
    return type && type.generates_work_hours;
  });

  if (generatingNonShifts.length === 0) {
    return { hours: 0, warnings };
  }

  // Use the first one to calculate hours
  const firstNonShift = generatingNonShifts.sort((a, b) => a.id.localeCompare(b.id))[0];
  const result = calculateNonShiftHours(employee, [], nonShifts, firstNonShift, nonShiftTypes);
  
  if (result.warning) {
    warnings.push(result.warning);
  }

  return { hours: result.hours, warnings };
}