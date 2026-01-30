/**
 * Gestion du "jour de service" pour les équipes de cuisine
 * 
 * Concept : Le "jour de service" ne change pas à minuit (00h00) mais à 6h du matin.
 * 
 * Exemples :
 * - Le 30 janvier à 23h30 → jour de service = "2026-01-30"
 * - Le 31 janvier à 00h30 → jour de service = "2026-01-30" (encore le service du 30)
 * - Le 31 janvier à 05h59 → jour de service = "2026-01-30" (toujours le service du 30)
 * - Le 31 janvier à 06h00 → jour de service = "2026-01-31" (nouveau service du 31)
 * 
 * Cela évite que les sessions disparaissent à minuit pour les équipes travaillant de nuit.
 */

import { format, subHours } from 'date-fns';

/**
 * Heure de changement de jour de service (6h du matin)
 */
const SERVICE_DAY_CUTOFF_HOUR = 6;

/**
 * Retourne le "jour de service" actuel
 * Si on est avant 6h du matin, on considère qu'on est encore sur le service de la veille
 * 
 * @returns {string} Date au format 'yyyy-MM-dd' représentant le jour de service
 * 
 * @example
 * // 30 janvier 2026 à 23h30
 * getServiceDate() // → "2026-01-30"
 * 
 * // 31 janvier 2026 à 01h00 (après minuit)
 * getServiceDate() // → "2026-01-30" (encore le service du 30)
 * 
 * // 31 janvier 2026 à 06h00
 * getServiceDate() // → "2026-01-31" (nouveau service du 31)
 */
export function getServiceDate() {
  const now = new Date();
  const currentHour = now.getHours();
  
  // Si on est avant 6h du matin, on considère qu'on est encore sur le service de la veille
  if (currentHour < SERVICE_DAY_CUTOFF_HOUR) {
    // Reculer de 6 heures pour obtenir la date du service précédent
    const serviceDate = subHours(now, 6);
    return format(serviceDate, 'yyyy-MM-dd');
  }
  
  // Sinon, on est sur le service du jour actuel
  return format(now, 'yyyy-MM-dd');
}

/**
 * Retourne une date spécifique ajustée selon l'heure de service
 * Utile pour convertir une date système en date de service
 * 
 * @param {Date|string} date - Date à convertir
 * @returns {string} Date au format 'yyyy-MM-dd' représentant le jour de service
 */
export function getServiceDateFromDate(date) {
  const d = new Date(date);
  const hour = d.getHours();
  
  if (hour < SERVICE_DAY_CUTOFF_HOUR) {
    const serviceDate = subHours(d, 6);
    return format(serviceDate, 'yyyy-MM-dd');
  }
  
  return format(d, 'yyyy-MM-dd');
}

/**
 * Vérifie si une date donnée correspond au jour de service actuel
 * 
 * @param {string} dateString - Date au format 'yyyy-MM-dd'
 * @returns {boolean} true si c'est le jour de service actuel
 */
export function isCurrentServiceDate(dateString) {
  return dateString === getServiceDate();
}

/**
 * Retourne l'heure de début et de fin d'un jour de service
 * Utile pour les requêtes de filtrage
 * 
 * @param {string} serviceDateString - Date du service au format 'yyyy-MM-dd'
 * @returns {{ start: Date, end: Date }} Début et fin du jour de service
 * 
 * @example
 * getServiceDateRange('2026-01-30')
 * // → { 
 * //     start: 2026-01-30 06:00:00,
 * //     end: 2026-01-31 05:59:59
 * //   }
 */
export function getServiceDateRange(serviceDateString) {
  const [year, month, day] = serviceDateString.split('-').map(Number);
  
  // Début du service : 6h00 du jour
  const start = new Date(year, month - 1, day, SERVICE_DAY_CUTOFF_HOUR, 0, 0, 0);
  
  // Fin du service : 5h59 du lendemain
  const end = new Date(year, month - 1, day + 1, SERVICE_DAY_CUTOFF_HOUR - 1, 59, 59, 999);
  
  return { start, end };
}

/**
 * Affiche un message d'information sur le jour de service actuel
 * Utile pour le debugging
 */
export function logServiceDateInfo() {
  const now = new Date();
  const systemDate = format(now, 'yyyy-MM-dd HH:mm');
  const serviceDate = getServiceDate();
  const { start, end } = getServiceDateRange(serviceDate);
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📅 JOUR DE SERVICE - INFORMATIONS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🕐 Heure système     : ${systemDate}`);
  console.log(`📆 Jour de service   : ${serviceDate}`);
  console.log(`🌅 Début du service  : ${format(start, 'yyyy-MM-dd HH:mm')}`);
  console.log(`🌙 Fin du service    : ${format(end, 'yyyy-MM-dd HH:mm')}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}