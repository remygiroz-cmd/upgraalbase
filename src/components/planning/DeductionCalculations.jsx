/**
 * Calculate deducted hours from non-shift events based on "Impacte la paie"
 * Returns both total and detail by type
 */
export function calculateDeductedHours(employee, nonShiftEvents, nonShiftTypes, monthStart, monthEnd) {
  if (!employee || !nonShiftEvents || !nonShiftTypes) {
    return { total: 0, details: [] };
  }

  // Filter events for this employee in this month
  const monthStartStr = formatDate(monthStart);
  const monthEndStr = formatDate(monthEnd);
  
  const employeeEvents = nonShiftEvents.filter(e => 
    e.employee_id === employee.id && 
    e.date >= monthStartStr && 
    e.date <= monthEndStr
  );

  // Calculate daily hours once
  const dailyHours = calculateDailyContractHours(employee);
  
  // Group by type
  const deductionsByType = {};

  employeeEvents.forEach(event => {
    const type = nonShiftTypes.find(t => t.id === event.non_shift_type_id);
    
    // Only deduct if type has "Impacte la paie" enabled
    if (!type || !type.impacts_payroll) return;

    if (!deductionsByType[type.label]) {
      deductionsByType[type.label] = {
        label: type.label,
        count: 0,
        hoursPerDay: dailyHours,
        totalHours: 0
      };
    }

    deductionsByType[type.label].count += 1;
    deductionsByType[type.label].totalHours += dailyHours;
  });

  // Convert to array and calculate total
  const details = Object.values(deductionsByType);
  const total = details.reduce((sum, d) => sum + d.totalHours, 0);

  return { total, details };
}

/**
 * Calculate daily contract hours for an employee
 * Cas standard: heures_semaine / jours_semaine
 * Cas CDD courte durée: heures_totales / jours_totaux
 */
function calculateDailyContractHours(employee) {
  if (!employee) return 0;

  // Check if CDD courte durée (has contract_total_hours and contract_total_days)
  const isCDDCourteDuree = employee.contract_type === 'cdd' && 
                            employee.contract_total_hours && 
                            employee.contract_total_days;

  if (isCDDCourteDuree) {
    // CDD courte durée: heures_totales / jours_totaux
    const totalHours = parseFloat(String(employee.contract_total_hours).replace(':', '.').replace(/h/g, ''));
    const totalDays = employee.contract_total_days;
    
    if (totalHours > 0 && totalDays > 0) {
      return totalHours / totalDays;
    }
  }

  // Cas standard: heures_semaine / jours_semaine
  const contractHoursWeekly = employee?.contract_hours_weekly 
    ? parseFloat(employee.contract_hours_weekly.replace(':', '.').replace(/h/g, ''))
    : 0;
  
  const workDaysPerWeek = employee?.work_days_per_week || 5;

  if (contractHoursWeekly === 0 || workDaysPerWeek === 0) return 0;

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
  const deductedData = calculateDeductedHours(employee, nonShiftEvents, nonShiftTypes, monthStart, monthEnd);
  
  // Ensure paid base doesn't go negative
  return Math.max(0, contractHours - deductedData.total);
}