/**
 * SOURCE DE VÉRITÉ UNIQUE pour la fusion des valeurs de paie mensuelles.
 *
 * RÈGLE DE PRIORITÉ :
 * - Pour le récap planning  : recapExtras/recapPersisted (MANUAL ONLY) > autoRecap
 * - Pour l'export compta    : exportOverride > recapExtras/recapPersisted (MANUAL ONLY) > autoExport
 *
 * IMPORTANT : recapPersisted n'est utilisé comme override QUE si is_manual_override === true.
 * Les enregistrements auto (is_manual_override absent/false) sont ignorés : on repart du calcul live.
 *
 * Auto = null/undefined = ne jamais convertir en 0.
 */

/** Résout la valeur finale : override > auto (null si aucun) */
function resolve(overrideVal, autoVal) {
  return overrideVal !== null && overrideVal !== undefined ? overrideVal : autoVal;
}

/**
 * Vérifie si un recapPersisted est un vrai override manuel (saisi par l'utilisateur).
 * Un record sans is_manual_override (ou false) est un cache auto → ignoré.
 */
function isManualPersisted(recapPersisted) {
  return recapPersisted?.is_manual_override === true;
}

/**
 * Vérifie si un recapExtras contient au moins un champ réellement saisi.
 * Un record avec tous champs null/undefined est ignoré.
 */
function hasAnyExtrasOverride(recapExtras) {
  if (!recapExtras) return false;
  const fields = ['jours_travailles', 'jours_prevus', 'jours_supp', 'ferie_jours', 'ferie_heures', 'cp_decomptes', 'payees_hors_sup_comp', 'non_shifts_visibles', 'notes'];
  return fields.some(f => recapExtras[f] !== null && recapExtras[f] !== undefined && recapExtras[f] !== '');
}

/**
 * resolveRecapFinal
 * Retourne les valeurs affichées dans la carte récap du planning.
 *
 * @param {Object} autoRecap        - Valeurs calculées automatiquement
 * @param {Object|null} recapPersisted - MonthlyRecapPersisted (heures)
 * @param {Object|null} recapExtras    - MonthlyRecapExtrasOverride (jours, CP, fériés…)
 */
export function resolveRecapFinal(autoRecap, recapPersisted, recapExtras) {
  return {
    // ── Heures (depuis recapPersisted override > auto) ──
    worked_hours:           resolve(recapPersisted?.worked_hours, autoRecap?.workedHours),
    complementary_hours_10: resolve(recapPersisted?.complementary_hours_10, autoRecap?.complementaryHours10),
    complementary_hours_25: resolve(recapPersisted?.complementary_hours_25, autoRecap?.complementaryHours25),
    overtime_hours_25:      resolve(recapPersisted?.overtime_hours_25, autoRecap?.overtimeHours25),
    overtime_hours_50:      resolve(recapPersisted?.overtime_hours_50, autoRecap?.overtimeHours50),
    complementary_hours_ui: resolve(recapPersisted?.complementary_hours_ui, autoRecap?.totalComplementaryHours),
    overtime_hours_ui:      resolve(recapPersisted?.overtime_hours_ui, autoRecap?.totalOvertimeHours),

    // ── Jours (depuis recapExtras override > auto) ──
    jours_travailles:       resolve(recapExtras?.jours_travailles, autoRecap?.workedDays),
    jours_prevus:           resolve(recapExtras?.jours_prevus, autoRecap?.expectedDays),
    jours_supp:             resolve(recapExtras?.jours_supp, autoRecap?.extraDays),

    // ── Fériés (depuis recapExtras override > auto) ──
    ferie_jours:            resolve(recapExtras?.ferie_jours, autoRecap?.holidaysWorkedDays),
    ferie_heures:           resolve(recapExtras?.ferie_heures, autoRecap?.holidaysWorkedHours),

    // ── CP (depuis recapExtras override > auto) ──
    cp_decomptes:           resolve(recapExtras?.cp_decomptes, autoRecap?.cpDays),

    // ── Payées (depuis recapExtras override > auto) ──
    payees_hors_sup_comp:   resolve(recapExtras?.payees_hors_sup_comp, autoRecap?.paidHours),

    // ── Non-shifts visibles ──
    non_shifts_visibles:    resolve(recapExtras?.non_shifts_visibles, autoRecap?.nonShiftsStr),

    // ── Notes ──
    notes:                  recapExtras?.notes || null,

    // Métadonnées
    hasRecapOverride: !!(recapPersisted || recapExtras),
  };
}

/**
 * resolveExportFinal
 * Retourne les valeurs utilisées dans l'export compta.
 * Priorité : exportOverride > recapExtras/recapPersisted > autoExport
 *
 * @param {Object} autoExport       - Valeurs calculées automatiquement pour l'export
 * @param {Object|null} recapPersisted
 * @param {Object|null} recapExtras
 * @param {Object|null} exportOverride - MonthlyExportOverride (priorité max)
 */
export function resolveExportFinal(autoExport, recapPersisted, recapExtras, exportOverride) {
  // Helper local : exportOverride > recap override > auto
  const r3 = (expVal, recapVal, autoVal) => {
    if (expVal !== null && expVal !== undefined) return expVal;
    if (recapVal !== null && recapVal !== undefined) return recapVal;
    return autoVal;
  };

  return {
    nb_jours_travailles:  r3(exportOverride?.nb_jours_travailles, recapExtras?.jours_travailles, autoExport?.nbJoursTravailles),
    jours_supp:           r3(exportOverride?.jours_supp, recapExtras?.jours_supp, autoExport?.joursSupp),
    payees_hors_sup_comp: r3(exportOverride?.payees_hors_sup_comp, recapExtras?.payees_hors_sup_comp, autoExport?.payeesHorsSup),
    compl_10:             r3(exportOverride?.compl_10, recapPersisted?.complementary_hours_10, autoExport?.compl10),
    compl_25:             r3(exportOverride?.compl_25, recapPersisted?.complementary_hours_25, autoExport?.compl25),
    supp_25:              r3(exportOverride?.supp_25, recapPersisted?.overtime_hours_25, autoExport?.supp25),
    supp_50:              r3(exportOverride?.supp_50, recapPersisted?.overtime_hours_50, autoExport?.supp50),
    ferie_jours:          r3(exportOverride?.ferie_jours, recapExtras?.ferie_jours, autoExport?.ferieDays),
    ferie_heures:         r3(exportOverride?.ferie_heures, recapExtras?.ferie_heures, autoExport?.ferieHours),
    non_shifts_visibles:  r3(exportOverride?.non_shifts_visibles, recapExtras?.non_shifts_visibles, autoExport?.nonShiftsStr),
    cp_decomptes:         r3(exportOverride?.cp_decomptes, recapExtras?.cp_decomptes != null ? String(recapExtras.cp_decomptes) : null, autoExport?.cpStr),

    hasExportOverride: !!exportOverride,
    hasRecapOverride:  !!(recapPersisted || recapExtras),
  };
}