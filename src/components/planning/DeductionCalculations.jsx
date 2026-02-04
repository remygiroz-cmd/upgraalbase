/**
 * STUB MODULE - DeductionCalculations
 * 
 * Après reset complet du protocole de calcul des heures,
 * ce fichier est réduit à un stub retournant des valeurs neutres.
 * 
 * Aucun calcul d'heures supplémentaires, complémentaires, ou déductions n'est effectué.
 * Les imports existants reçoivent simplement 0.
 */

/**
 * Placeholder: calculateMonthlyContractHours
 * Retourne 0 - le calcul est fait inline dans ExportComptaModal
 */
export function calculateMonthlyContractHours(employee) {
  return 0;
}

/**
 * Placeholder: calculateDeductedHours
 * Retourne { total: 0 } - aucune déduction
 */
export function calculateDeductedHours(employee, nonShiftEvents, nonShiftTypes, monthStart, monthEnd) {
  return { total: 0 };
}

/**
 * Placeholder: calculatePaidBaseHours
 * Retourne 0 - aucun calcul de base payée
 */
export function calculatePaidBaseHours(employee, nonShiftEvents, nonShiftTypes, monthStart, monthEnd) {
  return 0;
}