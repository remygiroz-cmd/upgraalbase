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
 *
 * NOUVELLE LOGIQUE "HORS REPARTITION":
 * - Si un shift est sur un jour non prévu au contrat → HS/HC_HORS_REPARTITION
 * - Ces heures comptent comme heures sup/complémentaires même si total < base contrat
 * - Allocation: HS_hors d'abord, puis HS_classiques = max(total - base - HS_hors, 0)
 */

// =============================================================================
// TYPES
// =============================================================================

/** Statut d'un shift */
export type ShiftStatus = 'planned' | 'confirmed' | 'completed' | 'cancelled';

/** Type de temps de travail */
export type WorkTimeType = 'full_time' | 'part_time';

/** Jour de la semaine (format clé pour weekly_schedule) */
export type WeekdayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

/** Configuration d'un jour dans le planning hebdomadaire */
export interface DaySchedule {
  worked: boolean;
  hours: number;
}

/** Planning hebdomadaire contractuel */
export interface WeeklySchedule {
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
}

/** Politique pour les heures hors répartition */
export type OutsideContractPolicy = 'overtime' | 'normal';

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
  weekly_schedule?: WeeklySchedule | null;
}

/** Résultat du calcul quotidien (enrichi) */
export interface DailyHoursResult {
  date: string;
  dayOfWeek: WeekdayKey;
  totalPlanned: number;
  totalActual: number;
  shiftsPlanned: number;
  shiftsActual: number;
  // Nouveau: info sur le contrat
  isContractDay: boolean;         // true si jour prévu au contrat
  contractHoursForDay: number;    // heures prévues ce jour (0 si pas prévu)
  hoursOutsideContract: number;   // heures travaillées un jour non prévu
}

/** Détail des heures supplémentaires */
export interface OvertimeBreakdown {
  outsideContract: number;  // HS hors répartition (jour non prévu)
  classic25: number;        // HS classiques majorées 25% (36h-43h)
  classic50: number;        // HS classiques majorées 50% (>43h)
  total: number;            // Total HS
}

/** Détail des heures complémentaires (temps partiel) */
export interface ComplementaryBreakdown {
  outsideContract: number;  // HC hors répartition (jour non prévu)
  classic10: number;        // HC classiques majorées 10%
  classic25: number;        // HC classiques majorées 25%
  total: number;            // Total HC
  exceedsLimit: boolean;    // Dépasse 35h
}

/** Résultat du calcul hebdomadaire (enrichi) */
export interface WeeklyHoursResult {
  weekStart: string;
  weekEnd: string;

  // Totaux
  totalPlannedHours: number;
  totalActualHours: number;
  totalEffectiveHours: number;  // Actual si dispo, sinon Planned

  // Base contractuelle
  contractHoursWeekly: number;
  workTimeType: WorkTimeType;
  hasWeeklySchedule: boolean;

  // NOUVEAU: Détail des heures hors contrat
  hoursOutsideContract: number;  // Total heures sur jours non prévus

  // Temps complet - Heures supplémentaires (enrichi)
  overtime: OvertimeBreakdown;
  // Legacy fields pour compatibilité
  overtime25: number;
  overtime50: number;
  totalOvertime: number;

  // Temps partiel - Heures complémentaires (enrichi)
  complementary: ComplementaryBreakdown;
  // Legacy fields pour compatibilité
  complementary10: number;
  complementary25: number;
  totalComplementary: number;

  // Alertes
  alerts: HoursAlert[];

  // Détail par jour
  dailyBreakdown: DailyHoursResult[];
}

/** Résultat du calcul mensuel (enrichi) */
export interface MonthlyHoursResult {
  year: number;
  month: number;

  // Totaux
  totalPlannedHours: number;
  totalActualHours: number;
  totalEffectiveHours: number;

  // Jours travaillés
  daysWorkedPlanned: number;
  daysWorkedActual: number;

  // Base contractuelle
  contractHoursMonthly: number;
  workTimeType: WorkTimeType;

  // NOUVEAU: Heures hors contrat
  hoursOutsideContract: number;

  // Agrégation des heures sup (enrichi)
  overtime: OvertimeBreakdown;
  totalOvertime25: number;  // Legacy
  totalOvertime50: number;  // Legacy

  // Agrégation des heures complémentaires (enrichi)
  complementary: ComplementaryBreakdown;
  totalComplementary10: number;  // Legacy
  totalComplementary25: number;  // Legacy

  // Alertes
  alerts: HoursAlert[];

  // Détail par semaine
  weeklyBreakdown: WeeklyHoursResult[];
}

/** Type d'alerte */
export type AlertType =
  | 'overtime_warning'          // Heures sup détectées
  | 'overtime_outside_contract' // HS hors répartition détectées
  | 'overtime_high'             // >48h/semaine
  | 'complementary_limit'       // HC > 10% contrat
  | 'complementary_outside'     // HC hors répartition détectées
  | 'part_time_exceeded'        // Temps partiel > 35h
  | 'rest_insufficient'         // Repos < 11h
  | 'daily_amplitude_high';     // Amplitude > 10h/jour

/** Alerte générée par les calculs */
export interface HoursAlert {
  type: AlertType;
  severity: 'info' | 'warning' | 'error';
  message: string;
  date?: string;
  value?: number;
}

/** Override manuel pour les récap */
export interface ManualOverride {
  weekKey?: string;        // Format: YYYY-WXX
  monthKey?: string;       // Format: YYYY-MM
  employeeId: string;
  // Overrides temps complet
  overtimeTotal?: number;
  overtimeOutside?: number;
  overtimeClassic?: number;
  // Overrides temps partiel
  complementaryTotal?: number;
  complementaryOutside?: number;
  complementaryClassic?: number;
  // Méta
  reason?: string;
  updatedAt: string;
  updatedBy: string;
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

/** Mapping jour de semaine JS (0-6) vers clé WeeklySchedule */
const JS_DAY_TO_KEY: WeekdayKey[] = [
  'sunday',    // 0
  'monday',    // 1
  'tuesday',   // 2
  'wednesday', // 3
  'thursday',  // 4
  'friday',    // 5
  'saturday'   // 6
];

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

/**
 * Convertit une date string en clé de jour de semaine
 */
export function getWeekdayKey(dateStr: string): WeekdayKey {
  const date = parseLocalDate(dateStr);
  return JS_DAY_TO_KEY[date.getDay()];
}

/**
 * Vérifie si un jour est prévu dans le planning contractuel
 */
export function isDayInContract(
  dateStr: string,
  weeklySchedule: WeeklySchedule | null | undefined
): { isContractDay: boolean; contractHours: number } {
  if (!weeklySchedule) {
    // Pas de planning défini = tous les jours sont considérés comme "dans le contrat"
    return { isContractDay: true, contractHours: 0 };
  }

  const dayKey = getWeekdayKey(dateStr);
  const daySchedule = weeklySchedule[dayKey];

  if (!daySchedule) {
    return { isContractDay: true, contractHours: 0 };
  }

  const isContractDay = daySchedule.worked === true && (daySchedule.hours > 0);
  const contractHours = daySchedule.worked ? (daySchedule.hours || 0) : 0;

  return { isContractDay, contractHours };
}

/**
 * Vérifie si un weekly_schedule est défini et valide
 */
export function hasValidWeeklySchedule(schedule: WeeklySchedule | null | undefined): boolean {
  if (!schedule) return false;

  // Vérifie qu'au moins un jour est coché avec des heures > 0
  const days: WeekdayKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  return days.some(day => {
    const daySchedule = schedule[day];
    return daySchedule && daySchedule.worked === true && daySchedule.hours > 0;
  });
}

// =============================================================================
// CALCULS QUOTIDIENS
// =============================================================================

/**
 * Calcule les heures pour une journée donnée (enrichi avec info contrat)
 */
export function calculateDailyHours(
  shifts: ShiftForCalculation[],
  employeeId: string,
  date: string,
  weeklySchedule: WeeklySchedule | null | undefined
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

  // Déterminer si ce jour est dans le contrat
  const { isContractDay, contractHours } = isDayInContract(date, weeklySchedule);
  const dayOfWeek = getWeekdayKey(date);

  // Heures effectives (actual si dispo, sinon planned)
  const effectiveHours = totalActual > 0 ? totalActual : totalPlanned;

  // Si le jour n'est pas prévu au contrat, toutes les heures sont "hors contrat"
  const hoursOutsideContract = !isContractDay ? effectiveHours : 0;

  return {
    date,
    dayOfWeek,
    totalPlanned,
    totalActual,
    shiftsPlanned,
    shiftsActual,
    isContractDay,
    contractHoursForDay: contractHours,
    hoursOutsideContract
  };
}

// =============================================================================
// CALCULS HEBDOMADAIRES
// =============================================================================

/**
 * Calcule les heures supplémentaires avec distinction hors répartition / classiques
 *
 * LOGIQUE:
 * 1. hoursOutsideContract = somme des heures sur jours non prévus → HS_HORS
 * 2. totalOverWeekly = max(effectiveHours - contractHoursWeekly, 0)
 * 3. HS_classiques = max(totalOverWeekly - hoursOutsideContract, 0)
 * 4. HS_total = HS_hors + HS_classiques (peut être > 0 même si effectiveHours <= 35h)
 */
export function calculateOvertimeWithOutsideContract(
  effectiveHours: number,
  contractHoursWeekly: number,
  hoursOutsideContract: number,
  policy: OutsideContractPolicy = 'overtime'
): OvertimeBreakdown {
  // Si policy = 'normal', on ignore le hors contrat et on calcule comme avant
  if (policy === 'normal') {
    const { overtime25, overtime50 } = calculateOvertime(effectiveHours);
    return {
      outsideContract: 0,
      classic25: overtime25,
      classic50: overtime50,
      total: overtime25 + overtime50
    };
  }

  // Policy = 'overtime' (défaut)
  // Les heures hors répartition sont toujours considérées comme HS
  const outsideContract = hoursOutsideContract;

  // Heures au-delà de la base contractuelle
  const totalOverContract = Math.max(effectiveHours - contractHoursWeekly, 0);

  // HS classiques = ce qui dépasse le contrat MOINS ce qui est déjà compté comme "hors répartition"
  const classicOvertime = Math.max(totalOverContract - hoursOutsideContract, 0);

  // Répartition des HS classiques en 25% et 50%
  let classic25 = 0;
  let classic50 = 0;

  if (classicOvertime > 0) {
    // Les HS classiques commencent à partir de la base (35h pour temps plein)
    // Seuil 25%: 35h → 43h (8h)
    // Seuil 50%: >43h
    const threshold25Max = OVERTIME_25_THRESHOLD - LEGAL_WEEKLY_HOURS; // 8h

    if (classicOvertime <= threshold25Max) {
      classic25 = classicOvertime;
    } else {
      classic25 = threshold25Max;
      classic50 = classicOvertime - threshold25Max;
    }
  }

  const total = outsideContract + classic25 + classic50;

  return {
    outsideContract,
    classic25,
    classic50,
    total
  };
}

/**
 * Calcule les heures supplémentaires (temps complet) - Version legacy
 */
export function calculateOvertime(totalHours: number): { overtime25: number; overtime50: number } {
  if (totalHours <= LEGAL_WEEKLY_HOURS) {
    return { overtime25: 0, overtime50: 0 };
  }

  const overtime = totalHours - LEGAL_WEEKLY_HOURS;

  if (totalHours <= OVERTIME_25_THRESHOLD) {
    return { overtime25: overtime, overtime50: 0 };
  }

  const overtime25 = OVERTIME_25_THRESHOLD - LEGAL_WEEKLY_HOURS;
  const overtime50 = totalHours - OVERTIME_25_THRESHOLD;

  return { overtime25, overtime50 };
}

/**
 * Calcule les heures complémentaires avec distinction hors répartition / classiques (temps partiel)
 */
export function calculateComplementaryWithOutsideContract(
  effectiveHours: number,
  contractHoursWeekly: number,
  hoursOutsideContract: number,
  policy: OutsideContractPolicy = 'overtime'
): ComplementaryBreakdown {
  if (policy === 'normal') {
    const result = calculateComplementary(effectiveHours, contractHoursWeekly);
    return {
      outsideContract: 0,
      classic10: result.complementary10,
      classic25: result.complementary25,
      total: result.complementary10 + result.complementary25,
      exceedsLimit: result.exceedsLimit
    };
  }

  // Policy = 'overtime'
  const outsideContract = hoursOutsideContract;
  const exceedsLimit = effectiveHours > LEGAL_WEEKLY_HOURS;

  // Heures au-delà du contrat (plafonnées à 35h)
  const effectiveCapped = Math.min(effectiveHours, LEGAL_WEEKLY_HOURS);
  const totalOverContract = Math.max(effectiveCapped - contractHoursWeekly, 0);

  // HC classiques = dépassement - hors répartition
  const classicComplementary = Math.max(totalOverContract - hoursOutsideContract, 0);

  // Répartition en 10% et 25%
  const threshold10 = contractHoursWeekly * COMPLEMENTARY_10_PERCENT;
  let classic10 = 0;
  let classic25 = 0;

  if (classicComplementary > 0) {
    if (classicComplementary <= threshold10) {
      classic10 = classicComplementary;
    } else {
      classic10 = threshold10;
      classic25 = classicComplementary - threshold10;
    }
  }

  const total = outsideContract + classic10 + classic25;

  return {
    outsideContract,
    classic10,
    classic25,
    total,
    exceedsLimit
  };
}

/**
 * Calcule les heures complémentaires (temps partiel) - Version legacy
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

  const threshold10 = contractHours * COMPLEMENTARY_10_PERCENT;

  if (complementaryTotal <= threshold10) {
    return { complementary10: complementaryTotal, complementary25: 0, exceedsLimit };
  }

  return {
    complementary10: threshold10,
    complementary25: complementaryTotal - threshold10,
    exceedsLimit
  };
}

/**
 * Calcule les heures pour une semaine donnée (enrichi)
 */
export function calculateWeeklyHours(
  shifts: ShiftForCalculation[],
  employee: EmployeeForCalculation,
  weekStart: Date,
  policy: OutsideContractPolicy = 'overtime'
): WeeklyHoursResult {
  const weekEnd = getIsoWeekEnd(weekStart);
  const weekStartStr = formatLocalDate(weekStart);
  const weekEndStr = formatLocalDate(weekEnd);

  const contractHoursWeekly = parseContractHours(employee.contract_hours_weekly);
  const workTimeType = employee.work_time_type || 'full_time';
  const weeklySchedule = employee.weekly_schedule;
  const hasSchedule = hasValidWeeklySchedule(weeklySchedule);

  // Filtrer les shifts de la semaine pour cet employé
  const weekShifts = shifts.filter(s => {
    if (s.employee_id !== employee.id) return false;
    return s.date >= weekStartStr && s.date <= weekEndStr;
  });

  // Calculer le détail quotidien
  const dailyBreakdown: DailyHoursResult[] = [];
  let totalPlannedHours = 0;
  let totalActualHours = 0;
  let hoursOutsideContract = 0;

  // Parcourir les 7 jours de la semaine
  const currentDate = new Date(weekStart);
  for (let i = 0; i < 7; i++) {
    const dateStr = formatLocalDate(currentDate);
    const daily = calculateDailyHours(weekShifts, employee.id, dateStr, weeklySchedule);
    dailyBreakdown.push(daily);
    totalPlannedHours += daily.totalPlanned;
    totalActualHours += daily.totalActual;
    hoursOutsideContract += daily.hoursOutsideContract;
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Heures effectives (actual si dispo, sinon planned)
  const totalEffectiveHours = totalActualHours > 0 ? totalActualHours : totalPlannedHours;

  // Calculer les heures sup/complémentaires avec la nouvelle logique
  const alerts: HoursAlert[] = [];
  let overtime: OvertimeBreakdown = { outsideContract: 0, classic25: 0, classic50: 0, total: 0 };
  let complementary: ComplementaryBreakdown = { outsideContract: 0, classic10: 0, classic25: 0, total: 0, exceedsLimit: false };

  if (workTimeType === 'full_time') {
    // Temps complet - calcul des heures supplémentaires avec hors répartition
    overtime = calculateOvertimeWithOutsideContract(
      totalEffectiveHours,
      contractHoursWeekly,
      hoursOutsideContract,
      hasSchedule ? policy : 'normal' // Si pas de schedule, pas de distinction
    );

    // Alertes
    if (overtime.outsideContract > 0) {
      alerts.push({
        type: 'overtime_outside_contract',
        severity: 'warning',
        message: `${overtime.outsideContract.toFixed(1)}h hors répartition contractuelle`,
        value: overtime.outsideContract
      });
    }

    if (overtime.total > 0) {
      alerts.push({
        type: 'overtime_warning',
        severity: 'info',
        message: `${overtime.total.toFixed(1)}h supplémentaires cette semaine`,
        value: overtime.total
      });
    }

    if (totalEffectiveHours > OVERTIME_MAX_THRESHOLD) {
      alerts.push({
        type: 'overtime_high',
        severity: 'error',
        message: `Dépassement du plafond de 48h/semaine (${totalEffectiveHours.toFixed(1)}h)`,
        value: totalEffectiveHours
      });
    }
  } else {
    // Temps partiel - calcul des heures complémentaires avec hors répartition
    complementary = calculateComplementaryWithOutsideContract(
      totalEffectiveHours,
      contractHoursWeekly,
      hoursOutsideContract,
      hasSchedule ? policy : 'normal'
    );

    // Alertes
    if (complementary.outsideContract > 0) {
      alerts.push({
        type: 'complementary_outside',
        severity: 'warning',
        message: `${complementary.outsideContract.toFixed(1)}h complémentaires hors répartition`,
        value: complementary.outsideContract
      });
    }

    if (complementary.classic25 > 0) {
      alerts.push({
        type: 'complementary_limit',
        severity: 'warning',
        message: `HC au-delà de 10% du contrat: ${complementary.classic25.toFixed(1)}h majorées à 25%`,
        value: complementary.classic25
      });
    }

    if (complementary.exceedsLimit) {
      alerts.push({
        type: 'part_time_exceeded',
        severity: 'error',
        message: `Temps partiel dépassant 35h/semaine (${totalEffectiveHours.toFixed(1)}h)`,
        value: totalEffectiveHours
      });
    }
  }

  return {
    weekStart: weekStartStr,
    weekEnd: weekEndStr,
    totalPlannedHours,
    totalActualHours,
    totalEffectiveHours,
    contractHoursWeekly,
    workTimeType,
    hasWeeklySchedule: hasSchedule,
    hoursOutsideContract,
    // Nouveau format enrichi
    overtime,
    complementary,
    // Legacy fields pour compatibilité
    overtime25: overtime.classic25,
    overtime50: overtime.classic50,
    totalOvertime: overtime.total,
    complementary10: complementary.classic10,
    complementary25: complementary.classic25,
    totalComplementary: complementary.total,
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
  const monthEnd = new Date(year, month, 0);

  let currentWeekStart = getIsoWeekStart(monthStart);

  while (currentWeekStart <= monthEnd) {
    weeks.push(new Date(currentWeekStart));
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
  }

  return weeks;
}

/**
 * Calcule les heures pour un mois donné (enrichi)
 */
export function calculateMonthlyHours(
  shifts: ShiftForCalculation[],
  employee: EmployeeForCalculation,
  year: number,
  month: number,
  policy: OutsideContractPolicy = 'overtime'
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
  let hoursOutsideContract = 0;

  // Agrégation overtime/complementary
  const overtime: OvertimeBreakdown = { outsideContract: 0, classic25: 0, classic50: 0, total: 0 };
  const complementary: ComplementaryBreakdown = { outsideContract: 0, classic10: 0, classic25: 0, total: 0, exceedsLimit: false };
  const allAlerts: HoursAlert[] = [];

  for (const weekStart of weeks) {
    const weekResult = calculateWeeklyHours(shifts, employee, weekStart, policy);
    weeklyBreakdown.push(weekResult);

    // Pour le total mensuel, on ne compte que les jours du mois
    for (const daily of weekResult.dailyBreakdown) {
      if (daily.date >= monthStartStr && daily.date <= monthEndStr) {
        totalPlannedHours += daily.totalPlanned;
        totalActualHours += daily.totalActual;
        hoursOutsideContract += daily.hoursOutsideContract;
      }
    }

    // Agréger overtime
    overtime.outsideContract += weekResult.overtime.outsideContract;
    overtime.classic25 += weekResult.overtime.classic25;
    overtime.classic50 += weekResult.overtime.classic50;
    overtime.total += weekResult.overtime.total;

    // Agréger complementary
    complementary.outsideContract += weekResult.complementary.outsideContract;
    complementary.classic10 += weekResult.complementary.classic10;
    complementary.classic25 += weekResult.complementary.classic25;
    complementary.total += weekResult.complementary.total;
    if (weekResult.complementary.exceedsLimit) {
      complementary.exceedsLimit = true;
    }

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

  const totalEffectiveHours = totalActualHours > 0 ? totalActualHours : totalPlannedHours;

  return {
    year,
    month,
    totalPlannedHours,
    totalActualHours,
    totalEffectiveHours,
    daysWorkedPlanned: daysWorked.size,
    daysWorkedActual: daysWorkedActual.size,
    contractHoursMonthly,
    workTimeType,
    hoursOutsideContract,
    // Nouveau format enrichi
    overtime,
    complementary,
    // Legacy fields
    totalOvertime25: overtime.classic25,
    totalOvertime50: overtime.classic50,
    totalComplementary10: complementary.classic10,
    totalComplementary25: complementary.classic25,
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
  return result.totalEffectiveHours;
}

/**
 * Vérifie s'il y a des dépassements d'heures
 */
export function hasExcess(result: WeeklyHoursResult): boolean {
  return result.overtime.total > 0 ||
         result.complementary.total > 0 ||
         result.alerts.some(a => a.severity === 'error');
}

/**
 * Vérifie s'il y a des heures hors répartition
 */
export function hasOutsideContractHours(result: WeeklyHoursResult | MonthlyHoursResult): boolean {
  return result.hoursOutsideContract > 0;
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

/**
 * Formate les heures en format HH:MM
 */
export function formatHoursHHMM(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}
