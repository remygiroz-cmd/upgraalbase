import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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
    // No user = scheduled job context
  }

  const b = base44.asServiceRole;

  const settingsArr = await b.entities.AppSettings.filter({ setting_key: 'optimisation_masse_salariale' });
  const settings = settingsArr[0];

  if (!settings || !settings.enabled) {
    return Response.json({ skipped: true, reason: 'Optimisation désactivée' });
  }

  const services = settings.services || [];
  const hoursType = settings.hours_type || 'complementary';

  if (services.length === 0) {
    return Response.json({ skipped: true, reason: 'Aucun service configuré' });
  }

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const monthKey = todayStr.substring(0, 7); // YYYY-MM
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-indexed

  // Month boundaries for filtering shifts
  const monthStart = `${monthKey}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const monthEnd = `${monthKey}-${String(lastDay).padStart(2, '0')}`;

  // Load the active reset version for this month
  const planningMonths = await b.entities.PlanningMonth.filter({ month_key: monthKey });
  const activeResetVersion = planningMonths[0]?.reset_version ?? 0;

  console.log(`🔄 Triggering persistMonthlyRecaps before scoring (month=${monthKey}, v=${activeResetVersion})`);
  // Toujours re-persister avant de scorer pour s'assurer que les données sont à jour
  await base44.asServiceRole.functions.invoke('persistMonthlyRecaps', { month_key: monthKey });
  console.log(`✅ persistMonthlyRecaps done`);

  // Load shifts for current month using month_key + active reset_version
  const allShiftsRaw = await b.entities.Shift.filter({ month_key: monthKey, reset_version: activeResetVersion });
  const allMonthShifts = allShiftsRaw;
  console.log(`📅 Month shifts: ${allMonthShifts.length} (month_key=${monthKey}, reset_version=${activeResetVersion})`);

  // Load non-shift events for today (to exclude absent/leave employees)
  // Load persisted recap data + extras overrides (source of truth = UI values + manual overrides)
  // Load all active employees + teams in parallel
  const [allNonShifts, allPersistedRecapsRaw, allRecapExtras, allEmployees, allTeams] = await Promise.all([
    b.entities.NonShiftEvent.filter({ date: todayStr }),
    b.entities.MonthlyRecapPersisted.filter({ month_key: monthKey, reset_version: activeResetVersion }),
    b.entities.MonthlyRecapExtrasOverride.filter({ month_key: monthKey }),
    b.entities.Employee.filter({ is_active: true }),
    b.entities.Team.filter({ is_active: true })
  ]);

  // Filtrage strict sur reset_version active (double sécurité)
  const allPersistedRecaps = allPersistedRecapsRaw.filter(r => r.reset_version === activeResetVersion);

  const employeeIdsOnNonShift = new Set(allNonShifts.map(ns => ns.employee_id));
  console.log(`📋 Persisted recaps loaded: ${allPersistedRecaps.length} for ${monthKey} v${activeResetVersion}`);
  console.log(`📋 Extras overrides loaded: ${allRecapExtras.length} for ${monthKey}`);

  // Today shifts already in allMonthShifts
  const allTodayShifts = allMonthShifts.filter(s => s.date === todayStr);

  // ─── Helper: get score from persisted recap avec priorité overrides manuels ──
  // Règle : is_manual_override=true → utiliser ses valeurs d'heures
  //         sinon → utiliser le calcul auto du record persisté (complementary/overtime_hours_10/25)
  function getScoreFromPersisted(empId) {
    const recap = allPersistedRecaps.find(r => r.employee_id === empId);
    
    // Score en heures décimales
    let comp10 = 0, comp25 = 0, ot25 = 0, ot50 = 0, workedHours = 0;

    if (recap) {
      workedHours = recap.worked_hours || 0;
      if (recap.is_manual_override === true) {
        // Override manuel : utiliser directement les valeurs saisies
        comp10  = recap.complementary_hours_10 || 0;
        comp25  = recap.complementary_hours_25 || 0;
        ot25    = recap.overtime_hours_25 || 0;
        ot50    = recap.overtime_hours_50 || 0;
        console.log(`⚡ MANUAL OVERRIDE for ${empId}: comp10=${comp10} comp25=${comp25} ot25=${ot25} ot50=${ot50}`);
      } else {
        // Cache auto : utiliser les champs détaillés
        comp10  = recap.complementary_hours_10 || 0;
        comp25  = recap.complementary_hours_25 || 0;
        ot25    = recap.overtime_hours_25 || 0;
        ot50    = recap.overtime_hours_50 || 0;
      }
    } else {
      console.warn("No MonthlyRecapPersisted found for employee", empId);
    }

    const comp = comp10 + comp25;
    const ot   = ot25 + ot50;

    return { comp, ot, workedHours, comp10, comp25, ot25, ot50, isManual: recap?.is_manual_override === true };
  }

  const results = [];

  for (const service of services) {
    const team = allTeams.find(t => t.name.toLowerCase() === service.toLowerCase());
    const teamEmployeeIds = team
      ? new Set(allEmployees.filter(e => e.team_id === team.id).map(e => e.id))
      : new Set();

    const serviceShifts = allTodayShifts.filter(s =>
      teamEmployeeIds.has(s.employee_id) &&
      s.status !== 'absent' && s.status !== 'leave' &&
      !employeeIdsOnNonShift.has(s.employee_id)
    );

    if (serviceShifts.length === 0) {
      const existing = await b.entities.DepartureOrder.filter({ date: todayStr, service });
      for (const e of existing) await b.entities.DepartureOrder.delete(e.id);
      await b.entities.DepartureOrder.create({ date: todayStr, service, ordered_employees: [], message: '', generated_at: new Date().toISOString(), status: 'empty' });
      results.push({ service, status: 'empty' });
      continue;
    }

    const employeeIds = [...new Set(serviceShifts.map(s => s.employee_id))];

    console.log(`\n🏷️  Service: ${service} | ${employeeIds.length} employees on shift today`);

    const employeeData = employeeIds.map(empId => {
      const emp = allEmployees.find(e => e.id === empId);
      if (!emp) return null;

      const { comp, ot, workedHours } = getScoreFromPersisted(empId);

      // Score selon le type d'heures configuré
      let score = 0;
      if (hoursType === 'complementary') score = comp;
      else if (hoursType === 'overtime') score = ot;
      else score = comp + ot; // 'both' ou par défaut

      console.log("OPTIM DEBUG", {
        employee: `${emp.first_name} ${emp.last_name}`,
        complementary_hours_ui: comp,
        overtime_hours_ui: ot,
        score,
        workedHours,
        hoursType,
        month_key: monthKey,
        reset_version: activeResetVersion
      });

      return {
        employee_id: empId,
        first_name: emp.first_name,
        last_name: emp.last_name,
        score,
        comp,
        ot,
        workedHours
      };
    }).filter(Boolean);

    // Tri : 1) score DESC, 2) workedHours DESC, 3) nom alphabétique
    employeeData.sort((a, b) => {
      if (Math.abs(b.score - a.score) > 0.001) return b.score - a.score;
      if (Math.abs(b.workedHours - a.workedHours) > 0.001) return b.workedHours - a.workedHours;
      return a.last_name.localeCompare(b.last_name, 'fr');
    });

    const orderStr = employeeData.map((emp, i) => `${i + 1}. ${emp.first_name} ${emp.last_name}`).join(', ');
    const debugStr = employeeData.map(e => `${e.first_name}=${e.score.toFixed(1)}h`).join(' | ');
    const message = `Ordre de départ pour le service ${service} aujourd'hui :\n${orderStr}\nDEBUG scores: ${debugStr}`;

    console.log(`📋 Final order: ${orderStr}`);
    console.log(`📊 Debug: ${debugStr}`);

    const existing = await b.entities.DepartureOrder.filter({ date: todayStr, service });
    for (const e of existing) await b.entities.DepartureOrder.delete(e.id);

    await b.entities.DepartureOrder.create({
      date: todayStr,
      service,
      ordered_employees: employeeData.map((e, i) => ({
        employee_id: e.employee_id,
        employee_name: `${e.first_name} ${e.last_name}`,
        score: e.score,
        rank: i + 1
      })),
      message,
      generated_at: new Date().toISOString(),
      status: 'success'
    });

    results.push({ service, status: 'success', count: employeeData.length, debug: debugStr });
  }

  return Response.json({ success: true, date: todayStr, results });
});