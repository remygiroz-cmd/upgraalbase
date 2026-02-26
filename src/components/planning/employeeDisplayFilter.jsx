/**
 * Fonction centrale de filtrage des employés dans le planning.
 * Ordre de priorité :
 *  1. force_hide_in_planning → toujours masqué
 *  2. force_show_in_planning → toujours affiché
 *  3. Règles contrat + archivage
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

  // PRIORITÉ 3 – Règles normales

  // Pas de date de début → on n'affiche pas
  if (!employee.start_date) return false;

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(employee.start_date);
  const end = employee.end_date ? new Date(employee.end_date) : null;

  // Contrat actif pour ce mois ?
  const contractActive =
    start <= lastDayOfMonth &&
    (!end || end >= firstDayOfMonth);

  if (!contractActive) return false;

  // Archivé → disparaît du présent et futur
  if (employee.is_active === false) {
    if (lastDayOfMonth >= today) return false;
  }

  return true;
}