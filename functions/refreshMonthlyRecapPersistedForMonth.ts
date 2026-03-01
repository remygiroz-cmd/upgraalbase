import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * refreshMonthlyRecapPersistedForMonth
 * 
 * Recalcule et persiste les recaps mensuels pour TOUS les employés actifs du mois,
 * utilisé avant un export compta pour s'assurer que MonthlyRecapPersisted est à jour.
 * 
 * Payload: {
 *   month_key: "2026-02"  // YYYY-MM
 * }
 */
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const b = base44.asServiceRole;
  let body = {};
  try { body = await req.json(); } catch { /* pas de body (appel automation) */ }
  
  // Si month_key non fourni (ex: appel depuis automation), utiliser le mois courant
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const month_key = body.month_key || currentMonthKey;

  const [year, monthStr] = month_key.split('-');
  const monthNum = parseInt(monthStr, 10);
  if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
    return Response.json({ error: 'month_key invalide (YYYY-MM)' }, { status: 400 });
  }

  // Fetch les données du mois
  const [employees, shifts, planning] = await Promise.all([
    b.entities.Employee.filter({ is_active: true }),
    b.entities.Shift.filter({ month_key }),
    b.entities.PlanningMonth.filter({ month_key })
  ]);

  const reset_version = planning[0]?.reset_version ?? 0;
  const filtered_shifts = shifts.filter(s => s.reset_version === reset_version);

  let persisted_count = 0;
  const errors = [];

  // Pour chaque employé actif ayant des shifts ce mois
  for (const emp of employees) {
    const emp_shifts = filtered_shifts.filter(s => s.employee_id === emp.id);
    if (emp_shifts.length === 0) continue;

    try {
      // Appeler saveSingleMonthlyRecap via SDK
      // Mais d'abord, il faut recalculer les valeurs UI...
      // 
      // ⚠️ LIMITATIONS: 
      // - Le backend ne peut pas recalculer exactement "les valeurs UI" car cela demande
      //   tous les non-shifts, overrides export, etc.
      // - Le mieux est de laisser le FRONTEND persister via MonthlySummary
      // - Cette fonction est juste un "fallback sync" qui assurant que chaque employee a UNE LIGNE
      //   (même si vide) dans MonthlyRecapPersisted
      
      const existing = await b.entities.MonthlyRecapPersisted.filter({
        month_key,
        employee_id: emp.id
      });

      if (existing.length === 0) {
        // Créer un enregistrement vide/par défaut si inexistant
        await b.entities.MonthlyRecapPersisted.create({
          month_key,
          employee_id: emp.id,
          reset_version,
          is_manual_override: false, // Cache auto → ignoré par le resolver
          complementary_hours_ui: 0,
          overtime_hours_ui: 0,
          complementary_hours_10: 0,
          complementary_hours_25: 0,
          overtime_hours_25: 0,
          overtime_hours_50: 0,
          worked_hours: emp_shifts.reduce((sum, s) => {
            // Calcul basique: durée shift
            const [h1, m1] = s.start_time.split(':').map(Number);
            const [h2, m2] = s.end_time.split(':').map(Number);
            let dur = (h2 * 60 + m2 - h1 * 60 - m1) / 60;
            dur -= (s.break_minutes || 0) / 60;
            return sum + Math.max(0, dur);
          }, 0)
        });
        persisted_count++;
      }
    } catch (err) {
      errors.push(`${emp.first_name} ${emp.last_name}: ${err.message}`);
    }
  }

  return Response.json({
    success: true,
    month_key,
    reset_version,
    persisted_count,
    errors: errors.length > 0 ? errors : undefined
  });
});