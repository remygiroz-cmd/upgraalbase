import { base44 } from '@/api/base44Client';

/**
 * Écrit la valeur CANONIQUE affichée dans la carte "Récap Mois" vers MonthlyRecapFinal.
 * C'est la SOURCE DE VÉRITÉ pour l'optimisation masse salariale.
 * 
 * Appeler à chaque fois que la carte recalcule ou qu'un override est sauvegardé/réinitialisé.
 */
export async function upsertMonthlyRecapFinal(monthKey, employeeId, recapResolved) {
  const compl10Min = Math.round((recapResolved.complementary_hours_10 ?? 0) * 60);
  const compl25Min = Math.round((recapResolved.complementary_hours_25 ?? 0) * 60);
  const supp25Min  = Math.round((recapResolved.overtime_hours_25      ?? 0) * 60);
  const supp50Min  = Math.round((recapResolved.overtime_hours_50      ?? 0) * 60);

  const payload = {
    month_key:             monthKey,
    employee_id:           employeeId,
    final_compl_10_min:    compl10Min,
    final_compl_25_min:    compl25Min,
    final_compl_total_min: compl10Min + compl25Min,
    final_supp_25_min:     supp25Min,
    final_supp_50_min:     supp50Min,
    final_supp_total_min:  supp25Min + supp50Min,
    final_source:          recapResolved._source ?? 'auto',
    updated_at:            new Date().toISOString(),
  };

  const existing = await base44.entities.MonthlyRecapFinal.filter({
    month_key: monthKey,
    employee_id: employeeId,
  });

  if (existing[0]) {
    await base44.entities.MonthlyRecapFinal.update(existing[0].id, payload);
  } else {
    await base44.entities.MonthlyRecapFinal.create(payload);
  }
}