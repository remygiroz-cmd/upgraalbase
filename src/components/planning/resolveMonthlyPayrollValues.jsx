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
  // ─── Décider si les overrides sont actifs ───────────────────────────────────
  // recapPersisted n'est utilisé QUE si l'utilisateur a manuellement saisi (is_manual_override=true)
  const usePersistedOverride = isManualPersisted(recapPersisted);
  // recapExtras n'est utilisé QUE s'il contient au moins un vrai champ saisi
  const useExtrasOverride = hasAnyExtrasOverride(recapExtras);

  // Source debug
  const source = usePersistedOverride ? 'manualOverride' : (useExtrasOverride ? 'extrasOverride' : 'auto');

  return {
    // ── Heures : override MANUEL UNIQUEMENT > auto ──
    worked_hours:           usePersistedOverride ? resolve(recapPersisted?.worked_hours, autoRecap?.workedHours) : autoRecap?.workedHours,
    complementary_hours_10: usePersistedOverride ? resolve(recapPersisted?.complementary_hours_10, autoRecap?.complementaryHours10) : autoRecap?.complementaryHours10,
    complementary_hours_25: usePersistedOverride ? resolve(recapPersisted?.complementary_hours_25, autoRecap?.complementaryHours25) : autoRecap?.complementaryHours25,
    overtime_hours_25:      usePersistedOverride ? resolve(recapPersisted?.overtime_hours_25, autoRecap?.overtimeHours25) : autoRecap?.overtimeHours25,
    overtime_hours_50:      usePersistedOverride ? resolve(recapPersisted?.overtime_hours_50, autoRecap?.overtimeHours50) : autoRecap?.overtimeHours50,
    complementary_hours_ui: usePersistedOverride ? resolve(recapPersisted?.complementary_hours_ui, autoRecap?.totalComplementaryHours) : autoRecap?.totalComplementaryHours,
    overtime_hours_ui:      usePersistedOverride ? resolve(recapPersisted?.overtime_hours_ui, autoRecap?.totalOvertimeHours) : autoRecap?.totalOvertimeHours,

    // ── Jours (depuis recapExtras override > auto) ──
    jours_travailles:       useExtrasOverride ? resolve(recapExtras?.jours_travailles, autoRecap?.workedDays) : autoRecap?.workedDays,
    jours_prevus:           useExtrasOverride ? resolve(recapExtras?.jours_prevus, autoRecap?.expectedDays) : autoRecap?.expectedDays,
    jours_supp:             useExtrasOverride ? resolve(recapExtras?.jours_supp, autoRecap?.extraDays) : autoRecap?.extraDays,

    // ── Fériés (depuis recapExtras override > auto) ──
    ferie_jours:            useExtrasOverride ? resolve(recapExtras?.ferie_jours, autoRecap?.holidaysWorkedDays) : autoRecap?.holidaysWorkedDays,
    ferie_heures:           useExtrasOverride ? resolve(recapExtras?.ferie_heures, autoRecap?.holidaysWorkedHours) : autoRecap?.holidaysWorkedHours,

    // ── CP (depuis recapExtras override > auto) ──
    cp_decomptes:           useExtrasOverride ? resolve(recapExtras?.cp_decomptes, autoRecap?.cpDays) : autoRecap?.cpDays,

    // ── Payées (depuis recapExtras override > auto) ──
    payees_hors_sup_comp:   useExtrasOverride ? resolve(recapExtras?.payees_hors_sup_comp, autoRecap?.paidHours) : autoRecap?.paidHours,

    // ── Non-shifts visibles ──
    non_shifts_visibles:    useExtrasOverride ? resolve(recapExtras?.non_shifts_visibles, autoRecap?.nonShiftsStr) : autoRecap?.nonShiftsStr,

    // ── Notes ──
    notes: useExtrasOverride ? (recapExtras?.notes || null) : null,

    // Métadonnées
    hasRecapOverride: usePersistedOverride || useExtrasOverride,
    _source: source, // debug
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
  // Même logique stricte : recapPersisted uniquement si manuel, recapExtras si non vide
  const usePersistedOverride = isManualPersisted(recapPersisted);
  const useExtrasOverride = hasAnyExtrasOverride(recapExtras);

  // Helper local : exportOverride > recap override (manuel seulement) > auto
  const r3 = (expVal, recapVal, useRecap, autoVal) => {
    if (expVal !== null && expVal !== undefined) return expVal;
    if (useRecap && recapVal !== null && recapVal !== undefined) return recapVal;
    return autoVal;
  };

  return {
    nb_jours_travailles:  r3(exportOverride?.nb_jours_travailles, recapExtras?.jours_travailles, useExtrasOverride, autoExport?.nbJoursTravailles),
    jours_supp:           r3(exportOverride?.jours_supp, recapExtras?.jours_supp, useExtrasOverride, autoExport?.joursSupp),
    payees_hors_sup_comp: r3(exportOverride?.payees_hors_sup_comp, recapExtras?.payees_hors_sup_comp, useExtrasOverride, autoExport?.payeesHorsSup),
    compl_10:             r3(exportOverride?.compl_10, recapPersisted?.complementary_hours_10, usePersistedOverride, autoExport?.compl10),
    compl_25:             r3(exportOverride?.compl_25, recapPersisted?.complementary_hours_25, usePersistedOverride, autoExport?.compl25),
    supp_25:              r3(exportOverride?.supp_25, recapPersisted?.overtime_hours_25, usePersistedOverride, autoExport?.supp25),
    supp_50:              r3(exportOverride?.supp_50, recapPersisted?.overtime_hours_50, usePersistedOverride, autoExport?.supp50),
    ferie_jours:          r3(exportOverride?.ferie_jours, recapExtras?.ferie_jours, useExtrasOverride, autoExport?.ferieDays),
    ferie_heures:         r3(exportOverride?.ferie_heures, recapExtras?.ferie_heures, useExtrasOverride, autoExport?.ferieHours),
    non_shifts_visibles:  r3(exportOverride?.non_shifts_visibles, recapExtras?.non_shifts_visibles, useExtrasOverride, autoExport?.nonShiftsStr),
    cp_decomptes:         r3(exportOverride?.cp_decomptes, recapExtras?.cp_decomptes != null ? String(recapExtras.cp_decomptes) : null, useExtrasOverride, autoExport?.cpStr),

    hasExportOverride: !!exportOverride,
    hasRecapOverride:  usePersistedOverride || useExtrasOverride,
  };
}