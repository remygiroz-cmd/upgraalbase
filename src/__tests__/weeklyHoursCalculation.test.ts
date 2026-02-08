/**
 * Tests pour le calcul d'heures hebdomadaires simplifié
 */
import { describe, it, expect } from 'vitest';
import {
  calculateWeeklyHours,
  calculateShiftDuration,
  parseContractHours,
  formatLocalDate,
  getIsoWeekStart,
  ShiftForCalculation
} from '../lib/weeklyHoursCalculation';

// =============================================================================
// HELPERS
// =============================================================================

function createShift(overrides: Partial<ShiftForCalculation> & { id: string; date: string; employee_id: string }): ShiftForCalculation {
  return {
    start_time: '09:00',
    end_time: '17:00',
    break_minutes: 0,
    status: 'completed',
    ...overrides
  };
}

// =============================================================================
// TESTS UNITAIRES - Fonctions utilitaires
// =============================================================================

describe('calculateShiftDuration', () => {
  it('calcule correctement une durée simple 9h-17h', () => {
    const shift = createShift({ id: '1', date: '2024-01-15', employee_id: 'emp1', start_time: '09:00', end_time: '17:00', break_minutes: 0 });
    expect(calculateShiftDuration(shift)).toBe(8);
  });

  it('soustrait la pause', () => {
    const shift = createShift({ id: '1', date: '2024-01-15', employee_id: 'emp1', start_time: '09:00', end_time: '17:00', break_minutes: 60 });
    expect(calculateShiftDuration(shift)).toBe(7);
  });

  it('gère le passage à minuit', () => {
    const shift = createShift({ id: '1', date: '2024-01-15', employee_id: 'emp1', start_time: '22:00', end_time: '06:00', break_minutes: 0 });
    expect(calculateShiftDuration(shift)).toBe(8);
  });

  it('calcule une durée de 4h', () => {
    const shift = createShift({ id: '1', date: '2024-01-15', employee_id: 'emp1', start_time: '09:00', end_time: '13:00', break_minutes: 0 });
    expect(calculateShiftDuration(shift)).toBe(4);
  });
});

describe('parseContractHours', () => {
  it('parse le format HH:MM', () => {
    expect(parseContractHours('35:00')).toBe(35);
    expect(parseContractHours('10:30')).toBe(10.5);
  });

  it('parse le format numérique', () => {
    expect(parseContractHours('35')).toBe(35);
    expect(parseContractHours('10')).toBe(10);
  });

  it('parse le format avec h', () => {
    expect(parseContractHours('35h')).toBe(35);
    expect(parseContractHours('10h')).toBe(10);
  });

  it('retourne 0 pour valeur null/undefined', () => {
    expect(parseContractHours(null)).toBe(0);
    expect(parseContractHours(undefined)).toBe(0);
  });
});

// =============================================================================
// TESTS DES 4 EXEMPLES UTILISATEUR
// =============================================================================

describe('Exemples utilisateur - Calculs hebdomadaires', () => {
  const employeeId = 'emp1';
  const weekStart = new Date('2024-01-15'); // Un lundi

  // Helper pour créer des shifts qui totalisent X heures
  function createShiftsForHours(hours: number): ShiftForCalculation[] {
    // Créer des shifts de 4h pour totaliser les heures demandées
    const shifts: ShiftForCalculation[] = [];
    let remaining = hours;
    let dayOffset = 0;

    while (remaining > 0) {
      const shiftHours = Math.min(remaining, 8); // Max 8h par jour
      const endHour = 9 + shiftHours;
      shifts.push(createShift({
        id: `s${shifts.length}`,
        date: formatLocalDate(new Date(weekStart.getTime() + dayOffset * 24 * 60 * 60 * 1000)),
        employee_id: employeeId,
        start_time: '09:00',
        end_time: `${String(endHour).padStart(2, '0')}:00`,
        break_minutes: 0
      }));
      remaining -= shiftHours;
      dayOffset++;
    }

    return shifts;
  }

  it('Exemple 1: Contrat 10h, Réalisé 12h → Base 10h / Heures + 2h / Heures - 0h', () => {
    const shifts = createShiftsForHours(12);
    const result = calculateWeeklyHours(shifts, employeeId, weekStart, 10, null);

    expect(result.baseUsed).toBe(10);
    expect(result.workedHours).toBe(12);
    expect(result.plusHours).toBe(2);
    expect(result.minusHours).toBe(0);
  });

  it('Exemple 2: Contrat 10h, Réalisé 8h → Base 10h / Heures + 0h / Heures - 2h', () => {
    const shifts = createShiftsForHours(8);
    const result = calculateWeeklyHours(shifts, employeeId, weekStart, 10, null);

    expect(result.baseUsed).toBe(10);
    expect(result.workedHours).toBe(8);
    expect(result.plusHours).toBe(0);
    expect(result.minusHours).toBe(2);
  });

  it('Exemple 3: Contrat 10h, Base surchargée à 8h, Réalisé 10h → Base 8h / Heures + 2h / Heures - 0h', () => {
    const shifts = createShiftsForHours(10);
    const result = calculateWeeklyHours(shifts, employeeId, weekStart, 10, 8); // baseOverride = 8

    expect(result.contractHoursPerWeek).toBe(10);
    expect(result.baseOverride).toBe(8);
    expect(result.baseUsed).toBe(8);
    expect(result.workedHours).toBe(10);
    expect(result.plusHours).toBe(2);
    expect(result.minusHours).toBe(0);
  });

  it('Exemple 4: Contrat 10h, Base surchargée à 12h, Réalisé 10h → Base 12h / Heures + 0h / Heures - 2h', () => {
    const shifts = createShiftsForHours(10);
    const result = calculateWeeklyHours(shifts, employeeId, weekStart, 10, 12); // baseOverride = 12

    expect(result.contractHoursPerWeek).toBe(10);
    expect(result.baseOverride).toBe(12);
    expect(result.baseUsed).toBe(12);
    expect(result.workedHours).toBe(10);
    expect(result.plusHours).toBe(0);
    expect(result.minusHours).toBe(2);
  });
});

// =============================================================================
// TESTS SUPPLÉMENTAIRES
// =============================================================================

describe('Cas supplémentaires', () => {
  const employeeId = 'emp1';
  const weekStart = new Date('2024-01-15');

  it('Réalisé = Base → Heures + 0 et Heures - 0', () => {
    const shifts = [
      createShift({ id: '1', date: '2024-01-15', employee_id: employeeId, start_time: '09:00', end_time: '19:00', break_minutes: 0 }) // 10h
    ];
    const result = calculateWeeklyHours(shifts, employeeId, weekStart, 10, null);

    expect(result.baseUsed).toBe(10);
    expect(result.workedHours).toBe(10);
    expect(result.plusHours).toBe(0);
    expect(result.minusHours).toBe(0);
  });

  it('Pas de shifts → Réalisé 0h', () => {
    const result = calculateWeeklyHours([], employeeId, weekStart, 10, null);

    expect(result.workedHours).toBe(0);
    expect(result.plusHours).toBe(0);
    expect(result.minusHours).toBe(10);
  });

  it('Shifts annulés ne sont pas comptés', () => {
    const shifts = [
      createShift({ id: '1', date: '2024-01-15', employee_id: employeeId, start_time: '09:00', end_time: '17:00', status: 'completed' }), // 8h comptées
      createShift({ id: '2', date: '2024-01-16', employee_id: employeeId, start_time: '09:00', end_time: '17:00', status: 'cancelled' })  // Non comptée
    ];
    const result = calculateWeeklyHours(shifts, employeeId, weekStart, 10, null);

    expect(result.workedHours).toBe(8);
    expect(result.shiftsCount).toBe(1);
  });

  it('Seuls les shifts de l\'employé concerné sont comptés', () => {
    const shifts = [
      createShift({ id: '1', date: '2024-01-15', employee_id: 'emp1', start_time: '09:00', end_time: '17:00' }), // 8h pour emp1
      createShift({ id: '2', date: '2024-01-16', employee_id: 'emp2', start_time: '09:00', end_time: '17:00' })  // 8h pour emp2
    ];
    const result = calculateWeeklyHours(shifts, 'emp1', weekStart, 10, null);

    expect(result.workedHours).toBe(8);
  });

  it('Seuls les shifts de la semaine sont comptés', () => {
    const shifts = [
      createShift({ id: '1', date: '2024-01-15', employee_id: employeeId, start_time: '09:00', end_time: '17:00' }), // Dans la semaine
      createShift({ id: '2', date: '2024-01-08', employee_id: employeeId, start_time: '09:00', end_time: '17:00' }), // Semaine précédente
      createShift({ id: '3', date: '2024-01-22', employee_id: employeeId, start_time: '09:00', end_time: '17:00' })  // Semaine suivante
    ];
    const result = calculateWeeklyHours(shifts, employeeId, weekStart, 10, null);

    expect(result.workedHours).toBe(8);
    expect(result.shiftsCount).toBe(1);
  });

  it('Base surchargée à 0 = tout est en heures +', () => {
    const shifts = [
      createShift({ id: '1', date: '2024-01-15', employee_id: employeeId, start_time: '09:00', end_time: '17:00' }) // 8h
    ];
    const result = calculateWeeklyHours(shifts, employeeId, weekStart, 10, 0);

    expect(result.baseUsed).toBe(0);
    expect(result.workedHours).toBe(8);
    expect(result.plusHours).toBe(8);
    expect(result.minusHours).toBe(0);
  });

  it('Compte les jours travaillés uniques', () => {
    const shifts = [
      createShift({ id: '1', date: '2024-01-15', employee_id: employeeId, start_time: '09:00', end_time: '13:00' }),
      createShift({ id: '2', date: '2024-01-15', employee_id: employeeId, start_time: '14:00', end_time: '18:00' }), // Même jour
      createShift({ id: '3', date: '2024-01-16', employee_id: employeeId, start_time: '09:00', end_time: '17:00' })
    ];
    const result = calculateWeeklyHours(shifts, employeeId, weekStart, 10, null);

    expect(result.daysWorked.length).toBe(2);
    expect(result.daysWorked).toContain('2024-01-15');
    expect(result.daysWorked).toContain('2024-01-16');
    expect(result.shiftsCount).toBe(3);
  });
});

describe('Temps plein 35h', () => {
  const employeeId = 'emp1';
  const weekStart = new Date('2024-01-15');

  it('35h travaillées sur contrat 35h = équilibre', () => {
    // 5 jours de 7h
    const shifts = [
      createShift({ id: '1', date: '2024-01-15', employee_id: employeeId, start_time: '09:00', end_time: '16:00' }),
      createShift({ id: '2', date: '2024-01-16', employee_id: employeeId, start_time: '09:00', end_time: '16:00' }),
      createShift({ id: '3', date: '2024-01-17', employee_id: employeeId, start_time: '09:00', end_time: '16:00' }),
      createShift({ id: '4', date: '2024-01-18', employee_id: employeeId, start_time: '09:00', end_time: '16:00' }),
      createShift({ id: '5', date: '2024-01-19', employee_id: employeeId, start_time: '09:00', end_time: '16:00' })
    ];
    const result = calculateWeeklyHours(shifts, employeeId, weekStart, 35, null);

    expect(result.workedHours).toBe(35);
    expect(result.plusHours).toBe(0);
    expect(result.minusHours).toBe(0);
  });

  it('39h travaillées sur contrat 35h = 4h en plus', () => {
    // 5 jours de 7h48min = 39h (mais gardons simple avec 7h + 4h de plus)
    const shifts = [
      createShift({ id: '1', date: '2024-01-15', employee_id: employeeId, start_time: '09:00', end_time: '17:00' }), // 8h
      createShift({ id: '2', date: '2024-01-16', employee_id: employeeId, start_time: '09:00', end_time: '17:00' }), // 8h
      createShift({ id: '3', date: '2024-01-17', employee_id: employeeId, start_time: '09:00', end_time: '17:00' }), // 8h
      createShift({ id: '4', date: '2024-01-18', employee_id: employeeId, start_time: '09:00', end_time: '17:00' }), // 8h
      createShift({ id: '5', date: '2024-01-19', employee_id: employeeId, start_time: '09:00', end_time: '16:00' })  // 7h
    ];
    const result = calculateWeeklyHours(shifts, employeeId, weekStart, 35, null);

    expect(result.workedHours).toBe(39);
    expect(result.plusHours).toBe(4);
    expect(result.minusHours).toBe(0);
  });
});
