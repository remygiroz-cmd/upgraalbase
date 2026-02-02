// Vérifications juridiques pour la convention HCR

export const calculateShiftDuration = (shift) => {
  const [startH, startM] = shift.start_time.split(':').map(Number);
  const [endH, endM] = shift.end_time.split(':').map(Number);
  
  let totalMinutes = (endH * 60 + endM) - (startH * 60 + startM);
  if (totalMinutes < 0) totalMinutes += 24 * 60;
  
  totalMinutes -= (shift.break_minutes || 0);
  return totalMinutes / 60; // heures
};

export const checkMinimumRest = (shifts, newShift) => {
  // Vérifier 11h de repos entre shifts
  // Note: Le repos de 11h s'applique uniquement entre des jours différents
  const sortedShifts = [...shifts, newShift].sort((a, b) => {
    const dateA = new Date(a.date + 'T' + a.end_time);
    const dateB = new Date(b.date + 'T' + b.end_time);
    return dateA - dateB;
  });

  for (let i = 0; i < sortedShifts.length - 1; i++) {
    const current = sortedShifts[i];
    const next = sortedShifts[i + 1];
    
    // Si les shifts sont le même jour, pas besoin de vérifier le repos de 11h
    if (current.date === next.date) {
      continue;
    }
    
    const currentEnd = new Date(current.date + 'T' + current.end_time);
    const nextStart = new Date(next.date + 'T' + next.start_time);
    
    const restHours = (nextStart - currentEnd) / (1000 * 60 * 60);
    
    if (restHours < 11) {
      return {
        valid: false,
        message: `Repos insuffisant (${restHours.toFixed(1)}h). Minimum légal : 11h entre deux shifts.`
      };
    }
  }
  
  return { valid: true };
};

export const checkDailyHours = (shifts) => {
  // Vérifier amplitude journalière (max 10h recommandé)
  const totalDuration = shifts.reduce((sum, shift) => sum + calculateShiftDuration(shift), 0);
  
  if (totalDuration > 10) {
    return {
      warning: true,
      message: `Amplitude journalière de ${totalDuration.toFixed(1)}h dépasse les 10h recommandées.`
    };
  }
  
  return { warning: false };
};

export const calculateWeeklyHours = (shifts, employeeId, weekStart) => {
  // Calculer heures hebdomadaires
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  
  const weekShifts = shifts.filter(s => {
    if (s.employee_id !== employeeId) return false;
    const shiftDate = new Date(s.date);
    return shiftDate >= weekStart && shiftDate <= weekEnd;
  });
  
  const totalHours = weekShifts.reduce((sum, shift) => sum + calculateShiftDuration(shift), 0);
  
  return {
    total: totalHours,
    normal: Math.min(totalHours, 35),
    overtime: Math.max(0, totalHours - 35),
    hasOvertime: totalHours > 35
  };
};

export const checkConflictingAbsence = (absences, date, employeeId) => {
  // Vérifier si employé en congé/absence
  return absences.some(absence => {
    if (absence.employee_id !== employeeId) return false;
    const absenceStart = new Date(absence.start_date);
    const absenceEnd = new Date(absence.end_date);
    const checkDate = new Date(date);
    return checkDate >= absenceStart && checkDate <= absenceEnd;
  });
};