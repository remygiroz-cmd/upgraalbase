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

  // Load ALL shifts for the current month to calculate complementary/overtime hours
  const monthStart = `${monthKey}-01`;
  const monthEnd = `${monthKey}-${new Date(year, month, 0).getDate().toString().padStart(2, '0')}`;
  const allMonthShifts = await b.entities.Shift.filter({ month_key: monthKey });

  console.log(`📊 Month shifts loaded: ${allMonthShifts.length} for ${monthKey}`);

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

      // Calculate score directly from shifts for the month - no reliance on stored recaps
      // Get all employee shifts for the current month
      const empMonthShifts = allMonthShifts.filter(s =>
        s.employee_id === empId &&
        s.status !== 'absent' && s.status !== 'leave' && s.status !== 'cancelled'
      );

      // Calculate total worked hours for the month (respecting base_hours_override)
      // Only count shifts UP TO AND INCLUDING today (not future shifts)
      const calcShiftHours = (s) => {
        if (s.base_hours_override !== null && s.base_hours_override !== undefined) {
          return parseFloat(s.base_hours_override) || 0;
        }
        if (!s.start_time || !s.end_time) return 0;
        const [sh, sm] = s.start_time.split(':').map(Number);
        const [eh, em] = s.end_time.split(':').map(Number);
        let mins = (eh * 60 + em) - (sh * 60 + sm);
        if (mins < 0) mins += 24 * 60;
        mins -= (s.break_minutes || 0);
        return Math.max(0, mins) / 60;
      };

      // Only count shifts up to today to get accurate "heures faites ce mois"
      const empPastShifts = empMonthShifts.filter(s => s.date <= todayStr);
      let totalWorkedHours = 0;
      empPastShifts.forEach(s => { totalWorkedHours += calcShiftHours(s); });

      // Get contract monthly hours directly from contract_hours field (most accurate)
      const parseHours = (val) => {
        if (!val) return 0;
        const str = String(val).trim();
        if (str.includes(':')) {
          const [h, m] = str.split(':').map(Number);
          return h + (m || 0) / 60;
        }
        return parseFloat(str.replace(',', '.')) || 0;
      };

      // Pro-rate contract hours to elapsed days (same as frontend recap logic)
      const daysInMonth = new Date(year, month, 0).getDate(); // month is 1-indexed
      const todayDayNum = parseInt(todayStr.split('-')[2]);
      const elapsedFraction = todayDayNum / daysInMonth;
      const contractMonthlyHours = parseHours(emp.contract_hours) * elapsedFraction;

      // Calculate extra hours (complementary for part-time, overtime for full-time)
      const extraHours = Math.max(0, totalWorkedHours - contractMonthlyHours);

      const isPartTime = emp.work_time_type === 'part_time';
      let score = 0;

      if (isPartTime) {
        if (hoursType === 'complementary' || hoursType === 'both') score += extraHours;
      } else {
        if (hoursType === 'overtime' || hoursType === 'both') score += extraHours;
        // full-time has no complementary hours
        if (hoursType === 'complementary') score = 0;
      }

      console.log(`  Score ${emp.first_name} ${emp.last_name}: shifts=${empMonthShifts.length}, worked=${totalWorkedHours.toFixed(2)}h, contract=${contractMonthlyHours.toFixed(2)}h, extra=${extraHours.toFixed(2)}h, score=${score.toFixed(2)}, partTime=${isPartTime}`);

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