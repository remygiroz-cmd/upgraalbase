/**
 * Utilitaires pour la gestion des jours fériés
 * CCN Restauration Rapide IDCC 1501 + Code du travail
 */

/**
 * Vérifie si une date est un jour férié
 */
export function getHolidayForDate(date, holidays) {
  if (!holidays || holidays.length === 0) return null;
  return holidays.find(h => h.date === date && h.is_active);
}

/**
 * Vérifie l'éligibilité d'un employé aux droits fériés CCN
 * @param employee - objet employé avec start_date
 * @param requiredMonths - nombre de mois d'ancienneté requis (défaut 8)
 * @returns {boolean, months} - éligibilité et nombre de mois d'ancienneté
 */
export function checkHolidayEligibility(employee, requiredMonths = 8) {
  if (!employee.start_date) {
    return { eligible: false, months: 0, reason: 'Date d\'embauche non renseignée' };
  }

  const startDate = new Date(employee.start_date);
  const today = new Date();
  const monthsDiff = (today.getFullYear() - startDate.getFullYear()) * 12 + 
                     (today.getMonth() - startDate.getMonth());

  const eligible = monthsDiff >= requiredMonths;

  return {
    eligible,
    months: monthsDiff,
    reason: eligible 
      ? `Éligible (${monthsDiff} mois d'ancienneté)` 
      : `Non éligible (${monthsDiff} mois < ${requiredMonths} mois requis)`
  };
}

/**
 * Calcule les données de compensation pour un shift férié
 */
export function calculateHolidayCompensation(shift, holiday, policy, isEligible) {
  const shiftDuration = parseFloat(shift.end_time) - parseFloat(shift.start_time) - 
                        (shift.break_minutes || 0) / 60;

  // 1er mai : doublement obligatoire
  if (holiday.is_may_first) {
    return {
      pay_multiplier: 2.0,
      comp_minutes: 0,
      type: 'may_first',
      description: 'Doublement obligatoire (Art. L3133-6)'
    };
  }

  // Employé non éligible : pas de compensation
  if (!isEligible) {
    return {
      pay_multiplier: 1.0,
      comp_minutes: 0,
      type: 'not_eligible',
      description: 'Ancienneté insuffisante pour droits fériés CCN'
    };
  }

  // Politique PAY : rémunération normale
  if (policy?.policy_for_non_may1 === 'pay') {
    return {
      pay_multiplier: 1.0,
      comp_minutes: 0,
      type: 'pay',
      description: 'Rémunération normale du jour férié'
    };
  }

  // Politique TIME_OFF : récupération en temps
  if (policy?.policy_for_non_may1 === 'time_off') {
    return {
      pay_multiplier: 1.0,
      comp_minutes: Math.round(shiftDuration * 60),
      type: 'time_off',
      description: `Récupération de ${shiftDuration.toFixed(1)}h`
    };
  }

  // Fallback
  return {
    pay_multiplier: 1.0,
    comp_minutes: 0,
    type: 'unknown',
    description: 'Politique non définie'
  };
}

/**
 * Valide la création d'un shift férié
 */
export function validateHolidayShift(shift, holiday, employee, policy) {
  const errors = [];
  const warnings = [];

  // 1er mai et établissement non autorisé
  if (holiday.is_may_first && policy?.may1_open_allowed === false) {
    warnings.push('L\'établissement n\'autorise pas l\'ouverture le 1er mai');
  }

  // Protection du repos hebdo
  if (policy?.weekly_rest_fixed_day_protection && !shift.explicit_employee_consent) {
    errors.push('Consentement explicite requis pour travailler un jour férié');
  }

  // Shift sans consentement
  if (!shift.explicit_employee_consent) {
    warnings.push('Le consentement de l\'employé n\'a pas été enregistré');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Génère les métadonnées de shift férié pour sauvegarde
 */
export function generateHolidayShiftData(shift, holiday, policy, employee) {
  const eligibility = checkHolidayEligibility(employee, policy?.eligibility_months);
  const compensation = calculateHolidayCompensation(shift, holiday, policy, eligibility.eligible);

  return {
    holiday_id: holiday.id,
    holiday_flag: true,
    holiday_pay_multiplier: compensation.pay_multiplier,
    holiday_comp_minutes: compensation.comp_minutes,
    manager_override: shift.manager_override,
    explicit_employee_consent: shift.explicit_employee_consent || false,
    consent_date: shift.consent_date || new Date().toISOString()
  };
}