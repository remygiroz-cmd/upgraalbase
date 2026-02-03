/**
 * Détection et calcul des périodes de congés payés
 * basé sur les non-shifts "Congé payé" posés dans le planning
 * et les shifts réels de l'employé
 */

import { parseLocalDate, formatLocalDate } from './dateUtils';
import { calculatePaidLeaveDays, isPublicHoliday } from './PaidLeaveCalculations';

/**
 * Détecte les périodes de congés payés pour un employé
 * en analysant les non-shifts CP posés et les shifts réels
 * 
 * @param {Array} shifts - Tous les shifts de l'employé
 * @param {Array} nonShiftEvents - Tous les non-shifts de l'employé
 * @param {Array} nonShiftTypes - Types de non-shifts
 * @param {string} employeeId - ID de l'employé
 * @param {Date} periodStart - Début de la période (mois)
 * @param {Date} periodEnd - Fin de la période (mois)
 * @param {boolean} debug - Mode debug
 * @returns {Array} Liste des périodes CP détectées avec calcul
 */
export function detectPaidLeavePeriods(shifts, nonShiftEvents, nonShiftTypes, employeeId, periodStart, periodEnd, debug = false) {
  if (!shifts || !nonShiftEvents || !nonShiftTypes) {
    return [];
  }
  
  const periodStartStr = formatLocalDate(periodStart);
  const periodEndStr = formatLocalDate(periodEnd);
  
  // Trouver le type "Congés payés"
  const paidLeaveType = nonShiftTypes.find(t => t.key === 'conges_payes');
  if (!paidLeaveType) {
    return [];
  }
  
  // Filtrer les shifts de l'employé dans la période (et autour pour contexte)
  const employeeShifts = shifts
    .filter(s => s.employee_id === employeeId)
    .sort((a, b) => a.date.localeCompare(b.date));
  
  // Filtrer les non-shifts "Congé payé" de l'employé dans la période
  const paidLeaveEvents = nonShiftEvents
    .filter(ns => 
      ns.employee_id === employeeId &&
      ns.non_shift_type_id === paidLeaveType.id &&
      ns.date >= periodStartStr &&
      ns.date <= periodEndStr
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  
  if (paidLeaveEvents.length === 0) {
    return [];
  }
  
  // Regrouper les non-shifts CP consécutifs ou proches en séquences
  const sequences = [];
  let currentSeq = null;
  
  for (const leave of paidLeaveEvents) {
    const leaveDate = parseLocalDate(leave.date);
    
    if (!currentSeq) {
      currentSeq = {
        nonShifts: [leave],
        firstDate: leave.date,
        lastDate: leave.date
      };
    } else {
      const lastDate = parseLocalDate(currentSeq.lastDate);
      const dayDiff = Math.floor((leaveDate - lastDate) / (1000 * 60 * 60 * 24));
      
      // Si moins de 5 jours d'écart, considérer comme même séquence
      // (permet de gérer dimanche + férié entre deux CP)
      if (dayDiff <= 5) {
        currentSeq.nonShifts.push(leave);
        currentSeq.lastDate = leave.date;
      } else {
        // Nouvelle séquence
        sequences.push(currentSeq);
        currentSeq = {
          nonShifts: [leave],
          firstDate: leave.date,
          lastDate: leave.date
        };
      }
    }
  }
  
  if (currentSeq) {
    sequences.push(currentSeq);
  }
  
  // Pour chaque séquence, déterminer les bornes et calculer les CP
  const periods = [];
  
  for (const seq of sequences) {
    const firstCPDate = parseLocalDate(seq.firstDate);
    const lastCPDate = parseLocalDate(seq.lastDate);
    
    // Trouver le dernier shift AVANT le premier CP
    const lastShiftBefore = employeeShifts
      .filter(s => s.date < seq.firstDate)
      .pop();
    
    // Trouver le premier shift APRÈS le dernier CP
    const firstShiftAfter = employeeShifts
      .find(s => s.date > seq.lastDate);
    
    // Déterminer startCP
    let startCP;
    if (lastShiftBefore) {
      const lastShiftDate = parseLocalDate(lastShiftBefore.date);
      const nextDay = new Date(lastShiftDate);
      nextDay.setDate(nextDay.getDate() + 1);
      startCP = formatLocalDate(nextDay);
    } else {
      // Pas de shift avant : commencer au premier CP posé
      startCP = seq.firstDate;
    }
    
    // Déterminer endCP
    let endCP;
    let isProvisional = false;
    if (firstShiftAfter) {
      const returnDate = parseLocalDate(firstShiftAfter.date);
      const dayBefore = new Date(returnDate);
      dayBefore.setDate(dayBefore.getDate() - 1);
      endCP = formatLocalDate(dayBefore);
    } else {
      // Pas de shift de reprise : prendre fin du mois (provisoire)
      endCP = periodEndStr;
      isProvisional = true;
    }
    
    // Calculer les jours ouvrables décomptés
    const returnDate = new Date(parseLocalDate(endCP));
    returnDate.setDate(returnDate.getDate() + 1);
    const returnDateStr = formatLocalDate(returnDate);
    
    const calculation = calculatePaidLeaveDays(startCP, returnDateStr, debug);
    
    const period = {
      startCP,
      endCP,
      returnDate: firstShiftAfter ? firstShiftAfter.date : null,
      isProvisional,
      workableDaysDeducted: calculation.workableDays,
      nonShiftsPosted: seq.nonShifts.length,
      firstCPPosted: seq.firstDate,
      lastCPPosted: seq.lastDate,
      lastShiftBefore: lastShiftBefore ? lastShiftBefore.date : null,
      firstShiftAfter: firstShiftAfter ? firstShiftAfter.date : null,
      breakdown: calculation.debugInfo
    };
    
    periods.push(period);
    
    if (debug) {
      console.log('🏖️ CP PERIOD DETECTED:', {
        employeeId,
        firstCPPosted: seq.firstDate,
        lastCPPosted: seq.lastDate,
        lastShiftBefore: lastShiftBefore?.date || 'none',
        firstShiftAfter: firstShiftAfter?.date || 'none',
        startCP,
        endCP,
        isProvisional,
        workableDaysDeducted: calculation.workableDays,
        breakdown: calculation.debugInfo
      });
    }
  }
  
  return periods;
}

/**
 * Vérifie si une date fait partie d'une période CP décomptée
 * 
 * @param {string} dateStr - Date à vérifier (YYYY-MM-DD)
 * @param {Array} cpPeriods - Périodes CP détectées
 * @returns {Object|null} { period, isDeducted } ou null
 */
export function isDateInPaidLeavePeriod(dateStr, cpPeriods) {
  if (!cpPeriods || cpPeriods.length === 0) return null;
  
  for (const period of cpPeriods) {
    if (dateStr >= period.startCP && dateStr <= period.endCP) {
      // Vérifier si c'est un jour ouvrable (donc décompté)
      const date = parseLocalDate(dateStr);
      const dayOfWeek = date.getDay();
      const isSunday = dayOfWeek === 0;
      const isHoliday = isPublicHoliday(dateStr);
      const isDeducted = !isSunday && !isHoliday;
      
      return {
        period,
        isDeducted,
        isLastDay: dateStr === period.endCP
      };
    }
  }
  
  return null;
}

/**
 * Calcule le total de CP décomptés pour un employé sur une période
 * 
 * @param {Array} cpPeriods - Périodes CP détectées
 * @returns {number} Total jours CP décomptés
 */
export function getTotalPaidLeaveDays(cpPeriods) {
  if (!cpPeriods || cpPeriods.length === 0) return 0;
  
  return cpPeriods.reduce((sum, period) => sum + period.workableDaysDeducted, 0);
}