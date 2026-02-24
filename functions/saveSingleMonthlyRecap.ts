import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * saveSingleMonthlyRecap
 * 
 * Persiste le recap mensuel calculé par le frontend (valeurs EXACTES affichées dans l'UI).
 * Appelé directement depuis le composant MonthlySummary après chaque calcul.
 * 
 * Payload: {
 *   month_key: "2026-02",
 *   employee_id: "...",
 *   reset_version: 13,
 *   complementary_hours_ui: 3.6,
 *   overtime_hours_ui: 0,
 *   complementary_hours_10: 3.6,
 *   complementary_hours_25: 0,
 *   overtime_hours_25: 0,
 *   overtime_hours_50: 0,
 *   worked_hours: 43.6
 * }
 */
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Non authentifié' }, { status: 401 });
    }
  } catch {
    return Response.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const b = base44.asServiceRole;

  let body = {};
  try { body = await req.json(); } catch { /* no body */ }

  const { month_key, employee_id, reset_version, complementary_hours_ui, overtime_hours_ui,
    complementary_hours_10, complementary_hours_25, overtime_hours_25, overtime_hours_50, worked_hours } = body;

  if (!month_key || !employee_id) {
    return Response.json({ error: 'month_key et employee_id requis' }, { status: 400 });
  }

  const recapData = {
    month_key,
    employee_id,
    reset_version: reset_version ?? 0,
    complementary_hours_ui: complementary_hours_ui ?? 0,
    overtime_hours_ui: overtime_hours_ui ?? 0,
    complementary_hours_10: complementary_hours_10 ?? 0,
    complementary_hours_25: complementary_hours_25 ?? 0,
    overtime_hours_25: overtime_hours_25 ?? 0,
    overtime_hours_50: overtime_hours_50 ?? 0,
    worked_hours: worked_hours ?? 0,
    updated_at: new Date().toISOString()
  };

  // Upsert
  const existing = await b.entities.MonthlyRecapPersisted.filter({ month_key, employee_id });

  if (existing.length > 0) {
    await b.entities.MonthlyRecapPersisted.update(existing[0].id, recapData);
  } else {
    await b.entities.MonthlyRecapPersisted.create(recapData);
  }

  return Response.json({ success: true });
});