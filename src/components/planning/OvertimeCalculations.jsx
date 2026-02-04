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
 * Calcule le solde hebdomadaire (effectué - contractuel)
 * Utilisé par le mode "Calcul mensuel (lissage)"
 */
export const calculateWeeklySaldeForSmoothing = (shifts, employeeId, weekStart, employee, nonShiftEvents = [], nonShiftTypes = []) => {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  
  const weekStartStr = formatLocalDate(weekStart);
  const weekEndStr = formatLocalDate(weekEnd);
  
  // Récupérer les heures effectuées (shifts + non-shifts générateurs)
  const weekShifts = shifts.filter(s => {
    if (s.employee_id !== employeeId) return false;
    return s.date >= weekStartStr && s.date <= weekEndStr;
  });
  
  const shiftHours = weekShifts.reduce((sum, shift) => sum + calculateShiftDuration(shift), 0);
  
  const weekNonShifts = nonShiftEvents.filter(ns => {
    if (ns.employee_id !== employeeId) return false;
    return ns.date >= weekStartStr && ns.date <= weekEndStr;
  });
  
  const nonShiftResult = calculateNonShiftGeneratedHours(weekNonShifts, nonShiftTypes, employee, false);
  const totalHours = shiftHours + nonShiftResult.totalHours;
  
  // Récupérer heures contractuelles semaine
  const isFullTime = employee?.work_time_type === 'full_time';
  const contractHoursWeekly = employee?.contract_hours_weekly 
    ? parseFloat(employee.contract_hours_weekly.replace(':', '.').replace(/h/g, ''))
    : (isFullTime ? 35 : 0);
  
  // Solde = effectué - contractuel
  const salde = totalHours - contractHoursWeekly;
  
  return {
    totalHours,
    contractHoursWeekly,
    salde
  };
};

/**
 * Calcule les heures pour un mois complet (mode mensuel avec lissage)
 */
export const calculateMonthlyEmployeeHours = (shifts, employeeId, monthStart, monthEnd, employee, nonShiftEvents = [], nonShiftTypes = []) => {
  const monthShifts = shifts.filter(s => {
    if (s.employee_id !== employeeId) return false;
    const shiftDate = new Date(s.date);
    return shiftDate >= monthStart && shiftDate <= monthEnd;
  });
  
  const totalHours = monthShifts.reduce((sum, shift) => sum + calculateShiftDuration(shift), 0);
  
  // Récupérer heures contractuelles
  const isFullTime = employee?.work_time_type === 'full_time';
  const contractHoursWeekly = employee?.contract_hours_weekly 
    ? parseFloat(employee.contract_hours_weekly.replace(':', '.').replace(/h/g, ''))
    : (isFullTime ? 35 : 0);
  
  // Calculer nombre de semaines dans le mois
  const days = Math.ceil((monthEnd - monthStart) / (1000 * 60 * 60 * 24)) + 1;
  const weeks = days / 7;
  const contractHoursMonthly = contractHoursWeekly * weeks;

  // LISSAGE : Calculer le solde cumulé semaine par semaine
  let totalSalde = 0;
  const weekSaldes = [];
  
  let currentDate = new Date(monthStart);
  while (currentDate <= monthEnd) {
    const weekStart = new Date(currentDate);
    const day = weekStart.getDay();
    const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
    weekStart.setDate(diff);
    
    if (weekStart < monthStart) weekStart.setTime(monthStart.getTime());
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    if (weekEnd > monthEnd) weekEnd.setTime(monthEnd.getTime());
    
    const weekData = calculateWeeklySaldeForSmoothing(shifts, employeeId, weekStart, employee, nonShiftEvents, nonShiftTypes);
    weekSaldes.push(weekData);
    totalSalde += weekData.salde;
    
    currentDate = new Date(weekEnd);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Règle du lissage : si salde <= 0 => 0 heures supp/comp
  const smoothedSalde = Math.max(0, totalSalde);

  if (isFullTime || contractHoursWeekly >= 35) {
    // Heures supplémentaires : appliquer règles sur le solde lissé
    if (smoothedSalde <= 0) {
      return {
        type: 'full_time',
        total: totalHours,
        normal: Math.min(totalHours, contractHoursMonthly),
        overtime_25: 0,
        overtime_50: 0,
        total_overtime: 0,
        totalSalde,
        smoothedSalde,
        weekSaldes
      };
    }

    const overtime_25 = Math.min(smoothedSalde, 8 * weeks); // 8h par semaine
    const overtime_50 = Math.max(0, smoothedSalde - (8 * weeks));

    return {
      type: 'full_time',
      total: totalHours,
      normal: Math.min(totalHours, contractHoursMonthly),
      overtime_25,
      overtime_50,
      total_overtime: smoothedSalde,
      totalSalde,
      smoothedSalde,
      weekSaldes
    };
  } else if (contractHoursWeekly > 0) {
    // Heures complémentaires : appliquer règles sur le solde lissé
    if (smoothedSalde <= 0) {
      return {
        type: 'part_time',
        total: totalHours,
        contract_hours: contractHoursMonthly,
        normal: Math.min(totalHours, contractHoursMonthly),
        complementary_10: 0,
        complementary_25: 0,
        total_complementary: 0,
        exceeds_limit: false,
        totalSalde,
        smoothedSalde,
        weekSaldes
      };
    }

    const limit_10_percent = contractHoursMonthly * 0.10;
    const max_allowed = contractHoursMonthly / 3;

    const complementary_10 = Math.min(smoothedSalde, limit_10_percent);
    const complementary_25 = Math.min(Math.max(0, smoothedSalde - limit_10_percent), max_allowed - complementary_10);
    
    const exceeds_limit = smoothedSalde > max_allowed;

    return {
      type: 'part_time',
      total: totalHours,
      contract_hours: contractHoursMonthly,
      normal: Math.min(totalHours, contractHoursMonthly),
      complementary_10,
      complementary_25,
      total_complementary: complementary_10 + complementary_25,
      exceeds_limit,
      totalSalde,
      smoothedSalde,
      weekSaldes
    };
  }

  return {
    type: 'unknown',
    total: totalHours,
    normal: totalHours,
    totalSalde,
    smoothedSalde,
    weekSaldes
  };
};