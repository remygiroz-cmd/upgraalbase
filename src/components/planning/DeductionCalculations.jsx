/**
 * Calculate deducted hours from non-shift events based on type configuration
 */
export function calculateDeductedHours(employee, nonShiftEvents, nonShiftTypes, monthStart, monthEnd) {
  if (!employee || !nonShiftEvents || !nonShiftTypes) return 0;

  // Filter events for this employee in this month
  const monthStartStr = formatDate(monthStart);
  const monthEndStr = formatDate(monthEnd);
  
  const employeeEvents = nonShiftEvents.filter(e => 
    e.employee_id === employee.id && 
    e.date >= monthStartStr && 
    e.date <= monthEndStr
  );

  let totalDeducted = 0;

  employeeEvents.forEach(event => {
    const type = nonShiftTypes.find(t => t.id === event.non_shift_type_id);
    
    // Only deduct if type is configured to deduct hours
    if (!type || !type.deducts_hours) return;

    if (type.deduction_mode === 'manual' && type.deduction_hours_per_day) {
      // Manual: fixed hours per day
      totalDeducted += type.deduction_hours_per_day;
    } else {
      // Auto: calculate based on contract
      const dailyHours = calculateDailyContractHours(employee);
      totalDeducted += dailyHours;
    }
  });

  return totalDeducted;
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
  const deductedHours = calculateDeductedHours(employee, nonShiftEvents, nonShiftTypes, monthStart, monthEnd);
  
  // Ensure paid base doesn't go negative
  return Math.max(0, contractHours - deductedHours);
}