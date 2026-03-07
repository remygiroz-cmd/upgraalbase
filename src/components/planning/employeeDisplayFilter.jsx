/**
 * Fonction centrale de filtrage des employés dans le planning.
 * Ordre de priorité :
 *  1. force_hide_in_planning → toujours masqué
 *  2. force_show_in_planning → toujours affiché
 *  3. Période de contrat (start_date / end_date) — le statut archivé ne rétroagit PAS
 *
 * Règle métier :
 *  - Un employé est visible dans un planning si le mois concerné est couvert par sa période de contrat.
 *  - Le statut is_active (archivé) ne supprime JAMAIS rétroactivement l'historique des plannings.
 *  - Un employé archivé reste visible dans tous les mois où son contrat était actif.
 *  - Pour les mois futurs (après end_date ou quand is_active=false et pas de end_date) : on masque.
 */

/**
 * @param {object} employee
 * @param {number} year  - ex: 2026
 * @param {number} month - 0-indexed (0 = janvier)
 * @returns {boolean}
 */
export function shouldDisplayEmployeeInPlanning(employee, year, month) {
  if (!employee) return false;

  // PRIORITÉ 1 – Masquage forcé (hard hide)
  if (employee.force_hide_in_planning === true) return false;

  // PRIORITÉ 2 – Affichage forcé (hard show)
  if (employee.force_show_in_planning === true) return true;

  // PRIORITÉ 3 – Période de contrat

  // Pas de date d'embauche → on n'affiche pas
  if (!employee.start_date) return false;

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  const contractStart = new Date(employee.start_date);
  contractStart.setHours(0, 0, 0, 0);

  // Le mois est avant le début du contrat → ne pas afficher
  if (contractStart > lastDayOfMonth) return false;

  // Présence d'une date de fin de contrat
  if (employee.end_date) {
    const contractEnd = new Date(employee.end_date);
    contractEnd.setHours(23, 59, 59, 999);
    // Le mois est après la fin du contrat → ne pas afficher
    if (contractEnd < firstDayOfMonth) return false;
    // Sinon le contrat couvre ce mois → afficher (peu importe is_active)
    return true;
  }

  // Pas de date de fin de contrat :
  // - Si actif → afficher
  // - Si archivé → afficher uniquement les mois passés (jusqu'au mois précédant aujourd'hui)
  if (employee.is_active === false) {
    const today = new Date();
    const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    // Plannings strictement passés → conserver l'historique
    if (lastDayOfMonth < currentMonthStart) return true;
    // Mois courant ou futur → masquer si archivé sans date de fin
    return false;
  }

  return true;
}