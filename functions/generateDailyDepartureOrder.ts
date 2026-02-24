import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Allow both authenticated calls (manual recalculate) and scheduled job
  // For scheduled calls, we use service role directly
  let isScheduled = false;
  try {
    const user = await base44.auth.me();
    if (user && user.role !== 'admin') {
      // Check if employee has manager permission
      const employees = await base44.asServiceRole.entities.Employee.filter({ email: user.email });
      const emp = employees[0];
      if (!emp || emp.permission_level !== 'manager') {
        return Response.json({ error: 'Accès refusé' }, { status: 403 });
      }
    }
  } catch {
    // No user = scheduled job context
    isScheduled = true;
  }

  const b = base44.asServiceRole;

  // Load settings
  const settingsArr = await b.entities.AppSettings.filter({ setting_key: 'optimisation_masse_salariale' });
  const settings = settingsArr[0];

  if (!settings || !settings.enabled) {
    return Response.json({ skipped: true, reason: 'Optimisation désactivée' });
  }

  const services = settings.services || [];
  const hoursType = settings.hours_type || 'complementary'; // 'complementary' | 'overtime' | 'both'

  if (services.length === 0) {
    return Response.json({ skipped: true, reason: 'Aucun service configuré' });
  }

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const monthKey = todayStr.substring(0, 7);
  const [year, month] = monthKey.split('-').map(Number);

  // Load all shifts for today
  const allShifts = await b.entities.Shift.filter({ date: todayStr });

  // Load non-shift events for today (employees on leave, CP, etc.)
  const allNonShifts = await b.entities.NonShiftEvent.filter({ date: todayStr });
  const employeeIdsOnNonShift = new Set(allNonShifts.map(ns => ns.employee_id));

  // Load monthly recaps for current month using month_key (YYYY-MM)
  const allRecapsRaw = await b.entities.MonthlyRecap.filter({ month_key: monthKey });
  
  console.log(`📊 MonthlyRecap query: month_key=${monthKey}, found ${allRecapsRaw.length} records`);

  // Deduplicate: keep the most recently updated recap per employee
  const recapsByEmployee = {};
  for (const recap of allRecapsRaw) {
    const existing = recapsByEmployee[recap.employee_id];
    if (!existing || (recap.updated_date > existing.updated_date)) {
      recapsByEmployee[recap.employee_id] = recap;
    }
  }
  const allRecaps = Object.values(recapsByEmployee);

  // Helper: parse a value that might be "3.6h", "3,6", or a number
  function parseHours(val) {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return val;
    const str = String(val).replace(',', '.').replace(/[^0-9.]/g, '');
    const n = parseFloat(str);
    return isNaN(n) ? null : n;
  }

  // Helper: get complementary hours from a recap record with full fallback chain
  function getComplementaryHours(recap) {
    if (!recap) return { value: 0, source: 'no_recap' };

    // Fallback chain
    const v1 = parseHours(recap.complementaryHours);
    if (v1 !== null) return { value: v1, source: 'complementaryHours', raw: recap.complementaryHours };

    const v2 = parseHours(recap.complementaryHoursTotal);
    if (v2 !== null) return { value: v2, source: 'complementaryHoursTotal', raw: recap.complementaryHoursTotal };

    const a = parseHours(recap.complementaryHours10);
    const b2 = parseHours(recap.complementaryHours25);
    if (a !== null || b2 !== null) {
      return { value: (a || 0) + (b2 || 0), source: 'complementaryHours10+25', raw: `${recap.complementaryHours10}+${recap.complementaryHours25}` };
    }

    const c = parseHours(recap.complementary_10);
    const d = parseHours(recap.complementary_25);
    if (c !== null || d !== null) {
      return { value: (c || 0) + (d || 0), source: 'complementary_10+25', raw: `${recap.complementary_10}+${recap.complementary_25}` };
    }

    const v5 = parseHours(recap.hComplementaires);
    if (v5 !== null) return { value: v5, source: 'hComplementaires', raw: recap.hComplementaires };

    console.warn(`⚠️ No complementary hours field found for employee ${recap.employee_id}`);
    return { value: 0, source: 'not_found' };
  }

  // Load all employees
  const allEmployees = await b.entities.Employee.filter({ is_active: true });

  // Load all teams (to match team name → team id → employees)
  const allTeams = await b.entities.Team.filter({ is_active: true });

  const results = [];

  for (const service of services) {
    // Find the team matching this service name
    const team = allTeams.find(t => t.name.toLowerCase() === service.toLowerCase());
    const teamEmployeeIds = team
      ? new Set(allEmployees.filter(e => e.team_id === team.id).map(e => e.id))
      : new Set();

    // Shifts for employees of this team today — exclude employees with a non-shift event (CP, absences, etc.)
    const serviceShifts = allShifts.filter(s =>
      teamEmployeeIds.has(s.employee_id) &&
      s.status !== 'absent' && s.status !== 'leave' &&
      !employeeIdsOnNonShift.has(s.employee_id)
    );

    if (serviceShifts.length === 0) {
      // Delete any existing entry and save empty
      const existing = await b.entities.DepartureOrder.filter({ date: todayStr, service });
      for (const e of existing) {
        await b.entities.DepartureOrder.delete(e.id);
      }
      await b.entities.DepartureOrder.create({
        date: todayStr,
        service,
        ordered_employees: [],
        message: '',
        generated_at: new Date().toISOString(),
        status: 'empty'
      });
      results.push({ service, status: 'empty' });
      continue;
    }

    // Get unique employees for this service today
    const employeeIds = [...new Set(serviceShifts.map(s => s.employee_id))];

    const employeeData = employeeIds.map(empId => {
      const emp = allEmployees.find(e => e.id === empId);
      if (!emp) return null;

      const recap = allRecaps.find(r => r.employee_id === empId);

      // Calculate score based on hours type
      // Use stored calculated values from MonthlyRecap (complementaryHours10/25, overtimeHours25/50)
      // These are populated by the frontend calculation engine and saved to DB
      const compResult = getComplementaryHours(recap);
      const compScore = compResult.value;

      const ot = recap
        ? ((recap.overtimeHours25 || recap.overtime_25 || 0) + (recap.overtimeHours50 || recap.overtime_50 || 0))
        : 0;

      let score = 0;
      if (hoursType === 'complementary') score = compScore;
      else if (hoursType === 'overtime') score = ot;
      else score = compScore + ot;

      console.log(`  [DEBUG] ${emp.first_name} ${emp.last_name} | recap_id=${recap?.id ?? 'NONE'} | month_key=${recap?.month_key ?? 'N/A'} | source=${compResult.source} | raw=${compResult.raw ?? 'N/A'} | comp=${compScore} ot=${ot} → score=${score}`);

      // Calculate today's total shift duration
      const todayShifts = serviceShifts.filter(s => s.employee_id === empId);
      let shiftDuration = 0;
      todayShifts.forEach(s => {
        if (s.start_time && s.end_time) {
          const [sh, sm] = s.start_time.split(':').map(Number);
          const [eh, em] = s.end_time.split(':').map(Number);
          let mins = (eh * 60 + em) - (sh * 60 + sm);
          if (mins < 0) mins += 24 * 60;
          shiftDuration += mins / 60;
        }
      });

      return {
        employee_id: empId,
        employee_name: `${emp.first_name} ${emp.last_name}`,
        first_name: emp.first_name,
        last_name: emp.last_name,
        score,
        shift_duration: shiftDuration,
        priority_optimisation: emp.priority_optimisation || 9999
      };
    }).filter(Boolean);

    // Sort: score DESC → shift_duration DESC → priority_optimisation ASC → alphabetical
    employeeData.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.shift_duration !== a.shift_duration) return b.shift_duration - a.shift_duration;
      if (a.priority_optimisation !== b.priority_optimisation) return a.priority_optimisation - b.priority_optimisation;
      return a.last_name.localeCompare(b.last_name);
    });

    // Build message
    const orderStr = employeeData.map((emp, i) => `${i + 1}. ${emp.first_name} ${emp.last_name}`).join(', ');
    const message = `Ordre de départ pour le service ${service} aujourd'hui :\n${orderStr}`;

    // Delete existing entry for today/service
    const existing = await b.entities.DepartureOrder.filter({ date: todayStr, service });
    for (const e of existing) {
      await b.entities.DepartureOrder.delete(e.id);
    }

    // Save new entry
    await b.entities.DepartureOrder.create({
      date: todayStr,
      service,
      ordered_employees: employeeData.map(e => ({
        employee_id: e.employee_id,
        employee_name: `${e.first_name} ${e.last_name}`,
        score: e.score,
        shift_duration: e.shift_duration
      })),
      message,
      generated_at: new Date().toISOString(),
      status: 'success'
    });

    results.push({ service, status: 'success', count: employeeData.length });
  }

  return Response.json({ success: true, date: todayStr, results });
});