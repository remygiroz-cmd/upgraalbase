/**
 * Tests unitaires pour hoursCalculation.ts
 *
 * Couvre:
 * - Calcul de durée de shift
 * - Logique planifié vs réalisé
 * - Heures supplémentaires (temps complet)
 * - Heures complémentaires (temps partiel)
 * - NOUVEAU: Heures hors répartition contractuelle
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
  calculateOvertimeWithOutsideContract,
  calculateComplementaryWithOutsideContract,
  calculateDailyHours,
  calculateWeeklyHours,
  calculateMonthlyHours,
  parseLocalDate,
  formatLocalDate,
  getIsoWeekStart,
  getIsoWeekEnd,
  getWeekdayKey,
  isDayInContract,
  hasValidWeeklySchedule,
  formatHours,
  LEGAL_WEEKLY_HOURS,
  OVERTIME_25_THRESHOLD,
  type ShiftForCalculation,
  type EmployeeForCalculation,
  type WeeklySchedule
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
    weekly_schedule: null,
    ...overrides
  };
}

/** Planning Mardi-Samedi, 7h/jour (35h/semaine) */
function createTueSatSchedule(): WeeklySchedule {
  return {
    monday: { worked: false, hours: 0 },
    tuesday: { worked: true, hours: 7 },
    wednesday: { worked: true, hours: 7 },
    thursday: { worked: true, hours: 7 },
    friday: { worked: true, hours: 7 },
    saturday: { worked: true, hours: 7 },
    sunday: { worked: false, hours: 0 }
  };
}

/** Planning Lundi-Vendredi standard, 7h/jour */
function createMonFriSchedule(): WeeklySchedule {
  return {
    monday: { worked: true, hours: 7 },
    tuesday: { worked: true, hours: 7 },
    wednesday: { worked: true, hours: 7 },
    thursday: { worked: true, hours: 7 },
    friday: { worked: true, hours: 7 },
    saturday: { worked: false, hours: 0 },
    sunday: { worked: false, hours: 0 }
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
    expect(calculateShiftDuration(shift)).toBe(7);
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
    expect(calculateShiftDuration(shift)).toBe(7.5);
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
      break_minutes: 120
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
// TEST 4: Heures supplémentaires (temps complet) - Legacy
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
    expect(result.overtime25).toBe(5);
    expect(result.overtime50).toBe(0);
  });

  it('calcule exactement à 43h', () => {
    const result = calculateOvertime(43);
    expect(result.overtime25).toBe(8);
    expect(result.overtime50).toBe(0);
  });

  it('calcule les HS 50% au-delà de 43h', () => {
    const result = calculateOvertime(50);
    expect(result.overtime25).toBe(8);
    expect(result.overtime50).toBe(7);
  });
});

// =============================================================================
// TEST 5: Heures complémentaires (temps partiel) - Legacy
// =============================================================================

describe('calculateComplementary', () => {
  const contractHours = 25;

  it('retourne 0 si en dessous du contrat', () => {
    const result = calculateComplementary(20, contractHours);
    expect(result.complementary10).toBe(0);
    expect(result.complementary25).toBe(0);
    expect(result.exceedsLimit).toBe(false);
  });

  it('calcule les HC 10% dans la limite de +10%', () => {
    const result = calculateComplementary(27, contractHours);
    expect(result.complementary10).toBe(2);
    expect(result.complementary25).toBe(0);
  });

  it('calcule les HC 25% au-delà de +10%', () => {
    const result = calculateComplementary(30, contractHours);
    expect(result.complementary10).toBe(2.5);
    expect(result.complementary25).toBe(2.5);
  });

  it('détecte le dépassement du plafond de 35h', () => {
    const result = calculateComplementary(38, contractHours);
    expect(result.exceedsLimit).toBe(true);
  });
});

// =============================================================================
// TEST 6: Détection jour dans le contrat
// =============================================================================

describe('isDayInContract', () => {
  const tueSatSchedule = createTueSatSchedule();

  it('retourne true pour un jour prévu (mardi)', () => {
    // 2024-01-16 est un mardi
    const result = isDayInContract('2024-01-16', tueSatSchedule);
    expect(result.isContractDay).toBe(true);
    expect(result.contractHours).toBe(7);
  });

  it('retourne false pour un jour non prévu (dimanche)', () => {
    // 2024-01-14 est un dimanche
    const result = isDayInContract('2024-01-14', tueSatSchedule);
    expect(result.isContractDay).toBe(false);
    expect(result.contractHours).toBe(0);
  });

  it('retourne false pour un jour non prévu (lundi)', () => {
    // 2024-01-15 est un lundi
    const result = isDayInContract('2024-01-15', tueSatSchedule);
    expect(result.isContractDay).toBe(false);
    expect(result.contractHours).toBe(0);
  });

  it('retourne true par défaut si pas de schedule', () => {
    const result = isDayInContract('2024-01-14', null);
    expect(result.isContractDay).toBe(true);
  });
});

describe('getWeekdayKey', () => {
  it('retourne le bon jour de la semaine', () => {
    expect(getWeekdayKey('2024-01-14')).toBe('sunday');    // Dimanche
    expect(getWeekdayKey('2024-01-15')).toBe('monday');    // Lundi
    expect(getWeekdayKey('2024-01-16')).toBe('tuesday');   // Mardi
    expect(getWeekdayKey('2024-01-20')).toBe('saturday');  // Samedi
  });
});

describe('hasValidWeeklySchedule', () => {
  it('retourne true pour un schedule valide', () => {
    expect(hasValidWeeklySchedule(createTueSatSchedule())).toBe(true);
  });

  it('retourne false pour null', () => {
    expect(hasValidWeeklySchedule(null)).toBe(false);
  });

  it('retourne false pour un schedule vide', () => {
    const emptySchedule: WeeklySchedule = {
      monday: { worked: false, hours: 0 },
      tuesday: { worked: false, hours: 0 },
      wednesday: { worked: false, hours: 0 },
      thursday: { worked: false, hours: 0 },
      friday: { worked: false, hours: 0 },
      saturday: { worked: false, hours: 0 },
      sunday: { worked: false, hours: 0 }
    };
    expect(hasValidWeeklySchedule(emptySchedule)).toBe(false);
  });
});

// =============================================================================
// TEST 7: HS avec hors répartition (NOUVEAU)
// =============================================================================

describe('calculateOvertimeWithOutsideContract', () => {
  it('temps plein 35h Mar-Sam + Dim 8h → HS_hors = 8h (cas utilisateur)', () => {
    // Employé travaille 35h sur Mar-Sam + 8h le Dimanche = 43h total
    // Les 8h du Dimanche sont hors répartition
    const result = calculateOvertimeWithOutsideContract(43, 35, 8, 'overtime');

    expect(result.outsideContract).toBe(8);  // 8h hors répartition
    expect(result.classic25).toBe(0);        // Pas de HS classiques
    expect(result.classic50).toBe(0);
    expect(result.total).toBe(8);            // Total HS = 8h
  });

  it('temps plein 30h Mar-Ven + Dim 8h → HS_hors = 8h même si total < 35h', () => {
    // Employé travaille 30h sur jours prévus + 8h Dimanche = 38h total
    // Les 8h du Dimanche sont hors répartition
    const result = calculateOvertimeWithOutsideContract(38, 35, 8, 'overtime');

    expect(result.outsideContract).toBe(8);  // 8h hors répartition = HS
    expect(result.classic25).toBe(0);        // 38 - 35 - 8 = -5 → 0 classiques
    expect(result.total).toBe(8);
  });

  it('temps plein 27h sur jours prévus + 8h Dim → HS_hors = 8h', () => {
    // Total = 35h, mais 8h sont hors répartition
    const result = calculateOvertimeWithOutsideContract(35, 35, 8, 'overtime');

    expect(result.outsideContract).toBe(8);  // 8h hors répartition = HS
    expect(result.classic25).toBe(0);        // 35 - 35 = 0 dépassement
    expect(result.total).toBe(8);            // Seulement les HS hors répartition
  });

  it('temps plein 35h Mar-Sam + Dim 8h + dépassement → HS hors + classiques', () => {
    // Employé: 40h sur jours prévus + 8h Dimanche = 48h total
    const result = calculateOvertimeWithOutsideContract(48, 35, 8, 'overtime');

    expect(result.outsideContract).toBe(8);  // 8h hors répartition
    // Dépassement classique = 48 - 35 - 8 = 5h
    expect(result.classic25).toBe(5);
    expect(result.classic50).toBe(0);
    expect(result.total).toBe(13);           // 8 + 5
  });

  it('policy "normal" ignore les heures hors contrat', () => {
    const result = calculateOvertimeWithOutsideContract(43, 35, 8, 'normal');

    expect(result.outsideContract).toBe(0);
    expect(result.classic25).toBe(8);  // 43 - 35 = 8h HS classiques
    expect(result.total).toBe(8);
  });
});

// =============================================================================
// TEST 8: HC avec hors répartition (temps partiel)
// =============================================================================

describe('calculateComplementaryWithOutsideContract', () => {
  it('temps partiel 20h Lun-Jeu + Dim 5h → HC_hors = 5h', () => {
    // Employé temps partiel 20h/semaine + 5h Dimanche = 25h total
    const result = calculateComplementaryWithOutsideContract(25, 20, 5, 'overtime');

    expect(result.outsideContract).toBe(5);  // 5h hors répartition = HC
    expect(result.classic10).toBe(0);        // 25 - 20 - 5 = 0 classiques
    expect(result.total).toBe(5);
    expect(result.exceedsLimit).toBe(false);
  });

  it('temps partiel 20h + Dim 5h + dépassement classique', () => {
    // Employé: 23h sur jours prévus + 5h Dimanche = 28h total
    const result = calculateComplementaryWithOutsideContract(28, 20, 5, 'overtime');

    expect(result.outsideContract).toBe(5);
    // Dépassement classique = 28 - 20 - 5 = 3h
    // 10% de 20h = 2h → 2h à 10%, 1h à 25%
    expect(result.classic10).toBe(2);
    expect(result.classic25).toBe(1);
    expect(result.total).toBe(8);  // 5 + 2 + 1
  });

  it('détecte le dépassement 35h pour temps partiel', () => {
    const result = calculateComplementaryWithOutsideContract(38, 20, 8, 'overtime');
    expect(result.exceedsLimit).toBe(true);
  });
});

// =============================================================================
// TEST 9: Calculs quotidiens avec schedule
// =============================================================================

describe('calculateDailyHours avec weekly_schedule', () => {
  const tueSatSchedule = createTueSatSchedule();

  it('identifie un jour hors contrat (dimanche)', () => {
    const shifts = [
      createShift({ date: '2024-01-14', status: 'completed' })  // Dimanche
    ];
    const result = calculateDailyHours(shifts, 'emp-1', '2024-01-14', tueSatSchedule);

    expect(result.isContractDay).toBe(false);
    expect(result.hoursOutsideContract).toBe(7);  // Toutes les heures
    expect(result.dayOfWeek).toBe('sunday');
  });

  it('identifie un jour dans le contrat (mardi)', () => {
    const shifts = [
      createShift({ date: '2024-01-16', status: 'completed' })  // Mardi
    ];
    const result = calculateDailyHours(shifts, 'emp-1', '2024-01-16', tueSatSchedule);

    expect(result.isContractDay).toBe(true);
    expect(result.hoursOutsideContract).toBe(0);
    expect(result.contractHoursForDay).toBe(7);
  });
});

// =============================================================================
// TEST 10: Calculs hebdomadaires avec schedule (CAS UTILISATEUR)
// =============================================================================

describe('calculateWeeklyHours avec weekly_schedule', () => {
  it('CAS UTILISATEUR: temps plein 35h Mar-Sam + Dim 8h → HS_hors = 8h', () => {
    // Semaine du 15 janvier 2024 (Lundi 15 au Dimanche 21)
    // Employé travaille Mar(16), Mer(17), Jeu(18), Ven(19), Sam(20) = 7h/jour = 35h
    // + Dimanche(21) 8h = total 43h

    const shifts: ShiftForCalculation[] = [
      // Mardi à Samedi: 7h/jour
      createShift({ id: 's1', date: '2024-01-16', status: 'completed', start_time: '09:00', end_time: '17:00', break_minutes: 60 }),
      createShift({ id: 's2', date: '2024-01-17', status: 'completed', start_time: '09:00', end_time: '17:00', break_minutes: 60 }),
      createShift({ id: 's3', date: '2024-01-18', status: 'completed', start_time: '09:00', end_time: '17:00', break_minutes: 60 }),
      createShift({ id: 's4', date: '2024-01-19', status: 'completed', start_time: '09:00', end_time: '17:00', break_minutes: 60 }),
      createShift({ id: 's5', date: '2024-01-20', status: 'completed', start_time: '09:00', end_time: '17:00', break_minutes: 60 }),
      // Dimanche: 8h (hors contrat)
      createShift({ id: 's6', date: '2024-01-21', status: 'completed', start_time: '09:00', end_time: '17:00', break_minutes: 0 }),
    ];

    const employee = createEmployee({
      work_time_type: 'full_time',
      contract_hours_weekly: '35:00',
      weekly_schedule: createTueSatSchedule()
    });

    const weekStart = new Date(2024, 0, 15);  // Lundi 15 janvier
    const result = calculateWeeklyHours(shifts, employee, weekStart, 'overtime');

    // Vérifications
    expect(result.totalEffectiveHours).toBe(43);  // 35 + 8
    expect(result.hoursOutsideContract).toBe(8);  // Dimanche
    expect(result.hasWeeklySchedule).toBe(true);

    // HS: 8h hors répartition, 0h classiques
    expect(result.overtime.outsideContract).toBe(8);
    expect(result.overtime.classic25).toBe(0);
    expect(result.overtime.total).toBe(8);

    // Alertes
    expect(result.alerts.some(a => a.type === 'overtime_outside_contract')).toBe(true);
  });

  it('temps plein sans schedule défini: calcul classique', () => {
    const shifts: ShiftForCalculation[] = [];
    for (let i = 0; i < 5; i++) {
      shifts.push(createShift({
        id: `shift-${i}`,
        date: `2024-01-1${5 + i}`,
        status: 'completed',
        start_time: '09:00',
        end_time: '18:00',
        break_minutes: 60  // 8h/jour × 5 = 40h
      }));
    }

    const employee = createEmployee({
      work_time_type: 'full_time',
      contract_hours_weekly: '35:00',
      weekly_schedule: null  // Pas de schedule
    });

    const weekStart = new Date(2024, 0, 15);
    const result = calculateWeeklyHours(shifts, employee, weekStart, 'overtime');

    expect(result.totalEffectiveHours).toBe(40);
    expect(result.hasWeeklySchedule).toBe(false);

    // Sans schedule, pas de distinction hors répartition
    expect(result.overtime.outsideContract).toBe(0);
    expect(result.overtime.classic25).toBe(5);  // 40 - 35 = 5h HS classiques
    expect(result.overtime.total).toBe(5);
  });

  it('temps partiel avec jour hors répartition', () => {
    // Employé temps partiel 20h/semaine Lun-Jeu + Dimanche 5h
    const partTimeSchedule: WeeklySchedule = {
      monday: { worked: true, hours: 5 },
      tuesday: { worked: true, hours: 5 },
      wednesday: { worked: true, hours: 5 },
      thursday: { worked: true, hours: 5 },
      friday: { worked: false, hours: 0 },
      saturday: { worked: false, hours: 0 },
      sunday: { worked: false, hours: 0 }
    };

    const shifts: ShiftForCalculation[] = [
      createShift({ id: 's1', date: '2024-01-15', status: 'completed', start_time: '09:00', end_time: '14:00', break_minutes: 0 }),  // Lun 5h
      createShift({ id: 's2', date: '2024-01-16', status: 'completed', start_time: '09:00', end_time: '14:00', break_minutes: 0 }),  // Mar 5h
      createShift({ id: 's3', date: '2024-01-17', status: 'completed', start_time: '09:00', end_time: '14:00', break_minutes: 0 }),  // Mer 5h
      createShift({ id: 's4', date: '2024-01-18', status: 'completed', start_time: '09:00', end_time: '14:00', break_minutes: 0 }),  // Jeu 5h
      createShift({ id: 's5', date: '2024-01-21', status: 'completed', start_time: '09:00', end_time: '14:00', break_minutes: 0 }),  // Dim 5h (hors contrat)
    ];

    const employee = createEmployee({
      work_time_type: 'part_time',
      contract_hours_weekly: '20:00',
      weekly_schedule: partTimeSchedule
    });

    const result = calculateWeeklyHours(shifts, employee, new Date(2024, 0, 15), 'overtime');

    expect(result.totalEffectiveHours).toBe(25);  // 20 + 5
    expect(result.hoursOutsideContract).toBe(5);  // Dimanche

    // HC: 5h hors répartition
    expect(result.complementary.outsideContract).toBe(5);
    expect(result.complementary.total).toBe(5);
  });
});

// =============================================================================
// TEST 11: Calculs mensuels
// =============================================================================

describe('calculateMonthlyHours', () => {
  it('agrège les semaines du mois avec heures hors contrat', () => {
    // Janvier 2024: 4+ semaines
    const shifts: ShiftForCalculation[] = [];

    // Semaine 1: shifts du 16 au 20 (Mar-Sam) + Dim 21
    for (let day = 16; day <= 20; day++) {
      shifts.push(createShift({
        id: `s-w1-${day}`,
        date: `2024-01-${day.toString().padStart(2, '0')}`,
        status: 'completed'
      }));
    }
    shifts.push(createShift({
      id: 's-w1-dim',
      date: '2024-01-21',  // Dimanche
      status: 'completed',
      start_time: '09:00',
      end_time: '17:00',
      break_minutes: 0
    }));

    const employee = createEmployee({
      weekly_schedule: createTueSatSchedule()
    });

    const result = calculateMonthlyHours(shifts, employee, 2024, 1, 'overtime');

    expect(result.hoursOutsideContract).toBeGreaterThan(0);
    expect(result.overtime.outsideContract).toBeGreaterThan(0);
  });
});

// =============================================================================
// TEST 12: Gestion des dates ISO
// =============================================================================

describe('Date utilities', () => {
  describe('parseLocalDate', () => {
    it('parse correctement une date', () => {
      const date = parseLocalDate('2024-01-15');
      expect(date.getFullYear()).toBe(2024);
      expect(date.getMonth()).toBe(0);
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
      const wednesday = new Date(2024, 0, 17);
      const monday = getIsoWeekStart(wednesday);
      expect(monday.getDate()).toBe(15);
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
// TEST 13: Formatage
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

  it('gère zéro', () => {
    expect(formatHours(0)).toBe('0h');
  });
});

// =============================================================================
// TEST 14: Edge cases
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
