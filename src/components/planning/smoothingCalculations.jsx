/**
 * Calculs pour le mode "Calcul mensuel (lissage)"
 * Basé sur le planning type pour les heures prévues
 */

import { calculateShiftDuration } from './LegalChecks';
import { formatLocalDate, parseLocalDate } from './dateUtils';
import { calculateNonShiftGeneratedHours } from './NonShiftHoursCalculations';

/**
 * Récupère les heures prévues pour un jour spécifique selon le planning type
 * @param {Date} date - La date pour laquelle on veut les heures prévues
 * @param {Array} templateWeeks - Liste des TemplateWeek pour l'employé
 * @param {Array} templateShifts - Liste des TemplateShift
 * @returns {number} Heures prévues ce jour, ou 0 si pas de planning type unique ou jour non prévu
 */
export const getExpectedHoursForDay = (date, templateWeeks, templateShifts) => {
  // Vérifier qu'il y a exactement un planning type
  if (!templateWeeks || templateWeeks.length !== 1) {
    return null; // Non calculable
  }

  const template = templateWeeks[0];
  
  // Déterminer le jour de semaine (1=Lundi, 7=Dimanche)
  const jsDay = date.getDay(); // 0=Dimanche, 1=Lundi, ..., 6=Samedi
  const dayOfWeek = jsDay === 0 ? 7 : jsDay; // ISO: 1=Lundi, 7=Dimanche

  // Trouver tous les template shifts pour ce jour
  const dayTemplates = templateShifts.filter(ts => 
    ts.template_week_id === template.id && ts.day_of_week === dayOfWeek
  );

  // Calculer la durée totale prévue ce jour
  let expectedHours = 0;
  dayTemplates.forEach(ts => {
    const [startHour, startMin] = ts.start_time.split(':').map(Number);
    const [endHour, endMin] = ts.end_time.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    const breakMinutes = ts.break_minutes || 0;
    const durationMinutes = endMinutes - startMinutes - breakMinutes;
    expectedHours += durationMinutes / 60;
  });

  return expectedHours;
};

/**
 * Récupère les heures effectuées pour un jour spécifique
 */
export const getWorkedHoursForDay = (dateStr, shifts, employeeId) => {
  const dayShifts = shifts.filter(s => 
    s.employee_id === employeeId && s.date === dateStr
  );

  return dayShifts.reduce((sum, shift) => sum + calculateShiftDuration(shift), 0);
};

/**
 * Calcule le solde hebdomadaire pour le mode lissage
 * Prend en compte UNIQUEMENT les jours du mois inclus dans la semaine
 */
export const calculateWeeklySaldeForSmoothing = (
  shifts,
  employeeId,
  weekStart,
  monthStart,
  monthEnd,
  templateWeeks,
  templateShifts,
  employee,
  nonShiftEvents = [],
  nonShiftTypes = []
) => {
  // Vérifier qu'il y a un planning type unique
  if (!templateWeeks || templateWeeks.length !== 1) {
    return {
      status: 'not_calculable',
      expectedWeek: null,
      workedWeek: null,
      salde: null,
      reason: templateWeeks && templateWeeks.length > 1 
        ? 'Plusieurs plannings types'
        : 'Aucun planning type'
    };
  }

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  let expectedWeek = 0;
  let workedWeek = 0;
  const daysIncluded = [];

  // Itérer sur chaque jour de la semaine
  for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
    const dateObj = new Date(d);
    
    // CONTRAINTE : ne traiter que les jours du mois
    if (dateObj < monthStart || dateObj > monthEnd) {
      continue;
    }

    const dateStr = formatLocalDate(dateObj);

    // Heures prévues ce jour selon planning type
    const expectedDay = getExpectedHoursForDay(dateObj, templateWeeks, templateShifts);
    if (expectedDay !== null) {
      expectedWeek += expectedDay;
    }

    // Heures effectuées ce jour
    const workedDay = getWorkedHoursForDay(dateStr, shifts, employeeId);
    workedWeek += workedDay;

    daysIncluded.push({
      date: dateStr,
      expected: expectedDay,
      worked: workedDay
    });
  }

  // Solde = effectué - prévu
  const salde = workedWeek - expectedWeek;

  return {
    status: 'calculated',
    expectedWeek,
    workedWeek,
    salde,
    daysIncluded,
    reason: null
  };
};

/**
 * Calcule les heures pour un mois complet en mode lissage
 * Basé sur le planning type
 */
export const calculateMonthlyEmployeeHoursSmoothing = (
  shifts,
  employeeId,
  monthStart,
  monthEnd,
  employee,
  templateWeeks,
  templateShifts,
  nonShiftEvents = [],
  nonShiftTypes = []
) => {
  // Vérifier qu'il y a un planning type unique
  if (!templateWeeks || templateWeeks.length !== 1) {
    return {
      status: 'not_calculable',
      reason: templateWeeks && templateWeeks.length > 1 
        ? 'Plusieurs plannings types'
        : 'Aucun planning type',
      totalSalde: null,
      smoothedSalde: null,
      weekSaldes: [],
      type: null
    };
  }

  // Récupérer heures totales du mois
  const monthShifts = shifts.filter(s => {
    if (s.employee_id !== employeeId) return false;
    const shiftDate = new Date(s.date);
    return shiftDate >= monthStart && shiftDate <= monthEnd;
  });

  const totalHours = monthShifts.reduce((sum, shift) => sum + calculateShiftDuration(shift), 0);

  // Calculer les soldes semaine par semaine
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

    const weekData = calculateWeeklySaldeForSmoothing(
      shifts,
      employeeId,
      weekStart,
      monthStart,
      monthEnd,
      templateWeeks,
      templateShifts,
      employee,
      nonShiftEvents,
      nonShiftTypes
    );

    if (weekData.status === 'calculated') {
      weekSaldes.push(weekData);
      totalSalde += weekData.salde;
    }

    currentDate = new Date(weekEnd);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Règle du lissage : si salde <= 0 => 0 heures supp/comp
  const smoothedSalde = Math.max(0, totalSalde);

  const isFullTime = employee?.work_time_type === 'full_time';
  const contractHoursWeekly = employee?.contract_hours_weekly 
    ? parseFloat(employee.contract_hours_weekly.replace(':', '.').replace(/h/g, ''))
    : (isFullTime ? 35 : 0);

  const days = Math.ceil((monthEnd - monthStart) / (1000 * 60 * 60 * 24)) + 1;
  const weeks = days / 7;

  if (isFullTime || contractHoursWeekly >= 35) {
    // Heures supplémentaires
    if (smoothedSalde <= 0) {
      return {
        status: 'calculated',
        type: 'full_time',
        total: totalHours,
        normal: 0,
        overtime_25: 0,
        overtime_50: 0,
        total_overtime: 0,
        totalSalde,
        smoothedSalde,
        weekSaldes,
        reason: null
      };
    }

    const overtime_25 = Math.min(smoothedSalde, 8 * weeks);
    const overtime_50 = Math.max(0, smoothedSalde - (8 * weeks));

    return {
      status: 'calculated',
      type: 'full_time',
      total: totalHours,
      normal: 0,
      overtime_25,
      overtime_50,
      total_overtime: smoothedSalde,
      totalSalde,
      smoothedSalde,
      weekSaldes,
      reason: null
    };
  } else if (contractHoursWeekly > 0) {
    // Heures complémentaires
    if (smoothedSalde <= 0) {
      return {
        status: 'calculated',
        type: 'part_time',
        total: totalHours,
        normal: 0,
        complementary_10: 0,
        complementary_25: 0,
        total_complementary: 0,
        exceeds_limit: false,
        totalSalde,
        smoothedSalde,
        weekSaldes,
        reason: null
      };
    }

    const contractHoursMonthly = contractHoursWeekly * weeks;
    const limit_10_percent = contractHoursMonthly * 0.10;
    const max_allowed = contractHoursMonthly / 3;

    const complementary_10 = Math.min(smoothedSalde, limit_10_percent);
    const complementary_25 = Math.min(Math.max(0, smoothedSalde - limit_10_percent), max_allowed - complementary_10);

    const exceeds_limit = smoothedSalde > max_allowed;

    return {
      status: 'calculated',
      type: 'part_time',
      total: totalHours,
      normal: 0,
      complementary_10,
      complementary_25,
      total_complementary: complementary_10 + complementary_25,
      exceeds_limit,
      totalSalde,
      smoothedSalde,
      weekSaldes,
      reason: null
    };
  }

  return {
    status: 'calculated',
    type: 'unknown',
    total: totalHours,
    normal: 0,
    totalSalde,
    smoothedSalde,
    weekSaldes,
    reason: null
  };
};