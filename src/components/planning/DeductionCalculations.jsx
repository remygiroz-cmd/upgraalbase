/**
 * Calculate deducted hours from non-shift events based on type configuration
 * Returns total deducted hours AND detailed breakdown by status type
 */
export function calculateDeductedHours(employee, nonShiftEvents, nonShiftTypes, monthStart, monthEnd) {
  if (!employee || !nonShiftEvents || !nonShiftTypes) {
    return { total: 0, details: {} };
  }

  // Filter events for this employee in this month
  const monthStartStr = formatDate(monthStart);
  const monthEndStr = formatDate(monthEnd);
  
  const employeeEvents = nonShiftEvents.filter(e => 
    e.employee_id === employee.id && 
    e.date >= monthStartStr && 
    e.date <= monthEndStr
  ).sort((a, b) => a.date.localeCompare(b.date)); // Sort chronologically

  let totalDeducted = 0;
  const details = {}; // { typeLabel: { days: X, hoursDeducted: Y, waitingDays: Z, compensatedDays: W } }

  // Get daily contract hours
  const dailyHours = calculateDailyContractHours(employee);

  // Group events by type and process
  const eventsByType = {};
  employeeEvents.forEach(event => {
    const type = nonShiftTypes.find(t => t.id === event.non_shift_type_id);
    if (!type || !type.impacts_payroll) return;

    if (!eventsByType[type.id]) {
      eventsByType[type.id] = { type, events: [] };
    }
    eventsByType[type.id].events.push(event);
  });

  // Process each type
  Object.values(eventsByType).forEach(({ type, events }) => {
    let typeDeducted = 0;
    let waitingDays = 0;
    let compensatedDays = 0;

    if (type.has_waiting_period && type.waiting_period_days > 0) {
      // Handle waiting period logic (e.g., for sick leave)
      events.forEach((event, index) => {
        let deductionRate;
        
        if (index < type.waiting_period_days) {
          // Within waiting period
          deductionRate = type.waiting_period_deduction_rate / 100;
          waitingDays++;
        } else {
          // After waiting period
          deductionRate = type.post_waiting_period_deduction_rate / 100;
          compensatedDays++;
        }

        const deducted = dailyHours * deductionRate;
        typeDeducted += deducted;
      });
    } else {
      // Standard deduction with single rate
      const deductionRate = type.deduction_rate / 100;
      events.forEach(event => {
        const deducted = dailyHours * deductionRate;
        typeDeducted += deducted;
      });
    }

    totalDeducted += typeDeducted;
    
    details[type.label] = {
      days: events.length,
      hoursDeducted: typeDeducted,
      waitingDays,
      compensatedDays,
      hasWaitingPeriod: type.has_waiting_period
    };
  });

  return { total: totalDeducted, details };
}

/**
 * Calculate daily contract hours for an employee
 */
function calculateDailyContractHours(employee) {
  // Get weekly contract hours
  const contractHoursWeekly = employee?.contract_hours_weekly 
    ? parseFloat(employee.contract_hours_weekly.replace(':', '.').replace(/h/g, ''))
    : 0;
  
  // Get work days per week (default to 5 if not specified)
  const workDaysPerWeek = employee?.work_days_per_week || 5;

  if (contractHoursWeekly === 0 || workDaysPerWeek === 0) return 0;

  // Daily hours = weekly hours / work days per week
  return contractHoursWeekly / workDaysPerWeek;
}

/**
 * Format date to YYYY-MM-DD
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculate base contractual hours for a month from employee contract
 */
export function calculateMonthlyContractHours(employee) {
  if (!employee) return 0;

  // Get monthly contract hours from employee record
  const contractHoursMonthly = employee?.contract_hours 
    ? parseFloat(employee.contract_hours.replace(':', '.').replace(/h/g, ''))
    : 0;

  return contractHoursMonthly;
}

/**
 * Calculate paid base hours: contract hours - deducted hours
 */
export function calculatePaidBaseHours(employee, nonShiftEvents, nonShiftTypes, monthStart, monthEnd) {
  const contractHours = calculateMonthlyContractHours(employee);
  const { total: deductedHours } = calculateDeductedHours(employee, nonShiftEvents, nonShiftTypes, monthStart, monthEnd);
  
  // Ensure paid base doesn't go negative
  return Math.max(0, contractHours - deductedHours);
}