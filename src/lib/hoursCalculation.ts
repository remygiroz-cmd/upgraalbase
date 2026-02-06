/**
 * Calculs d'heures pour le module Planning
 *
 * CONVENTIONS:
 * - Toutes les fonctions sont PURES (pas d'effets de bord)
 * - Les durées sont en heures décimales (ex: 1.5 = 1h30)
 * - Les dates sont au format YYYY-MM-DD (string)
 * - Les heures sont au format HH:MM (string)
 *
 * REGLES METIER:
 * - Temps complet: base 35h/semaine
 * - Heures supplémentaires: >35h (25% jusqu'à 43h, 50% au-delà)
 * - Temps partiel: heures complémentaires (10% jusqu'à +10% contrat, 25% au-delà)
 * - Plafond temps partiel: ne peut pas dépasser 35h/semaine
 */

// =============================================================================
// TYPES
// =============================================================================

/** Statut d'un shift */
export type ShiftStatus = 'planned' | 'confirmed' | 'completed' | 'cancelled';

/** Type de temps de travail */
export type WorkTimeType = 'full_time' | 'part_time';

/** Shift minimal pour les calculs */
export interface ShiftForCalculation {
  id: string;
  date: string;           // YYYY-MM-DD
  employee_id: string;
  start_time: string;     // HH:MM
  end_time: string;       // HH:MM
  break_minutes: number;
  status: ShiftStatus;
}

/** Employé minimal pour les calculs */
export interface EmployeeForCalculation {
  id: string;
  work_time_type: WorkTimeType;
  contract_hours_weekly: string;  // Ex: "35:00" ou "25"
}

/** Résultat du calcul quotidien */
export interface DailyHoursResult {
  date: string;
  totalPlanned: number;
  totalActual: number;
  shiftsPlanned: number;
  shiftsActual: number;
}

/** Résultat du calcul hebdomadaire */
export interface WeeklyHoursResult {
  weekStart: string;
  weekEnd: string;

  // Totaux
  totalPlannedHours: number;
  totalActualHours: number;

  // Base contractuelle
  contractHoursWeekly: number;
  workTimeType: WorkTimeType;

  // Temps complet - Heures supplémentaires
  overtime25: number;       // HS majorées à 25% (36h-43h)
  overtime50: number;       // HS majorées à 50% (>43h)
  totalOvertime: number;

  // Temps partiel - Heures complémentaires
  complementary10: number;  // HC majorées à 10% (≤ +10% contrat)
  complementary25: number;  // HC majorées à 25% (> +10% contrat)
  totalComplementary: number;

  // Alertes
  alerts: HoursAlert[];

  // Détail par jour
  dailyBreakdown: DailyHoursResult[];
}

/** Résultat du calcul mensuel */
export interface MonthlyHoursResult {
  year: number;
  month: number;

  // Totaux
  totalPlannedHours: number;
  totalActualHours: number;

  // Jours travaillés
  daysWorkedPlanned: number;
  daysWorkedActual: number;

  // Base contractuelle
  contractHoursMonthly: number;
  workTimeType: WorkTimeType;

  // Agrégation des heures sup/complémentaires
  totalOvertime25: number;
  totalOvertime50: number;
  totalComplementary10: number;
  totalComplementary25: number;

  // Alertes
  alerts: HoursAlert[];

  // Détail par semaine
  weeklyBreakdown: WeeklyHoursResult[];
}

/** Type d'alerte */
export type AlertType =
  | 'overtime_warning'        // Heures sup détectées
  | 'overtime_high'           // >48h/semaine
  | 'complementary_limit'     // HC > 10% contrat
  | 'part_time_exceeded'      // Temps partiel > 35h
  | 'rest_insufficient'       // Repos < 11h
  | 'daily_amplitude_high';   // Amplitude > 10h/jour

/** Alerte générée par les calculs */
export interface HoursAlert {
  type: AlertType;
  severity: 'info' | 'warning' | 'error';
  message: string;
  date?: string;
  value?: number;
}

// =============================================================================
// CONSTANTES METIER
// =============================================================================

/** Base légale hebdomadaire en France */
export const LEGAL_WEEKLY_HOURS = 35;

/** Seuil des HS à 25% (35h → 43h) */
export const OVERTIME_25_THRESHOLD = 43;

/** Seuil max recommandé (48h) */
export const OVERTIME_MAX_THRESHOLD = 48;

/** Pourcentage pour HC 10% (jusqu'à +10% du contrat) */
export const COMPLEMENTARY_10_PERCENT = 0.10;

/** Moyenne de semaines par mois */
export const WEEKS_PER_MONTH = 4.33;

// =============================================================================
// FONCTIONS UTILITAIRES
// =============================================================================

/**
 * Détermine si un shift est "réalisé" (vs planifié)
 * Un shift est réalisé si son statut est 'completed'
 */
export function isShiftActual(shift: ShiftForCalculation): boolean {
  return shift.status === 'completed';
}

/**
 * Détermine si un shift doit être compté (pas annulé)
 */
export function isShiftCountable(shift: ShiftForCalculation): boolean {
  return shift.status !== 'cancelled';
}

/**
 * Calcule la durée d'un shift en heures décimales
 * Gère le cas où end < start (shift traversant minuit)
 */
export function calculateShiftDuration(shift: ShiftForCalculation): number {
  const [startH, startM] = shift.start_time.split(':').map(Number);
  const [endH, endM] = shift.end_time.split(':').map(Number);

  let totalMinutes = (endH * 60 + endM) - (startH * 60 + startM);

  // Gestion du passage à minuit
  if (totalMinutes < 0) {
    totalMinutes += 24 * 60;
  }

  // Soustraction de la pause
  totalMinutes -= (shift.break_minutes || 0);

  // Ne pas retourner de valeur négative
  return Math.max(0, totalMinutes / 60);
}

/**
 * Parse les heures contractuelles hebdomadaires
 * Accepte les formats: "35:00", "35", "35h", "35h00"
 */
export function parseContractHours(contractHoursWeekly: string | null | undefined): number {
  if (!contractHoursWeekly) return LEGAL_WEEKLY_HOURS;

  const str = String(contractHoursWeekly).trim();

  // Format "35:30" ou "35:00"
  if (str.includes(':')) {
    const [hours, minutes] = str.split(':').map(Number);
    return hours + (minutes || 0) / 60;
  }

  // Format "35h30" ou "35h"
  if (str.toLowerCase().includes('h')) {
    const match = str.match(/^(\d+(?:\.\d+)?)\s*h\s*(\d+)?$/i);
    if (match) {
      const hours = parseFloat(match[1]);
      const minutes = match[2] ? parseInt(match[2], 10) : 0;
      return hours + minutes / 60;
    }
  }

  // Format numérique simple "35" ou "35.5"
  const parsed = parseFloat(str);
  return isNaN(parsed) ? LEGAL_WEEKLY_HOURS : parsed;
}

/**
 * Parse une date string "YYYY-MM-DD" en objet Date LOCAL
 * IMPORTANT: Ne jamais utiliser new Date("YYYY-MM-DD") qui parse en UTC
 */
export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Convertit un objet Date en string "YYYY-MM-DD" en timezone locale
 */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Obtient le début de la semaine ISO (lundi) pour une date donnée
 */
export function getIsoWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  // Dimanche = 0, on veut Lundi = 0
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Obtient la fin de la semaine ISO (dimanche) pour une date donnée
 */
export function getIsoWeekEnd(date: Date): Date {
  const weekStart = getIsoWeekStart(date);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  return weekEnd;
}

// =============================================================================
// CALCULS QUOTIDIENS
// =============================================================================

/**
 * Calcule les heures pour une journée donnée
 */
export function calculateDailyHours(
  shifts: ShiftForCalculation[],
  employeeId: string,
  date: string
): DailyHoursResult {
  const dayShifts = shifts.filter(
    s => s.employee_id === employeeId && s.date === date && isShiftCountable(s)
  );

  let totalPlanned = 0;
  let totalActual = 0;
  let shiftsPlanned = 0;
  let shiftsActual = 0;

  for (const shift of dayShifts) {
    const duration = calculateShiftDuration(shift);

    if (isShiftActual(shift)) {
      totalActual += duration;
      shiftsActual++;
    } else {
      totalPlanned += duration;
      shiftsPlanned++;
    }
  }

  return {
    date,
    totalPlanned,
    totalActual,
    shiftsPlanned,
    shiftsActual
  };
}

// =============================================================================
// CALCULS HEBDOMADAIRES
// =============================================================================

/**
 * Calcule les heures supplémentaires (temps complet)
 *
 * Règles:
 * - Base légale: 35h/semaine
 * - 36h → 43h: majorées à 25%
 * - >43h: majorées à 50%
 */
export function calculateOvertime(totalHours: number): { overtime25: number; overtime50: number } {
  if (totalHours <= LEGAL_WEEKLY_HOURS) {
    return { overtime25: 0, overtime50: 0 };
  }

  const overtime = totalHours - LEGAL_WEEKLY_HOURS;

  if (totalHours <= OVERTIME_25_THRESHOLD) {
    // Tout en HS 25%
    return { overtime25: overtime, overtime50: 0 };
  }

  // Mix HS 25% et HS 50%
  const overtime25 = OVERTIME_25_THRESHOLD - LEGAL_WEEKLY_HOURS; // 8h
  const overtime50 = totalHours - OVERTIME_25_THRESHOLD;

  return { overtime25, overtime50 };
}

/**
 * Calcule les heures complémentaires (temps partiel)
 *
 * Règles:
 * - Base: heures contractuelles
 * - Jusqu'à +10% du contrat: majorées à 10%
 * - Au-delà: majorées à 25%
 * - Plafond: 35h/semaine max
 */
export function calculateComplementary(
  totalHours: number,
  contractHours: number
): { complementary10: number; complementary25: number; exceedsLimit: boolean } {
  if (totalHours <= contractHours) {
    return { complementary10: 0, complementary25: 0, exceedsLimit: false };
  }

  const exceedsLimit = totalHours > LEGAL_WEEKLY_HOURS;
  const complementaryTotal = Math.min(totalHours, LEGAL_WEEKLY_HOURS) - contractHours;

  if (complementaryTotal <= 0) {
    return { complementary10: 0, complementary25: 0, exceedsLimit };
  }

  // Seuil de 10% du contrat
  const threshold10 = contractHours * COMPLEMENTARY_10_PERCENT;

  if (complementaryTotal <= threshold10) {
    return { complementary10: complementaryTotal, complementary25: 0, exceedsLimit };
  }

  // Mix HC 10% et HC 25%
  return {
    complementary10: threshold10,
    complementary25: complementaryTotal - threshold10,
    exceedsLimit
  };
}

/**
 * Calcule les heures pour une semaine donnée
 */
export function calculateWeeklyHours(
  shifts: ShiftForCalculation[],
  employee: EmployeeForCalculation,
  weekStart: Date
): WeeklyHoursResult {
  const weekEnd = getIsoWeekEnd(weekStart);
  const weekStartStr = formatLocalDate(weekStart);
  const weekEndStr = formatLocalDate(weekEnd);

  const contractHoursWeekly = parseContractHours(employee.contract_hours_weekly);
  const workTimeType = employee.work_time_type || 'full_time';

  // Filtrer les shifts de la semaine pour cet employé
  const weekShifts = shifts.filter(s => {
    if (s.employee_id !== employee.id) return false;
    return s.date >= weekStartStr && s.date <= weekEndStr;
  });

  // Calculer le détail quotidien
  const dailyBreakdown: DailyHoursResult[] = [];
  let totalPlannedHours = 0;
  let totalActualHours = 0;

  // Parcourir les 7 jours de la semaine
  const currentDate = new Date(weekStart);
  for (let i = 0; i < 7; i++) {
    const dateStr = formatLocalDate(currentDate);
    const daily = calculateDailyHours(weekShifts, employee.id, dateStr);
    dailyBreakdown.push(daily);
    totalPlannedHours += daily.totalPlanned;
    totalActualHours += daily.totalActual;
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Utiliser les heures réelles si disponibles, sinon les planifiées
  const effectiveHours = totalActualHours > 0 ? totalActualHours : totalPlannedHours;

  // Calculer les heures sup/complémentaires
  let overtime25 = 0;
  let overtime50 = 0;
  let totalOvertime = 0;
  let complementary10 = 0;
  let complementary25 = 0;
  let totalComplementary = 0;
  const alerts: HoursAlert[] = [];

  if (workTimeType === 'full_time') {
    // Temps complet - calcul des heures supplémentaires
    const overtime = calculateOvertime(effectiveHours);
    overtime25 = overtime.overtime25;
    overtime50 = overtime.overtime50;
    totalOvertime = overtime25 + overtime50;

    if (totalOvertime > 0) {
      alerts.push({
        type: 'overtime_warning',
        severity: 'info',
        message: `${totalOvertime.toFixed(1)}h supplémentaires cette semaine`,
        value: totalOvertime
      });
    }

    if (effectiveHours > OVERTIME_MAX_THRESHOLD) {
      alerts.push({
        type: 'overtime_high',
        severity: 'error',
        message: `Dépassement du plafond de 48h/semaine (${effectiveHours.toFixed(1)}h)`,
        value: effectiveHours
      });
    }
  } else {
    // Temps partiel - calcul des heures complémentaires
    const complementary = calculateComplementary(effectiveHours, contractHoursWeekly);
    complementary10 = complementary.complementary10;
    complementary25 = complementary.complementary25;
    totalComplementary = complementary10 + complementary25;

    if (complementary25 > 0) {
      alerts.push({
        type: 'complementary_limit',
        severity: 'warning',
        message: `HC au-delà de 10% du contrat: ${complementary25.toFixed(1)}h majorées à 25%`,
        value: complementary25
      });
    }

    if (complementary.exceedsLimit) {
      alerts.push({
        type: 'part_time_exceeded',
        severity: 'error',
        message: `Temps partiel dépassant 35h/semaine (${effectiveHours.toFixed(1)}h)`,
        value: effectiveHours
      });
    }
  }

  return {
    weekStart: weekStartStr,
    weekEnd: weekEndStr,
    totalPlannedHours,
    totalActualHours,
    contractHoursWeekly,
    workTimeType,
    overtime25,
    overtime50,
    totalOvertime,
    complementary10,
    complementary25,
    totalComplementary,
    alerts,
    dailyBreakdown
  };
}

// =============================================================================
// CALCULS MENSUELS
// =============================================================================

/**
 * Obtient toutes les semaines (débuts de semaine ISO) qui intersectent un mois
 */
export function getWeeksInMonth(year: number, month: number): Date[] {
  const weeks: Date[] = [];
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0); // Dernier jour du mois

  // Première semaine qui contient le 1er du mois
  let currentWeekStart = getIsoWeekStart(monthStart);

  while (currentWeekStart <= monthEnd) {
    weeks.push(new Date(currentWeekStart));
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
  }

  return weeks;
}

/**
 * Calcule les heures pour un mois donné
 */
export function calculateMonthlyHours(
  shifts: ShiftForCalculation[],
  employee: EmployeeForCalculation,
  year: number,
  month: number
): MonthlyHoursResult {
  const contractHoursWeekly = parseContractHours(employee.contract_hours_weekly);
  const contractHoursMonthly = contractHoursWeekly * WEEKS_PER_MONTH;
  const workTimeType = employee.work_time_type || 'full_time';

  const weeks = getWeeksInMonth(year, month);
  const weeklyBreakdown: WeeklyHoursResult[] = [];
  const monthStartStr = formatLocalDate(new Date(year, month - 1, 1));
  const monthEndStr = formatLocalDate(new Date(year, month, 0));

  let totalPlannedHours = 0;
  let totalActualHours = 0;
  let totalOvertime25 = 0;
  let totalOvertime50 = 0;
  let totalComplementary10 = 0;
  let totalComplementary25 = 0;
  const allAlerts: HoursAlert[] = [];

  for (const weekStart of weeks) {
    const weekResult = calculateWeeklyHours(shifts, employee, weekStart);
    weeklyBreakdown.push(weekResult);

    // Pour le total mensuel, on ne compte que les jours du mois
    for (const daily of weekResult.dailyBreakdown) {
      if (daily.date >= monthStartStr && daily.date <= monthEndStr) {
        totalPlannedHours += daily.totalPlanned;
        totalActualHours += daily.totalActual;
      }
    }

    // Agréger les heures sup/complémentaires
    totalOvertime25 += weekResult.overtime25;
    totalOvertime50 += weekResult.overtime50;
    totalComplementary10 += weekResult.complementary10;
    totalComplementary25 += weekResult.complementary25;

    // Collecter les alertes
    allAlerts.push(...weekResult.alerts);
  }

  // Compter les jours travaillés
  const daysWorked = new Set<string>();
  const daysWorkedActual = new Set<string>();

  const monthShifts = shifts.filter(s => {
    if (s.employee_id !== employee.id) return false;
    return s.date >= monthStartStr && s.date <= monthEndStr && isShiftCountable(s);
  });

  for (const shift of monthShifts) {
    daysWorked.add(shift.date);
    if (isShiftActual(shift)) {
      daysWorkedActual.add(shift.date);
    }
  }

  return {
    year,
    month,
    totalPlannedHours,
    totalActualHours,
    daysWorkedPlanned: daysWorked.size,
    daysWorkedActual: daysWorkedActual.size,
    contractHoursMonthly,
    workTimeType,
    totalOvertime25,
    totalOvertime50,
    totalComplementary10,
    totalComplementary25,
    alerts: allAlerts,
    weeklyBreakdown
  };
}

// =============================================================================
// FONCTIONS D'AIDE POUR L'UI
// =============================================================================

/**
 * Détermine le total effectif à afficher (réalisé si dispo, sinon planifié)
 */
export function getEffectiveHours(result: WeeklyHoursResult | MonthlyHoursResult): number {
  if ('totalActualHours' in result && result.totalActualHours > 0) {
    return result.totalActualHours;
  }
  return result.totalPlannedHours;
}

/**
 * Vérifie s'il y a des dépassements d'heures
 */
export function hasExcess(result: WeeklyHoursResult): boolean {
  return result.totalOvertime > 0 ||
         result.totalComplementary > 0 ||
         result.alerts.some(a => a.severity === 'error');
}

/**
 * Formate les heures en string lisible (ex: "7h30")
 */
export function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}h${m.toString().padStart(2, '0')}`;
}
