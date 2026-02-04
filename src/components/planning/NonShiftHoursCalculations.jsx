/**
 * Calcul des heures générées par les non-shifts (Congés, Absences, etc.)
 * Implémente l'option "Génère des heures" des types de non-shifts
 */

/**
 * Convertit une durée au format "HH:MM" ou "H.H" en heures décimales
 */
function parseHours(hoursString) {
  if (!hoursString) return 0;
  
  const str = String(hoursString).trim();
  
  // Format "HH:MM"
  if (str.includes(':')) {
    const [h, m] = str.split(':').map(Number);
    return h + (m / 60);
  }
  
  // Format "H.H" ou nombre
  return parseFloat(str) || 0;
}

/**
 * Détermine si l'employé est en CDD de courte durée
 */
function isCDDCourteDuree(employee) {
  // CDD court = contrat avec heures totales ET jours totaux renseignés
  return !!(
    employee?.contract_total_hours && 
    employee?.contract_total_days
  );
}

/**
 * Calcule les heures générées par jour pour un employé
 * @param {Object} employee - Fiche employé avec données contrat
 * @returns {number} Heures générées par jour (décimal)
 */
export function calculateDailyGeneratedHours(employee) {
  if (!employee) return 0;
  
  // CDD de courte durée : heures_totales / jours_totaux
  if (isCDDCourteDuree(employee)) {
    const totalHours = parseHours(employee.contract_total_hours);
    const totalDays = employee.contract_total_days || 0;
    
    if (totalDays === 0) return 0;
    return totalHours / totalDays;
  }
  
  // Cas général : heures_hebdo / jours_travail_semaine
  const weeklyHours = parseHours(employee.contract_hours_weekly);
  const daysPerWeek = employee.work_days_per_week || 0;
  
  if (daysPerWeek === 0) return 0;
  return weeklyHours / daysPerWeek;
}

/**
 * Calcule les heures totales générées par une liste de non-shifts
 * @param {Array} nonShiftEvents - Liste des non-shifts
 * @param {Array} nonShiftTypes - Types de non-shifts avec options
 * @param {Object} employee - Fiche employé
 * @param {boolean} debug - Mode debug
 * @returns {Object} { totalHours, debugInfo }
 */
export function calculateNonShiftGeneratedHours(nonShiftEvents, nonShiftTypes, employee, debug = false) {
  if (!nonShiftEvents || !nonShiftTypes || !employee) {
    return { totalHours: 0, debugInfo: [] };
  }
  
  const dailyHours = calculateDailyGeneratedHours(employee);
  const debugInfo = [];
  let totalHours = 0;
  
  for (const event of nonShiftEvents) {
    // Trouver le type correspondant
    const type = nonShiftTypes.find(t => t.id === event.non_shift_type_id);
    
    if (!type) {
      if (debug) {
        debugInfo.push({
          date: event.date,
          label: event.non_shift_type_label || '???',
          generatesHours: false,
          hoursGenerated: 0,
          reason: 'Type non trouvé'
        });
      }
      continue;
    }
    
    // Vérifier si ce type génère des heures
    const generates = type.generates_work_hours === true;
    
    if (generates) {
      totalHours += dailyHours;
    }
    
    if (debug) {
      debugInfo.push({
        date: event.date,
        label: type.label,
        generatesHours: generates,
        hoursGenerated: generates ? dailyHours : 0,
        method: isCDDCourteDuree(employee) ? 'CDD_court' : 'hebdomadaire'
      });
    }
  }
  
  return { totalHours, debugInfo };
}

/**
 * Calcule les heures générées par un seul non-shift
 * @param {Object} nonShiftEvent - Événement non-shift
 * @param {Array} nonShiftTypes - Types de non-shifts
 * @param {Object} employee - Fiche employé
 * @returns {number} Heures générées (0 si non applicable)
 */
export function calculateSingleNonShiftHours(nonShiftEvent, nonShiftTypes, employee) {
  if (!nonShiftEvent || !nonShiftTypes || !employee) return 0;
  
  const type = nonShiftTypes.find(t => t.id === nonShiftEvent.non_shift_type_id);
  if (!type || !type.generates_work_hours) return 0;
  
  return calculateDailyGeneratedHours(employee);
}

/**
 * Calcule les heures décomptées par une liste de non-shifts
 * @param {Array} nonShiftEvents - Liste des non-shifts
 * @param {Array} nonShiftTypes - Types de non-shifts avec options
 * @param {Object} employee - Fiche employé
 * @param {boolean} debug - Mode debug
 * @returns {Object} { totalHours, debugInfo }
 */
export function calculateNonShiftDeductedHours(nonShiftEvents, nonShiftTypes, employee, debug = false) {
  if (!nonShiftEvents || !nonShiftTypes || !employee) {
    return { totalHours: 0, debugInfo: [] };
  }
  
  const dailyHours = calculateDailyGeneratedHours(employee);
  const debugInfo = [];
  let totalHours = 0;
  
  for (const event of nonShiftEvents) {
    // Trouver le type correspondant
    const type = nonShiftTypes.find(t => t.id === event.non_shift_type_id);
    
    if (!type) {
      if (debug) {
        debugInfo.push({
          date: event.date,
          label: event.non_shift_type_label || '???',
          deductsHours: false,
          hoursDeducted: 0,
          reason: 'Type non trouvé'
        });
      }
      continue;
    }
    
    // Vérifier si ce type décompte des heures
    const deducts = type.deducts_hours === true;
    
    if (deducts) {
      totalHours += dailyHours;
    }
    
    if (debug) {
      debugInfo.push({
        date: event.date,
        label: type.label,
        deductsHours: deducts,
        hoursDeducted: deducts ? dailyHours : 0,
        method: isCDDCourteDuree(employee) ? 'CDD_court' : 'hebdomadaire'
      });
    }
  }
  
  return { totalHours, debugInfo };
}