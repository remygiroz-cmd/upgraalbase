import { base44 } from '@/api/base44Client';

/**
 * Service pour MonthlyExportOverride
 * Gère les surcharges de l'export compta (priorité maximale)
 */

export async function getExportOverride(monthKey, employeeId) {
  const results = await base44.entities.MonthlyExportOverride.filter({
    month_key: monthKey,
    employee_id: employeeId
  });
  return results[0] || null;
}

export async function upsertExportOverride(monthKey, employeeId, payload, resetVersion) {
  const existing = await getExportOverride(monthKey, employeeId);

  const clean = { updated_at: new Date().toISOString() };
  if (resetVersion !== undefined) clean.reset_version = resetVersion;

  const fields = [
    'nb_jours_travailles', 'jours_supp', 'payees_hors_sup_comp',
    'compl_10', 'compl_25', 'supp_25', 'supp_50',
    'ferie_jours', 'ferie_heures', 'non_shifts_visibles',
    'cp_decomptes', 'notes'
  ];

  fields.forEach(f => {
    if (payload[f] !== undefined) {
      clean[f] = payload[f];
    }
  });

  if (existing) {
    return await base44.entities.MonthlyExportOverride.update(existing.id, clean);
  } else {
    return await base44.entities.MonthlyExportOverride.create({
      month_key: monthKey,
      employee_id: employeeId,
      ...clean
    });
  }
}

export async function clearExportOverride(monthKey, employeeId) {
  const existing = await getExportOverride(monthKey, employeeId);
  if (existing) {
    await base44.entities.MonthlyExportOverride.delete(existing.id);
  }
}

// Alias explicite
export const deleteExportOverride = clearExportOverride;