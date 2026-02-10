import { calculateDayHours } from '@/components/utils/nonShiftHoursCalculation';

/**
 * Monthly recap calculations with 3 calculation modes
 * 
 * MODES:
 * - disabled: No automatic calculations
 * - weekly: Weekly overtime calculation (43h limit per week)
 * - monthly: Monthly smoothing for part-time workers
 * 
 * Rules:
 * - Overtime (temps plein): 35h/week is base, +25% from 36-43h, +50% above 43h
 * - Complementary (temps partiel): +10% up to 10% of contract, +25% beyond, max 1/3 of contract
 */

/**
 * Parse contract hours from string format to decimal
 */
export function parseContractHours(hoursString) {
  if (typeof hoursString === 'number') return hoursString;
  if (!hoursString) return 0;
  
  const str = String(hoursString).trim();
  
  if (str.includes(':')) {
    const [hours, minutes] = str.split(':').map(s => parseInt(s, 10));
    return hours + (minutes || 0) / 60;
  }
  
  const parsed = parseFloat(str.replace(',', '.'));
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Calculate shift duration in decimal hours
 */
export function calculateShiftDuration(shift) {
  if (!shift || !shift.start_time || !shift.end_time) return 0;

  if (shift.base_hours_override !== null && shift.base_hours_override !== undefined) {
    return shift.base_hours_override;
  }

  const [startHour, startMin] = shift.start_time.split(':').map(Number);
  const [endHour, endMin] = shift.end_time.split(':').map(Number);

  let totalMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
  
  if (totalMinutes < 0) {
    totalMinutes += 24 * 60;
  }

  const breakMinutes = shift.break_minutes || 0;
  totalMinutes -= breakMinutes;

  return Math.max(0, totalMinutes / 60);
}

/**
 * Parse hours string (HH:MM or decimal)
 */
export function parseHoursString(value) {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  
  const str = String(value).trim();
  
  if (str.includes(':')) {
    const [h, m] = str.split(':').map(s => parseInt(s, 10) || 0);
    return h + m / 60;
  }
  
  const parsed = parseFloat(str.replace(',', '.'));
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Format a date to YYYY-MM-DD
 */
function formatDate(date) {
  if (typeof date === 'string') return date;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get all dates in a month
 */
function getDatesInMonth(year, month) {
  const dates = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  for (let day = 1; day <= daysInMonth; day++) {
    dates.push(formatDate(new Date(year, month, day)));
  }
  
  return dates;
}

/**
 * Calculate monthly recap
 * 
 * @param {string} mode - 'disabled', 'weekly', or 'monthly'
 * @param {Object} employee - Employee data
 * @param {Array} shifts - All shifts
 * @param {Array} nonShiftEvents - All non-shift events
 * @param {Array} nonShiftTypes - Non-shift type definitions
 * @param {Array} holidayDates - Array of holiday date strings
 * @param {number} year - Year (e.g., 2026)
 * @param {number} month - Month (0-indexed, 0=January)
 * @returns {Object} calculated recap
 */
export function calculateMonthlyRecap(
  mode,
  employee,
  shifts,
  nonShiftEvents,
  nonShiftTypes,
  holidayDates,
  year,
  month
) {
  // Base result structure
  const result = {
    expectedDays: 0,
    workedDays: 0,
    extraDays: 0,
    contractMonthlyHours: 0,
    adjustedContractHours: 0,
    workedHours: 0,
    isPartTime: employee.work_time_type === 'part_time',
    overtimeHours25: 0,
    overtimeHours50: 0,
    totalOvertimeHours: 0,
    complementaryHours10: 0,
    complementaryHours25: 0,
    totalComplementaryHours: 0,
    nonShiftsByType: {},
    holidaysWorkedDays: 0,
    holidaysWorkedHours: 0,
    eligibleForHolidayPay: false,
    cpDays: null // Will be filled from CP periods
  };

  if (mode === 'disabled') {
    // Only count basic worked hours, no calculations
    const monthDates = getDatesInMonth(year, month);
    
    monthDates.forEach(date => {
      const dayShifts = shifts.filter(s => 
        s.employee_id === employee.id && 
        s.date === date && 
        s.status !== 'cancelled'
      );
      
      const dayNonShifts = nonShiftEvents.filter(ns => 
        ns.employee_id === employee.id && 
        ns.date === date
      );

      if (dayShifts.length > 0) {
        result.workedDays++;
        dayShifts.forEach(s => {
          result.workedHours += calculateShiftDuration(s);
        });
      } else if (dayNonShifts.length > 0) {
        const { hours } = calculateDayHours([], dayNonShifts, nonShiftTypes, employee, calculateShiftDuration);
        result.workedHours += hours;
      }
    });

    return result;
  }

  // For weekly and monthly modes: full calculations
  const contractHoursWeekly = parseContractHours(employee.contract_hours_weekly) || 35;
  const workDaysPerWeek = employee.work_days_per_week || 5;
  
  // Calculate expected monthly hours based on calendar
  const monthDates = getDatesInMonth(year, month);
  const weeklySchedule = employee.weekly_schedule || {};
  
  // Determine which days of week are worked
  const workedDaysOfWeek = new Set();
  const dayMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  
  dayMap.forEach((dayName, dayIndex) => {
    if (weeklySchedule[dayName]?.worked) {
      workedDaysOfWeek.add(dayIndex);
    }
  });
  
  // If no schedule, assume consecutive days from Monday
  if (workedDaysOfWeek.size === 0) {
    for (let i = 0; i < workDaysPerWeek; i++) {
      workedDaysOfWeek.add((i + 1) % 7); // 1=Monday, 2=Tuesday, etc.
    }
  }
  
  // Count expected days in the month
  monthDates.forEach(dateStr => {
    const date = new Date(dateStr);
    const dayOfWeek = date.getDay();
    if (workedDaysOfWeek.has(dayOfWeek)) {
      result.expectedDays++;
    }
  });
  
  // Calculate contract monthly hours
  const weeksInMonth = monthDates.length / 7;
  result.contractMonthlyHours = Math.round((contractHoursWeekly * weeksInMonth) * 100) / 100;
  result.adjustedContractHours = result.contractMonthlyHours;

  // Calculate worked hours and days
  const dayDataMap = new Map();
  
  monthDates.forEach(date => {
    const dayShifts = shifts.filter(s => 
      s.employee_id === employee.id && 
      s.date === date && 
      s.status !== 'cancelled'
    );
    
    const dayNonShifts = nonShiftEvents.filter(ns => 
      ns.employee_id === employee.id && 
      ns.date === date
    );

    const { hours, warnings } = calculateDayHours(
      dayShifts, 
      dayNonShifts, 
      nonShiftTypes, 
      employee, 
      calculateShiftDuration
    );

    if (hours > 0 || dayShifts.length > 0 || dayNonShifts.length > 0) {
      result.workedDays++;
      result.workedHours += hours;
      
      dayDataMap.set(date, {
        hours,
        hasShifts: dayShifts.length > 0,
        hasNonShifts: dayNonShifts.length > 0,
        isHoliday: holidayDates.includes(date)
      });
    }

    // Track holiday worked days
    if (dayShifts.length > 0 && holidayDates.includes(date)) {
      result.holidaysWorkedDays++;
      result.holidaysWorkedHours += hours;
    }

    // Count non-shifts by type
    dayNonShifts.forEach(ns => {
      const type = nonShiftTypes.find(t => t.id === ns.non_shift_type_id);
      if (type) {
        const key = type.code || type.name;
        if (!result.nonShiftsByType[key]) {
          result.nonShiftsByType[key] = { count: 0, code: type.code };
        }
        result.nonShiftsByType[key].count++;
      }
    });
  });

  // Calculate extra days
  result.extraDays = Math.max(0, result.workedDays - result.expectedDays);

  // Calculate overtime/complementary based on mode
  if (mode === 'weekly') {
    // Weekly calculation: check each week individually
    calculateWeeklyOvertime(result, employee, shifts, nonShiftEvents, nonShiftTypes, monthDates, contractHoursWeekly);
  } else if (mode === 'monthly') {
    // Monthly calculation: STILL calculates week-by-week for legal compliance
    // The difference is only in how base hours are displayed/adjusted
    calculateMonthlyOvertime(result, employee, shifts, nonShiftEvents, nonShiftTypes, monthDates, contractHoursWeekly);
  }

  // Check holiday pay eligibility (8 months = ~240 days of employment)
  if (employee.start_date) {
    const startDate = new Date(employee.start_date);
    const currentDate = new Date(year, month, 15); // Mid-month check
    const daysEmployed = Math.floor((currentDate - startDate) / (1000 * 60 * 60 * 24));
    result.eligibleForHolidayPay = daysEmployed >= 240;
  }

  return result;
}

/**
 * Calculate overtime using weekly method
 * Each week is checked individually for 43h limit
 */
function calculateWeeklyOvertime(result, employee, shifts, nonShiftEvents, nonShiftTypes, monthDates, contractHoursWeekly) {
  const isPartTime = employee.work_time_type === 'part_time';
  
  // Group dates by week (Monday to Sunday)
  const weekMap = new Map();
  
  monthDates.forEach(dateStr => {
    const date = new Date(dateStr);
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Days to Monday
    const monday = new Date(date);
    monday.setDate(monday.getDate() + diff);
    const weekKey = formatDate(monday);
    
    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, []);
    }
    weekMap.get(weekKey).push(dateStr);
  });

  // Calculate overtime for each week
  weekMap.forEach((weekDates) => {
    let weekHours = 0;
    
    weekDates.forEach(date => {
      const dayShifts = shifts.filter(s => 
        s.employee_id === employee.id && 
        s.date === date && 
        s.status !== 'cancelled'
      );
      
      const dayNonShifts = nonShiftEvents.filter(ns => 
        ns.employee_id === employee.id && 
        ns.date === date
      );

      const { hours } = calculateDayHours(
        dayShifts, 
        dayNonShifts, 
        nonShiftTypes, 
        employee, 
        calculateShiftDuration
      );

      weekHours += hours;
    });

    // Calculate overtime/complementary for this week
    if (isPartTime) {
      // Part-time: complementary hours
      const excess = Math.max(0, weekHours - contractHoursWeekly);
      const maxComplementary = contractHoursWeekly / 3; // Max 1/3 of contract
      const actualComplementary = Math.min(excess, maxComplementary);
      
      const limit10 = contractHoursWeekly * 0.10;
      result.complementaryHours10 += Math.min(actualComplementary, limit10);
      
      if (actualComplementary > limit10) {
        result.complementaryHours25 += actualComplementary - limit10;
      }
    } else {
      // Full-time: overtime hours
      if (weekHours > 35) {
        const overtimeThisWeek = weekHours - 35;
        
        // +25% from 36h to 43h (i.e., 1h to 8h of overtime)
        const hours25 = Math.min(overtimeThisWeek, 8);
        result.overtimeHours25 += hours25;
        
        // +50% beyond 43h (i.e., beyond 8h of overtime)
        if (overtimeThisWeek > 8) {
          result.overtimeHours50 += overtimeThisWeek - 8;
        }
      }
    }
  });

  result.totalOvertimeHours = result.overtimeHours25 + result.overtimeHours50;
  result.totalComplementaryHours = result.complementaryHours10 + result.complementaryHours25;
}

/**
 * Calculate overtime using monthly smoothing method
 * CRITICAL: Even in monthly mode, overtime 25%/50% thresholds are calculated WEEK BY WEEK
 * This ensures legal compliance: 35h base per week, +25% from 36-43h, +50% above 43h
 * Monthly mode only differs in how the base contract hours are displayed/adjusted
 */
function calculateMonthlyOvertime(result, employee, shifts, nonShiftEvents, nonShiftTypes, monthDates, contractHoursWeekly) {
  const isPartTime = employee.work_time_type === 'part_time';
  
  if (isPartTime) {
    // Part-time: complementary hours with monthly smoothing
    const excess = Math.max(0, result.workedHours - result.contractMonthlyHours);
    const maxComplementary = result.contractMonthlyHours / 3;
    const actualComplementary = Math.min(excess, maxComplementary);
    
    const limit10 = result.contractMonthlyHours * 0.10;
    result.complementaryHours10 = Math.min(actualComplementary, limit10);
    
    if (actualComplementary > limit10) {
      result.complementaryHours25 = actualComplementary - limit10;
    }
    
    result.totalComplementaryHours = result.complementaryHours10 + result.complementaryHours25;
  } else {
    // Full-time: MUST calculate week by week, then aggregate
    // Legal thresholds are per week: 35h base, +25% from 36-43h, +50% beyond 43h
    
    // Group dates by week (Monday to Sunday)
    const weekMap = new Map();
    
    monthDates.forEach(dateStr => {
      const date = new Date(dateStr);
      const day = date.getDay();
      const diff = day === 0 ? -6 : 1 - day; // Days to Monday
      const monday = new Date(date);
      monday.setDate(monday.getDate() + diff);
      const weekKey = formatDate(monday);
      
      if (!weekMap.has(weekKey)) {
        weekMap.set(weekKey, []);
      }
      weekMap.get(weekKey).push(dateStr);
    });

    // Calculate overtime for each week, then sum
    weekMap.forEach((weekDates) => {
      let weekHours = 0;
      
      weekDates.forEach(date => {
        const dayShifts = shifts.filter(s => 
          s.employee_id === employee.id && 
          s.date === date && 
          s.status !== 'cancelled'
        );
        
        const dayNonShifts = nonShiftEvents.filter(ns => 
          ns.employee_id === employee.id && 
          ns.date === date
        );

        const { hours } = calculateDayHours(
          dayShifts, 
          dayNonShifts, 
          nonShiftTypes, 
          employee, 
          calculateShiftDuration
        );

        weekHours += hours;
      });

      // Apply weekly thresholds: 35h base, +25% up to 43h, +50% beyond
      if (weekHours > 35) {
        const overtimeThisWeek = weekHours - 35;
        
        // +25% from 36h to 43h (i.e., 1h to 8h of overtime)
        const hours25 = Math.min(overtimeThisWeek, 8);
        result.overtimeHours25 += hours25;
        
        // +50% beyond 43h (i.e., beyond 8h of overtime)
        if (overtimeThisWeek > 8) {
          result.overtimeHours50 += overtimeThisWeek - 8;
        }
      }
    });

    result.totalOvertimeHours = result.overtimeHours25 + result.overtimeHours50;
  }
}

/**
 * Apply manual overrides to calculated recap
 */
export function applyManualOverrides(calculatedRecap, overrides) {
  const result = { ...calculatedRecap };
  const overriddenFields = [];

  Object.keys(overrides).forEach(key => {
    const value = overrides[key];
    if (value !== null && value !== undefined && value !== '') {
      result[key] = value;
      overriddenFields.push(key);
    }
  });

  return { ...result, overriddenFields };
}