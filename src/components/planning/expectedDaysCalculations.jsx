/**
 * Calcule les jours prévus basés sur le planning type
 */

/**
 * Récupère les jours de semaine travaillés selon le planning type
 * Retourne un set avec les jours travaillés (1=Lundi, 7=Dimanche)
 */
export const getExpectedDaysOfWeek = (templateWeeks, templateShifts) => {
  if (!templateWeeks || templateWeeks.length === 0) {
    return null; // Pas de planning type
  }

  if (templateWeeks.length > 1) {
    return 'multiple'; // Multiple plannings types
  }

  // Exactement 1 planning type
  const template = templateWeeks[0];
  const shiftsForTemplate = templateShifts.filter(ts => ts.template_week_id === template.id);
  
  // Extraire les jours uniques
  const daysSet = new Set(shiftsForTemplate.map(ts => ts.day_of_week));
  
  return daysSet.size > 0 ? daysSet : null;
};

/**
 * Compte combien de fois chaque jour de semaine apparaît dans le mois
 */
const getDayCountsInMonth = (monthStart, monthEnd) => {
  const counts = {
    1: 0, // Lundi
    2: 0, // Mardi
    3: 0, // Mercredi
    4: 0, // Jeudi
    5: 0, // Vendredi
    6: 0, // Samedi
    7: 0  // Dimanche
  };

  for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
    const jsDay = d.getDay(); // 0=Dimanche, 1=Lundi, ..., 6=Samedi
    const isoDay = jsDay === 0 ? 7 : jsDay; // Convertir en ISO (1=Lundi, 7=Dimanche)
    counts[isoDay]++;
  }

  return counts;
};

/**
 * Calcule les jours prévus pour un employé sur un mois
 * @returns { status, expectedDays, reason } ou null si non calculable
 */
export const calculateExpectedDaysOfMonth = (templateWeeks, templateShifts, monthStart, monthEnd) => {
  const expectedDaysOfWeek = getExpectedDaysOfWeek(templateWeeks, templateShifts);

  if (expectedDaysOfWeek === null) {
    return {
      status: 'undefined',
      expectedDays: null,
      reason: 'Aucun planning type défini'
    };
  }

  if (expectedDaysOfWeek === 'multiple') {
    return {
      status: 'non_calculable',
      expectedDays: null,
      reason: 'Plusieurs plannings types'
    };
  }

  // Compter les occurrences de chaque jour dans le mois
  const dayCounts = getDayCountsInMonth(monthStart, monthEnd);

  // Sommer les jours prévus
  let expectedDays = 0;
  expectedDaysOfWeek.forEach(day => {
    expectedDays += dayCounts[day];
  });

  return {
    status: 'calculated',
    expectedDays,
    reason: null
  };
};

/**
 * Compte les jours réalisés (jours avec au moins 1 shift)
 */
export const calculateRealizedDays = (shifts, employeeId, monthStart, monthEnd) => {
  const monthShifts = shifts.filter(s => {
    if (s.employee_id !== employeeId) return false;
    const shiftDate = new Date(s.date);
    return shiftDate >= monthStart && shiftDate <= monthEnd;
  });

  // Obtenir les dates uniques
  const uniqueDates = new Set(monthShifts.map(s => s.date));
  return uniqueDates.size;
};

/**
 * Calcule l'écart (réalisé - prévu) et retourne une classe de couleur
 */
export const getGapColor = (gap) => {
  if (gap === 0) return 'bg-green-100 text-green-900 border-green-300';
  if (gap >= -2 && gap <= 2) return 'bg-yellow-100 text-yellow-900 border-yellow-300';
  if (gap > 2) return 'bg-orange-100 text-orange-900 border-orange-300';
  // gap < -2
  return 'bg-red-100 text-red-900 border-red-300';
};

export const getGapTextColor = (gap) => {
  if (gap === 0) return 'text-green-700';
  if (gap >= -2 && gap <= 2) return 'text-yellow-700';
  if (gap > 2) return 'text-orange-700';
  return 'text-red-700';
};