import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * refreshMonthlyRecapPersistedForMonth
 *
 * ✅ SAFE: Ne touche QUE MonthlyRecapPersisted (upsert).
 * ❌ INTERDIT: Shift, reset_version, PlanningMonth, templates, reset, cleanup.
 *
 * Payload: { month_key: "2026-03" }   ← OBLIGATOIRE (passé par l'automation)
 * Optionnel: { month_key: "2026-03", also_previous_month: true }
 */
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const b = base44.asServiceRole;

  let body = {};
  try { body = await req.json(); } catch { /* pas de body */ }

  // Calculer month_key en Europe/Paris si demandé (pour les automations)
  let resolvedMonthKey = body.month_key;
  if (!resolvedMonthKey || body.use_current_month_paris) {
    // Calculer l'heure courante en Europe/Paris pour éviter les décalages UTC
    const nowParis = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
    resolvedMonthKey = `${nowParis.getFullYear()}-${String(nowParis.getMonth() + 1).padStart(2, '0')}`;
    console.log(`[refreshRecaps] 📅 month_key calculé (Europe/Paris): ${resolvedMonthKey}`);
  }

  const [ky, km] = resolvedMonthKey.split('-');
  if (!ky || !km || isNaN(parseInt(km)) || parseInt(km) < 1 || parseInt(km) > 12) {
    console.error(`[refreshRecaps] ❌ month_key invalide: ${resolvedMonthKey}`);
    return Response.json({ error: 'month_key invalide (YYYY-MM)' }, { status: 400 });
  }

  const monthKeys = [resolvedMonthKey];
  if (body.also_previous_month) {
    const [y, m] = resolvedMonthKey.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1); // mois précédent
    const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    monthKeys.push(prevKey);
  }

  const results = [];

  for (const month_key of monthKeys) {
    console.log(`[refreshRecaps] ▶ Traitement month_key=${month_key}`);

    const [yearStr, monthStr] = month_key.split('-');
    const monthNum = parseInt(monthStr, 10);
    if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      console.error(`[refreshRecaps] ❌ month_key invalide: ${month_key}`);
      results.push({ month_key, error: 'month_key invalide' });
      continue;
    }

    // ✅ Lecture seule: employees, shifts (pour savoir qui a des shifts), planning version
    // ❌ On ne modifie JAMAIS Shift ni PlanningMonth
    const [employees, allShiftsForMonth, planning] = await Promise.all([
      b.entities.Employee.filter({ is_active: true }),
      b.entities.Shift.filter({ month_key }),
      b.entities.PlanningMonth.filter({ month_key })
    ]);

    // Lire la reset_version active (lecture seule — pas de modification)
    const reset_version = planning[0]?.reset_version ?? 0;

    // Filtrer les shifts sur la version active uniquement
    const activeShifts = allShiftsForMonth.filter(s =>
      (s.reset_version ?? 0) === reset_version
    );

    // Employer IDs ayant des shifts actifs ce mois
    const empIdsWithShifts = new Set(activeShifts.map(s => s.employee_id));

    console.log(
      `[refreshRecaps]   month_key=${month_key} | reset_version=${reset_version}` +
      ` | total shifts DB=${allShiftsForMonth.length} | shifts actifs (v${reset_version})=${activeShifts.length}` +
      ` | employés actifs=${employees.length} | employés avec shifts=${empIdsWithShifts.size}`
    );

    let upserted = 0;
    let skipped = 0;
    const errors = [];

    for (const emp of employees) {
      if (!empIdsWithShifts.has(emp.id)) {
        skipped++;
        continue;
      }

      const emp_shifts = activeShifts.filter(s => s.employee_id === emp.id);

      try {
        // Vérifier si un enregistrement existe déjà
        const existing = await b.entities.MonthlyRecapPersisted.filter({
          month_key,
          employee_id: emp.id
        });

        if (existing.length === 0) {
          // Créer une ligne de base (l'UI recalculera les vraies valeurs)
          const worked_hours = emp_shifts.reduce((sum, s) => {
            const [h1, m1] = (s.start_time || '00:00').split(':').map(Number);
            const [h2, m2] = (s.end_time || '00:00').split(':').map(Number);
            const dur = (h2 * 60 + m2 - h1 * 60 - m1) / 60 - (s.break_minutes || 0) / 60;
            return sum + Math.max(0, dur);
          }, 0);

          // ✅ SEULE écriture autorisée: MonthlyRecapPersisted
          await b.entities.MonthlyRecapPersisted.create({
            month_key,
            employee_id: emp.id,
            reset_version,
            is_manual_override: false,
            worked_hours,
            complementary_hours_ui: 0,
            overtime_hours_ui: 0,
            complementary_hours_10: 0,
            complementary_hours_25: 0,
            overtime_hours_25: 0,
            overtime_hours_50: 0
          });
          upserted++;
          console.log(`[refreshRecaps]   ✓ Créé recap pour ${emp.first_name} ${emp.last_name} (${emp_shifts.length} shifts, ${worked_hours.toFixed(2)}h)`);
        } else {
          // Enregistrement existant: ne pas écraser (UI a la priorité)
          skipped++;
        }
      } catch (err) {
        console.error(`[refreshRecaps]   ❌ Erreur ${emp.first_name} ${emp.last_name}: ${err.message}`);
        errors.push(`${emp.first_name} ${emp.last_name}: ${err.message}`);
      }
    }

    console.log(
      `[refreshRecaps] ✅ month_key=${month_key} terminé` +
      ` | créés=${upserted} | ignorés=${skipped} | erreurs=${errors.length}`
    );

    results.push({
      month_key,
      reset_version,
      active_shifts: activeShifts.length,
      employees_with_shifts: empIdsWithShifts.size,
      created: upserted,
      skipped,
      errors: errors.length > 0 ? errors : undefined
    });
  }

  return Response.json({ success: true, results });
});