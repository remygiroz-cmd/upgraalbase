import { base44 } from '@/api/base44Client';

/**
 * Service pour MonthlyRecapExtrasOverride
 * Gère les surcharges des champs "jours/CP/fériés/payées/non-shifts" du récap mensuel
 */

export async function getRecapExtras(monthKey, employeeId) {
  const results = await base44.entities.MonthlyRecapExtrasOverride.filter({
    month_key: monthKey,
    employee_id: employeeId
  });
  return results[0] || null;
}

/**
 * Upsert une surcharge extras récap
 * Seuls les champs non-null/undefined sont écrits (Auto = null = ne pas écraser)
 */
export async function upsertRecapExtras(monthKey, employeeId, payload, resetVersion) {
  const existing = await getRecapExtras(monthKey, employeeId);

  // Nettoyer : ne garder que les valeurs non-vides (null = auto)
  const clean = { updated_at: new Date().toISOString() };
  if (resetVersion !== undefined) clean.reset_version = resetVersion;

  const fields = [
    'jours_travailles', 'jours_prevus', 'jours_supp',
    'ferie_jours', 'ferie_heures', 'cp_decomptes',
    'payees_hors_sup_comp', 'non_shifts_visibles', 'notes'
  ];

  fields.forEach(f => {
    if (payload[f] !== undefined) {
      clean[f] = payload[f]; // null = reset au auto
    }
  });

  if (existing) {
    return await base44.entities.MonthlyRecapExtrasOverride.update(existing.id, clean);
  } else {
    return await base44.entities.MonthlyRecapExtrasOverride.create({
      month_key: monthKey,
      employee_id: employeeId,
      ...clean
    });
  }
}

export async function clearRecapExtras(monthKey, employeeId) {
  const existing = await getRecapExtras(monthKey, employeeId);
  if (existing) {
    await base44.entities.MonthlyRecapExtrasOverride.delete(existing.id);
  }
}

// Alias explicite
export const deleteRecapExtras = clearRecapExtras;