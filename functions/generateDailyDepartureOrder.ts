import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * generateDailyDepartureOrder
 *
 * SOURCE CANONIQUE UNIQUE : MonthlyRecapFinal
 * Ce record est écrit par MonthlySummary à chaque rendu/recalcul.
 * Il contient EXACTEMENT les valeurs affichées dans la carte "Récap Mois".
 *
 * Ce backend NE CALCULE PLUS RIEN. Il lit, trie, sauvegarde.
 */

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();
    if (user && user.role !== 'admin') {
      const employees = await base44.asServiceRole.entities.Employee.filter({ email: user.email });
      const emp = employees[0];
      if (!emp || emp.permission_level !== 'manager') {
        return Response.json({ error: 'Accès refusé' }, { status: 403 });
      }
    }
  } catch {
    // Contexte automation (pas d'utilisateur) — autorisé
  }

  const b = base44.asServiceRole;

  const settingsArr = await b.entities.AppSettings.filter({ setting_key: 'optimisation_masse_salariale' });
  const settings = settingsArr[0];

  if (!settings?.enabled) {
    return Response.json({ skipped: true, reason: 'Optimisation désactivée' });
  }

  const services  = settings.services  || [];
  const hoursType = settings.hours_type || 'complementary';

  if (services.length === 0) {
    return Response.json({ skipped: true, reason: 'Aucun service configuré' });
  }

  const today = new Date();
  const pad = n => String(n).padStart(2, '0');
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;
  const monthKey = todayStr.substring(0, 7);

  console.log(`📅 Génération ordre de départ — ${todayStr} (${monthKey})`);
  console.log(`⚙️  hoursType=${hoursType}, services=${services.join(',')}`);
  console.log(`ℹ️  SOURCE: MonthlyRecapFinal (valeurs canoniques = exactement ce qu'affiche la carte)`);

  const planningMonths = await b.entities.PlanningMonth.filter({ month_key: monthKey });
  const resetVersion   = planningMonths[0]?.reset_version ?? 0;

  // Chargement parallèle — uniquement ce dont on a besoin
  const [
    allTodayNonShifts,
    allTodayShifts,
    allRecapFinal,
    allEmployees,
    allTeams
  ] = await Promise.all([
    b.entities.NonShiftEvent.filter({ date: todayStr }),
    b.entities.Shift.filter({ date: todayStr, reset_version: resetVersion }),
    b.entities.MonthlyRecapFinal.filter({ month_key: monthKey }),
    b.entities.Employee.filter({ is_active: true }),
    b.entities.Team.filter({ is_active: true })
  ]);

  const nonShiftEmpIds = new Set(allTodayNonShifts.map(ns => ns.employee_id));

  console.log(`📋 RecapFinal disponibles: ${allRecapFinal.length} | Shifts aujourd'hui: ${allTodayShifts.length}`);

  const results = [];

  for (const service of services) {
    const team = allTeams.find(t => t.name.toLowerCase() === service.toLowerCase());
    const teamEmpIds = team
      ? new Set(allEmployees.filter(e => e.team_id === team.id).map(e => e.id))
      : new Set();

    // Employés présents aujourd'hui dans ce service (shifts du jour, pas de non-shift)
    const serviceShifts = allTodayShifts.filter(s =>
      teamEmpIds.has(s.employee_id) &&
      s.status !== 'absent' && s.status !== 'leave' && s.status !== 'cancelled' &&
      !nonShiftEmpIds.has(s.employee_id)
    );

    if (serviceShifts.length === 0) {
      const existing = await b.entities.DepartureOrder.filter({ date: todayStr, service });
      for (const e of existing) await b.entities.DepartureOrder.delete(e.id);
      await b.entities.DepartureOrder.create({
        date: todayStr, service, ordered_employees: [], message: '', generated_at: new Date().toISOString(), status: 'empty'
      });
      results.push({ service, status: 'empty' });
      continue;
    }

    const employeeIds = [...new Set(serviceShifts.map(s => s.employee_id))];
    console.log(`\n🏷️  Service: ${service} | ${employeeIds.length} employés présents`);

    const employeeData = employeeIds.map(empId => {
      const emp = allEmployees.find(e => e.id === empId);
      if (!emp) return null;

      // SOURCE CANONIQUE : MonthlyRecapFinal écrit par l'UI
      const recap = allRecapFinal.find(r => r.employee_id === empId) || null;

      let scoreMinutes, compTotalMin, otTotalMin, src;

      if (recap) {
        compTotalMin = recap.final_compl_total_min ?? 0;
        otTotalMin   = recap.final_supp_total_min  ?? 0;
        src = recap.final_source ?? 'final';
      } else {
        // Pas encore de record final (UI pas encore rendu ce mois) → score 0
        compTotalMin = 0;
        otTotalMin   = 0;
        src = 'noData';
      }

      if (hoursType === 'complementary') scoreMinutes = compTotalMin;
      else if (hoursType === 'overtime')  scoreMinutes = otTotalMin;
      else                                scoreMinutes = compTotalMin + otTotalMin;

      console.log(`  ${emp.first_name} ${emp.last_name}: comp=${compTotalMin}min supp=${otTotalMin}min score=${scoreMinutes}min src=${src}`);

      return {
        employee_id: empId,
        first_name: emp.first_name,
        last_name: emp.last_name,
        scoreMinutes,
        compTotalMin,
        otTotalMin,
        src
      };
    }).filter(Boolean);

    // Tri : scoreMinutes DESC, puis nom alphabétique
    employeeData.sort((a, b) => {
      if (b.scoreMinutes !== a.scoreMinutes) return b.scoreMinutes - a.scoreMinutes;
      return a.last_name.localeCompare(b.last_name, 'fr');
    });

    const debugStr = employeeData.map(e => `${e.first_name}=${e.scoreMinutes}min(${e.src})`).join(' | ');
    console.log(`📋 Ordre: ${employeeData.map((e,i) => `${i+1}.${e.first_name}`).join(' ')}`);
    console.log(`📊 Debug: ${debugStr}`);

    const existing = await b.entities.DepartureOrder.filter({ date: todayStr, service });
    for (const e of existing) await b.entities.DepartureOrder.delete(e.id);

    await b.entities.DepartureOrder.create({
      date: todayStr,
      service,
      ordered_employees: employeeData.map((e, i) => ({
        employee_id:   e.employee_id,
        employee_name: `${e.first_name} ${e.last_name}`,
        score_minutes: e.scoreMinutes,
        src:           e.src,
        rank:          i + 1
      })),
      message: `Ordre de départ — ${service} — ${todayStr}`,
      generated_at: new Date().toISOString(),
      status: 'success'
    });

    results.push({ service, status: 'success', count: employeeData.length, debug: debugStr });
  }

  return Response.json({ success: true, date: todayStr, results });
});