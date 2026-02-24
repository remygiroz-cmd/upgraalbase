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

  // Load shifts for current month — fetch last 31 days worth which covers exactly the month
  // We fetch all shifts and filter strictly to [monthStart, monthEnd]
  const allShiftsRaw = await b.entities.Shift.filter({ month_key: monthKey });
  const allMonthShifts = allShiftsRaw.length > 0
    ? allShiftsRaw
    : (await b.entities.Shift.list('-date', 1000)).filter(s => s.date >= monthStart && s.date <= monthEnd);
  console.log(`📅 Month shifts: ${allMonthShifts.length} (${monthStart}→${monthEnd})`);

  // Load non-shift events for today (to exclude absent/leave employees)
  const allNonShifts = await b.entities.NonShiftEvent.filter({ date: todayStr });
  const employeeIdsOnNonShift = new Set(allNonShifts.map(ns => ns.employee_id));

  // Today shifts already in allMonthShifts
  const allTodayShifts = allMonthShifts.filter(s => s.date === todayStr);

  // Load all active employees
  const allEmployees = await b.entities.Employee.filter({ is_active: true });

  // Load all teams
  const allTeams = await b.entities.Team.filter({ is_active: true });

  // ─── Helper: parse contract hours (HH:MM or decimal string) ─────────────
  function parseContractHours(val) {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const str = String(val).trim();
    if (str.includes(':')) {
      const [h, m] = str.split(':').map(s => parseInt(s, 10) || 0);
      return h + m / 60;
    }
    const n = parseFloat(str.replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }

  // ─── Helper: shift duration in hours ─────────────────────────────────────
  function shiftDuration(shift) {
    if (!shift.start_time || !shift.end_time) return 0;
    if (shift.base_hours_override !== null && shift.base_hours_override !== undefined) {
      return shift.base_hours_override;
    }
    const [sh, sm] = shift.start_time.split(':').map(Number);
    const [eh, em] = shift.end_time.split(':').map(Number);
    let mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins < 0) mins += 24 * 60;
    mins -= (shift.break_minutes || 0);
    return Math.max(0, mins / 60);
  }

  // ─── Compute complementary hours for a part-time employee this month ─────
  // Logic mirrors the weekly calc: sum complementary per week, then aggregate
  function computeComplementaryHours(employee, monthShifts) {
    const contractHoursWeekly = parseContractHours(employee.contract_hours_weekly) || 0;
    if (contractHoursWeekly <= 0) return 0;

    // Build the set of contractual worked days-of-week
    const weeklySchedule = employee.weekly_schedule || {};
    const dayMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const workedDaysOfWeek = new Set();
    dayMap.forEach((dayName, dayIndex) => {
      if (weeklySchedule[dayName]?.worked) workedDaysOfWeek.add(dayIndex);
    });
    const workDaysPerWeek = employee.work_days_per_week || workedDaysOfWeek.size || 5;
    if (workedDaysOfWeek.size === 0) {
      for (let i = 0; i < workDaysPerWeek; i++) workedDaysOfWeek.add((i + 1) % 7);
    }
    const dailyContractHours = contractHoursWeekly / workDaysPerWeek;

    // Group shifts by ISO week (Monday date as key)
    const weekMap = {};
    for (const shift of monthShifts) {
      if (shift.employee_id !== employee.id) continue;
      if (shift.status === 'absent' || shift.status === 'leave') continue;
      // Get Monday of this shift's week
      const d = new Date(shift.date);
      const dow = d.getDay();
      const diff = dow === 0 ? -6 : 1 - dow;
      const monday = new Date(d);
      monday.setDate(monday.getDate() + diff);
      const weekKey2 = `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`;
      if (!weekMap[weekKey2]) weekMap[weekKey2] = { workedHours: 0, base: 0, counted: false };
    }

    // For each week touching the month, calculate base and worked hours
    // Build full week list from month boundaries
    const weeksSet = new Set();
    for (let day = 1; day <= lastDay; day++) {
      const d = new Date(year, month, day);
      const dow = d.getDay();
      const diff = dow === 0 ? -6 : 1 - dow;
      const monday = new Date(d);
      monday.setDate(monday.getDate() + diff);
      const wk = `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`;
      weeksSet.add(wk);
    }

    let totalComp = 0;
    let totalBase = 0;

    for (const weekMondayStr of weeksSet) {
      // Get all 7 days of this week
      const weekDates = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekMondayStr);
        d.setDate(d.getDate() + i);
        weekDates.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
      }
      // Only count days visible in the month
      const visibleDates = weekDates.filter(d => d >= monthStart && d <= monthEnd);

      // Count contractual days visible
      let contractDaysVisible = 0;
      for (const dateStr of visibleDates) {
        const dow = new Date(dateStr).getDay();
        if (workedDaysOfWeek.has(dow)) contractDaysVisible++;
      }
      const weekBase = contractDaysVisible * dailyContractHours;
      totalBase += weekBase;

      // Sum worked hours for this week (visible dates only)
      let weekHours = 0;
      for (const dateStr of visibleDates) {
        const dayShifts = monthShifts.filter(s =>
          s.employee_id === employee.id &&
          s.date === dateStr &&
          s.status !== 'absent' && s.status !== 'leave'
        );
        weekHours += dayShifts.reduce((sum, s) => sum + shiftDuration(s), 0);
      }

      const weekComp = Math.max(0, weekHours - weekBase);
      totalComp += weekComp;
    }

    // Monthly 10%/25% split (but we only need total for ranking)
    const totalComplementaryHours = totalComp;
    console.log(`  [CALC] ${employee.first_name} ${employee.last_name}: contractWeekly=${contractHoursWeekly}h isPartTime=${employee.work_time_type} totalBase=${totalBase.toFixed(2)}h totalComp=${totalComplementaryHours.toFixed(2)}h`);
    return totalComplementaryHours;
  }

  // ─── Compute overtime hours for a full-time employee this month ───────────
  function computeOvertimeHours(employee, monthShifts) {
    const contractHoursWeekly = parseContractHours(employee.contract_hours_weekly) || 35;
    const workDaysPerWeek = employee.work_days_per_week || 5;
    const weeklySchedule = employee.weekly_schedule || {};
    const dayMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const workedDaysOfWeek = new Set();
    dayMap.forEach((dayName, dayIndex) => {
      if (weeklySchedule[dayName]?.worked) workedDaysOfWeek.add(dayIndex);
    });
    if (workedDaysOfWeek.size === 0) {
      for (let i = 0; i < workDaysPerWeek; i++) workedDaysOfWeek.add((i + 1) % 7);
    }
    const dailyContractHours = contractHoursWeekly / workDaysPerWeek;

    const weeksSet = new Set();
    for (let day = 1; day <= lastDay; day++) {
      const d = new Date(year, month, day);
      const dow = d.getDay();
      const diff = dow === 0 ? -6 : 1 - dow;
      const monday = new Date(d);
      monday.setDate(monday.getDate() + diff);
      const wk = `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`;
      weeksSet.add(wk);
    }

    let totalOvertime = 0;
    for (const weekMondayStr of weeksSet) {
      const weekDates = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekMondayStr);
        d.setDate(d.getDate() + i);
        weekDates.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
      }
      const visibleDates = weekDates.filter(d => d >= monthStart && d <= monthEnd);
      let contractDaysVisible = 0;
      for (const dateStr of visibleDates) {
        const dow = new Date(dateStr).getDay();
        if (workedDaysOfWeek.has(dow)) contractDaysVisible++;
      }
      const weekBase = contractDaysVisible * dailyContractHours;
      let weekHours = 0;
      for (const dateStr of visibleDates) {
        const dayShifts = monthShifts.filter(s =>
          s.employee_id === employee.id &&
          s.date === dateStr &&
          s.status !== 'absent' && s.status !== 'leave'
        );
        weekHours += dayShifts.reduce((sum, s) => sum + shiftDuration(s), 0);
      }
      totalOvertime += Math.max(0, weekHours - weekBase);
    }
    console.log(`  [CALC] ${employee.first_name} ${employee.last_name}: contractWeekly=${contractHoursWeekly}h isFullTime totalOvertime=${totalOvertime.toFixed(2)}h`);
    return totalOvertime;
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

      const isPartTime = emp.work_time_type === 'part_time';

      // Compute score directly from shifts (no DB recap needed)
      let comp = 0;
      let ot = 0;

      if (isPartTime) {
        comp = computeComplementaryHours(emp, allMonthShifts);
      } else {
        ot = computeOvertimeHours(emp, allMonthShifts);
      }

      let score = 0;
      if (hoursType === 'complementary') score = isPartTime ? comp : 0;
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