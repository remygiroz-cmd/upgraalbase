/**
 * Calcul des congés payés selon la règle des jours ouvrables
 * Conformément au droit du travail et à la convention de la restauration rapide
 */

import { parseLocalDate, formatLocalDate } from './dateUtils';

/**
 * Liste des jours fériés français (dates fixes et calculées)
 * Format: "MM-DD" pour les dates fixes
 */
const FIXED_HOLIDAYS = [
  '01-01', // Jour de l'an
  '05-01', // Fête du travail
  '05-08', // Victoire 1945
  '07-14', // Fête nationale
  '08-15', // Assomption
  '11-01', // Toussaint
  '11-11', // Armistice 1918
  '12-25', // Noël
];

/**
 * Calcul des dates de Pâques et jours fériés mobiles pour une année donnée
 * Algorithme de Meeus/Jones/Butcher
 */
function getMovableHolidays(year) {
  // Calcul de Pâques
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  
  const easter = new Date(year, month - 1, day);
  
  // Lundi de Pâques (+1 jour)
  const easterMonday = new Date(easter);
  easterMonday.setDate(easterMonday.getDate() + 1);
  
  // Ascension (+39 jours)
  const ascension = new Date(easter);
  ascension.setDate(ascension.getDate() + 39);
  
  // Lundi de Pentecôte (+50 jours)
  const pentecostMonday = new Date(easter);
  pentecostMonday.setDate(pentecostMonday.getDate() + 50);
  
  return [
    formatLocalDate(easterMonday),
    formatLocalDate(ascension),
    formatLocalDate(pentecostMonday)
  ];
}

/**
 * Vérifie si une date est un jour férié
 */
export function isPublicHoliday(dateStr) {
  const date = parseLocalDate(dateStr);
  const year = date.getFullYear();
  const monthDay = dateStr.substring(5); // "MM-DD"
  
  // Vérifier les jours fériés fixes
  if (FIXED_HOLIDAYS.includes(monthDay)) {
    return true;
  }
  
  // Vérifier les jours fériés mobiles
  const movableHolidays = getMovableHolidays(year);
  return movableHolidays.includes(dateStr);
}

/**
 * Vérifie si une date est un jour ouvrable (lundi à samedi, hors fériés)
 */
function isWorkableDay(dateStr) {
  const date = parseLocalDate(dateStr);
  const dayOfWeek = date.getDay();
  
  // Dimanche = 0 → pas ouvrable
  if (dayOfWeek === 0) return false;
  
  // Jour férié → pas ouvrable
  if (isPublicHoliday(dateStr)) return false;
  
  // Lundi à samedi, non férié → ouvrable
  return true;
}

/**
 * Calcule le nombre de jours ouvrables de congé
 * 
 * @param {string} startDateStr - Date de début du congé (YYYY-MM-DD)
 * @param {string} returnDateStr - Date de reprise (YYYY-MM-DD) - NON COMPTÉE
 * @param {boolean} debug - Mode debug pour traçabilité
 * @returns {Object} { workableDays, debugInfo }
 * 
 * Règle:
 * - Date de début = date de congé posée
 * - Date de fin = veille du jour de reprise
 * - Le jour de reprise n'est jamais compté
 * - Pour chaque jour entre début et (reprise - 1):
 *   - Si lundi à samedi ET non férié → +1 jour
 *   - Sinon → ignoré
 */
export function calculatePaidLeaveDays(startDateStr, returnDateStr, debug = false) {
  if (!startDateStr || !returnDateStr) {
    return { workableDays: 0, debugInfo: [] };
  }
  
  const startDate = parseLocalDate(startDateStr);
  const returnDate = parseLocalDate(returnDateStr);
  
  // La veille de la reprise est le dernier jour de congé
  const endDate = new Date(returnDate);
  endDate.setDate(endDate.getDate() - 1);
  
  if (endDate < startDate) {
    // Cas incohérent : reprise avant ou le même jour que le début
    return { workableDays: 0, debugInfo: [] };
  }
  
  const debugInfo = [];
  let workableDays = 0;
  
  // Parcourir tous les jours du début à la veille de la reprise (inclus)
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const dateStr = formatLocalDate(currentDate);
    const date = parseLocalDate(dateStr);
    const dayOfWeek = date.getDay();
    const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const dayName = dayNames[dayOfWeek];
    
    const isSunday = dayOfWeek === 0;
    const isHoliday = isPublicHoliday(dateStr);
    const isWorkable = isWorkableDay(dateStr);
    
    if (isWorkable) {
      workableDays++;
    }
    
    if (debug) {
      debugInfo.push({
        date: dateStr,
        dayName,
        isSunday,
        isHoliday,
        isWorkable,
        counted: isWorkable
      });
    }
    
    // Jour suivant
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  if (debug) {
    console.log('🏖️ PAID LEAVE CALCULATION (jours ouvrables):', {
      startDate: startDateStr,
      returnDate: returnDateStr,
      endDate: formatLocalDate(endDate),
      workableDays,
      breakdown: debugInfo
    });
  }
  
  return { workableDays, debugInfo };
}

/**
 * Calcule les jours de congés payés pour un employé sur une période
 * en cherchant les non-shifts de type "Congés payés"
 * 
 * @param {Array} nonShiftEvents - Liste des non-shifts
 * @param {Array} nonShiftTypes - Types de non-shifts
 * @param {string} employeeId - ID de l'employé
 * @param {Date} periodStart - Début de la période
 * @param {Date} periodEnd - Fin de la période
 * @param {boolean} debug - Mode debug
 * @returns {Object} { totalPaidLeaveDays, periods, debugInfo }
 */
export function calculateEmployeePaidLeave(nonShiftEvents, nonShiftTypes, employeeId, periodStart, periodEnd, debug = false) {
  if (!nonShiftEvents || !nonShiftTypes) {
    return { totalPaidLeaveDays: 0, periods: [], debugInfo: [] };
  }
  
  const periodStartStr = formatLocalDate(periodStart);
  const periodEndStr = formatLocalDate(periodEnd);
  
  // Trouver le type "Congés payés"
  const paidLeaveType = nonShiftTypes.find(t => t.key === 'conges_payes');
  if (!paidLeaveType) {
    return { totalPaidLeaveDays: 0, periods: [], debugInfo: [] };
  }
  
  // Filtrer les congés payés de l'employé dans la période
  const employeePaidLeave = nonShiftEvents.filter(ns => 
    ns.employee_id === employeeId &&
    ns.non_shift_type_id === paidLeaveType.id &&
    ns.date >= periodStartStr &&
    ns.date <= periodEndStr
  ).sort((a, b) => a.date.localeCompare(b.date));
  
  // Regrouper les congés consécutifs en périodes
  const periods = [];
  let currentPeriod = null;
  
  for (const leave of employeePaidLeave) {
    const leaveDate = parseLocalDate(leave.date);
    
    if (!currentPeriod) {
      // Nouvelle période
      currentPeriod = {
        startDate: leave.date,
        endDate: leave.date,
        events: [leave]
      };
    } else {
      const lastDate = parseLocalDate(currentPeriod.endDate);
      const dayDiff = Math.floor((leaveDate - lastDate) / (1000 * 60 * 60 * 24));
      
      // Si le jour suivant (ou proche), étendre la période
      if (dayDiff <= 3) { // Tolérance pour dimanche + férié
        currentPeriod.endDate = leave.date;
        currentPeriod.events.push(leave);
      } else {
        // Nouvelle période
        periods.push(currentPeriod);
        currentPeriod = {
          startDate: leave.date,
          endDate: leave.date,
          events: [leave]
        };
      }
    }
  }
  
  if (currentPeriod) {
    periods.push(currentPeriod);
  }
  
  // Calculer les jours ouvrables pour chaque période
  let totalPaidLeaveDays = 0;
  const debugInfo = [];
  
  for (const period of periods) {
    // Date de reprise = jour après la fin de période
    const returnDate = new Date(parseLocalDate(period.endDate));
    returnDate.setDate(returnDate.getDate() + 1);
    const returnDateStr = formatLocalDate(returnDate);
    
    const calculation = calculatePaidLeaveDays(period.startDate, returnDateStr, debug);
    
    period.workableDays = calculation.workableDays;
    totalPaidLeaveDays += calculation.workableDays;
    
    if (debug) {
      debugInfo.push({
        period: `${period.startDate} → ${period.endDate}`,
        returnDate: returnDateStr,
        workableDays: calculation.workableDays,
        breakdown: calculation.debugInfo
      });
    }
  }
  
  return { totalPaidLeaveDays, periods, debugInfo };
}