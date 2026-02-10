/**
 * Weekly hours calculation utilities
 * Used for planning and weekly summaries
 */

/**
 * Parse contract hours from string format to decimal
 * Supports "HH:MM" or decimal formats
 * @param {string|number} hoursString 
 * @returns {number} decimal hours
 */
export function parseContractHours(hoursString) {
  if (typeof hoursString === 'number') return hoursString;
  if (!hoursString) return 0;
  
  const str = String(hoursString).trim();
  
  // Check if it's HH:MM format
  if (str.includes(':')) {
    const [hours, minutes] = str.split(':').map(s => parseInt(s, 10));
    return hours + (minutes || 0) / 60;
  }
  
  // Otherwise try to parse as decimal
  const parsed = parseFloat(str.replace(',', '.'));
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Calculate shift duration in decimal hours
 * @param {Object} shift - Shift object with start_time, end_time, break_minutes
 * @returns {number} duration in decimal hours
 */
export function calculateShiftDuration(shift) {
  if (!shift || !shift.start_time || !shift.end_time) return 0;

  // Use base_hours_override if present
  if (shift.base_hours_override !== null && shift.base_hours_override !== undefined) {
    return shift.base_hours_override;
  }

  const [startHour, startMin] = shift.start_time.split(':').map(Number);
  const [endHour, endMin] = shift.end_time.split(':').map(Number);

  let totalMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
  
  // Handle overnight shifts
  if (totalMinutes < 0) {
    totalMinutes += 24 * 60;
  }

  // Subtract break
  const breakMinutes = shift.break_minutes || 0;
  totalMinutes -= breakMinutes;

  return Math.max(0, totalMinutes / 60);
}

/**
 * Format a date object to YYYY-MM-DD string in local timezone (Europe/Paris)
 * @param {Date} date
 * @returns {string} formatted date
 */
export function formatLocalDate(date) {
  if (!date) return null;
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Get week number in a month (1-5)
 * @param {Date} date
 * @returns {number} week number
 */
export function getWeekOfMonth(date) {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  const firstMonday = new Date(firstDay);
  
  // Find first Monday
  while (firstMonday.getDay() !== 1) {
    firstMonday.setDate(firstMonday.getDate() + 1);
  }
  
  const diffTime = date.getTime() - firstMonday.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  return Math.floor(diffDays / 7) + 1;
}

/**
 * Parse hours string to decimal (accepts "HH:MM" or decimal)
 * @param {string|number} value
 * @returns {number} decimal hours
 */
export function parseHoursString(value) {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  
  const str = String(value).trim();
  
  // HH:MM format
  if (str.includes(':')) {
    const [h, m] = str.split(':').map(s => parseInt(s, 10) || 0);
    return h + m / 60;
  }
  
  // Decimal format
  const parsed = parseFloat(str.replace(',', '.'));
  return isNaN(parsed) ? 0 : parsed;
}