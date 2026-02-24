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

  // Load shifts for current month using month_key + active reset_version (to avoid counting old versions)
  const allShiftsRaw = await b.entities.Shift.filter({ month_key: monthKey, reset_version: activeResetVersion });
  const allMonthShifts = allShiftsRaw;
  console.log(`📅 Month shifts: ${allMonthShifts.length} (month_key=${monthKey}, reset_version=${activeResetVersion})`);

  // Load non-shift events for today (to exclude absent/leave employees)
  // Load persisted recap data (source of truth = UI values)
  // Load all active employees + teams in parallel
  const [allNonShifts, allPersistedRecaps, allEmployees, allTeams] = await Promise.all([
    b.entities.NonShiftEvent.filter({ date: todayStr }),
    b.entities.MonthlyRecapPersisted.filter({ month_key: monthKey }),
    b.entities.Employee.filter({ is_active: true }),
    b.entities.Team.filter({ is_active: true })
  ]);

  const employeeIdsOnNonShift = new Set(allNonShifts.map(ns => ns.employee_id));
  console.log(`📋 Persisted recaps loaded: ${allPersistedRecaps.length} for ${monthKey}`);

  // Today shifts already in allMonthShifts
  const allTodayShifts = allMonthShifts.filter(s => s.date === todayStr);

  // ─── Helper: get score from persisted recap (source of truth = UI values) ──
  function getScoreFromPersisted(empId, hoursTypeParam) {
    const recap = allPersistedRecaps.find(r => r.employee_id === empId);
    if (!recap) {
      console.log(`  [WARN] No persisted recap for ${empId} — score=0`);
      return { comp: 0, ot: 0 };
    }
    return {
      comp: recap.complementary_hours_ui || 0,
      ot: recap.overtime_hours_ui || 0
    };
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

      const { comp, ot } = getScoreFromPersisted(empId, hoursType);
      const isPartTime = emp.work_time_type === 'part_time';

      let score = 0;
      if (hoursType === 'complementary') score = comp;
      else if (hoursType === 'overtime') score = ot;
      else score = comp + ot;

      console.log(`  → ${emp.first_name} ${emp.last_name}: comp=${comp.toFixed(2)}h ot=${ot.toFixed(2)}h score=${score.toFixed(2)} (hoursType=${hoursType}, partTime=${isPartTime})`);

      return {
        employee_id: empId,
        first_name: emp.first_name,
        last_name: emp.last_name,
        score,
        comp,
        ot
      };
    }).filter(Boolean);

    // Sort: score DESC, then name ASC
    employeeData.sort((a, b) => {
      if (Math.abs(b.score - a.score) > 0.001) return b.score - a.score;
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