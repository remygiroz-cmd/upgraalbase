/**
 * CALCULS SIMPLES V1
 * Sans lissage, sans prorata, sans majorations
 * Une seule source de vérité pour tous les calculs
 * 
 * PRINCIPES :
 * - Semaine = semaine complète (lun-dim)
 * - Delta = heures effectuées - heures contrat
 * - Mois = somme simple des deltas hebdo (sans double-compte par weekKey)
 * - Aucun NaN : défaut à 0 ou "Non défini"
 */

import { calculateShiftDuration } from './LegalChecks';
import { formatLocalDate } from './dateUtils';

/**
 * Récupère les heures contractuelles/semaine
 * Normalise tous les formats en nombre décimal (heures)
 */
const getContractHoursPerWeek = (employee) => {
  if (!employee) return 0;
  
  const isFullTime = employee.work_time_type === 'full_time';
  let hours = 0;

  if (employee.contract_hours_weekly) {
    if (typeof employee.contract_hours_weekly === 'string') {
      // Format "HH:MM"
      const parts = employee.contract_hours_weekly.split(':').map(p => parseInt(p, 10));
      hours = (parts[0] || 0) + ((parts[1] || 0) / 60);
    } else {
      hours = parseFloat(String(employee.contract_hours_weekly).replace(',', '.')) || 0;
    }
  } else if (isFullTime) {
    hours = 35; // Défaut temps plein
  }

  return isNaN(hours) ? 0 : hours;
};

/**
 * Calcule les heures effectuées dans une semaine
 * Déduplique par shift_id pour éviter les doubles comptes
 */
const getWorkedHoursPerWeek = (shifts, employeeId, weekStart, weekEnd) => {
  const startStr = formatLocalDate(weekStart);
  const endStr = formatLocalDate(weekEnd);

  // Déduplicar par shift_id
  const uniqueShifts = [];
  const shiftIds = new Set();

  shifts.forEach(shift => {
    if (shift.employee_id !== employeeId) return;
    if (shift.date < startStr || shift.date > endStr) return;
    
    if (!shiftIds.has(shift.id)) {
      shiftIds.add(shift.id);
      uniqueShifts.push(shift);
    }
  });

  const totalHours = uniqueShifts.reduce((sum, shift) => sum + calculateShiftDuration(shift), 0);
  return isNaN(totalHours) ? 0 : totalHours;
};

/**
 * Clé unique pour une semaine (ISO 8601 lundi)
 */
const getWeekKey = (weekStart) => {
  const monday = new Date(weekStart);
  const day = monday.getDay();
  const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
  monday.setDate(diff);
  return formatLocalDate(monday);
};

/**
 * FONCTION CENTRALE V1
 * Calcule un delta simpl pour UNE semaine
 * 
 * Retourne { weekKey, contractWeek, workedWeek, delta }
 */
export const getSimpleWeeklyBalance = (
  shifts,
  employeeId,
  weekStart,
  employee
) => {
  if (!employee) {
    return {
      status: 'not_calculable',
      weekKey: getWeekKey(weekStart),
      contractWeek: 0,
      workedWeek: 0,
      delta: 0,
      reason: 'Données employé manquantes'
    };
  }

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const weekKey = getWeekKey(weekStart);
  const contractWeek = getContractHoursPerWeek(employee);
  const workedWeek = getWorkedHoursPerWeek(shifts, employeeId, weekStart, weekEnd);
  const delta = workedWeek - contractWeek;

  return {
    status: 'calculated',
    weekKey,
    contractWeek: Math.round(contractWeek * 100) / 100,
    workedWeek: Math.round(workedWeek * 100) / 100,
    delta: Math.round(delta * 100) / 100,
    reason: null
  };
};

/**
 * FONCTION POUR MOIS V1
 * Somme les deltas simples de toutes les semaines du mois
 * Évite les doubles comptes via weekKey unique
 */
export const getSimpleMonthlyBalance = (
  shifts,
  employeeId,
  monthStart,
  monthEnd,
  employee
) => {
  if (!employee) {
    return {
      status: 'not_calculable',
      reason: 'Données employé manquantes',
      monthlyDelta: 0,
      suppCompRetained: 0,
      weekBalances: []
    };
  }

  const weekBalances = [];
  const processedWeekKeys = new Set();

  let currentDate = new Date(monthStart);
  while (currentDate <= monthEnd) {
    // Aligner sur lundi ISO
    const weekStart = new Date(currentDate);
    const day = weekStart.getDay();
    const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
    weekStart.setDate(diff);

    // Si lundi est avant le mois, commencer au début du mois
    if (weekStart < monthStart) weekStart.setTime(monthStart.getTime());

    const weekKey = getWeekKey(weekStart);

    // Éviter les doubles semaines
    if (processedWeekKeys.has(weekKey)) {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      currentDate = new Date(weekEnd);
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }

    const balance = getSimpleWeeklyBalance(shifts, employeeId, weekStart, employee);

    if (balance.status === 'calculated') {
      weekBalances.push(balance);
      processedWeekKeys.add(weekKey);
    }

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    currentDate = new Date(weekEnd);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Somme simple des deltas
  const monthlyDelta = weekBalances.reduce((sum, week) => sum + week.delta, 0);
  const suppCompRetained = Math.max(0, monthlyDelta);

  return {
    status: 'calculated',
    monthlyDelta: Math.round(monthlyDelta * 100) / 100,
    suppCompRetained: Math.round(suppCompRetained * 100) / 100,
    weekBalances,
    reason: null
  };
};