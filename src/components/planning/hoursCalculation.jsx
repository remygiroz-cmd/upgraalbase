/**
 * Module de calcul des heures travaillées, supplémentaires et complémentaires
 * avec gestion des heures manquantes par rapport au contrat
 */

/**
 * Parse heures contractuelles "HH:MM" ou "HH.MM" -> decimal
 */
function parseContractHours(hoursStr) {
  if (!hoursStr) return 35;
  const cleaned = hoursStr.replace(',', '.');
  if (cleaned.includes(':')) {
    const [h, m] = cleaned.split(':').map(Number);
    return h + m / 60;
  }
  return parseFloat(cleaned);
}

/**
 * Calcule la durée d'un shift en heures
 */
function calculateShiftDuration(startTime, endTime, breakMinutes) {
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  
  let minutes = (endH * 60 + endM) - (startH * 60 + startM);
  if (minutes < 0) minutes += 24 * 60;
  
  minutes -= breakMinutes;
  return Math.max(0, minutes / 60);
}

/**
 * Obtient le jour ISO (1=Lundi, 7=Dimanche)
 */
function getIsoDayOfWeek(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const jsDay = date.getDay();
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * Vérifie si un jour est prévu au contrat
 */
function isContractDay(employee, dayOfWeek) {
  if (!employee.weekly_schedule) return true;
  
  const dayMap = {
    1: 'monday',
    2: 'tuesday',
    3: 'wednesday',
    4: 'thursday',
    5: 'friday',
    6: 'saturday',
    7: 'sunday'
  };
  
  const dayKey = dayMap[dayOfWeek];
  return employee.weekly_schedule[dayKey]?.worked || false;
}

/**
 * Obtient les heures attendues pour un jour donné selon le contrat
 */
function getExpectedHoursForDay(employee, dayOfWeek) {
  if (!employee.weekly_schedule) return 0;
  
  const dayMap = {
    1: 'monday',
    2: 'tuesday',
    3: 'wednesday',
    4: 'thursday',
    5: 'friday',
    6: 'saturday',
    7: 'sunday'
  };
  
  const dayKey = dayMap[dayOfWeek];
  const daySchedule = employee.weekly_schedule[dayKey];
  
  if (!daySchedule || !daySchedule.worked) return 0;
  return daySchedule.hours || 0;
}

/**
 * Calcule les heures hebdomadaires avec gestion des heures manquantes
 */
export function calculateWeeklyHours(shifts, employee, weekStart, policy = 'overtime') {
  const contractHoursWeekly = parseContractHours(employee.contract_hours_weekly || '35:00');
  const workTimeType = employee.work_time_type || 'full_time';
  const hasWeeklySchedule = !!employee.weekly_schedule;

  // Calculer les dates de la semaine
  const [year, month, day] = weekStart.split('-').map(Number);
  const startDate = new Date(year, month - 1, day);
  const weekDates = [];
  
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    weekDates.push(dateStr);
  }

  // Analyse quotidienne
  const dailyBreakdown = weekDates.map(date => {
    const dayOfWeek = getIsoDayOfWeek(date);
    const isContract = isContractDay(employee, dayOfWeek);
    const expectedHours = getExpectedHoursForDay(employee, dayOfWeek);
    
    const dayShifts = shifts.filter(s => s.date === date);
    let totalPlanned = 0;
    let totalActual = 0;
    
    for (const shift of dayShifts) {
      const duration = calculateShiftDuration(shift.start_time, shift.end_time, shift.break_minutes);
      if (shift.status === 'completed' || shift.status === 'validated') {
        totalActual += duration;
      } else {
        totalPlanned += duration;
      }
    }
    
    const totalWorked = totalActual > 0 ? totalActual : totalPlanned;
    const hoursOutsideContract = !isContract && totalWorked > 0 ? totalWorked : 0;
    const missingHours = isContract && expectedHours > 0 && totalWorked < expectedHours 
      ? expectedHours - totalWorked 
      : 0;
    
    return {
      date,
      dayOfWeek,
      isContractDay: isContract,
      totalPlanned,
      totalActual,
      hoursOutsideContract,
      expectedHours,
      missingHours
    };
  });

  // Totaux
  const totalPlannedHours = dailyBreakdown.reduce((sum, d) => sum + d.totalPlanned, 0);
  const totalActualHours = dailyBreakdown.reduce((sum, d) => sum + d.totalActual, 0);
  const effectiveHours = totalActualHours > 0 ? totalActualHours : totalPlannedHours;
  const hoursOutsideContract = dailyBreakdown.reduce((sum, d) => sum + d.hoursOutsideContract, 0);
  const totalMissingHours = dailyBreakdown.reduce((sum, d) => sum + d.missingHours, 0);

  // Calcul des heures excédentaires APRÈS déduction des heures manquantes
  const hoursOnContractDays = effectiveHours - hoursOutsideContract;
  const netExcessHours = hoursOnContractDays - contractHoursWeekly - totalMissingHours;

  let overtime = {
    outsideContract: 0,
    classic25: 0,
    classic50: 0,
    total: 0
  };

  let complementary = {
    outsideContract: 0,
    classic10: 0,
    classic25: 0,
    total: 0,
    exceedsLimit: false
  };

  // Calcul selon le type de contrat
  if (workTimeType === 'full_time' && netExcessHours > 0) {
    overtime.outsideContract = hoursOutsideContract;
    
    if (netExcessHours <= 8) {
      overtime.classic25 = netExcessHours;
    } else {
      overtime.classic25 = 8;
      overtime.classic50 = netExcessHours - 8;
    }
    
    overtime.total = overtime.outsideContract + overtime.classic25 + overtime.classic50;
  } else if (workTimeType === 'part_time' && netExcessHours > 0) {
    complementary.outsideContract = hoursOutsideContract;
    
    const maxComplementary = contractHoursWeekly * 0.33;
    
    if (netExcessHours <= maxComplementary) {
      if (netExcessHours <= contractHoursWeekly * 0.1) {
        complementary.classic10 = netExcessHours;
      } else {
        complementary.classic10 = contractHoursWeekly * 0.1;
        complementary.classic25 = netExcessHours - complementary.classic10;
      }
    } else {
      complementary.exceedsLimit = true;
      complementary.classic10 = contractHoursWeekly * 0.1;
      complementary.classic25 = maxComplementary - complementary.classic10;
    }
    
    complementary.total = complementary.outsideContract + complementary.classic10 + complementary.classic25;
  }

  return {
    totalPlannedHours,
    totalActualHours,
    contractHoursWeekly,
    workTimeType,
    hasWeeklySchedule,
    hoursOutsideContract,
    overtime,
    complementary,
    missingHours: totalMissingHours,
    dailyBreakdown,
    alerts: []
  };
}

/**
 * Calcule les heures mensuelles avec gestion des heures manquantes
 */
export function calculateMonthlyHours(shifts, employee, year, month, policy = 'overtime') {
  const contractHoursWeekly = parseContractHours(employee.contract_hours_weekly || '35:00');
  const workTimeType = employee.work_time_type || 'full_time';
  
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const daysInMonth = lastDay.getDate();
  const weeksInMonth = daysInMonth / 7;
  
  const contractHoursMonthly = contractHoursWeekly * weeksInMonth;

  const weeklyResults = [];
  let currentWeekStart = new Date(firstDay);
  
  const dayOfWeek = currentWeekStart.getDay();
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  currentWeekStart.setDate(currentWeekStart.getDate() + daysToMonday);
  
  while (currentWeekStart <= lastDay) {
    const weekStartStr = `${currentWeekStart.getFullYear()}-${String(currentWeekStart.getMonth() + 1).padStart(2, '0')}-${String(currentWeekStart.getDate()).padStart(2, '0')}`;
    
    const weekShifts = shifts.filter(s => {
      const [y, m, d] = s.date.split('-').map(Number);
      const shiftDate = new Date(y, m - 1, d);
      const weekEnd = new Date(currentWeekStart);
      weekEnd.setDate(currentWeekStart.getDate() + 6);
      
      return shiftDate >= currentWeekStart && shiftDate <= weekEnd &&
             shiftDate.getMonth() === month - 1;
    });
    
    if (weekShifts.length > 0 || isPartialWeekInMonth(currentWeekStart, month, year)) {
      const weekResult = calculateWeeklyHours(weekShifts, employee, weekStartStr, policy);
      weeklyResults.push(weekResult);
    }
    
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
  }

  const totalPlannedHours = weeklyResults.reduce((sum, w) => sum + w.totalPlannedHours, 0);
  const totalActualHours = weeklyResults.reduce((sum, w) => sum + w.totalActualHours, 0);
  const totalEffectiveHours = totalActualHours > 0 ? totalActualHours : totalPlannedHours;
  const totalMissingHours = weeklyResults.reduce((sum, w) => sum + w.missingHours, 0);
  
  const netExcessHours = totalEffectiveHours - contractHoursMonthly - totalMissingHours;

  const daysWorkedPlanned = new Set(shifts.filter(s => !['completed', 'validated'].includes(s.status)).map(s => s.date)).size;
  const daysWorkedActual = new Set(shifts.filter(s => ['completed', 'validated'].includes(s.status)).map(s => s.date)).size;

  let overtime = null;
  let complementary = null;

  if (workTimeType === 'full_time' && netExcessHours > 0) {
    const totalOutside = weeklyResults.reduce((sum, w) => sum + w.overtime.outsideContract, 0);
    const total25 = weeklyResults.reduce((sum, w) => sum + w.overtime.classic25, 0);
    const total50 = weeklyResults.reduce((sum, w) => sum + w.overtime.classic50, 0);
    
    overtime = {
      outsideContract: totalOutside,
      classic25: total25,
      classic50: total50,
      total: Math.max(0, netExcessHours)
    };
  } else if (workTimeType === 'part_time' && netExcessHours > 0) {
    const totalOutside = weeklyResults.reduce((sum, w) => sum + w.complementary.outsideContract, 0);
    const total10 = weeklyResults.reduce((sum, w) => sum + w.complementary.classic10, 0);
    const total25 = weeklyResults.reduce((sum, w) => sum + w.complementary.classic25, 0);
    const exceedsLimit = weeklyResults.some(w => w.complementary.exceedsLimit);
    
    complementary = {
      outsideContract: totalOutside,
      classic10: total10,
      classic25: total25,
      total: Math.max(0, netExcessHours),
      exceedsLimit
    };
  }

  return {
    totalPlannedHours,
    totalActualHours,
    totalEffectiveHours,
    contractHoursMonthly,
    daysWorkedPlanned,
    daysWorkedActual,
    workTimeType,
    overtime,
    complementary,
    missingHours: totalMissingHours,
    netExcessHours: Math.max(0, netExcessHours)
  };
}

function isPartialWeekInMonth(weekStart, month, year) {
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    if (d.getMonth() === month - 1 && d.getFullYear() === year) {
      return true;
    }
  }
  return false;
}

export function getEffectiveHours(result) {
  return result.totalActualHours > 0 ? result.totalActualHours : result.totalPlannedHours;
}