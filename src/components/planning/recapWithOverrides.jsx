/**
 * LOGIQUE CENTRALISÉE : RÉCAP FINAL = AUTO + OVERRIDES EXPORT
 * 
 * Source de vérité unique pour afficher les valeurs finales dans :
 * - MonthlySummary (carte récap planning)
 * - ExportComptaModal (export PDF/email)
 */

/**
 * Applique les overrides export sur un récap calculé automatiquement
 * @param {Object} autoRecap - Récap calculé automatiquement
 * @param {Object} override - Override depuis ExportComptaOverride entity (peut être null)
 * @returns {Object} Récap final avec overrides appliqués
 */
export function applyExportOverrides(autoRecap, override) {
  if (!override) {
    return { ...autoRecap };
  }

  // Appliquer les overrides uniquement si définis (non null/undefined)
  return {
    ...autoRecap,
    // Jours
    workedDays: override.override_nbJoursTravailles ?? autoRecap.workedDays,
    extraDays: override.override_joursSupp ?? autoRecap.extraDays,
    
    // Heures de base
    workedHours: override.override_payeesHorsSupComp ?? autoRecap.workedHours,
    
    // Heures complémentaires
    complementaryHours10: override.override_compl10 ?? autoRecap.complementaryHours10,
    complementaryHours25: override.override_compl25 ?? autoRecap.complementaryHours25,
    
    // Heures supplémentaires
    overtimeHours25: override.override_supp25 ?? autoRecap.overtimeHours25,
    overtimeHours50: override.override_supp50 ?? autoRecap.overtimeHours50,
    
    // Jours fériés
    holidaysWorkedDays: override.override_ferieDays ?? autoRecap.holidaysWorkedDays,
    holidaysWorkedHours: override.override_ferieHours ?? autoRecap.holidaysWorkedHours,
    ferieEligible: (override.override_ferieDays ?? autoRecap.holidaysWorkedDays) > 0,
    ferieDays: override.override_ferieDays ?? autoRecap.ferieDays,
    ferieHours: override.override_ferieHours ?? autoRecap.ferieHours,
    
    // Métadonnées
    hasOverride: true,
    overrideSource: override
  };
}

/**
 * Récupère le récap final pour un employé (avec overrides si existants)
 * @param {string} monthKey - Clé du mois YYYY-MM
 * @param {string} employeeId - ID de l'employé
 * @param {Object} autoRecap - Récap calculé automatiquement
 * @param {Array} overrides - Liste des overrides du mois
 * @returns {Object} Récap final
 */
export function getFinalRecap(monthKey, employeeId, autoRecap, overrides) {
  const override = overrides.find(o => 
    o.month_key === monthKey && o.employee_id === employeeId
  );
  
  return applyExportOverrides(autoRecap, override);
}