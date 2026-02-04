/**
 * Calculs pour le mode "Calcul mensuel (lissage)"
 * Basé sur le CONTRAT pour les heures prévues (pas sur le planning type)
 * 
 * OBJECTIF :
 * - Calculer un solde semaine par semaine sur les jours du mois uniquement
 * - Base "prévu" = heures contractuelles semaine (ex 35h)
 * - Semaines partielles (début/fin de mois) : prorata sur jours inclus
 * - Éviter double-compte des shifts (déduplicar par shift_id)
 */

import { calculateShiftDuration } from './LegalChecks';
import { formatLocalDate, parseLocalDate } from './dateUtils';
import { calculateNonShiftGeneratedHours } from './NonShiftHoursCalculations';

/**
 * Récupère les jours contractuels de l'employé (Lun-Dim)
 * Retourne un Set avec les jours travaillés selon le contrat (1=Lundi, 7=Dimanche)
 */
const getContractualDaysOfWeek = (employee) => {
  if (!employee?.contract_days) {
    // Fallback : par défaut Lun-Ven
    return new Set([1, 2, 3, 4, 5]);
  }

  const days = new Set();
  if (employee.contract_days.monday) days.add(1);
  if (employee.contract_days.tuesday) days.add(2);
  if (employee.contract_days.wednesday) days.add(3);
  if (employee.contract_days.thursday) days.add(4);
  if (employee.contract_days.friday) days.add(5);
  if (employee.contract_days.saturday) days.add(6);
  if (employee.contract_days.sunday) days.add(7);

  return days;
};

/**
 * Calcule les heures effectuées pour une semaine (avec prorata pour semaines partielles)
 * IMPORTANT : Déduplique strictement par shift_id pour éviter les doubles comptes
 */
export const getWorkedHoursForWeek = (shifts, employeeId, weekStart, monthStart, monthEnd) => {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  // Filtrer les shifts : employé + dates incluses dans [weekStart, weekEnd] ET [monthStart, monthEnd]
  const effectiveStart = new Date(Math.max(weekStart.getTime(), monthStart.getTime()));
  const effectiveEnd = new Date(Math.min(weekEnd.getTime(), monthEnd.getTime()));

  const startStr = formatLocalDate(effectiveStart);
  const endStr = formatLocalDate(effectiveEnd);

  // Déduplicar par shift_id AVANT de sommer (ANTI DOUBLE-COMPTE)
  const shiftIds = new Set();
  const uniqueShifts = [];

  shifts.forEach(shift => {
    if (shift.employee_id !== employeeId) return;
    if (shift.date < startStr || shift.date > endStr) return;
    
    if (!shiftIds.has(shift.id)) {
      shiftIds.add(shift.id);
      uniqueShifts.push(shift);
    }
  });

  // Sommer les heures (chaque shift une seule fois)
  const totalWorkedHours = uniqueShifts.reduce((sum, shift) => sum + calculateShiftDuration(shift), 0);

  return totalWorkedHours;
};

/**
 * FONCTION UNIQUE DE CALCUL DE SOLDE HEBDO
 * Utilisée par WeeklySummary ET MonthlySummary pour garantir l'identité des calculs
 * 
 * Retourne { expectedWeek, workedWeek, salde } calculés sur les jours du mois uniquement
 * 
 * BASE = CONTRAT (heures_contractuelles_semaine)
 * Prorata sur les jours contractuels inclus dans la semaine ET le mois
 */
export const getWeeklySummaryDataForMonth = (
  shifts,
  employeeId,
  weekStart,
  monthStart,
  monthEnd,
  employee,
  nonShiftEvents = [],
  nonShiftTypes = []
) => {
  // Appel calculateWeeklySaldeForSmoothing (même logique)
  return calculateWeeklySaldeForSmoothing(
    shifts,
    employeeId,
    weekStart,
    monthStart,
    monthEnd,
    employee,
    nonShiftEvents,
    nonShiftTypes
  );
};

/**
 * Calcule le solde hebdomadaire pour le mode lissage
 * BASE = CONTRAT (heures_contractuelles_semaine)
 * Prorata sur les jours contractuels inclus dans la semaine ET le mois
 * 
 * Méthode :
 * 1) heuresContratParJour = heuresContratSemaine / joursContratParSemaine
 * 2) joursContratInclus = nombre de jours "contractuels" dans [weekStart, weekEnd] ∩ [monthStart, monthEnd]
 * 3) prévuSemaine = joursContratInclus * heuresContratParJour
 */
export const calculateWeeklySaldeForSmoothing = (
  shifts,
  employeeId,
  weekStart,
  monthStart,
  monthEnd,
  employee,
  nonShiftEvents = [],
  nonShiftTypes = []
) => {
  // Vérifier les données d'employé
  if (!employee) {
    return {
      status: 'not_calculable',
      expectedWeek: null,
      workedWeek: null,
      salde: null,
      reason: 'Données employé manquantes'
    };
  }

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  // A) Récupérer heures contractuelles semaine + NORMALISATION
  const isFullTime = employee.work_time_type === 'full_time';
  let contractHoursWeekly = 35; // Défaut temps plein
  
  if (employee.contract_hours_weekly) {
    if (typeof employee.contract_hours_weekly === 'string') {
      // Format "HH:MM" → décimal
      const parts = employee.contract_hours_weekly.split(':').map(p => parseInt(p, 10));
      contractHoursWeekly = (parts[0] || 0) + ((parts[1] || 0) / 60);
    } else {
      contractHoursWeekly = parseFloat(String(employee.contract_hours_weekly).replace(',', '.')) || 35;
    }
  } else if (!isFullTime) {
    contractHoursWeekly = 0;
  }

  // Protéger contre NaN
  if (isNaN(contractHoursWeekly)) {
    console.warn(`[DEBUG] contractHoursWeekly is NaN for employee ${employee.id}, reset to 35`);
    contractHoursWeekly = isFullTime ? 35 : 0;
  }

  // B) Nombre de jours contractuels par semaine + NORMALISATION
  const contractualDays = getContractualDaysOfWeek(employee);
  const joursContratParSemaine = contractualDays.size || 5; // Fallback Lun-Ven

  // Protection : si aucun jour contractuel
  if (joursContratParSemaine === 0) {
    return {
      status: 'not_calculable',
      expectedWeek: 0,
      workedWeek: 0,
      salde: 0,
      reason: 'Aucun jour contractuel défini'
    };
  }

  // C) Heures par jour contractuel
  let heuresContratParJour = contractHoursWeekly / joursContratParSemaine;
  
  // Protéger contre NaN
  if (isNaN(heuresContratParJour)) {
    console.warn(`[DEBUG] heuresContratParJour is NaN for employee ${employee.id}`);
    return {
      status: 'not_calculable',
      expectedWeek: 0,
      workedWeek: 0,
      salde: 0,
      reason: 'Heures contractuelles invalides'
    };
  }

  // D) Compter les jours contractuels inclus dans la semaine ET le mois
  const effectiveStart = new Date(Math.max(weekStart.getTime(), monthStart.getTime()));
  const effectiveEnd = new Date(Math.min(weekEnd.getTime(), monthEnd.getTime()));

  let joursContratInclus = 0;
  const daysIncluded = [];

  for (let d = new Date(effectiveStart); d <= effectiveEnd; d.setDate(d.getDate() + 1)) {
    const jsDay = d.getDay(); // 0=Dimanche, 1=Lundi, ..., 6=Samedi
    const isoDay = jsDay === 0 ? 7 : jsDay; // ISO: 1=Lundi, 7=Dimanche

    if (contractualDays.has(isoDay)) {
      joursContratInclus++;
    }

    const dateStr = formatLocalDate(d);
    daysIncluded.push({
      date: dateStr,
      isContractual: contractualDays.has(isoDay)
    });
  }

  // E) Calcul du prévu + PROTECTION NaN
  let expectedWeek = joursContratInclus * heuresContratParJour;

  if (isNaN(expectedWeek)) {
   console.warn(`[DEBUG] expectedWeek is NaN for employee ${employee.id}, reset to 0`);
   expectedWeek = 0;
  }

  // F) Heures effectuées (shifts uniquement, pas non-shifts)
  let workedWeek = getWorkedHoursForWeek(shifts, employeeId, weekStart, monthStart, monthEnd);

  if (isNaN(workedWeek)) {
   console.warn(`[DEBUG] workedWeek is NaN for employee ${employee.id}, reset to 0`);
   workedWeek = 0;
  }

  // G) Solde
  let salde = workedWeek - expectedWeek;

  if (isNaN(salde)) {
   console.warn(`[DEBUG] salde is NaN for employee ${employee.id}, reset to 0`);
   salde = 0;
  }

  return {
   status: 'calculated',
   expectedWeek: Math.round(expectedWeek * 100) / 100,
   workedWeek: Math.round(workedWeek * 100) / 100,
   salde: Math.round(salde * 100) / 100,
   daysIncluded,
   joursContratInclus,
   contractHoursWeekly,
   reason: null
  };
};

/**
 * Génère une clé unique pour une semaine (ISO 8601 lundi)
 */
const getWeekKey = (weekStart) => {
  const monday = new Date(weekStart);
  const day = monday.getDay();
  const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
  monday.setDate(diff);
  return formatLocalDate(monday);
};

/**
 * Calcule les heures pour un mois complet en mode lissage
 * Basé sur le CONTRAT (pas planning type)
 * 
 * PROCESSUS :
 * 1) Calculer solde semaine par semaine avec base contrat + prorata
 * 2) Sommer les soldes → totalSalde (une seule fois par semaine unique)
 * 3) Appliquer lissage : smoothedSalde = max(0, totalSalde)
 * 4) Appliquer majorations (25%, 50% ou 10%, 25%) selon type
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
  // Vérifier les données d'employé
  if (!employee) {
    return {
      status: 'not_calculable',
      reason: 'Données employé manquantes',
      totalSalde: null,
      smoothedSalde: null,
      weekSaldes: [],
      type: null
    };
  }

  // Récupérer heures totales du mois (déduplication par shift_id)
  const startStr = formatLocalDate(monthStart);
  const endStr = formatLocalDate(monthEnd);

  const shiftIds = new Set();
  const uniqueShifts = [];
  shifts.forEach(shift => {
    if (shift.employee_id !== employeeId) return;
    if (shift.date < startStr || shift.date > endStr) return;
    
    if (!shiftIds.has(shift.id)) {
      shiftIds.add(shift.id);
      uniqueShifts.push(shift);
    }
  });

  const totalHours = uniqueShifts.reduce((sum, shift) => sum + calculateShiftDuration(shift), 0);

  // Calculer les soldes semaine par semaine (avec base CONTRAT)
  // ANTI DOUBLON : tracker par weekKey (date du lundi ISO)
  let totalSalde = 0;
  const weekSaldes = [];
  const processedWeekKeys = new Set(); // NOUVEAU : tracker les semaines déjà traitées
  const weekKeyDetails = []; // DEBUG : détail des semaines traitées

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

    // Générer clé unique pour cette semaine
    const weekKey = getWeekKey(weekStart);
    
    // Vérifier si cette semaine a déjà été traitée (ANTI DOUBLON)
    if (processedWeekKeys.has(weekKey)) {
      console.warn(`[ANTI DOUBLON] Semaine ${weekKey} déjà traitée, skip`);
      currentDate = new Date(weekEnd);
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }

    const weekData = calculateWeeklySaldeForSmoothing(
      shifts,
      employeeId,
      weekStart,
      monthStart,
      monthEnd,
      employee,
      nonShiftEvents,
      nonShiftTypes
    );

    if (weekData.status === 'calculated') {
      weekSaldes.push(weekData);
      totalSalde += weekData.salde;
      processedWeekKeys.add(weekKey);
      
      // DEBUG : enregistrer le détail
      weekKeyDetails.push({
        weekKey,
        salde: weekData.salde,
        expectedWeek: weekData.expectedWeek,
        workedWeek: weekData.workedWeek
      });
    }

    currentDate = new Date(weekEnd);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // DEBUG : log du détail des semaines
  console.log(`[calculateMonthlyEmployeeHoursSmoothing] Employee ${employee.id} - Détail des semaines:`, {
    monthStart: startStr,
    monthEnd: endStr,
    weekCount: weekKeyDetails.length,
    weekDetails: weekKeyDetails,
    totalSalde
  });

  // Lissage : si salde <= 0 => 0 heures supp/comp
  // IMPORTANT : totalSaldoFromWeeks est l'UNIQUE source de vérité
  const totalSaldoFromWeeks = totalSalde;
  const smoothedSalde = Math.max(0, totalSaldoFromWeeks);

  // DEBUG final - TRAÇAGE COMPLET (PREUVE)
  console.log(`[calculateMonthlyEmployeeHoursSmoothing] Employee ${employee.id} - TRAÇAGE FINAL:`, {
    weekCount: weekSaldes.length,
    weekKeyDetailsList: weekKeyDetails.map(w => `${w.weekKey}: ${w.salde}h`),
    totalSaldoFromWeeks,
    smoothedSalde,
    formula: 'smoothedSalde = Math.max(0, totalSaldoFromWeeks)',
    PROOF: `AVANT override: totalSaldoFromWeeks=${totalSaldoFromWeeks}h, APRÈS override: smoothedSalde=${smoothedSalde}h`
  });

  // Récupérer infos contrat
  const isFullTime = employee.work_time_type === 'full_time';
  let contractHoursWeekly = 35; // Défaut temps plein
  
  if (employee.contract_hours_weekly) {
    if (typeof employee.contract_hours_weekly === 'string') {
      const [h, m] = employee.contract_hours_weekly.split(':').map(Number);
      contractHoursWeekly = h + (m / 60);
    } else {
      contractHoursWeekly = parseFloat(employee.contract_hours_weekly);
    }
  } else if (!isFullTime) {
    contractHoursWeekly = 0;
  }

  // Nombre de semaines réelles du mois (pour majorations)
  const days = Math.ceil((monthEnd - monthStart) / (1000 * 60 * 60 * 24)) + 1;
  const weeks = days / 7;

  if (isFullTime || contractHoursWeekly >= 35) {
    // TEMPS PLEIN : Heures supplémentaires
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
        contractHoursWeekly,
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
      contractHoursWeekly,
      reason: null
    };
  } else if (contractHoursWeekly > 0) {
    // TEMPS PARTIEL : Heures complémentaires
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
        contractHoursWeekly,
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
      contractHoursWeekly,
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
    contractHoursWeekly,
    reason: null
  };
};