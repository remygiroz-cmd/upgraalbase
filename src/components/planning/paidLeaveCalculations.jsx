/**
 * Calculs pour les périodes de Congés Payés (CP)
 * Règle légale : décompte en jours ouvrables (lundi à samedi, hors dimanches et jours fériés)
 */

import { parseLocalDate, formatLocalDate } from './dateUtils';

/**
 * Jours fériés français 2026 (à étendre selon les besoins)
 */
const JOURS_FERIES_2026 = [
  '2026-01-01', // Jour de l'An
  '2026-04-06', // Lundi de Pâques
  '2026-05-01', // Fête du Travail
  '2026-05-08', // Victoire 1945
  '2026-05-14', // Ascension
  '2026-05-25', // Lundi de Pentecôte
  '2026-07-14', // Fête Nationale
  '2026-08-15', // Assomption
  '2026-11-01', // Toussaint
  '2026-11-11', // Armistice 1918
  '2026-12-25', // Noël
];

/**
 * Calcule les dates de début et fin de la période CP
 * @param {string} lastWorkDay - Dernier jour travaillé (YYYY-MM-DD)
 * @param {string} firstWorkDayAfter - Jour de reprise (YYYY-MM-DD)
 * @returns {Object} { startCP, endCP }
 */
export function calculateCPPeriod(lastWorkDay, firstWorkDayAfter) {
  const lastDate = parseLocalDate(lastWorkDay);
  const firstDate = parseLocalDate(firstWorkDayAfter);
  
  // startCP = lendemain du dernier jour travaillé
  const startCP = new Date(lastDate);
  startCP.setDate(startCP.getDate() + 1);
  
  // endCP = veille du jour de reprise
  const endCP = new Date(firstDate);
  endCP.setDate(endCP.getDate() - 1);
  
  return {
    startCP: formatLocalDate(startCP),
    endCP: formatLocalDate(endCP)
  };
}

/**
 * Vérifie si une date est un dimanche
 */
function isSunday(date) {
  return date.getDay() === 0;
}

/**
 * Vérifie si une date est un jour férié
 */
function isPublicHoliday(dateStr) {
  return JOURS_FERIES_2026.includes(dateStr);
}

/**
 * Calcule le nombre de jours ouvrables dans une période CP
 * Jours ouvrables = lundi à samedi (hors dimanches et jours fériés)
 * @param {string} startCP - Date de début (YYYY-MM-DD)
 * @param {string} endCP - Date de fin (YYYY-MM-DD)
 * @param {boolean} debug - Mode debug
 * @returns {Object} { totalDays, countedDays, excludedDays, details }
 */
export function calculateCPDays(startCP, endCP, debug = false) {
  const start = parseLocalDate(startCP);
  const end = parseLocalDate(endCP);
  
  const details = [];
  let countedDays = 0;
  let excludedDays = 0;
  
  let currentDate = new Date(start);
  while (currentDate <= end) {
    const dateStr = formatLocalDate(currentDate);
    const sunday = isSunday(currentDate);
    const holiday = isPublicHoliday(dateStr);
    
    const excluded = sunday || holiday;
    
    if (!excluded) {
      countedDays++;
    } else {
      excludedDays++;
    }
    
    if (debug) {
      details.push({
        date: dateStr,
        dayName: currentDate.toLocaleDateString('fr-FR', { weekday: 'short' }),
        counted: !excluded,
        reason: sunday ? 'Dimanche' : (holiday ? 'Jour férié' : '')
      });
    }
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  const totalDays = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
  
  return {
    totalDays,
    countedDays,
    excludedDays,
    details: debug ? details : null
  };
}

/**
 * Calcule le total de jours CP pour un employé sur un mois donné
 * @param {Array} periods - Périodes CP de l'employé
 * @param {Date} monthStart - Début du mois
 * @param {Date} monthEnd - Fin du mois
 * @returns {number} Total CP sur le mois
 */
export function calculateMonthlyCPTotal(periods, monthStart, monthEnd) {
  const monthStartStr = formatLocalDate(monthStart);
  const monthEndStr = formatLocalDate(monthEnd);
  
  let total = 0;
  
  periods.forEach(period => {
    // Vérifier si la période intersecte le mois
    if (period.end_cp < monthStartStr || period.start_cp > monthEndStr) {
      return; // Pas d'intersection
    }
    
    // Calculer l'intersection
    const intersectStart = period.start_cp >= monthStartStr ? period.start_cp : monthStartStr;
    const intersectEnd = period.end_cp <= monthEndStr ? period.end_cp : monthEndStr;
    
    // Calculer les jours ouvrables dans l'intersection
    const result = calculateCPDays(intersectStart, intersectEnd);
    total += result.countedDays;
  });
  
  return total;
}

/**
 * Vérifie si une date est dans une période CP
 * @param {string} dateStr - Date à vérifier (YYYY-MM-DD)
 * @param {Array} periods - Liste des périodes CP
 * @returns {Object|null} Période correspondante ou null
 */
export function isDateInCPPeriod(dateStr, periods) {
  return periods.find(p => dateStr >= p.start_cp && dateStr <= p.end_cp) || null;
}