/**
 * Utilitaires de gestion des dates pour le planning
 * IMPORTANT : Les dates dans le planning sont des date-only (YYYY-MM-DD)
 * et doivent être traitées en timezone locale, jamais en UTC.
 */

/**
 * Parse une date string "YYYY-MM-DD" en objet Date LOCAL
 * Ne jamais utiliser new Date("YYYY-MM-DD") qui parse en UTC
 */
export function parseLocalDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Convertit un objet Date en string "YYYY-MM-DD" en timezone locale
 * Ne jamais utiliser toISOString() qui convertit en UTC
 */
export function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Obtient le jour de la semaine ISO (1=Lundi, 7=Dimanche) depuis une date string
 */
export function getIsoDayOfWeek(dateStr) {
  const date = parseLocalDate(dateStr);
  const jsDay = date.getDay(); // 0=Dimanche, 1=Lundi, ..., 6=Samedi
  return jsDay === 0 ? 7 : jsDay; // Convertir Dimanche (0) en 7
}

/**
 * Obtient le nom du jour en français depuis une date string
 */
export function getDayName(dateStr) {
  const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const date = parseLocalDate(dateStr);
  return dayNames[date.getDay()];
}