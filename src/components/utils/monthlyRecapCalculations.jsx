import { parseContractHours, formatLocalDate } from '@/lib/weeklyHoursCalculation';
import { calculateShiftDuration } from '@/components/planning/LegalChecks';
import { calculateDayHours } from '@/components/utils/nonShiftHoursCalculation';

/**
 * Calcule le récapitulatif mensuel complet selon le mode de calcul configuré
 * 
 * @param {string} calculationMode - 'disabled', 'weekly', 'monthly'
 * @param {Object} employee - Employé avec contrat
 * @param {Array} shifts - Tous les shifts du mois
 * @param {Array} nonShiftEvents - Tous les non-shifts du mois
 * @param {Array} nonShiftTypes - Types de non-shifts
 * @param {Array} weeklyRecaps - Récaps hebdomadaires du mois
 * @param {Array} cpPeriods - Périodes de CP
 * @param {Array} holidayDates - Dates marquées fériées
 * @param {Date} monthStart - Début du mois
 * @param {Date} monthEnd - Fin du mois
 * @returns {Object} Récap mensuel calculé
 */
export function calculateMonthlyRecap(
  calculationMode,
  employee,
  shifts,
  nonShiftEvents,
  nonShiftTypes,
  weeklyRecaps,
  cpPeriods,
  holidayDates,
  monthStart,
  monthEnd
) {
  if (calculationMode === 'disabled') {
    return {
      expectedDays: null,
      actualDaysWorked: null,
      extraDays: null,
      expectedHours: null,
      deductedHours: null,
      adjustedExpectedHours: null,
      overtime25: null,
      overtime50: null,
      complementary10: null,
      complementary25: null,
      nonShiftsByType: null,
      holidaysWorked: null,
      holidaysHours: null,
      cpDays: null
    };
  }

  const employeeShifts = shifts.filter(s => s.employee_id === employee.id);
  const employeeNonShifts = nonShiftEvents.filter(ns => ns.employee_id === employee.id);

  // 1) Nombre de jours prévus (adapté au mois)
  const expectedDays = calculateExpectedDaysInMonth(employee, monthStart, monthEnd);

  // 2) Nombre de jours réellement travaillés
  const actualDaysWorked = calculateActualDaysWorked(
    employeeShifts,
    employeeNonShifts,
    nonShiftTypes,
    employee
  );

  // 3) Jours supplémentaires
  const extraDays = Math.max(0, actualDaysWorked - expectedDays);

  // 4) Heures mensuelles prévues ajustées
  const contractHoursWeekly = parseContractHours(employee?.contract_hours_weekly) || 0;
  const expectedHours = contractHoursWeekly * 4.33; // Base mensuelle
  
  const { deductedHours, nonShiftsByType } = calculateDeductedHoursAndNonShifts(
    employeeNonShifts,
    nonShiftTypes,
    employee
  );
  
  const adjustedExpectedHours = Math.max(0, expectedHours - deductedHours);

  // 5) Heures complémentaires / supplémentaires
  let overtime25 = 0;
  let overtime50 = 0;
  let complementary10 = 0;
  let complementary25 = 0;

  const isPartTime = employee?.work_time_type === 'part_time';

  if (calculationMode === 'weekly') {
    // MODE 2 - Calcul hebdomadaire classique
    const result = calculateOvertimeWeekly(
      weeklyRecaps,
      employeeShifts,
      employeeNonShifts,
      nonShiftTypes,
      employee,
      monthStart,
      monthEnd,
      isPartTime
    );
    overtime25 = result.overtime25;
    overtime50 = result.overtime50;
    complementary10 = result.complementary10;
    complementary25 = result.complementary25;
  } else if (calculationMode === 'monthly') {
    // MODE 3 - Lissage mensuel
    const result = calculateOvertimeMonthly(
      weeklyRecaps,
      employeeShifts,
      employeeNonShifts,
      nonShiftTypes,
      employee,
      monthStart,
      monthEnd,
      isPartTime
    );
    overtime25 = result.overtime25;
    overtime50 = result.overtime50;
    complementary10 = result.complementary10;
    complementary25 = result.complementary25;
  }

  // 7) Jours fériés travaillés
  const { holidaysWorked, holidaysHours } = calculateHolidaysWorked(
    employeeShifts,
    holidayDates,
    employee
  );

  // 8) CP décomptés
  const cpDays = calculateCPDays(cpPeriods, monthStart, monthEnd);

  return {
    expectedDays,
    actualDaysWorked,
    extraDays: extraDays > 0 ? extraDays : null,
    expectedHours,
    deductedHours: deductedHours > 0 ? deductedHours : null,
    adjustedExpectedHours,
    overtime25: overtime25 > 0 ? overtime25 : null,
    overtime50: overtime50 > 0 ? overtime50 : null,
    complementary10: complementary10 > 0 ? complementary10 : null,
    complementary25: complementary25 > 0 ? complementary25 : null,
    nonShiftsByType: Object.keys(nonShiftsByType).length > 0 ? nonShiftsByType : null,
    holidaysWorked: holidaysWorked > 0 ? holidaysWorked : null,
    holidaysHours: holidaysHours > 0 ? holidaysHours : null,
    cpDays: cpDays > 0 ? cpDays : null
  };
}

/**
 * Calcule le nombre de jours prévus dans le mois selon le contrat
 */
function calculateExpectedDaysInMonth(employee, monthStart, monthEnd) {
  const weeklySchedule = employee?.weekly_schedule;
  if (!weeklySchedule) return 0;

  const dayMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const workedDaysSet = new Set();
  dayMap.forEach((dayName, dayIndex) => {
    if (weeklySchedule[dayName]?.worked) {
      workedDaysSet.add(dayIndex);
    }
  });

  if (workedDaysSet.size === 0) return 0;

  let count = 0;
  for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    if (workedDaysSet.has(dayOfWeek)) {
      count++;
    }
  }

  return count;
}

/**
 * Calcule le nombre de jours réellement travaillés
 */
function calculateActualDaysWorked(shifts, nonShifts, nonShiftTypes, employee) {
  const datesWithWork = new Set();

  // Ajouter les jours avec shifts
  shifts.forEach(s => {
    if (s.status !== 'cancelled') {
      datesWithWork.add(s.date);
    }
  });

  // Ajouter les jours avec non-shifts qui génèrent des heures
  nonShifts.forEach(ns => {
    const type = nonShiftTypes.find(t => t.id === ns.non_shift_type_id);
    if (type?.generates_work_hours) {
      datesWithWork.add(ns.date);
    }
  });

  return datesWithWork.size;
}

/**
 * Calcule les heures déduites et compte les non-shifts par type
 */
function calculateDeductedHoursAndNonShifts(nonShifts, nonShiftTypes, employee) {
  const contractHoursWeekly = parseContractHours(employee?.contract_hours_weekly) || 0;
  const workDaysPerWeek = employee?.work_days_per_week || 5;
  const hoursPerDay = workDaysPerWeek > 0 ? contractHoursWeekly / workDaysPerWeek : 0;

  let deductedHours = 0;
  const nonShiftsByType = {};

  nonShifts.forEach(ns => {
    const type = nonShiftTypes.find(t => t.id === ns.non_shift_type_id);
    if (!type) return;

    // Compter par type
    const label = type.label || type.name || 'Autre';
    nonShiftsByType[label] = (nonShiftsByType[label] || 0) + 1;

    // Déduire si le type impacte la paie
    if (type.impacts_pay === true) {
      deductedHours += hoursPerDay;
    }
  });

  return { deductedHours, nonShiftsByType };
}

/**
 * MODE 2 - Calcul hebdomadaire classique
 * Les heures négatives ne comptent PAS
 */
function calculateOvertimeWeekly(
  weeklyRecaps,
  shifts,
  nonShifts,
  nonShiftTypes,
  employee,
  monthStart,
  monthEnd,
  isPartTime
) {
  const contractHoursWeekly = parseContractHours(employee?.contract_hours_weekly) || 0;
  const weeks = getWeeksInMonth(monthStart, monthEnd);

  let overtime25 = 0;
  let overtime50 = 0;
  let complementary10 = 0;
  let complementary25 = 0;

  weeks.forEach(weekStart => {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekStartStr = formatLocalDate(weekStart);
    const weekEndStr = formatLocalDate(weekEnd);

    // Calculer les heures travaillées de la semaine
    const weekShifts = shifts.filter(s => 
      s.date >= weekStartStr && s.date <= weekEndStr && s.status !== 'cancelled'
    );
    const weekNonShifts = nonShifts.filter(ns => 
      ns.date >= weekStartStr && ns.date <= weekEndStr
    );

    let weekHours = 0;
    const dateMap = new Map();
    
    weekShifts.forEach(shift => {
      if (!dateMap.has(shift.date)) {
        dateMap.set(shift.date, { shifts: [], nonShifts: [] });
      }
      dateMap.get(shift.date).shifts.push(shift);
    });
    
    weekNonShifts.forEach(ns => {
      if (!dateMap.has(ns.date)) {
        dateMap.set(ns.date, { shifts: [], nonShifts: [] });
      }
      dateMap.get(ns.date).nonShifts.push(ns);
    });
    
    dateMap.forEach((dayData) => {
      const { hours } = calculateDayHours(
        dayData.shifts,
        dayData.nonShifts,
        nonShiftTypes,
        employee,
        calculateShiftDuration
      );
      weekHours += hours;
    });

    // Calculer l'écart (seulement si positif)
    const weekDiff = weekHours - contractHoursWeekly;
    if (weekDiff <= 0) return; // Ignorer les semaines négatives

    if (isPartTime) {
      // Heures complémentaires (sans atteindre 35h)
      const maxComp = Math.min(weekDiff, 35 - contractHoursWeekly);
      if (maxComp <= 0) return;

      const limit10 = contractHoursWeekly * 0.1;
      const comp10 = Math.min(maxComp, limit10);
      const comp25 = Math.max(0, maxComp - limit10);

      complementary10 += comp10;
      complementary25 += comp25;
    } else {
      // Heures supplémentaires (temps plein)
      const over25 = Math.min(weekDiff, 8); // 36e à 43e
      const over50 = Math.max(0, weekDiff - 8); // 44e et +

      overtime25 += over25;
      overtime50 += over50;
    }
  });

  return { overtime25, overtime50, complementary10, complementary25 };
}

/**
 * MODE 3 - Lissage mensuel
 * Pour temps partiel: additionner TOUTES les semaines (positives + négatives)
 * Pour temps plein: identique au mode 2 (pas de lissage)
 */
function calculateOvertimeMonthly(
  weeklyRecaps,
  shifts,
  nonShifts,
  nonShiftTypes,
  employee,
  monthStart,
  monthEnd,
  isPartTime
) {
  const contractHoursWeekly = parseContractHours(employee?.contract_hours_weekly) || 0;
  const weeks = getWeeksInMonth(monthStart, monthEnd);

  let overtime25 = 0;
  let overtime50 = 0;
  let complementary10 = 0;
  let complementary25 = 0;

  if (isPartTime) {
    // LISSAGE MENSUEL pour temps partiel
    let totalMonthlyDiff = 0;

    weeks.forEach(weekStart => {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const weekStartStr = formatLocalDate(weekStart);
      const weekEndStr = formatLocalDate(weekEnd);

      const weekShifts = shifts.filter(s => 
        s.date >= weekStartStr && s.date <= weekEndStr && s.status !== 'cancelled'
      );
      const weekNonShifts = nonShifts.filter(ns => 
        ns.date >= weekStartStr && ns.date <= weekEndStr
      );

      let weekHours = 0;
      const dateMap = new Map();
      
      weekShifts.forEach(shift => {
        if (!dateMap.has(shift.date)) {
          dateMap.set(shift.date, { shifts: [], nonShifts: [] });
        }
        dateMap.get(shift.date).shifts.push(shift);
      });
      
      weekNonShifts.forEach(ns => {
        if (!dateMap.has(ns.date)) {
          dateMap.set(ns.date, { shifts: [], nonShifts: [] });
        }
        dateMap.get(ns.date).nonShifts.push(ns);
      });
      
      dateMap.forEach((dayData) => {
        const { hours } = calculateDayHours(
          dayData.shifts,
          dayData.nonShifts,
          nonShiftTypes,
          employee,
          calculateShiftDuration
        );
        weekHours += hours;
      });

      // ADDITIONNER toutes les semaines (positives ET négatives)
      totalMonthlyDiff += (weekHours - contractHoursWeekly);
    });

    // Si le total mensuel est positif, appliquer les majorations
    if (totalMonthlyDiff > 0) {
      const monthlyContractHours = contractHoursWeekly * 4.33;
      const limit10 = monthlyContractHours * 0.1;
      
      const comp10 = Math.min(totalMonthlyDiff, limit10);
      const comp25 = Math.max(0, totalMonthlyDiff - limit10);

      complementary10 = comp10;
      complementary25 = comp25;
    }
  } else {
    // TEMPS PLEIN: identique au mode 2 (pas de lissage)
    weeks.forEach(weekStart => {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const weekStartStr = formatLocalDate(weekStart);
      const weekEndStr = formatLocalDate(weekEnd);

      const weekShifts = shifts.filter(s => 
        s.date >= weekStartStr && s.date <= weekEndStr && s.status !== 'cancelled'
      );
      const weekNonShifts = nonShifts.filter(ns => 
        ns.date >= weekStartStr && ns.date <= weekEndStr
      );

      let weekHours = 0;
      const dateMap = new Map();
      
      weekShifts.forEach(shift => {
        if (!dateMap.has(shift.date)) {
          dateMap.set(shift.date, { shifts: [], nonShifts: [] });
        }
        dateMap.get(shift.date).shifts.push(shift);
      });
      
      weekNonShifts.forEach(ns => {
        if (!dateMap.has(ns.date)) {
          dateMap.set(ns.date, { shifts: [], nonShifts: [] });
        }
        dateMap.get(ns.date).nonShifts.push(ns);
      });
      
      dateMap.forEach((dayData) => {
        const { hours } = calculateDayHours(
          dayData.shifts,
          dayData.nonShifts,
          nonShiftTypes,
          employee,
          calculateShiftDuration
        );
        weekHours += hours;
      });

      const weekDiff = weekHours - contractHoursWeekly;
      if (weekDiff <= 0) return;

      const over25 = Math.min(weekDiff, 8);
      const over50 = Math.max(0, weekDiff - 8);

      overtime25 += over25;
      overtime50 += over50;
    });
  }

  return { overtime25, overtime50, complementary10, complementary25 };
}

/**
 * Calcule les jours fériés travaillés
 */
function calculateHolidaysWorked(shifts, holidayDates, employee) {
  // Vérifier l'ancienneté (> 8 mois)
  if (!employee?.start_date) {
    return { holidaysWorked: 0, holidaysHours: 0 };
  }

  const startDate = new Date(employee.start_date);
  const today = new Date();
  const monthsDiff = (today.getFullYear() - startDate.getFullYear()) * 12 + 
                     (today.getMonth() - startDate.getMonth());

  if (monthsDiff < 8) {
    return { holidaysWorked: 0, holidaysHours: 0 };
  }

  // Créer un Set des dates fériées
  const holidayDateSet = new Set(holidayDates.map(h => h.date));

  let holidaysWorked = 0;
  let holidaysHours = 0;

  // Grouper par date
  const dateMap = new Map();
  shifts.forEach(shift => {
    if (shift.status === 'cancelled') return;
    if (!dateMap.has(shift.date)) {
      dateMap.set(shift.date, []);
    }
    dateMap.get(shift.date).push(shift);
  });

  // Compter les jours fériés travaillés
  dateMap.forEach((dayShifts, date) => {
    if (holidayDateSet.has(date)) {
      holidaysWorked++;
      dayShifts.forEach(shift => {
        holidaysHours += calculateShiftDuration(shift);
      });
    }
  });

  return { holidaysWorked, holidaysHours };
}

/**
 * Calcule les jours de CP dans le mois
 */
function calculateCPDays(cpPeriods, monthStart, monthEnd) {
  const monthStartStr = formatLocalDate(monthStart);
  const monthEndStr = formatLocalDate(monthEnd);

  let cpDays = 0;

  cpPeriods.forEach(period => {
    const periodStart = period.start_cp;
    const periodEnd = period.end_cp;

    // Vérifier si la période intersecte avec le mois
    if (periodEnd < monthStartStr || periodStart > monthEndStr) {
      return;
    }

    // Calculer l'intersection
    const intersectionStart = periodStart >= monthStartStr ? periodStart : monthStartStr;
    const intersectionEnd = periodEnd <= monthEndStr ? periodEnd : monthEndStr;

    // Compter les jours dans l'intersection
    const startDate = new Date(intersectionStart);
    const endDate = new Date(intersectionEnd);
    const days = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

    cpDays += days;
  });

  return cpDays;
}

/**
 * Récupère toutes les semaines qui intersectent avec le mois
 */
function getWeeksInMonth(monthStart, monthEnd) {
  const weeks = [];
  let current = new Date(monthStart);

  // Trouver le lundi de la première semaine
  while (current.getDay() !== 1) {
    current.setDate(current.getDate() - 1);
  }

  // Ajouter toutes les semaines jusqu'à la fin du mois
  while (current <= monthEnd) {
    weeks.push(new Date(current));
    current.setDate(current.getDate() + 7);
  }

  return weeks;
}