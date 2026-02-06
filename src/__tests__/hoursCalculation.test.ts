/**
 * Tests unitaires pour hoursCalculation.ts
 *
 * Couvre:
 * - Calcul de durée de shift
 * - Logique planifié vs réalisé
 * - Heures supplémentaires (temps complet)
 * - Heures complémentaires (temps partiel)
 * - Calculs quotidiens, hebdomadaires, mensuels
 * - Alertes de dépassement
 * - Edge cases
 */

import { describe, it, expect } from 'vitest';
import {
  calculateShiftDuration,
  isShiftActual,
  isShiftCountable,
  parseContractHours,
  calculateOvertime,
  calculateComplementary,
  calculateDailyHours,
  calculateWeeklyHours,
  calculateMonthlyHours,
  parseLocalDate,
  formatLocalDate,
  getIsoWeekStart,
  getIsoWeekEnd,
  formatHours,
  LEGAL_WEEKLY_HOURS,
  OVERTIME_25_THRESHOLD,
  type ShiftForCalculation,
  type EmployeeForCalculation
} from '../lib/hoursCalculation';

// =============================================================================
// HELPERS POUR LES TESTS
// =============================================================================

function createShift(overrides: Partial<ShiftForCalculation> = {}): ShiftForCalculation {
  return {
    id: 'shift-1',
    date: '2024-01-15',
    employee_id: 'emp-1',
    start_time: '09:00',
    end_time: '17:00',
    break_minutes: 60,
    status: 'planned',
    ...overrides
  };
}

function createEmployee(overrides: Partial<EmployeeForCalculation> = {}): EmployeeForCalculation {
  return {
    id: 'emp-1',
    work_time_type: 'full_time',
    contract_hours_weekly: '35:00',
    ...overrides
  };
}

// =============================================================================
// TEST 1: Calcul de durée de shift
// =============================================================================

describe('calculateShiftDuration', () => {
  it('calcule correctement un shift standard 9h-17h avec 1h de pause', () => {
    const shift = createShift({
      start_time: '09:00',
      end_time: '17:00',
      break_minutes: 60
    });
    expect(calculateShiftDuration(shift)).toBe(7); // 8h - 1h pause = 7h
  });

  it('calcule correctement un shift sans pause', () => {
    const shift = createShift({
      start_time: '09:00',
      end_time: '13:00',
      break_minutes: 0
    });
    expect(calculateShiftDuration(shift)).toBe(4);
  });

  it('gère le passage à minuit', () => {
    const shift = createShift({
      start_time: '22:00',
      end_time: '06:00',
      break_minutes: 30
    });
    expect(calculateShiftDuration(shift)).toBe(7.5); // 8h - 30min
  });

  it('gère les minutes fractionnelles', () => {
    const shift = createShift({
      start_time: '09:00',
      end_time: '12:30',
      break_minutes: 0
    });
    expect(calculateShiftDuration(shift)).toBe(3.5);
  });

  it('ne retourne jamais une valeur négative', () => {
    const shift = createShift({
      start_time: '09:00',
      end_time: '10:00',
      break_minutes: 120 // Plus que la durée
    });
    expect(calculateShiftDuration(shift)).toBe(0);
  });
});

// =============================================================================
// TEST 2: Logique planifié vs réalisé
// =============================================================================

describe('isShiftActual', () => {
  it('retourne true pour status completed', () => {
    const shift = createShift({ status: 'completed' });
    expect(isShiftActual(shift)).toBe(true);
  });

  it('retourne false pour status planned', () => {
    const shift = createShift({ status: 'planned' });
    expect(isShiftActual(shift)).toBe(false);
  });

  it('retourne false pour status confirmed', () => {
    const shift = createShift({ status: 'confirmed' });
    expect(isShiftActual(shift)).toBe(false);
  });

  it('retourne false pour status cancelled', () => {
    const shift = createShift({ status: 'cancelled' });
    expect(isShiftActual(shift)).toBe(false);
  });
});

describe('isShiftCountable', () => {
  it('retourne true pour status planned', () => {
    expect(isShiftCountable(createShift({ status: 'planned' }))).toBe(true);
  });

  it('retourne true pour status confirmed', () => {
    expect(isShiftCountable(createShift({ status: 'confirmed' }))).toBe(true);
  });

  it('retourne true pour status completed', () => {
    expect(isShiftCountable(createShift({ status: 'completed' }))).toBe(true);
  });

  it('retourne false pour status cancelled', () => {
    expect(isShiftCountable(createShift({ status: 'cancelled' }))).toBe(false);
  });
});

// =============================================================================
// TEST 3: Parsing des heures contractuelles
// =============================================================================

describe('parseContractHours', () => {
  it('parse le format HH:MM', () => {
    expect(parseContractHours('35:00')).toBe(35);
    expect(parseContractHours('35:30')).toBe(35.5);
    expect(parseContractHours('25:15')).toBe(25.25);
  });

  it('parse le format numérique simple', () => {
    expect(parseContractHours('35')).toBe(35);
    expect(parseContractHours('25.5')).toBe(25.5);
  });

  it('parse le format avec h', () => {
    expect(parseContractHours('35h')).toBe(35);
    expect(parseContractHours('35h30')).toBe(35.5);
  });

  it('retourne 35h par défaut si invalide', () => {
    expect(parseContractHours(null)).toBe(LEGAL_WEEKLY_HOURS);
    expect(parseContractHours(undefined)).toBe(LEGAL_WEEKLY_HOURS);
    expect(parseContractHours('')).toBe(LEGAL_WEEKLY_HOURS);
  });
});

// =============================================================================
// TEST 4: Heures supplémentaires (temps complet)
// =============================================================================

describe('calculateOvertime', () => {
  it('retourne 0 si en dessous de 35h', () => {
    const result = calculateOvertime(30);
    expect(result.overtime25).toBe(0);
    expect(result.overtime50).toBe(0);
  });

  it('retourne 0 si exactement 35h', () => {
    const result = calculateOvertime(35);
    expect(result.overtime25).toBe(0);
    expect(result.overtime50).toBe(0);
  });

  it('calcule les HS 25% entre 35h et 43h', () => {
    const result = calculateOvertime(40);
    expect(result.overtime25).toBe(5); // 40 - 35 = 5
    expect(result.overtime50).toBe(0);
  });

  it('calcule exactement à 43h', () => {
    const result = calculateOvertime(43);
    expect(result.overtime25).toBe(8); // 43 - 35 = 8
    expect(result.overtime50).toBe(0);
  });

  it('calcule les HS 50% au-delà de 43h', () => {
    const result = calculateOvertime(50);
    expect(result.overtime25).toBe(8); // 43 - 35 = 8
    expect(result.overtime50).toBe(7); // 50 - 43 = 7
  });

  it('gère les valeurs décimales', () => {
    const result = calculateOvertime(45.5);
    expect(result.overtime25).toBe(8);
    expect(result.overtime50).toBe(2.5);
  });
});

// =============================================================================
// TEST 5: Heures complémentaires (temps partiel)
// =============================================================================

describe('calculateComplementary', () => {
  const contractHours = 25; // Temps partiel 25h/semaine

  it('retourne 0 si en dessous du contrat', () => {
    const result = calculateComplementary(20, contractHours);
    expect(result.complementary10).toBe(0);
    expect(result.complementary25).toBe(0);
    expect(result.exceedsLimit).toBe(false);
  });

  it('retourne 0 si exactement au contrat', () => {
    const result = calculateComplementary(25, contractHours);
    expect(result.complementary10).toBe(0);
    expect(result.complementary25).toBe(0);
    expect(result.exceedsLimit).toBe(false);
  });

  it('calcule les HC 10% dans la limite de +10%', () => {
    const result = calculateComplementary(27, contractHours);
    expect(result.complementary10).toBe(2); // 27 - 25 = 2
    expect(result.complementary25).toBe(0);
    expect(result.exceedsLimit).toBe(false);
  });

  it('calcule le seuil de 10% exactement', () => {
    // 10% de 25h = 2.5h
    const result = calculateComplementary(27.5, contractHours);
    expect(result.complementary10).toBe(2.5);
    expect(result.complementary25).toBe(0);
    expect(result.exceedsLimit).toBe(false);
  });

  it('calcule les HC 25% au-delà de +10%', () => {
    // 10% de 25h = 2.5h, donc au-delà de 27.5h
    const result = calculateComplementary(30, contractHours);
    expect(result.complementary10).toBe(2.5);
    expect(result.complementary25).toBe(2.5); // 30 - 25 - 2.5 = 2.5
    expect(result.exceedsLimit).toBe(false);
  });

  it('détecte le dépassement du plafond de 35h', () => {
    const result = calculateComplementary(38, contractHours);
    expect(result.exceedsLimit).toBe(true);
    // Les HC sont plafonnées à 35h - 25h = 10h
    expect(result.complementary10).toBe(2.5);
    expect(result.complementary25).toBe(7.5);
  });
});

// =============================================================================
// TEST 6: Calculs quotidiens
// =============================================================================

describe('calculateDailyHours', () => {
  it('calcule les heures planifiées', () => {
    const shifts = [
      createShift({ status: 'planned', start_time: '09:00', end_time: '17:00', break_minutes: 60 }),
    ];
    const result = calculateDailyHours(shifts, 'emp-1', '2024-01-15');

    expect(result.totalPlanned).toBe(7);
    expect(result.totalActual).toBe(0);
    expect(result.shiftsPlanned).toBe(1);
    expect(result.shiftsActual).toBe(0);
  });

  it('calcule les heures réalisées', () => {
    const shifts = [
      createShift({ status: 'completed', start_time: '09:00', end_time: '17:00', break_minutes: 60 }),
    ];
    const result = calculateDailyHours(shifts, 'emp-1', '2024-01-15');

    expect(result.totalPlanned).toBe(0);
    expect(result.totalActual).toBe(7);
    expect(result.shiftsPlanned).toBe(0);
    expect(result.shiftsActual).toBe(1);
  });

  it('ignore les shifts annulés', () => {
    const shifts = [
      createShift({ status: 'cancelled', start_time: '09:00', end_time: '17:00', break_minutes: 60 }),
    ];
    const result = calculateDailyHours(shifts, 'emp-1', '2024-01-15');

    expect(result.totalPlanned).toBe(0);
    expect(result.totalActual).toBe(0);
  });

  it('additionne plusieurs shifts dans la journée', () => {
    const shifts = [
      createShift({ id: 's1', status: 'planned', start_time: '09:00', end_time: '12:00', break_minutes: 0 }),
      createShift({ id: 's2', status: 'planned', start_time: '14:00', end_time: '18:00', break_minutes: 0 }),
    ];
    const result = calculateDailyHours(shifts, 'emp-1', '2024-01-15');

    expect(result.totalPlanned).toBe(7); // 3h + 4h
  });

  it('filtre par employé', () => {
    const shifts = [
      createShift({ employee_id: 'emp-1', status: 'planned' }),
      createShift({ employee_id: 'emp-2', status: 'planned' }),
    ];
    const result = calculateDailyHours(shifts, 'emp-1', '2024-01-15');

    expect(result.shiftsPlanned).toBe(1);
  });
});

// =============================================================================
// TEST 7: Calculs hebdomadaires
// =============================================================================

describe('calculateWeeklyHours', () => {
  it('calcule une semaine standard temps complet sans HS', () => {
    const shifts: ShiftForCalculation[] = [];
    // 5 jours à 7h = 35h
    for (let i = 0; i < 5; i++) {
      shifts.push(createShift({
        id: `shift-${i}`,
        date: `2024-01-1${5 + i}`, // Lundi 15 -> Vendredi 19
        status: 'completed',
        start_time: '09:00',
        end_time: '17:00',
        break_minutes: 60
      }));
    }

    const employee = createEmployee({ work_time_type: 'full_time' });
    const weekStart = new Date(2024, 0, 15); // Lundi

    const result = calculateWeeklyHours(shifts, employee, weekStart);

    expect(result.totalActualHours).toBe(35);
    expect(result.totalOvertime).toBe(0);
    expect(result.alerts.length).toBe(0);
  });

  it('calcule les heures supplémentaires temps complet', () => {
    const shifts: ShiftForCalculation[] = [];
    // 5 jours à 9h = 45h
    for (let i = 0; i < 5; i++) {
      shifts.push(createShift({
        id: `shift-${i}`,
        date: `2024-01-1${5 + i}`,
        status: 'completed',
        start_time: '08:00',
        end_time: '18:00',
        break_minutes: 60
      }));
    }

    const employee = createEmployee({ work_time_type: 'full_time' });
    const weekStart = new Date(2024, 0, 15);

    const result = calculateWeeklyHours(shifts, employee, weekStart);

    expect(result.totalActualHours).toBe(45);
    expect(result.overtime25).toBe(8); // 35 -> 43
    expect(result.overtime50).toBe(2); // 43 -> 45
    expect(result.totalOvertime).toBe(10);
    expect(result.alerts.some(a => a.type === 'overtime_warning')).toBe(true);
  });

  it('calcule les heures complémentaires temps partiel', () => {
    const shifts: ShiftForCalculation[] = [];
    // 5 jours à 6h = 30h (pour un contrat de 25h)
    for (let i = 0; i < 5; i++) {
      shifts.push(createShift({
        id: `shift-${i}`,
        date: `2024-01-1${5 + i}`,
        status: 'completed',
        start_time: '09:00',
        end_time: '15:30',
        break_minutes: 30
      }));
    }

    const employee = createEmployee({
      work_time_type: 'part_time',
      contract_hours_weekly: '25:00'
    });
    const weekStart = new Date(2024, 0, 15);

    const result = calculateWeeklyHours(shifts, employee, weekStart);

    expect(result.totalActualHours).toBe(30);
    expect(result.complementary10).toBe(2.5); // 10% de 25h
    expect(result.complementary25).toBe(2.5); // 30 - 25 - 2.5
    expect(result.totalComplementary).toBe(5);
  });

  it('génère une alerte si temps partiel dépasse 35h', () => {
    const shifts: ShiftForCalculation[] = [];
    // 5 jours à 8h = 40h
    for (let i = 0; i < 5; i++) {
      shifts.push(createShift({
        id: `shift-${i}`,
        date: `2024-01-1${5 + i}`,
        status: 'completed',
        start_time: '09:00',
        end_time: '18:00',
        break_minutes: 60
      }));
    }

    const employee = createEmployee({
      work_time_type: 'part_time',
      contract_hours_weekly: '25:00'
    });
    const weekStart = new Date(2024, 0, 15);

    const result = calculateWeeklyHours(shifts, employee, weekStart);

    expect(result.alerts.some(a => a.type === 'part_time_exceeded')).toBe(true);
  });

  it('utilise les heures planifiées si pas de réalisées', () => {
    const shifts: ShiftForCalculation[] = [];
    for (let i = 0; i < 5; i++) {
      shifts.push(createShift({
        id: `shift-${i}`,
        date: `2024-01-1${5 + i}`,
        status: 'planned', // Pas encore réalisé
        start_time: '09:00',
        end_time: '17:00',
        break_minutes: 60
      }));
    }

    const employee = createEmployee();
    const weekStart = new Date(2024, 0, 15);

    const result = calculateWeeklyHours(shifts, employee, weekStart);

    expect(result.totalPlannedHours).toBe(35);
    expect(result.totalActualHours).toBe(0);
    // Les calculs d'HS/HC utilisent les planifiées comme fallback
  });
});

// =============================================================================
// TEST 8: Calculs mensuels
// =============================================================================

describe('calculateMonthlyHours', () => {
  it('agrège les semaines du mois', () => {
    const shifts: ShiftForCalculation[] = [];
    // 4 semaines de 35h chacune
    const dates = [
      '2024-01-08', '2024-01-09', '2024-01-10', '2024-01-11', '2024-01-12',
      '2024-01-15', '2024-01-16', '2024-01-17', '2024-01-18', '2024-01-19',
      '2024-01-22', '2024-01-23', '2024-01-24', '2024-01-25', '2024-01-26',
      '2024-01-29', '2024-01-30', '2024-01-31'
    ];

    dates.forEach((date, i) => {
      shifts.push(createShift({
        id: `shift-${i}`,
        date,
        status: 'completed',
        start_time: '09:00',
        end_time: '17:00',
        break_minutes: 60
      }));
    });

    const employee = createEmployee();
    const result = calculateMonthlyHours(shifts, employee, 2024, 1);

    expect(result.daysWorkedActual).toBe(18);
    expect(result.totalActualHours).toBe(18 * 7); // 126h
  });

  it('calcule correctement les semaines partielles', () => {
    // Février 2024: du 1er (jeudi) au 29 (jeudi)
    const shifts: ShiftForCalculation[] = [
      createShift({ id: 's1', date: '2024-02-01', status: 'completed' }),
      createShift({ id: 's2', date: '2024-02-29', status: 'completed' }),
    ];

    const employee = createEmployee();
    const result = calculateMonthlyHours(shifts, employee, 2024, 2);

    expect(result.daysWorkedActual).toBe(2);
  });
});

// =============================================================================
// TEST 9: Gestion des dates ISO
// =============================================================================

describe('Date utilities', () => {
  describe('parseLocalDate', () => {
    it('parse correctement une date', () => {
      const date = parseLocalDate('2024-01-15');
      expect(date.getFullYear()).toBe(2024);
      expect(date.getMonth()).toBe(0); // Janvier
      expect(date.getDate()).toBe(15);
    });
  });

  describe('formatLocalDate', () => {
    it('formate correctement une date', () => {
      const date = new Date(2024, 0, 15);
      expect(formatLocalDate(date)).toBe('2024-01-15');
    });

    it('ajoute les zéros de padding', () => {
      const date = new Date(2024, 0, 5);
      expect(formatLocalDate(date)).toBe('2024-01-05');
    });
  });

  describe('getIsoWeekStart', () => {
    it('retourne le lundi pour un mercredi', () => {
      const wednesday = new Date(2024, 0, 17); // Mercredi 17 janvier
      const monday = getIsoWeekStart(wednesday);
      expect(monday.getDate()).toBe(15); // Lundi 15
    });

    it('retourne le même jour pour un lundi', () => {
      const monday = new Date(2024, 0, 15);
      const result = getIsoWeekStart(monday);
      expect(result.getDate()).toBe(15);
    });

    it('retourne le lundi précédent pour un dimanche', () => {
      const sunday = new Date(2024, 0, 21);
      const monday = getIsoWeekStart(sunday);
      expect(monday.getDate()).toBe(15);
    });
  });

  describe('getIsoWeekEnd', () => {
    it('retourne le dimanche de la semaine', () => {
      const wednesday = new Date(2024, 0, 17);
      const sunday = getIsoWeekEnd(wednesday);
      expect(sunday.getDate()).toBe(21);
    });
  });
});

// =============================================================================
// TEST 10: Formatage
// =============================================================================

describe('formatHours', () => {
  it('formate les heures entières', () => {
    expect(formatHours(7)).toBe('7h');
    expect(formatHours(35)).toBe('35h');
  });

  it('formate les heures avec minutes', () => {
    expect(formatHours(7.5)).toBe('7h30');
    expect(formatHours(7.25)).toBe('7h15');
  });

  it('gère les arrondis', () => {
    expect(formatHours(7.99)).toBe('7h59');
  });

  it('gère zéro', () => {
    expect(formatHours(0)).toBe('0h');
  });
});

// =============================================================================
// TEST 11: Edge cases
// =============================================================================

describe('Edge cases', () => {
  it('gère une liste vide de shifts', () => {
    const employee = createEmployee();
    const result = calculateWeeklyHours([], employee, new Date(2024, 0, 15));

    expect(result.totalPlannedHours).toBe(0);
    expect(result.totalActualHours).toBe(0);
    expect(result.totalOvertime).toBe(0);
  });

  it('gère les shifts avec des heures identiques (durée 0)', () => {
    const shift = createShift({
      start_time: '09:00',
      end_time: '09:00',
      break_minutes: 0
    });
    expect(calculateShiftDuration(shift)).toBe(0);
  });

  it('gère le changement de mois', () => {
    // Semaine du 29 janvier au 4 février
    const shifts = [
      createShift({ id: 's1', date: '2024-01-29', status: 'completed' }),
      createShift({ id: 's2', date: '2024-01-30', status: 'completed' }),
      createShift({ id: 's3', date: '2024-01-31', status: 'completed' }),
      createShift({ id: 's4', date: '2024-02-01', status: 'completed' }),
      createShift({ id: 's5', date: '2024-02-02', status: 'completed' }),
    ];

    const employee = createEmployee();
    const weekStart = new Date(2024, 0, 29);
    const result = calculateWeeklyHours(shifts, employee, weekStart);

    expect(result.dailyBreakdown.filter(d => d.shiftsActual > 0).length).toBe(5);
  });

  it('détecte le dépassement de 48h/semaine', () => {
    // 6 jours à 9h = 54h (lundi 15 au samedi 20)
    const dates = ['2024-01-15', '2024-01-16', '2024-01-17', '2024-01-18', '2024-01-19', '2024-01-20'];
    const shifts: ShiftForCalculation[] = dates.map((date, i) => createShift({
      id: `shift-${i}`,
      date,
      status: 'completed',
      start_time: '08:00',
      end_time: '18:00',
      break_minutes: 60
    }));

    const employee = createEmployee();
    const result = calculateWeeklyHours(shifts, employee, new Date(2024, 0, 15));

    expect(result.totalActualHours).toBe(54);
    expect(result.alerts.some(a => a.type === 'overtime_high')).toBe(true);
  });
});
