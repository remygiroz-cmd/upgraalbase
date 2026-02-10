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
 * Get all weeks that touch a given month (even partially)
 * Returns an array of week objects with: { weekKey, dates }
 * Each week includes ALL 7 days (Monday to Sunday), even if some are outside the month
 */
function getWeeksTouchingMonth(year, month) {
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  
  const weeks = [];
  const seenWeeks = new Set();
  
  // Iterate through all dates in the month
  const daysInMonth = monthEnd.getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dayOfWeek = date.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Days to Monday
    const monday = new Date(date);
    monday.setDate(monday.getDate() + diff);
    const weekKey = formatDate(monday);
    
    // If we haven't seen this week yet, add it
    if (!seenWeeks.has(weekKey)) {
      seenWeeks.add(weekKey);
      weeks.push({
        weekKey,
        dates: getFullWeekDates(formatDate(date))
      });
    }
  }
  
  return weeks;
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
    calculateWeeklyOvertime(result, employee, shifts, nonShiftEvents, nonShiftTypes, year, month, contractHoursWeekly);
  } else if (mode === 'monthly') {
    // Monthly calculation: STILL calculates week-by-week for legal compliance
    // The difference is only in how base hours are displayed/adjusted
    calculateMonthlyOvertime(result, employee, shifts, nonShiftEvents, nonShiftTypes, year, month, contractHoursWeekly);
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
 * Get all 7 days of a week (Monday to Sunday) given any date in that week
 */
function getFullWeekDates(dateStr) {
  const date = new Date(dateStr);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Days to Monday
  const monday = new Date(date);
  monday.setDate(monday.getDate() + diff);
  
  const weekDates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    weekDates.push(formatDate(d));
  }
  
  return weekDates;
}

/**
 * Calculate overtime using weekly method
 * Each week is checked individually for 43h limit
 * CRITICAL: Weeks that overlap the month are calculated on ALL 7 days, not just days in the month
 */
function calculateWeeklyOvertime(result, employee, shifts, nonShiftEvents, nonShiftTypes, year, month, contractHoursWeekly) {
  const isPartTime = employee.work_time_type === 'part_time';
  
  // Get ALL weeks that touch the month (even partially)
  const weeks = getWeeksTouchingMonth(year, month);

  console.log(`
═══════════════════════════════════════════════════════════
📊 WEEKLY OVERTIME CALCULATION (Weekly Mode)
═══════════════════════════════════════════════════════════
Employee ID: ${employee.id}
Employee Name: ${employee.first_name} ${employee.last_name}
Month: ${year}-${String(month + 1).padStart(2, '0')}
Weeks to process: ${weeks.length}
Contract hours/week: ${contractHoursWeekly}h
═══════════════════════════════════════════════════════════
`);

  const weekDetails = [];

  // Calculate overtime for each week
  weeks.forEach(({ weekKey, dates: weekDates }, weekIndex) => {
    let weekHours = 0;
    const weekStart = weekDates[0];
    const weekEnd = weekDates[6];
    
    // Check if partial week (some days outside the month)
    const monthStartStr = formatDate(new Date(year, month, 1));
    const monthEndStr = formatDate(new Date(year, month + 1, 0));
    const isPartialWeek = weekStart < monthStartStr || weekEnd > monthEndStr;
    
    // Calculate hours for ALL 7 days in the week
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
    let weekOvertime = 0;
    let weekHS25 = 0;
    let weekHS50 = 0;
    
    if (isPartTime) {
      // Part-time: complementary hours
      const excess = Math.max(0, weekHours - contractHoursWeekly);
      const maxComplementary = contractHoursWeekly / 3;
      const actualComplementary = Math.min(excess, maxComplementary);
      
      const limit10 = contractHoursWeekly * 0.10;
      result.complementaryHours10 += Math.min(actualComplementary, limit10);
      
      if (actualComplementary > limit10) {
        result.complementaryHours25 += actualComplementary - limit10;
      }
      
      weekOvertime = actualComplementary;
    } else {
      // Full-time: overtime hours (35h base)
      if (weekHours > 35) {
        weekOvertime = weekHours - 35;
        
        // +25% from 36h to 43h (i.e., 1h to 8h of overtime)
        weekHS25 = Math.min(weekOvertime, 8);
        result.overtimeHours25 += weekHS25;
        
        // +50% beyond 43h (i.e., beyond 8h of overtime)
        if (weekOvertime > 8) {
          weekHS50 = weekOvertime - 8;
          result.overtimeHours50 += weekHS50;
        }
      }
    }

    const weekDetail = {
      index: weekIndex + 1,
      weekKey,
      weekStart,
      weekEnd,
      isPartial: isPartialWeek,
      baseHours: 35, // For full-time
      workedHours: weekHours,
      hsTotal: weekOvertime,
      hs25: weekHS25,
      hs50: weekHS50
    };
    
    weekDetails.push(weekDetail);

    console.log(`Week ${weekIndex + 1} [${weekKey}] ${isPartialWeek ? '⚠️ PARTIAL' : '✓ COMPLETE'}
  Range: ${weekStart} → ${weekEnd}
  Worked: ${weekHours.toFixed(2)}h / Base: 35h
  Overtime: ${weekOvertime.toFixed(2)}h (25%: ${weekHS25.toFixed(2)}h, 50%: ${weekHS50.toFixed(2)}h)`);
  });

  result.totalOvertimeHours = result.overtimeHours25 + result.overtimeHours50;
  result.totalComplementaryHours = result.complementaryHours10 + result.complementaryHours25;
  
  console.log(`
───────────────────────────────────────────────────────────
📈 AGGREGATION SUMMARY
───────────────────────────────────────────────────────────
Total weeks processed: ${weekDetails.length}
  Complete weeks: ${weekDetails.filter(w => !w.isPartial).length}
  Partial weeks: ${weekDetails.filter(w => w.isPartial).length}

Total worked hours: ${weekDetails.reduce((sum, w) => sum + w.workedHours, 0).toFixed(2)}h
Total overtime: ${result.totalOvertimeHours.toFixed(2)}h
  HS 25%: ${result.overtimeHours25.toFixed(2)}h
  HS 50%: ${result.overtimeHours50.toFixed(2)}h

✅ Expected sum check:
  Σ(weekHS) = ${weekDetails.reduce((sum, w) => sum + w.hsTotal, 0).toFixed(2)}h
  Monthly HS = ${result.totalOvertimeHours.toFixed(2)}h
  ${Math.abs(weekDetails.reduce((sum, w) => sum + w.hsTotal, 0) - result.totalOvertimeHours) < 0.01 ? '✓ MATCH' : '❌ MISMATCH'}
═══════════════════════════════════════════════════════════
`);
}

/**
 * Calculate overtime using monthly smoothing method
 * CRITICAL: Even in monthly mode, overtime 25%/50% thresholds are calculated WEEK BY WEEK
 * This ensures legal compliance: 35h base per week, +25% from 36-43h, +50% above 43h
 * Monthly mode only differs in how the base contract hours are displayed/adjusted
 * Weeks that overlap the month are calculated on ALL 7 days, not just days in the month
 */
function calculateMonthlyOvertime(result, employee, shifts, nonShiftEvents, nonShiftTypes, year, month, contractHoursWeekly) {
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
    
    // Get ALL weeks that touch the month (even partially)
    const weeks = getWeeksTouchingMonth(year, month);

    console.log(`
═══════════════════════════════════════════════════════════
📊 MONTHLY OVERTIME CALCULATION (Monthly Smoothing Mode)
═══════════════════════════════════════════════════════════
Employee ID: ${employee.id}
Employee Name: ${employee.first_name} ${employee.last_name}
Month: ${year}-${String(month + 1).padStart(2, '0')}
Weeks to process: ${weeks.length}
Contract hours/week: ${contractHoursWeekly}h
═══════════════════════════════════════════════════════════
`);

    const weekDetails = [];

    // Calculate overtime for each week, then sum
    weeks.forEach(({ weekKey, dates: weekDates }, weekIndex) => {
      let weekHours = 0;
      const weekStart = weekDates[0];
      const weekEnd = weekDates[6];
      
      // Check if partial week (some days outside the month)
      const monthStartStr = formatDate(new Date(year, month, 1));
      const monthEndStr = formatDate(new Date(year, month + 1, 0));
      const isPartialWeek = weekStart < monthStartStr || weekEnd > monthEndStr;
      
      // Calculate hours for ALL 7 days in the week
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
      let weekOvertime = 0;
      let weekHS25 = 0;
      let weekHS50 = 0;
      
      if (weekHours > 35) {
        weekOvertime = weekHours - 35;
        
        // +25% from 36h to 43h (i.e., 1h to 8h of overtime)
        weekHS25 = Math.min(weekOvertime, 8);
        result.overtimeHours25 += weekHS25;
        
        // +50% beyond 43h (i.e., beyond 8h of overtime)
        if (weekOvertime > 8) {
          weekHS50 = weekOvertime - 8;
          result.overtimeHours50 += weekHS50;
        }
      }

      const weekDetail = {
        index: weekIndex + 1,
        weekKey,
        weekStart,
        weekEnd,
        isPartial: isPartialWeek,
        baseHours: 35,
        workedHours: weekHours,
        hsTotal: weekOvertime,
        hs25: weekHS25,
        hs50: weekHS50
      };
      
      weekDetails.push(weekDetail);

      console.log(`Week ${weekIndex + 1} [${weekKey}] ${isPartialWeek ? '⚠️ PARTIAL' : '✓ COMPLETE'}
  Range: ${weekStart} → ${weekEnd}
  Worked: ${weekHours.toFixed(2)}h / Base: 35h
  Overtime: ${weekOvertime.toFixed(2)}h (25%: ${weekHS25.toFixed(2)}h, 50%: ${weekHS50.toFixed(2)}h)`);
    });

    result.totalOvertimeHours = result.overtimeHours25 + result.overtimeHours50;
    
    console.log(`
───────────────────────────────────────────────────────────
📈 AGGREGATION SUMMARY
───────────────────────────────────────────────────────────
Total weeks processed: ${weekDetails.length}
  Complete weeks: ${weekDetails.filter(w => !w.isPartial).length}
  Partial weeks: ${weekDetails.filter(w => w.isPartial).length}

Total worked hours: ${weekDetails.reduce((sum, w) => sum + w.workedHours, 0).toFixed(2)}h
Total overtime: ${result.totalOvertimeHours.toFixed(2)}h
  HS 25%: ${result.overtimeHours25.toFixed(2)}h
  HS 50%: ${result.overtimeHours50.toFixed(2)}h

✅ Expected sum check:
  Σ(weekHS) = ${weekDetails.reduce((sum, w) => sum + w.hsTotal, 0).toFixed(2)}h
  Monthly HS = ${result.totalOvertimeHours.toFixed(2)}h
  ${Math.abs(weekDetails.reduce((sum, w) => sum + w.hsTotal, 0) - result.totalOvertimeHours) < 0.01 ? '✓ MATCH' : '❌ MISMATCH'}
═══════════════════════════════════════════════════════════
`);
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