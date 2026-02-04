// Calculs des heures supplémentaires et complémentaires
// Convention collective restauration rapide

import { calculateShiftDuration } from './LegalChecks';
import { parseLocalDate, formatLocalDate } from './dateUtils';
import { calculateNonShiftGeneratedHours } from './NonShiftHoursCalculations';

/**
 * Calcule les heures supplémentaires en mode hebdomadaire
 * Pour temps plein (35h/semaine)
 */
export const calculateWeeklyOvertime = (weeklyHours) => {
  if (weeklyHours <= 35) {
    return {
      normal: weeklyHours,
      overtime_25: 0,
      overtime_50: 0,
      total_overtime: 0
    };
  }

  const overtime = weeklyHours - 35;
  const overtime_25 = Math.min(overtime, 8); // 36h à 43h
  const overtime_50 = Math.max(0, overtime - 8); // au-delà de 43h

  return {
    normal: 35,
    overtime_25,
    overtime_50,
    total_overtime: overtime
  };
};

/**
 * Calcule les heures complémentaires en mode hebdomadaire
 * Pour temps partiel
 */
export const calculateWeeklyComplementary = (weeklyHours, contractHoursWeekly) => {
  if (!contractHoursWeekly || weeklyHours <= contractHoursWeekly) {
    return {
      normal: weeklyHours,
      complementary_10: 0,
      complementary_25: 0,
      total_complementary: 0,
      exceeds_limit: false
    };
  }

  const complementary = weeklyHours - contractHoursWeekly;
  const limit_10_percent = contractHoursWeekly * 0.10;
  const max_allowed = contractHoursWeekly / 3; // Plafond 1/3

  const complementary_10 = Math.min(complementary, limit_10_percent);
  const complementary_25 = Math.min(Math.max(0, complementary - limit_10_percent), max_allowed - complementary_10);
  
  const exceeds_limit = complementary > max_allowed;

  return {
    normal: contractHoursWeekly,
    complementary_10,
    complementary_25,
    total_complementary: complementary_10 + complementary_25,
    exceeds_limit
  };
};

/**
 * Calcule les heures pour un employé sur une semaine (mode hebdomadaire)
 * Semaine = Lundi → Dimanche (ISO week)
 */
export const calculateWeeklyEmployeeHours = (shifts, employeeId, weekStart, employee, debug = false, nonShiftEvents = [], nonShiftTypes = []) => {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  
  const weekStartStr = formatLocalDate(weekStart);
  const weekEndStr = formatLocalDate(weekEnd);
  
  const debugInfo = [];
  
  // Filter shifts in week range - using string comparison for date-only (no timezone issues)
  const weekShifts = shifts.filter(s => {
    if (s.employee_id !== employeeId) return false;
    
    // Compare dates as strings (YYYY-MM-DD) - inclusive range [weekStartStr, weekEndStr]
    const included = s.date >= weekStartStr && s.date <= weekEndStr;
    
    if (debug) {
      const duration = included ? calculateShiftDuration(s) : 0;
      debugInfo.push({
        type: 'shift',
        date: s.date,
        duration: duration.toFixed(2),
        durationMinutes: included ? Math.round(duration * 60) : 0,
        included
      });
    }
    
    return included;
  });
  
  // Calculer heures des shifts réels
  const shiftHours = weekShifts.reduce((sum, shift) => sum + calculateShiftDuration(shift), 0);
  
  // Filtrer les non-shifts de la semaine
  const weekNonShifts = nonShiftEvents.filter(ns => {
    if (ns.employee_id !== employeeId) return false;
    return ns.date >= weekStartStr && ns.date <= weekEndStr;
  });
  
  // Calculer heures générées par les non-shifts
  const nonShiftResult = calculateNonShiftGeneratedHours(weekNonShifts, nonShiftTypes, employee, debug);
  
  // Total = shifts réels + heures générées
  const totalHours = shiftHours + nonShiftResult.totalHours;
  
  if (debug) {
    const totalMinutes = weekShifts.reduce((sum, shift) => sum + calculateShiftDuration(shift) * 60, 0);
    const nonShiftMinutes = Math.round(nonShiftResult.totalHours * 60);
    
    console.log('🔍 WEEKLY EMPLOYEE HOURS DEBUG (mode hebdomadaire):', {
      weekStart: weekStartStr,
      weekEnd: weekEndStr,
      employeeId,
      totalShifts: weekShifts.length,
      shifts: debugInfo,
      shiftsMinutes: Math.round(totalMinutes),
      shiftsHours: shiftHours.toFixed(2),
      nonShifts: nonShiftResult.debugInfo,
      nonShiftsMinutes: nonShiftMinutes,
      nonShiftsHours: nonShiftResult.totalHours.toFixed(2),
      totalMinutes: Math.round(totalMinutes) + nonShiftMinutes,
      totalHours: totalHours.toFixed(2)
    });
  }
  
  // Déterminer si temps plein ou partiel
  const isFullTime = employee?.work_time_type === 'full_time';
  const contractHoursWeekly = employee?.contract_hours_weekly 
    ? parseFloat(employee.contract_hours_weekly.replace(':', '.').replace(/h/g, ''))
    : (isFullTime ? 35 : 0);

  if (isFullTime || contractHoursWeekly >= 35) {
    const overtime = calculateWeeklyOvertime(totalHours);
    return {
      type: 'full_time',
      total: totalHours,
      debugInfo: debug ? [...debugInfo, ...nonShiftResult.debugInfo.map(ns => ({ type: 'non-shift', ...ns }))] : null,
      nonShiftHours: nonShiftResult.totalHours,
      ...overtime
    };
  } else if (contractHoursWeekly > 0) {
    const complementary = calculateWeeklyComplementary(totalHours, contractHoursWeekly);
    return {
      type: 'part_time',
      total: totalHours,
      contract_hours: contractHoursWeekly,
      debugInfo: debug ? [...debugInfo, ...nonShiftResult.debugInfo.map(ns => ({ type: 'non-shift', ...ns }))] : null,
      nonShiftHours: nonShiftResult.totalHours,
      ...complementary
    };
  }

  return {
    type: 'unknown',
    total: totalHours,
    normal: totalHours,
    debugInfo: debug ? [...debugInfo, ...nonShiftResult.debugInfo.map(ns => ({ type: 'non-shift', ...ns }))] : null,
    nonShiftHours: nonShiftResult.totalHours
  };
};

/**
 * Calcule les heures pour un mois complet (mode mensuel)
 */
export const calculateMonthlyEmployeeHours = (shifts, employeeId, monthStart, monthEnd, employee) => {
  const monthShifts = shifts.filter(s => {
    if (s.employee_id !== employeeId) return false;
    const shiftDate = new Date(s.date);
    return shiftDate >= monthStart && shiftDate <= monthEnd;
  });
  
  const totalHours = monthShifts.reduce((sum, shift) => sum + calculateShiftDuration(shift), 0);
  
  // Calculer nombre de semaines dans le mois
  const days = Math.ceil((monthEnd - monthStart) / (1000 * 60 * 60 * 24)) + 1;
  const weeks = days / 7;
  
  const isFullTime = employee?.work_time_type === 'full_time';
  const contractHoursWeekly = employee?.contract_hours_weekly 
    ? parseFloat(employee.contract_hours_weekly.replace(':', '.').replace(/h/g, ''))
    : (isFullTime ? 35 : 0);
  
  const contractHoursMonthly = contractHoursWeekly * weeks;

  if (isFullTime || contractHoursWeekly >= 35) {
    // Heures supplémentaires mensuelles
    if (totalHours <= contractHoursMonthly) {
      return {
        type: 'full_time',
        total: totalHours,
        normal: totalHours,
        overtime_25: 0,
        overtime_50: 0,
        total_overtime: 0
      };
    }

    const overtime = totalHours - contractHoursMonthly;
    const overtime_25 = Math.min(overtime, 8 * weeks); // 8h par semaine
    const overtime_50 = Math.max(0, overtime - (8 * weeks));

    return {
      type: 'full_time',
      total: totalHours,
      normal: contractHoursMonthly,
      overtime_25,
      overtime_50,
      total_overtime: overtime
    };
  } else if (contractHoursWeekly > 0) {
    // Heures complémentaires mensuelles
    if (totalHours <= contractHoursMonthly) {
      return {
        type: 'part_time',
        total: totalHours,
        contract_hours: contractHoursMonthly,
        normal: totalHours,
        complementary_10: 0,
        complementary_25: 0,
        total_complementary: 0,
        exceeds_limit: false
      };
    }

    const complementary = totalHours - contractHoursMonthly;
    const limit_10_percent = contractHoursMonthly * 0.10;
    const max_allowed = contractHoursMonthly / 3;

    const complementary_10 = Math.min(complementary, limit_10_percent);
    const complementary_25 = Math.min(Math.max(0, complementary - limit_10_percent), max_allowed - complementary_10);
    
    const exceeds_limit = complementary > max_allowed;

    return {
      type: 'part_time',
      total: totalHours,
      contract_hours: contractHoursMonthly,
      normal: contractHoursMonthly,
      complementary_10,
      complementary_25,
      total_complementary: complementary_10 + complementary_25,
      exceeds_limit
    };
  }

  return {
    type: 'unknown',
    total: totalHours,
    normal: totalHours
  };
};