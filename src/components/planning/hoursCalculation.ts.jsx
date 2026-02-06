/**
 * Module de calcul des heures travaillées, supplémentaires et complémentaires
 * avec gestion des heures manquantes par rapport au contrat
 */

interface Employee {
  id: string;
  work_time_type?: 'full_time' | 'part_time';
  contract_hours_weekly?: string; // Format "HH:MM" ou "HH.MM"
  weekly_schedule?: {
    monday?: { worked: boolean; hours: number };
    tuesday?: { worked: boolean; hours: number };
    wednesday?: { worked: boolean; hours: number };
    thursday?: { worked: boolean; hours: number };
    friday?: { worked: boolean; hours: number };
    saturday?: { worked: boolean; hours: number };
    sunday?: { worked: boolean; hours: number };
  } | null;
}

interface Shift {
  id: string;
  date: string; // Format "YYYY-MM-DD"
  employee_id: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  status: string;
}

interface DailyBreakdown {
  date: string;
  dayOfWeek: number; // 1=Lundi, 7=Dimanche
  isContractDay: boolean;
  totalPlanned: number;
  totalActual: number;
  hoursOutsideContract: number;
  expectedHours: number; // Heures attendues selon le contrat
  missingHours: number; // Heures manquantes par rapport au contrat
}

interface WeeklyResult {
  totalPlannedHours: number;
  totalActualHours: number;
  contractHoursWeekly: number;
  workTimeType: 'full_time' | 'part_time';
  hasWeeklySchedule: boolean;
  hoursOutsideContract: number;
  overtime: {
    outsideContract: number;
    classic25: number;
    classic50: number;
    total: number;
  };
  complementary: {
    outsideContract: number;
    classic10: number;
    classic25: number;
    total: number;
    exceedsLimit: boolean;
  };
  missingHours: number; // Total heures manquantes
  dailyBreakdown: DailyBreakdown[];
  alerts: string[];
}

interface MonthlyResult {
  totalPlannedHours: number;
  totalActualHours: number;
  totalEffectiveHours: number;
  contractHoursMonthly: number;
  daysWorkedPlanned: number;
  daysWorkedActual: number;
  workTimeType: 'full_time' | 'part_time';
  overtime: {
    outsideContract: number;
    classic25: number;
    classic50: number;
    total: number;
  } | null;
  complementary: {
    outsideContract: number;
    classic10: number;
    classic25: number;
    total: number;
    exceedsLimit: boolean;
  } | null;
  missingHours: number; // Total heures manquantes (avant compensation)
  netExcessHours: number; // Heures excédentaires après déduction des heures manquantes
}

/**
 * Parse heures contractuelles "HH:MM" ou "HH.MM" -> decimal
 */
function parseContractHours(hoursStr: string): number {
  if (!hoursStr) return 35; // Défaut
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
function calculateShiftDuration(startTime: string, endTime: string, breakMinutes: number): number {
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  
  let minutes = (endH * 60 + endM) - (startH * 60 + startM);
  if (minutes < 0) minutes += 24 * 60; // Gestion passage minuit
  
  minutes -= breakMinutes;
  return Math.max(0, minutes / 60);
}

/**
 * Obtient le jour ISO (1=Lundi, 7=Dimanche)
 */
function getIsoDayOfWeek(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const jsDay = date.getDay();
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * Vérifie si un jour est prévu au contrat
 */
function isContractDay(employee: Employee, dayOfWeek: number): boolean {
  if (!employee.weekly_schedule) return true;
  
  const dayMap: Record<number, keyof typeof employee.weekly_schedule> = {
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
function getExpectedHoursForDay(employee: Employee, dayOfWeek: number): number {
  if (!employee.weekly_schedule) return 0;
  
  const dayMap: Record<number, keyof typeof employee.weekly_schedule> = {
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
export function calculateWeeklyHours(
  shifts: Shift[],
  employee: Employee,
  weekStart: string,
  policy: 'overtime' | 'time_off' = 'overtime'
): WeeklyResult {
  const contractHoursWeekly = parseContractHours(employee.contract_hours_weekly || '35:00');
  const workTimeType = employee.work_time_type || 'full_time';
  const hasWeeklySchedule = !!employee.weekly_schedule;

  // Calculer les dates de la semaine
  const [year, month, day] = weekStart.split('-').map(Number);
  const startDate = new Date(year, month - 1, day);
  const weekDates: string[] = [];
  
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    weekDates.push(dateStr);
  }

  // Analyse quotidienne
  const dailyBreakdown: DailyBreakdown[] = weekDates.map(date => {
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
    // Temps complet: heures supplémentaires
    overtime.outsideContract = hoursOutsideContract;
    
    if (netExcessHours <= 8) {
      overtime.classic25 = netExcessHours;
    } else {
      overtime.classic25 = 8;
      overtime.classic50 = netExcessHours - 8;
    }
    
    overtime.total = overtime.outsideContract + overtime.classic25 + overtime.classic50;
  } else if (workTimeType === 'part_time' && netExcessHours > 0) {
    // Temps partiel: heures complémentaires
    complementary.outsideContract = hoursOutsideContract;
    
    const maxComplementary = contractHoursWeekly * 0.33; // 1/3 des heures contractuelles
    
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
export function calculateMonthlyHours(
  shifts: Shift[],
  employee: Employee,
  year: number,
  month: number, // 1-12
  policy: 'overtime' | 'time_off' = 'overtime'
): MonthlyResult {
  const contractHoursWeekly = parseContractHours(employee.contract_hours_weekly || '35:00');
  const workTimeType = employee.work_time_type || 'full_time';
  
  // Calculer le nombre de semaines dans le mois
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const daysInMonth = lastDay.getDate();
  const weeksInMonth = daysInMonth / 7;
  
  const contractHoursMonthly = contractHoursWeekly * weeksInMonth;

  // Grouper les shifts par semaine et calculer
  const weeklyResults: WeeklyResult[] = [];
  let currentWeekStart = new Date(firstDay);
  
  // Trouver le premier lundi du mois (ou avant)
  const dayOfWeek = currentWeekStart.getDay();
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  currentWeekStart.setDate(currentWeekStart.getDate() + daysToMonday);
  
  while (currentWeekStart <= lastDay) {
    const weekStartStr = `${currentWeekStart.getFullYear()}-${String(currentWeekStart.getMonth() + 1).padStart(2, '0')}-${String(currentWeekStart.getDate()).padStart(2, '0')}`;
    
    // Filtrer les shifts de cette semaine qui sont dans le mois
    const weekShifts = shifts.filter(s => {
      const shiftDate = new Date(s.date.split('-').map(Number)[0], s.date.split('-').map(Number)[1] - 1, s.date.split('-').map(Number)[2]);
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

  // Agréger les résultats
  const totalPlannedHours = weeklyResults.reduce((sum, w) => sum + w.totalPlannedHours, 0);
  const totalActualHours = weeklyResults.reduce((sum, w) => sum + w.totalActualHours, 0);
  const totalEffectiveHours = totalActualHours > 0 ? totalActualHours : totalPlannedHours;
  const totalMissingHours = weeklyResults.reduce((sum, w) => sum + w.missingHours, 0);
  
  // Calcul des heures excédentaires APRÈS déduction des heures manquantes
  const netExcessHours = totalEffectiveHours - contractHoursMonthly - totalMissingHours;

  // Jours travaillés
  const daysWorkedPlanned = new Set(shifts.filter(s => !['completed', 'validated'].includes(s.status)).map(s => s.date)).size;
  const daysWorkedActual = new Set(shifts.filter(s => ['completed', 'validated'].includes(s.status)).map(s => s.date)).size;

  let overtime = null;
  let complementary = null;

  // Calcul selon le type de contrat - uniquement si positif
  if (workTimeType === 'full_time' && netExcessHours > 0) {
    const totalOutside = weeklyResults.reduce((sum, w) => sum + w.overtime.outsideContract, 0);
    const total25 = weeklyResults.reduce((sum, w) => sum + w.overtime.classic25, 0);
    const total50 = weeklyResults.reduce((sum, w) => sum + w.overtime.classic50, 0);
    
    overtime = {
      outsideContract: totalOutside,
      classic25: total25,
      classic50: total50,
      total: Math.max(0, netExcessHours) // Ne compter que le positif
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
      total: Math.max(0, netExcessHours), // Ne compter que le positif
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
    netExcessHours: Math.max(0, netExcessHours) // Ne retourner que le positif
  };
}

/**
 * Vérifie si une semaine est partiellement dans le mois
 */
function isPartialWeekInMonth(weekStart: Date, month: number, year: number): boolean {
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    if (d.getMonth() === month - 1 && d.getFullYear() === year) {
      return true;
    }
  }
  return false;
}

/**
 * Retourne les heures effectives (actual si disponible, sinon planned)
 */
export function getEffectiveHours(result: WeeklyResult): number {
  return result.totalActualHours > 0 ? result.totalActualHours : result.totalPlannedHours;
}