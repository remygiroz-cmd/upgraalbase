/**
 * Vérifications et utilitaires pour le planning
 *
 * Note: Les calculs d'heures sont maintenant dans /lib/weeklyHoursCalculation.ts
 */
import { formatLocalDate } from './dateUtils';

/**
 * Calcule la durée d'un shift en heures avec conversion stricte
 * Règle: 15min = 0.25h, 30min = 0.5h, 45min = 0.75h
 */
export const calculateShiftDuration = (shift) => {
  const [startH, startM] = shift.start_time.split(':').map(Number);
  const [endH, endM] = shift.end_time.split(':').map(Number);

  let totalMinutes = (endH * 60 + endM) - (startH * 60 + startM);
  if (totalMinutes < 0) totalMinutes += 24 * 60;

  totalMinutes -= (shift.break_minutes || 0);
  
  // Conversion stricte: arrondir au quart d'heure inférieur puis convertir
  const roundedMinutes = Math.floor(totalMinutes / 15) * 15;
  return Math.max(0, roundedMinutes / 60);
};

/**
 * Vérifie le repos minimum de 11h entre shifts (sur des jours différents)
 */
export const checkMinimumRest = (shifts, newShift) => {
  const sortedShifts = [...shifts, newShift].sort((a, b) => {
    const dateA = new Date(a.date + 'T' + a.end_time);
    const dateB = new Date(b.date + 'T' + b.end_time);
    return dateA - dateB;
  });

  for (let i = 0; i < sortedShifts.length - 1; i++) {
    const current = sortedShifts[i];
    const next = sortedShifts[i + 1];

    // Si les shifts sont le même jour, pas de vérification
    if (current.date === next.date) {
      continue;
    }

    const currentEnd = new Date(current.date + 'T' + current.end_time);
    const nextStart = new Date(next.date + 'T' + next.start_time);

    const restHours = (nextStart - currentEnd) / (1000 * 60 * 60);

    if (restHours < 11) {
      return {
        valid: false,
        message: `Repos insuffisant (${restHours.toFixed(1)}h). Minimum légal : 11h entre deux shifts.`
      };
    }
  }

  return { valid: true };
};

/**
 * Vérifie l'amplitude journalière (alerte si > 10h)
 */
export const checkDailyHours = (shifts) => {
  const totalDuration = shifts.reduce((sum, shift) => sum + calculateShiftDuration(shift), 0);

  if (totalDuration > 10) {
    return {
      warning: true,
      message: `Amplitude journalière de ${totalDuration.toFixed(1)}h dépasse les 10h recommandées.`
    };
  }

  return { warning: false };
};

/**
 * Calcule le total des heures d'une semaine (version simple pour compatibilité)
 * @deprecated Utiliser calculateWeeklyHours de /lib/weeklyHoursCalculation.ts
 */
export const calculateWeeklyHours = (shifts, employeeId, weekStart) => {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const weekStartStr = formatLocalDate(weekStart);
  const weekEndStr = formatLocalDate(weekEnd);

  const weekShifts = shifts.filter(s => {
    if (s.employee_id !== employeeId) return false;
    return s.date >= weekStartStr && s.date <= weekEndStr;
  });

  const totalHours = weekShifts.reduce((sum, shift) => sum + calculateShiftDuration(shift), 0);

  return {
    total: totalHours,
    shiftsCount: weekShifts.length
  };
};

/**
 * Vérifie si un employé est en absence/congé à une date donnée
 */
export const checkConflictingAbsence = (absences, date, employeeId) => {
  return absences.some(absence => {
    if (absence.employee_id !== employeeId) return false;
    const absenceStart = new Date(absence.start_date);
    const absenceEnd = new Date(absence.end_date);
    const checkDate = new Date(date);
    return checkDate >= absenceStart && checkDate <= absenceEnd;
  });
};