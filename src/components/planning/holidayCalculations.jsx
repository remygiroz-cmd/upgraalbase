/**
 * Calculs liés aux jours fériés
 */

/**
 * Vérifie si un employé est éligible pour les jours fériés
 * Critère: au moins 8 mois d'ancienneté à la date du jour férié
 */
export function isEmployeeEligibleForHoliday(employee, holidayDate) {
  if (!employee?.start_date) return false;
  
  const startDate = new Date(employee.start_date);
  const checkDate = new Date(holidayDate);
  
  // Calculate months difference
  const monthsDiff = (checkDate.getFullYear() - startDate.getFullYear()) * 12 
                   + (checkDate.getMonth() - startDate.getMonth());
  
  return monthsDiff >= 8;
}

/**
 * Calcule le coefficient multiplicateur pour un shift en jour férié
 * Retourne 2 si éligible, 1 sinon
 */
export function getHolidayMultiplier(employee, date, holidayDates) {
  const isHoliday = holidayDates.some(h => h.date === date);
  if (!isHoliday) return 1;
  
  const isEligible = isEmployeeEligibleForHoliday(employee, date);
  return isEligible ? 2 : 1;
}

/**
 * Calcule les heures travaillées en jours fériés pour un employé sur une période
 */
export function calculateHolidayHours(shifts, employee, startDate, endDate, holidayDates) {
  if (!holidayDates || holidayDates.length === 0) {
    return { count: 0, dates: [], realHours: 0, countedHours: 0, bonusHours: 0 };
  }
  
  const formatDateStr = (date) => {
    if (!date) return '';
    if (typeof date === 'string') return date;
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const startDateStr = formatDateStr(startDate);
  const endDateStr = formatDateStr(endDate);
  
  if (!startDateStr || !endDateStr) {
    return { count: 0, dates: [], realHours: 0, countedHours: 0, bonusHours: 0 };
  }
  
  const holidayShifts = shifts.filter(shift => {
    if (shift.employee_id !== employee.id) return false;
    if (shift.date < startDateStr || shift.date > endDateStr) return false;
    
    return holidayDates.some(h => h.date === shift.date);
  });
  
  const result = {
    count: 0,
    dates: [],
    realHours: 0,
    countedHours: 0,
    bonusHours: 0
  };
  
  holidayShifts.forEach(shift => {
    const multiplier = getHolidayMultiplier(employee, shift.date, holidayDates);
    const shiftHours = calculateShiftDuration(shift);
    const countedHours = shiftHours * multiplier;
    
    if (multiplier === 2) {
      result.count++;
      result.dates.push(shift.date);
      result.realHours += shiftHours;
      result.countedHours += countedHours;
      result.bonusHours += shiftHours; // Les heures en bonus
    }
  });
  
  // Deduplicate dates
  result.dates = [...new Set(result.dates)];
  
  return result;
}

/**
 * Calculate shift duration in hours
 */
function calculateShiftDuration(shift) {
  const [startH, startM] = shift.start_time.split(':').map(Number);
  const [endH, endM] = shift.end_time.split(':').map(Number);
  
  let totalMinutes = (endH * 60 + endM) - (startH * 60 + startM);
  if (totalMinutes < 0) totalMinutes += 24 * 60;
  
  totalMinutes -= (shift.break_minutes || 0);
  
  return totalMinutes / 60;
}