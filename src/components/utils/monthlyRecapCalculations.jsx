import { calculateDayHours } from '@/components/utils/nonShiftHoursCalculation';

/**
 * Monthly recap calculations – SOURCE DE VÉRITÉ = SOMME DES SEMAINES
 *
 * Architecture :
 *  1. Chaque semaine clipée au mois est calculée en MINUTES ENTIÈRES (pas de float).
 *  2. Le mensuel est = Σ des semaines.
 *  3. La ventilation +10%/+25% (temps partiel) ou +25%/+50% (temps plein) est appliquée
 *     sur le TOTAL mensuel, en minutes entières.
 *  4. Aucun arrondi fantôme : tout reste en minutes jusqu'à l'affichage.
 */

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS DE BASE
// ─────────────────────────────────────────────────────────────────────────────

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
 * Durée d'un shift en MINUTES ENTIÈRES (strict : jamais base_hours_override)
 */
function shiftStrictMinutes(shift) {
  if (!shift || !shift.start_time || !shift.end_time) return 0;
  const [sh, sm] = shift.start_time.split(':').map(Number);
  const [eh, em] = shift.end_time.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  mins -= (shift.break_minutes || 0);
  return Math.max(0, mins);
}

/**
 * Durée d'un shift pour le calcul des HEURES TRAVAILLÉES (float, compatible calculateDayHours)
 * ATTENTION : utilisé uniquement pour workedHours dans le contexte non-shift.
 */
export function calculateShiftDuration(shift) {
  if (!shift || !shift.start_time || !shift.end_time) return 0;
  if (shift.base_hours_override !== null && shift.base_hours_override !== undefined) {
    return shift.base_hours_override;
  }
  const [startHour, startMin] = shift.start_time.split(':').map(Number);
  const [endHour, endMin] = shift.end_time.split(':').map(Number);
  let totalMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
  if (totalMinutes < 0) totalMinutes += 24 * 60;
  const breakMinutes = shift.break_minutes || 0;
  totalMinutes -= breakMinutes;
  return Math.max(0, totalMinutes / 60);
}

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

function formatDate(date) {
  if (typeof date === 'string') return date;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDatesInMonth(year, month) {
  const dates = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    dates.push(formatDate(new Date(year, month, day)));
  }
  return dates;
}

function getFullWeekDates(dateStr) {
  const date = new Date(dateStr);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
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

function getWeeksTouchingMonth(year, month) {
  const monthEnd = new Date(year, month + 1, 0);
  const weeks = [];
  const seenWeeks = new Set();
  const daysInMonth = monthEnd.getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dayOfWeek = date.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(date);
    monday.setDate(monday.getDate() + diff);
    const weekKey = formatDate(monday);
    if (!seenWeeks.has(weekKey)) {
      seenWeeks.add(weekKey);
      weeks.push({ weekKey, dates: getFullWeekDates(formatDate(date)) });
    }
  }
  return weeks;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER CENTRAL : calcul d'une semaine en MINUTES (clipée au mois)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcule baseMin / workedMin / deltaMin pour une semaine donnée, clipée au mois.
 *
 * @param {string[]} visibleDates    - Dates du mois dans cette semaine
 * @param {string} weekKey           - Lundi de la semaine (YYYY-MM-DD)
 * @param {Object} employee
 * @param {Array}  shifts
 * @param {Array}  nonShiftEvents
 * @param {Array}  nonShiftTypes
 * @param {Array}  weeklyRecaps      - WeeklyRecap overrides
 * @param {Set}    workedDaysOfWeek  - Jours travaillés contractuels (0=dim, 1=lun…)
 * @param {number} dailyContractHoursDecimal
 * @returns {{ baseMin: number, workedMin: number, deltaMin: number }}
 */
function computeWeeklyMinutesFromVisible(
  visibleDates, weekKey,
  employee, shifts, nonShiftEvents, nonShiftTypes,
  weeklyRecaps, workedDaysOfWeek, dailyContractHoursDecimal
) {
  // BASE : override hebdo s'il existe, sinon contrat proratisé (en minutes entières)
  const weekRecap = weeklyRecaps.find(
    wr => wr.employee_id === employee.id && wr.week_start === weekKey
  );

  let baseMin;
  if (weekRecap?.base_override_hours !== null && weekRecap?.base_override_hours !== undefined) {
    // Override = valeur saisie en heures décimales → arrondi en minutes entières
    baseMin = Math.round(weekRecap.base_override_hours * 60);
  } else {
    // Contrat : compter les jours contractuels dans les dates visibles
    let contractDays = 0;
    visibleDates.forEach(dateStr => {
      const dow = new Date(dateStr).getDay();
      if (workedDaysOfWeek.has(dow)) contractDays++;
    });
    // En minutes entières (pas d'arrondi au quart d'heure ici, on reste exact)
    baseMin = Math.round(contractDays * dailyContractHoursDecimal * 60);
  }

  // RÉALISÉ : strict real times, jamais base_hours_override sur les shifts
  let workedMin = 0;
  const dateMap = new Map();

  const weekShifts = shifts.filter(
    s => s.employee_id === employee.id &&
      visibleDates.includes(s.date) &&
      s.status !== 'cancelled'
  );
  const weekNonShifts = nonShiftEvents.filter(
    ns => ns.employee_id === employee.id && visibleDates.includes(ns.date)
  );

  weekShifts.forEach(s => {
    if (!dateMap.has(s.date)) dateMap.set(s.date, { shifts: [], nonShifts: [] });
    dateMap.get(s.date).shifts.push(s);
  });
  weekNonShifts.forEach(ns => {
    if (!dateMap.has(ns.date)) dateMap.set(ns.date, { shifts: [], nonShifts: [] });
    dateMap.get(ns.date).nonShifts.push(ns);
  });

  dateMap.forEach((dayData) => {
    if (dayData.shifts.length > 0) {
      dayData.shifts.forEach(s => { workedMin += shiftStrictMinutes(s); });
    } else {
      // Non-shift qui génère des heures
      const { hours } = calculateDayHours([], dayData.nonShifts, nonShiftTypes, employee, calculateShiftDuration);
      workedMin += Math.round(hours * 60);
    }
  });

  return { baseMin, workedMin, deltaMin: workedMin - baseMin };
}

// ─────────────────────────────────────────────────────────────────────────────
// CALCUL MENSUEL
// ─────────────────────────────────────────────────────────────────────────────

export function calculateMonthlyRecap(
  mode,
  employee,
  shifts,
  nonShiftEvents,
  nonShiftTypes,
  holidayDates,
  year,
  month,
  weeklyRecaps = []
) {
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
    complementaryExcessWarning: 0,
    nonShiftsByType: {},
    holidaysWorkedDays: 0,
    holidaysWorkedHours: 0,
    eligibleForHolidayPay: false,
    cpDays: null,
    // Minutes (source de vérité pour l'export)
    baseMinutes: 0,
    workedMinutes: 0,
    deltaMinutes: 0,
    complementaryMinutes10: 0,
    complementaryMinutes25: 0,
    overtimeMinutes25: 0,
    overtimeMinutes50: 0,
  };

  const monthDates = getDatesInMonth(year, month);
  const contractHoursWeekly = parseContractHours(employee.contract_hours_weekly) || 35;
  const workDaysPerWeek = employee.work_days_per_week || 5;
  const dailyContractHours = contractHoursWeekly / workDaysPerWeek;
  const isPartTime = result.isPartTime;

  // Jours travaillés contractuels (Set)
  const weeklySchedule = employee.weekly_schedule || {};
  const workedDaysOfWeek = new Set();
  const dayMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  dayMap.forEach((dayName, dayIndex) => {
    if (weeklySchedule[dayName]?.worked) workedDaysOfWeek.add(dayIndex);
  });
  if (workedDaysOfWeek.size === 0) {
    for (let i = 0; i < workDaysPerWeek; i++) workedDaysOfWeek.add((i + 1) % 7);
  }

  // Jours prévus du mois
  monthDates.forEach(dateStr => {
    if (workedDaysOfWeek.has(new Date(dateStr).getDay())) result.expectedDays++;
  });

  // ── Mode disabled : calcul simple, pas de sup/comp ──
  if (mode === 'disabled') {
    monthDates.forEach(date => {
      const dayShifts = shifts.filter(s => s.employee_id === employee.id && s.date === date && s.status !== 'cancelled');
      const dayNonShifts = nonShiftEvents.filter(ns => ns.employee_id === employee.id && ns.date === date);

      if (dayShifts.length > 0) {
        result.workedDays++;
        const dayMins = dayShifts.reduce((sum, s) => sum + shiftStrictMinutes(s), 0);
        result.workedHours += dayMins / 60;
        result.workedMinutes += dayMins;
        if (holidayDates.includes(date)) {
          result.holidaysWorkedDays++;
          result.holidaysWorkedHours += dayMins / 60;
        }
      } else if (dayNonShifts.length > 0) {
        const { hours } = calculateDayHours([], dayNonShifts, nonShiftTypes, employee, calculateShiftDuration);
        result.workedHours += hours;
        result.workedMinutes += Math.round(hours * 60);
      }
    });
    result.eligibleForHolidayPay = result.holidaysWorkedDays > 0;
    result.ferieEligible = result.eligibleForHolidayPay;
    result.ferieDays = result.holidaysWorkedDays;
    result.ferieHours = result.holidaysWorkedHours;
    return result;
  }

  // ── Modes weekly / monthly : SOURCE = SOMME DES SEMAINES ──
  const weeks = getWeeksTouchingMonth(year, month);
  const monthStartStr = formatDate(new Date(year, month, 1));
  const monthEndStr = formatDate(new Date(year, month + 1, 0));

  let totalBaseMin = 0;
  let totalWorkedMin = 0;

  // Comptage jours travaillés / heures fériées (reste basé sur dates du mois)
  monthDates.forEach(date => {
    const dayShifts = shifts.filter(s => s.employee_id === employee.id && s.date === date && s.status !== 'cancelled');
    const dayNonShifts = nonShiftEvents.filter(ns => ns.employee_id === employee.id && ns.date === date);

    const hasActivity = dayShifts.length > 0 || dayNonShifts.length > 0;
    if (hasActivity) {
      result.workedDays++;
    }

    if (holidayDates.includes(date) && dayShifts.length > 0) {
      result.holidaysWorkedDays++;
      result.holidaysWorkedHours += dayShifts.reduce((sum, s) => sum + shiftStrictMinutes(s), 0) / 60;
    }

    dayNonShifts.forEach(ns => {
      const type = nonShiftTypes.find(t => t.id === ns.non_shift_type_id);
      if (type) {
        const key = type.code || type.name;
        if (!result.nonShiftsByType[key]) result.nonShiftsByType[key] = { count: 0, code: type.code };
        result.nonShiftsByType[key].count++;
      }
    });
  });

  // Somme des semaines en minutes
  weeks.forEach(({ weekKey, dates: weekDates }) => {
    const visibleDates = weekDates.filter(d => d >= monthStartStr && d <= monthEndStr);
    if (visibleDates.length === 0) return;

    const { baseMin, workedMin } = computeWeeklyMinutesFromVisible(
      visibleDates, weekKey,
      employee, shifts, nonShiftEvents, nonShiftTypes,
      weeklyRecaps, workedDaysOfWeek, dailyContractHours
    );
    totalBaseMin += baseMin;
    totalWorkedMin += workedMin;
  });

  result.baseMinutes = totalBaseMin;
  result.workedMinutes = totalWorkedMin;
  result.deltaMinutes = totalWorkedMin - totalBaseMin;

  // Conversion en heures pour rétrocompatibilité affichage
  result.contractMonthlyHours = totalBaseMin / 60;
  result.adjustedContractHours = result.contractMonthlyHours;
  result.workedHours = totalWorkedMin / 60;
  result.extraDays = Math.max(0, result.workedDays - result.expectedDays);

  // ── Ventilation sup / comp (en minutes entières) ──
  const extraMin = Math.max(0, result.deltaMinutes); // heures en plus

  if (isPartTime) {
    // Temps partiel : +10% jusqu'à 10% de la base, +25% au-delà
    const limit10Min = Math.round(totalBaseMin * 0.10);
    const c10Min = Math.min(extraMin, limit10Min);
    const c25Min = Math.max(0, extraMin - c10Min);

    result.complementaryMinutes10 = c10Min;
    result.complementaryMinutes25 = c25Min;
    result.complementaryHours10 = c10Min / 60;
    result.complementaryHours25 = c25Min / 60;
    result.totalComplementaryHours = (c10Min + c25Min) / 60;

    // Avertissement consultatif si > 1/3 de la base
    const maxMin = Math.round(totalBaseMin / 3);
    result.complementaryExcessWarning = extraMin > maxMin ? (extraMin - maxMin) / 60 : 0;
  } else {
    // Temps plein : calcul semaine par semaine pour 25%/50%
    // (règle légale : HS25 de 36h à 43h/sem, HS50 au-delà de 43h/sem)
    let hs25Min = 0;
    let hs50Min = 0;

    weeks.forEach(({ weekKey, dates: weekDates }) => {
      const visibleDates = weekDates.filter(d => d >= monthStartStr && d <= monthEndStr);
      if (visibleDates.length === 0) return;

      const { baseMin: wBase, workedMin: wWorked } = computeWeeklyMinutesFromVisible(
        visibleDates, weekKey,
        employee, shifts, nonShiftEvents, nonShiftTypes,
        weeklyRecaps, workedDaysOfWeek, dailyContractHours
      );

      if (wWorked > wBase) {
        const weekExtraMin = wWorked - wBase;
        // Seuil 8h (480 min) = différence entre 35h et 43h/sem
        const hs25WeekMin = Math.min(weekExtraMin, 480);
        const hs50WeekMin = Math.max(0, weekExtraMin - 480);
        hs25Min += hs25WeekMin;
        hs50Min += hs50WeekMin;
      }
    });

    result.overtimeMinutes25 = hs25Min;
    result.overtimeMinutes50 = hs50Min;
    result.overtimeHours25 = hs25Min / 60;
    result.overtimeHours50 = hs50Min / 60;
    result.totalOvertimeHours = (hs25Min + hs50Min) / 60;
  }

  result.eligibleForHolidayPay = result.holidaysWorkedDays > 0;
  result.ferieEligible = result.eligibleForHolidayPay;
  result.ferieDays = result.holidaysWorkedDays;
  result.ferieHours = result.holidaysWorkedHours;

  if (employee.start_date) {
    const startDate = new Date(employee.start_date);
    const mid = new Date(year, month, 15);
    result.hasSufficientSeniority = Math.floor((mid - startDate) / 86400000) >= 90;
  }

  return result;
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