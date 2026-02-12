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
  month,
  weeklyRecaps = [] // NOUVEAU: WeeklyRecap overrides par semaine
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
        const dayHours = dayShifts.reduce((sum, s) => sum + calculateShiftDuration(s), 0);
        result.workedHours += dayHours;
        
        // Track holiday worked days - ONLY if employee has SHIFTS on this specific holiday date
        const isHolidayDate = holidayDates.includes(date);
        if (isHolidayDate) {
          result.holidaysWorkedDays++;
          result.holidaysWorkedHours += dayHours;
          console.log(`[HOLIDAY DISABLED] ${employee.first_name} ${employee.last_name} worked on holiday ${date}: ${dayHours}h`);
        }
      } else if (dayNonShifts.length > 0) {
        const { hours } = calculateDayHours([], dayNonShifts, nonShiftTypes, employee, calculateShiftDuration);
        result.workedHours += hours;
      }
    });
    
    // Set eligibility based on actual holiday work
    result.eligibleForHolidayPay = result.holidaysWorkedDays > 0;
    result.ferieEligible = result.holidaysWorkedDays > 0;
    result.ferieDays = result.holidaysWorkedDays;
    result.ferieHours = result.holidaysWorkedHours;

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
  
  // CRITICAL: Reset holiday counters
  result.holidaysWorkedDays = 0;
  result.holidaysWorkedHours = 0;
  
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

    // Track holiday worked days - ONLY if employee has SHIFTS on this specific holiday date
    const isHolidayDate = holidayDates.includes(date);
    if (dayShifts.length > 0 && isHolidayDate) {
      result.holidaysWorkedDays++;
      result.holidaysWorkedHours += hours;
      console.log(`[HOLIDAY] ${employee.first_name} ${employee.last_name} worked on holiday ${date}: ${hours}h`);
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
    calculateWeeklyOvertime(result, employee, shifts, nonShiftEvents, nonShiftTypes, year, month, contractHoursWeekly, weeklyRecaps);
  } else if (mode === 'monthly') {
    // Monthly calculation: STILL calculates week-by-week for legal compliance
    // The difference is only in how base hours are displayed/adjusted
    calculateMonthlyOvertime(result, employee, shifts, nonShiftEvents, nonShiftTypes, year, month, contractHoursWeekly, weeklyRecaps);
  }

  // Holiday pay eligibility: employee must have WORKED on a holiday
  // (Ancienneté is a separate legal requirement but for display we show if worked)
  result.eligibleForHolidayPay = result.holidaysWorkedDays > 0;
  
  // Check seniority for legal compliance (optional info)
  if (employee.start_date) {
    const startDate = new Date(employee.start_date);
    const currentDate = new Date(year, month, 15); // Mid-month check
    const daysEmployed = Math.floor((currentDate - startDate) / (1000 * 60 * 60 * 24));
    result.hasSufficientSeniority = daysEmployed >= 90; // 3 months
  }

  // Aliases pour export compta (mêmes valeurs, noms plus clairs)
  result.ferieEligible = result.holidaysWorkedDays > 0; // TRUE only if worked on holiday
  result.ferieDays = result.holidaysWorkedDays;
  result.ferieHours = result.holidaysWorkedHours;

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
 * Calculate overtime using weekly method (CLASSIQUE)
 * CRITICAL: 
 * - Base hours calculated based on contractual days visible in the month for PARTIAL weeks
 * - For part-time: complementary hours calculated per week, then aggregated monthly
 * - Split 10%/25% calculated at MONTHLY level (not per week)
 */
function calculateWeeklyOvertime(result, employee, shifts, nonShiftEvents, nonShiftTypes, year, month, contractHoursWeekly, weeklyRecaps = []) {
  const isPartTime = employee.work_time_type === 'part_time';
  
  // Calculate daily contract hours
  const workDaysPerWeek = employee.work_days_per_week || 5;
  const dailyContractHours = contractHoursWeekly / workDaysPerWeek;
  
  // Get worked days of week from contract
  const weeklySchedule = employee.weekly_schedule || {};
  const workedDaysOfWeek = new Set();
  const dayMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  
  dayMap.forEach((dayName, dayIndex) => {
    if (weeklySchedule[dayName]?.worked) {
      workedDaysOfWeek.add(dayIndex);
    }
  });
  
  // If no schedule defined, assume consecutive days from Monday
  if (workedDaysOfWeek.size === 0) {
    for (let i = 0; i < workDaysPerWeek; i++) {
      workedDaysOfWeek.add((i + 1) % 7); // 1=Monday, 2=Tuesday, etc.
    }
  }
  
  // Get ALL weeks that touch the month
  const weeks = getWeeksTouchingMonth(year, month);
  const monthStartStr = formatDate(new Date(year, month, 1));
  const monthEndStr = formatDate(new Date(year, month + 1, 0));

  console.log(`
═══════════════════════════════════════════════════════════
📊 WEEKLY OVERTIME CALCULATION (MODE CLASSIQUE)
═══════════════════════════════════════════════════════════
Employee ID: ${employee.id}
Employee Name: ${employee.first_name} ${employee.last_name}
Work type: ${isPartTime ? 'PART-TIME' : 'FULL-TIME'}
Month: ${year}-${String(month + 1).padStart(2, '0')}
Contract: ${contractHoursWeekly}h/week, ${workDaysPerWeek} days/week
Daily rate: ${dailyContractHours.toFixed(2)}h/day
Worked days: ${Array.from(workedDaysOfWeek).map(d => dayMap[d]).join(', ')}
Weeks to process: ${weeks.length}
═══════════════════════════════════════════════════════════
`);

  const weekDetails = [];
  let totalComplementaryBeforeSplit = 0; // For part-time monthly aggregation

  // Process each week
  weeks.forEach(({ weekKey, dates: weekDates }, weekIndex) => {
    // Determine which dates are visible in the month
    const visibleDates = weekDates.filter(d => d >= monthStartStr && d <= monthEndStr);
    const isPartialWeek = visibleDates.length < 7;
    
    // Count contractual days visible in the month for this week
    let contractDaysVisible = 0;
    visibleDates.forEach(dateStr => {
      const date = new Date(dateStr);
      const dayOfWeek = date.getDay();
      if (workedDaysOfWeek.has(dayOfWeek)) {
        contractDaysVisible++;
      }
    });
    
    // CRITICAL: Check if there's a WeeklyRecap override for this employee/week
    const weekRecapKey = `${employee.id}_${weekKey}`;
    const weekRecap = weeklyRecaps.find(wr => `${wr.employee_id}_${wr.week_start}` === weekRecapKey);
    
    // Use override if available, otherwise calculate from contract
    const weeklyBase = weekRecap?.base_override_hours ?? (contractDaysVisible * dailyContractHours);
    
    console.log(`[WEEK OVERRIDE CHECK] ${employee.first_name} ${employee.last_name} - ${weekKey}
    weekRecap found: ${!!weekRecap}
    base_override_hours: ${weekRecap?.base_override_hours}
    weeklyBase (final): ${weeklyBase}`);
    
    // Calculate worked hours (on visible days only)
    let weekHours = 0;
    visibleDates.forEach(date => {
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

    // Calculate overtime/complementary
    let weekOvertime = 0;
    let weekComplementary = 0;
    let weekHS25 = 0;
    let weekHS50 = 0;
    
    if (isPartTime) {
      // Part-time: calculate complementary hours WITHOUT split (split will be done monthly)
      weekComplementary = Math.max(0, weekHours - weeklyBase);
      totalComplementaryBeforeSplit += weekComplementary;
      weekOvertime = weekComplementary;
    } else {
      // Full-time: overtime hours
      if (weekHours > weeklyBase) {
        weekOvertime = weekHours - weeklyBase;
        
        // Apply 25%/50% thresholds
        weekHS25 = Math.min(weekOvertime, 8);
        result.overtimeHours25 += weekHS25;
        
        if (weekOvertime > 8) {
          weekHS50 = weekOvertime - 8;
          result.overtimeHours50 += weekHS50;
        }
      }
    }

    const weekDetail = {
      index: weekIndex + 1,
      weekKey,
      weekStart: weekDates[0],
      weekEnd: weekDates[6],
      visibleDates,
      isPartial: isPartialWeek,
      contractDaysVisible,
      dailyContractHours,
      baseHours: weeklyBase,
      workedHours: weekHours,
      complementary: weekComplementary,
      hsTotal: weekOvertime,
      hs25: weekHS25,
      hs50: weekHS50
    };
    
    weekDetails.push(weekDetail);

    console.log(`Week ${weekIndex + 1} [${weekKey}] ${isPartialWeek ? '⚠️ PARTIAL' : '✓ COMPLETE'}
  Range: ${weekDates[0]} → ${weekDates[6]}
  Visible dates: ${visibleDates.length} days (${visibleDates[0]} → ${visibleDates[visibleDates.length - 1]})
  Contract days visible: ${contractDaysVisible} × ${dailyContractHours.toFixed(2)}h = ${weeklyBase.toFixed(2)}h base
  Worked: ${weekHours.toFixed(2)}h
  ${isPartTime ? `Complementary: ${weekComplementary.toFixed(2)}h` : `Overtime: ${weekOvertime.toFixed(2)}h (25%: ${weekHS25.toFixed(2)}h, 50%: ${weekHS50.toFixed(2)}h)`}`);
  });

  // For part-time: apply monthly split
  if (isPartTime) {
    const referenceContractHoursForPeriod = weekDetails.reduce((sum, w) => sum + w.baseHours, 0);
    const threshold10 = referenceContractHoursForPeriod * 0.10;
    
    result.complementaryHours10 = Math.min(totalComplementaryBeforeSplit, threshold10);
    result.complementaryHours25 = Math.max(0, totalComplementaryBeforeSplit - threshold10);
    result.totalComplementaryHours = totalComplementaryBeforeSplit;

    console.log(`
───────────────────────────────────────────────────────────
📈 MONTHLY AGGREGATION (PART-TIME)
───────────────────────────────────────────────────────────
Total weeks: ${weekDetails.length} (${weekDetails.filter(w => !w.isPartial).length} complete, ${weekDetails.filter(w => w.isPartial).length} partial)

Per-week complementary hours:
${weekDetails.map(w => `  Week ${w.index}: Base ${w.baseHours.toFixed(2)}h, Worked ${w.workedHours.toFixed(2)}h, HC ${w.complementary.toFixed(2)}h`).join('\n')}

📊 MONTHLY SPLIT CALCULATION:
  referenceContractHoursForPeriod (Σ weeklyBase) = ${referenceContractHoursForPeriod.toFixed(2)}h
  threshold10 (10% of reference) = ${threshold10.toFixed(2)}h
  
  monthlyComplementaryTotal (Σ weeklyComplementary) = ${totalComplementaryBeforeSplit.toFixed(2)}h
  HC +10%: ${result.complementaryHours10.toFixed(2)}h
  HC +25%: ${result.complementaryHours25.toFixed(2)}h

✅ Validation checks:
  Σ(weeklyComplementary) = ${weekDetails.reduce((sum, w) => sum + w.complementary, 0).toFixed(2)}h
  monthlyComplementaryTotal = ${totalComplementaryBeforeSplit.toFixed(2)}h
  ${Math.abs(weekDetails.reduce((sum, w) => sum + w.complementary, 0) - totalComplementaryBeforeSplit) < 0.01 ? '✓ MATCH' : '❌ MISMATCH'}
  
  HC10 + HC25 = ${(result.complementaryHours10 + result.complementaryHours25).toFixed(2)}h
  monthlyComplementaryTotal = ${totalComplementaryBeforeSplit.toFixed(2)}h
  ${Math.abs((result.complementaryHours10 + result.complementaryHours25) - totalComplementaryBeforeSplit) < 0.01 ? '✓ MATCH' : '❌ MISMATCH'}
═══════════════════════════════════════════════════════════
`);
  } else {
    // Full-time: overtime
    result.totalOvertimeHours = result.overtimeHours25 + result.overtimeHours50;
    
    console.log(`
───────────────────────────────────────────────────────────
📈 MONTHLY AGGREGATION (FULL-TIME)
───────────────────────────────────────────────────────────
Total weeks: ${weekDetails.length} (${weekDetails.filter(w => !w.isPartial).length} complete, ${weekDetails.filter(w => w.isPartial).length} partial)

Per-week breakdown:
${weekDetails.map(w => `  Week ${w.index}: Base ${w.baseHours.toFixed(2)}h, Worked ${w.workedHours.toFixed(2)}h, HS ${w.hsTotal.toFixed(2)}h`).join('\n')}

Total worked hours: ${weekDetails.reduce((sum, w) => sum + w.workedHours, 0).toFixed(2)}h
Total overtime: ${result.totalOvertimeHours.toFixed(2)}h
  HS 25%: ${result.overtimeHours25.toFixed(2)}h
  HS 50%: ${result.overtimeHours50.toFixed(2)}h

✅ Validation check:
  Σ(weekHS) = ${weekDetails.reduce((sum, w) => sum + w.hsTotal, 0).toFixed(2)}h
  Monthly HS = ${result.totalOvertimeHours.toFixed(2)}h
  ${Math.abs(weekDetails.reduce((sum, w) => sum + w.hsTotal, 0) - result.totalOvertimeHours) < 0.01 ? '✓ MATCH' : '❌ MISMATCH'}
═══════════════════════════════════════════════════════════
`);
  }
}

/**
 * Calculate overtime using monthly smoothing method
 * CRITICAL: Base hours calculated based on contractual days visible in the month for PARTIAL weeks
 */
function calculateMonthlyOvertime(result, employee, shifts, nonShiftEvents, nonShiftTypes, year, month, contractHoursWeekly, weeklyRecaps = []) {
  const isPartTime = employee.work_time_type === 'part_time';
  
  // Calculate daily contract hours
  const workDaysPerWeek = employee.work_days_per_week || 5;
  const dailyContractHours = contractHoursWeekly / workDaysPerWeek;
  
  // Get worked days of week from contract
  const weeklySchedule = employee.weekly_schedule || {};
  const workedDaysOfWeek = new Set();
  const dayMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  
  dayMap.forEach((dayName, dayIndex) => {
    if (weeklySchedule[dayName]?.worked) {
      workedDaysOfWeek.add(dayIndex);
    }
  });
  
  // If no schedule defined, assume consecutive days from Monday
  if (workedDaysOfWeek.size === 0) {
    for (let i = 0; i < workDaysPerWeek; i++) {
      workedDaysOfWeek.add((i + 1) % 7);
    }
  }
  
  // Get ALL weeks that touch the month
  const weeks = getWeeksTouchingMonth(year, month);
  const monthStartStr = formatDate(new Date(year, month, 1));
  const monthEndStr = formatDate(new Date(year, month + 1, 0));

  console.log(`
═══════════════════════════════════════════════════════════
📊 MONTHLY CALCULATION (MODE LISSAGE)
═══════════════════════════════════════════════════════════
Employee ID: ${employee.id}
Employee Name: ${employee.first_name} ${employee.last_name}
Work type: ${isPartTime ? 'PART-TIME' : 'FULL-TIME'}
Month: ${year}-${String(month + 1).padStart(2, '0')}
Contract: ${contractHoursWeekly}h/week, ${workDaysPerWeek} days/week
Daily rate: ${dailyContractHours.toFixed(2)}h/day
Worked days: ${Array.from(workedDaysOfWeek).map(d => dayMap[d]).join(', ')}
Weeks to process: ${weeks.length}
═══════════════════════════════════════════════════════════
`);

  const weekDetails = [];
  let calculatedMonthlyBase = 0;

  // Process each week to calculate real monthly base
  weeks.forEach(({ weekKey, dates: weekDates }, weekIndex) => {
    // Determine which dates are visible in the month
    const visibleDates = weekDates.filter(d => d >= monthStartStr && d <= monthEndStr);
    const isPartialWeek = visibleDates.length < 7;
    
    // Count contractual days visible in the month for this week
    let contractDaysVisible = 0;
    visibleDates.forEach(dateStr => {
      const date = new Date(dateStr);
      const dayOfWeek = date.getDay();
      if (workedDaysOfWeek.has(dayOfWeek)) {
        contractDaysVisible++;
      }
    });
    
    // CRITICAL: Check if there's a WeeklyRecap override for this employee/week
    const weekRecapKey = `${employee.id}_${weekKey}`;
    const weekRecap = weeklyRecaps.find(wr => `${wr.employee_id}_${wr.week_start}` === weekRecapKey);
    
    // Use override if available, otherwise calculate from contract
    const weeklyBase = weekRecap?.base_override_hours ?? (contractDaysVisible * dailyContractHours);
    calculatedMonthlyBase += weeklyBase;
    
    console.log(`[MONTH WEEK OVERRIDE] ${employee.first_name} ${employee.last_name} - ${weekKey}
    weekRecap found: ${!!weekRecap}
    base_override_hours: ${weekRecap?.base_override_hours}
    weeklyBase (final): ${weeklyBase}`);
    
    // Calculate worked hours (on visible days only)
    let weekHours = 0;
    visibleDates.forEach(date => {
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

    const weekDetail = {
      index: weekIndex + 1,
      weekKey,
      weekStart: weekDates[0],
      weekEnd: weekDates[6],
      visibleDates,
      isPartial: isPartialWeek,
      contractDaysVisible,
      dailyContractHours,
      baseHours: weeklyBase,
      workedHours: weekHours
    };
    
    weekDetails.push(weekDetail);

    console.log(`Week ${weekIndex + 1} [${weekKey}] ${isPartialWeek ? '⚠️ PARTIAL' : '✓ COMPLETE'}
  Range: ${weekDates[0]} → ${weekDates[6]}
  Visible dates: ${visibleDates.length} days (${visibleDates.join(', ')})
  Contract days visible: ${contractDaysVisible} × ${dailyContractHours.toFixed(2)}h = ${weeklyBase.toFixed(2)}h base
  Worked: ${weekHours.toFixed(2)}h`);
  });

  // CRITICAL: Override monthly base with calculated value (NOT calendar proration)
  const oldContractMonthlyHours = result.contractMonthlyHours;
  result.contractMonthlyHours = calculatedMonthlyBase;
  result.adjustedContractHours = calculatedMonthlyBase;
  
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

    console.log(`
───────────────────────────────────────────────────────────
📈 MONTHLY AGGREGATION (PART-TIME LISSAGE)
───────────────────────────────────────────────────────────
Total weeks: ${weekDetails.length} (${weekDetails.filter(w => !w.isPartial).length} complete, ${weekDetails.filter(w => w.isPartial).length} partial)

Per-week base calculation:
${weekDetails.map(w => `  Week ${w.index}: ${w.contractDaysVisible} contract days × ${w.dailyContractHours.toFixed(2)}h = ${w.baseHours.toFixed(2)}h base, Worked ${w.workedHours.toFixed(2)}h`).join('\n')}

📊 MONTHLY BASE CALCULATION:
  OLD method (calendar proration): ${oldContractMonthlyHours.toFixed(2)}h
  NEW method (Σ weeklyBase): ${calculatedMonthlyBase.toFixed(2)}h
  
✅ Validation check:
  Σ(weeklyBase) = ${weekDetails.reduce((sum, w) => sum + w.baseHours, 0).toFixed(2)}h
  calculatedMonthlyBase = ${calculatedMonthlyBase.toFixed(2)}h
  ${Math.abs(weekDetails.reduce((sum, w) => sum + w.baseHours, 0) - calculatedMonthlyBase) < 0.01 ? '✓ MATCH' : '❌ ERROR: monthly base mismatch'}

Monthly worked hours: ${result.workedHours.toFixed(2)}h
Monthly base (corrected): ${result.contractMonthlyHours.toFixed(2)}h
Monthly complementary: ${result.totalComplementaryHours.toFixed(2)}h
  HC +10%: ${result.complementaryHours10.toFixed(2)}h (up to ${limit10.toFixed(2)}h)
  HC +25%: ${result.complementaryHours25.toFixed(2)}h
═══════════════════════════════════════════════════════════
`);
  } else {
    // Full-time: overtime hours
    let totalOvertimeFromWeeks = 0;
    
    weekDetails.forEach(week => {
      let weekOvertime = 0;
      let weekHS25 = 0;
      let weekHS50 = 0;
      
      if (week.workedHours > week.baseHours) {
        weekOvertime = week.workedHours - week.baseHours;
        
        // Apply 25%/50% thresholds
        weekHS25 = Math.min(weekOvertime, 8);
        result.overtimeHours25 += weekHS25;
        
        if (weekOvertime > 8) {
          weekHS50 = weekOvertime - 8;
          result.overtimeHours50 += weekHS50;
        }
      }
      
      totalOvertimeFromWeeks += weekOvertime;
      week.hsTotal = weekOvertime;
      week.hs25 = weekHS25;
      week.hs50 = weekHS50;
    });

    result.totalOvertimeHours = result.overtimeHours25 + result.overtimeHours50;
    
    console.log(`
───────────────────────────────────────────────────────────
📈 MONTHLY AGGREGATION (FULL-TIME LISSAGE)
───────────────────────────────────────────────────────────
Total weeks: ${weekDetails.length} (${weekDetails.filter(w => !w.isPartial).length} complete, ${weekDetails.filter(w => w.isPartial).length} partial)

Per-week breakdown:
${weekDetails.map(w => `  Week ${w.index}: ${w.contractDaysVisible} contract days × ${w.dailyContractHours.toFixed(2)}h = ${w.baseHours.toFixed(2)}h base, Worked ${w.workedHours.toFixed(2)}h, HS ${w.hsTotal.toFixed(2)}h`).join('\n')}

📊 MONTHLY BASE CALCULATION:
  OLD method (calendar proration): ${oldContractMonthlyHours.toFixed(2)}h
  NEW method (Σ weeklyBase): ${calculatedMonthlyBase.toFixed(2)}h

✅ Validation check:
  Σ(weeklyBase) = ${weekDetails.reduce((sum, w) => sum + w.baseHours, 0).toFixed(2)}h
  calculatedMonthlyBase = ${calculatedMonthlyBase.toFixed(2)}h
  ${Math.abs(weekDetails.reduce((sum, w) => sum + w.baseHours, 0) - calculatedMonthlyBase) < 0.01 ? '✓ MATCH' : '❌ ERROR: monthly base mismatch'}

Total worked hours: ${weekDetails.reduce((sum, w) => sum + w.workedHours, 0).toFixed(2)}h
Total overtime: ${result.totalOvertimeHours.toFixed(2)}h
  HS 25%: ${result.overtimeHours25.toFixed(2)}h
  HS 50%: ${result.overtimeHours50.toFixed(2)}h
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