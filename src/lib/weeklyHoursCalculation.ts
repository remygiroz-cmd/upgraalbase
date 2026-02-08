/**
 * Calculs d'heures hebdomadaires simplifiés
 *
 * LOGIQUE:
 * - Base = heures contractuelles par semaine (surchargeable)
 * - Réalisé = somme des shifts travaillés
 * - Heures + = max(0, Réalisé - Base)
 * - Heures - = max(0, Base - Réalisé)
 */

// =============================================================================
// TYPES
// =============================================================================

/** Shift minimal pour les calculs */
export interface ShiftForCalculation {
  id: string;
  date: string;           // YYYY-MM-DD
  employee_id: string;
  start_time: string;     // HH:MM
  end_time: string;       // HH:MM
  break_minutes: number;
  status?: string;
}

/** Résultat du calcul hebdomadaire */
export interface WeeklyHoursResult {
  weekStart: string;
  weekEnd: string;
  employeeId: string;

  // Base (par défaut = contrat, surchargeable)
  contractHoursPerWeek: number;
  baseOverride: number | null;
  baseUsed: number;           // = baseOverride ?? contractHoursPerWeek

  // Réalisé
  workedHours: number;

  // Écarts
  plusHours: number;          // max(0, workedHours - baseUsed)
  minusHours: number;         // max(0, baseUsed - workedHours)

  // Métadonnées
  shiftsCount: number;
  daysWorked: string[];       // Liste des dates avec shifts
}

/** Surcharge manuelle stockée */
export interface WeeklyRecap {
  id?: string;
  employee_id: string;
  week_start: string;         // YYYY-MM-DD (lundi de la semaine)
  base_override_hours: number | null;
  notes?: string;
  updated_at?: string;
}

// =============================================================================
// FONCTIONS UTILITAIRES
// =============================================================================

/**
 * Formate une date en YYYY-MM-DD (locale)
 */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Retourne le lundi de la semaine ISO
 */
export function getIsoWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Retourne le dimanche de la semaine ISO
 */
export function getIsoWeekEnd(weekStart: Date): Date {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  return d;
}

/**
 * Calcule la durée d'un shift en heures
 */
export function calculateShiftDuration(shift: ShiftForCalculation): number {
  const [startH, startM] = shift.start_time.split(':').map(Number);
  const [endH, endM] = shift.end_time.split(':').map(Number);

  let totalMinutes = (endH * 60 + endM) - (startH * 60 + startM);

  // Gestion du passage à minuit
  if (totalMinutes < 0) {
    totalMinutes += 24 * 60;
  }

  // Soustraire la pause
  totalMinutes -= (shift.break_minutes || 0);

  return Math.max(0, totalMinutes / 60);
}

/**
 * Parse les heures contractuelles (format "35:00" ou "35" ou "10")
 */
export function parseContractHours(value: string | number | null | undefined): number {
  if (!value) return 0;

  if (typeof value === 'number') return value;

  const str = String(value).trim();

  // Format "HH:MM"
  if (str.includes(':')) {
    const [hours, minutes] = str.split(':').map(Number);
    return hours + (minutes || 0) / 60;
  }

  // Format "XXh" ou "XX"
  return parseFloat(str.replace(/h/gi, '')) || 0;
}

// =============================================================================
// CALCUL PRINCIPAL
// =============================================================================

/**
 * Calcule les heures pour une semaine donnée
 */
export function calculateWeeklyHours(
  shifts: ShiftForCalculation[],
  employeeId: string,
  weekStart: Date,
  contractHoursPerWeek: number,
  baseOverride: number | null = null
): WeeklyHoursResult {
  const weekStartStr = formatLocalDate(weekStart);
  const weekEnd = getIsoWeekEnd(weekStart);
  const weekEndStr = formatLocalDate(weekEnd);

  // Filtrer les shifts de la semaine pour cet employé
  const weekShifts = shifts.filter(s => {
    if (s.employee_id !== employeeId) return false;
    if (s.date < weekStartStr || s.date > weekEndStr) return false;
    // Ne compter que les shifts "travaillés" (pas cancelled)
    if (s.status === 'cancelled') return false;
    return true;
  });

  // Calculer les heures travaillées
  const workedHours = weekShifts.reduce((sum, shift) => {
    return sum + calculateShiftDuration(shift);
  }, 0);

  // Jours travaillés (uniques)
  const daysWorked = [...new Set(weekShifts.map(s => s.date))].sort();

  // Base utilisée
  const baseUsed = baseOverride !== null ? baseOverride : contractHoursPerWeek;

  // Calcul des écarts
  const plusHours = Math.max(0, workedHours - baseUsed);
  const minusHours = Math.max(0, baseUsed - workedHours);

  return {
    weekStart: weekStartStr,
    weekEnd: weekEndStr,
    employeeId,
    contractHoursPerWeek,
    baseOverride,
    baseUsed,
    workedHours,
    plusHours,
    minusHours,
    shiftsCount: weekShifts.length,
    daysWorked
  };
}

/**
 * Calcule les heures pour toutes les semaines d'un mois
 */
export function calculateMonthlyWeeks(
  shifts: ShiftForCalculation[],
  employeeId: string,
  year: number,
  month: number,
  contractHoursPerWeek: number,
  weeklyOverrides: Map<string, number | null> = new Map()
): WeeklyHoursResult[] {
  const results: WeeklyHoursResult[] = [];

  // Premier jour du mois
  const monthStart = new Date(year, month - 1, 1);
  // Dernier jour du mois
  const monthEnd = new Date(year, month, 0);

  // Trouver le premier lundi qui contient des jours du mois
  let currentWeekStart = getIsoWeekStart(monthStart);

  while (currentWeekStart <= monthEnd) {
    const weekStartStr = formatLocalDate(currentWeekStart);
    const baseOverride = weeklyOverrides.get(weekStartStr) ?? null;

    const weekResult = calculateWeeklyHours(
      shifts,
      employeeId,
      currentWeekStart,
      contractHoursPerWeek,
      baseOverride
    );

    results.push(weekResult);

    // Passer à la semaine suivante
    currentWeekStart = new Date(currentWeekStart);
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
  }

  return results;
}

/**
 * Calcule le total mensuel à partir des semaines
 * Note: Ne compte que les jours qui sont dans le mois
 */
export function calculateMonthlyTotals(
  weeklyResults: WeeklyHoursResult[],
  year: number,
  month: number
): {
  totalWorked: number;
  totalPlus: number;
  totalMinus: number;
  netBalance: number;  // totalPlus - totalMinus
} {
  let totalPlus = 0;
  let totalMinus = 0;
  let totalWorked = 0;

  for (const week of weeklyResults) {
    totalPlus += week.plusHours;
    totalMinus += week.minusHours;
    totalWorked += week.workedHours;
  }

  return {
    totalWorked,
    totalPlus,
    totalMinus,
    netBalance: totalPlus - totalMinus
  };
}
