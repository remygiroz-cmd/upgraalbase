/**
 * Helper central pour l'affichage des heures dans l'app.
 * NE JAMAIS faire de formatage d'heures directement dans les composants.
 * Toujours passer par ces fonctions.
 */

/**
 * Convertit des minutes (entier) en chaîne HH:MM (ex: 90 -> "1h30")
 */
export function minutesToHHMM(totalMinutes) {
  const mins = Math.round(totalMinutes);
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  const sign = mins < 0 ? '-' : '';
  return `${sign}${h}h${m.toString().padStart(2, '0')}`;
}

/**
 * Convertit des minutes (entier) en décimal arrondi (ex: 90 -> "1.50h")
 */
export function minutesToDecimal(totalMinutes, decimals = 2) {
  const mins = Math.round(totalMinutes);
  const val = mins / 60;
  return `${val.toFixed(decimals)}h`;
}

/**
 * Formate des minutes selon le mode choisi.
 * @param {number} totalMinutes
 * @param {'HHMM'|'DECIMAL'} mode
 * @returns {string}
 */
export function formatMinutes(totalMinutes, mode) {
  if (totalMinutes === null || totalMinutes === undefined || isNaN(totalMinutes)) return '-';
  if (mode === 'DECIMAL') return minutesToDecimal(totalMinutes);
  return minutesToHHMM(totalMinutes); // default HHMM
}

/**
 * Formate des heures (float) selon le mode choisi.
 * Convertit d'abord en minutes pour éviter le drift float.
 * @param {number} hoursFloat
 * @param {'HHMM'|'DECIMAL'} mode
 * @returns {string}
 */
export function formatHours(hoursFloat, mode) {
  if (hoursFloat === null || hoursFloat === undefined || isNaN(hoursFloat)) return '-';
  const totalMinutes = Math.round(hoursFloat * 60);
  return formatMinutes(totalMinutes, mode);
}