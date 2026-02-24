import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * persistMonthlyRecaps
 * 
 * Recalcule les récaps mensuels pour tous les employés actifs du mois donné,
 * en appliquant la MÊME logique que le composant UI (recapWithOverrides + calculateMonthlyRecap),
 * puis persiste les valeurs finales dans MonthlyRecapPersisted.
 * 
 * Payload: { month_key: "2026-02" }  (optionnel, défaut = mois courant)
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function getFullWeekDates(mondayStr) {
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(mondayStr + 'T00:00:00');
    d.setDate(d.getDate() + i);
    dates.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
  }
  return dates;
}

function getWeeksTouchingMonth(year, month) {
  const weeksSet = new Set();
  const lastDay = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(year, month, day);
    const dow = d.getDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    const mon = new Date(year, month, day + diff);
    const monStr = `${mon.getFullYear()}-${String(mon.getMonth()+1).padStart(2,'0')}-${String(mon.getDate()).padStart(2,'0')}`;
    weeksSet.add(monStr);
  }
  return [...weeksSet];
}

/**
 * Calcule les heures complémentaires et supplémentaires pour un employé,
 * identique à la logique calculateMonthlyRecap (mode weekly).
 */
function calculateRecapForEmployee(emp, empShifts, year, month, monthStart, monthEnd) {
  const contractHoursWeekly = parseContractHours(emp.contract_hours_weekly) || 0;
  const isPartTime = emp.work_time_type === 'part_time';
  const workDaysPerWeek = emp.work_days_per_week || 5;

  const weeklySchedule = emp.weekly_schedule || {};
  const dayMapNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const workedDaysOfWeek = new Set();
  dayMapNames.forEach((name, idx) => { if (weeklySchedule[name]?.worked) workedDaysOfWeek.add(idx); });
  if (workedDaysOfWeek.size === 0) {
    for (let i = 0; i < workDaysPerWeek; i++) workedDaysOfWeek.add((i + 1) % 7);
  }

  const dailyContractHours = contractHoursWeekly / (workedDaysOfWeek.size || workDaysPerWeek);
  const weeks = getWeeksTouchingMonth(year, month);

  let totalComp = 0;
  let totalOt25 = 0;
  let totalOt50 = 0;
  let totalWorkedHours = 0;
  let totalWeeklyBase = 0;

  for (const mondayStr of weeks) {
    const allWeekDates = getFullWeekDates(mondayStr);
    const visibleDates = allWeekDates.filter(d => d >= monthStart && d <= monthEnd);

    let contractDaysVisible = 0;
    for (const dateStr of visibleDates) {
      if (workedDaysOfWeek.has(new Date(dateStr + 'T00:00:00').getDay())) contractDaysVisible++;
    }
    const weekBase = contractDaysVisible * dailyContractHours;
    totalWeeklyBase += weekBase;

    let weekHours = 0;
    for (const dateStr of visibleDates) {
      const dayShifts = empShifts.filter(s =>
        s.date === dateStr && s.status !== 'absent' && s.status !== 'leave' && s.status !== 'cancelled'
      );
      weekHours += dayShifts.reduce((sum, s) => sum + shiftDuration(s), 0);
    }
    totalWorkedHours += weekHours;

    const diff = weekHours - weekBase;
    if (isPartTime) {
      totalComp += Math.max(0, diff);
    } else {
      const weekOt = Math.max(0, diff);
      totalOt25 += Math.min(weekOt, 8);
      if (weekOt > 8) totalOt50 += weekOt - 8;
    }
  }

  // Monthly split for part-time (HC10/HC25)
  let comp10 = 0, comp25 = 0;
  if (isPartTime) {
    const threshold10 = totalWeeklyBase * 0.10;
    comp10 = Math.floor(Math.min(totalComp, threshold10) * 100) / 100;
    comp25 = Math.floor(Math.max(0, totalComp - threshold10) * 100) / 100;
  }

  return {
    comp10,
    comp25,
    ot25: totalOt25,
    ot50: totalOt50,
    totalComp: comp10 + comp25,
    totalOt: totalOt25 + totalOt50,
    workedHours: totalWorkedHours
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Non authentifié' }, { status: 401 });
    }
    if (user.role !== 'admin') {
      const employees = await base44.asServiceRole.entities.Employee.filter({ email: user.email });
      const emp = employees[0];
      if (!emp || emp.permission_level !== 'manager') {
        return Response.json({ error: 'Accès refusé' }, { status: 403 });
      }
    }
  } catch {
    // scheduled job
  }

  const b = base44.asServiceRole;

  // Parse payload
  let body = {};
  try { body = await req.json(); } catch { /* no body */ }

  const today = new Date();
  const defaultMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const monthKey = body.month_key || defaultMonthKey;

  const [yearStr, monthStr] = monthKey.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1; // 0-indexed

  const monthStart = `${monthKey}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const monthEnd = `${monthKey}-${String(lastDay).padStart(2, '0')}`;

  console.log(`\n════════════════════════════════════════════════════════`);
  console.log(`📊 PERSIST MONTHLY RECAPS — ${monthKey}`);
  console.log(`════════════════════════════════════════════════════════`);

  // Load planning version
  const planningMonths = await b.entities.PlanningMonth.filter({ month_key: monthKey });
  const activeResetVersion = planningMonths[0]?.reset_version ?? 0;
  console.log(`Reset version: ${activeResetVersion}`);

  // Load all data in parallel
  const [allEmployees, allShifts, allOverrides, settingsArr] = await Promise.all([
    b.entities.Employee.filter({ is_active: true }),
    b.entities.Shift.filter({ month_key: monthKey, reset_version: activeResetVersion }),
    b.entities.ExportComptaOverride ? b.entities.ExportComptaOverride.filter({ month_key: monthKey }) : Promise.resolve([]),
    b.entities.AppSettings.filter({ setting_key: 'planning_calculation_mode' })
  ]);

  console.log(`Employees: ${allEmployees.length}, Shifts: ${allShifts.length}, Overrides: ${allOverrides.length}`);

  let processed = 0;
  let errors = 0;

  for (const emp of allEmployees) {
    try {
      const empShifts = allShifts.filter(s => s.employee_id === emp.id);
      const rawRecap = calculateRecapForEmployee(emp, empShifts, year, month, monthStart, monthEnd);

      // Apply export overrides (same as applyExportOverrides in recapWithOverrides.js)
      const override = allOverrides.find(o => o.employee_id === emp.id);
      let comp10 = rawRecap.comp10;
      let comp25 = rawRecap.comp25;
      let ot25 = rawRecap.ot25;
      let ot50 = rawRecap.ot50;

      if (override) {
        if (override.override_compl10 !== null && override.override_compl10 !== undefined) comp10 = override.override_compl10;
        if (override.override_compl25 !== null && override.override_compl25 !== undefined) comp25 = override.override_compl25;
        if (override.override_supp25 !== null && override.override_supp25 !== undefined) ot25 = override.override_supp25;
        if (override.override_supp50 !== null && override.override_supp50 !== undefined) ot50 = override.override_supp50;
      }

      const complementary_hours_ui = Math.round((comp10 + comp25) * 100) / 100;
      const overtime_hours_ui = Math.round((ot25 + ot50) * 100) / 100;

      console.log(`  ${emp.first_name} ${emp.last_name}: HC=${complementary_hours_ui}h HS=${overtime_hours_ui}h${override ? ' [OVERRIDE]' : ''}`);

      // Upsert into MonthlyRecapPersisted
      const existing = await b.entities.MonthlyRecapPersisted.filter({
        month_key: monthKey,
        employee_id: emp.id
      });

      const recapData = {
        month_key: monthKey,
        employee_id: emp.id,
        reset_version: activeResetVersion,
        complementary_hours_ui,
        overtime_hours_ui,
        complementary_hours_10: comp10,
        complementary_hours_25: comp25,
        overtime_hours_25: ot25,
        overtime_hours_50: ot50,
        worked_hours: rawRecap.workedHours,
        updated_at: new Date().toISOString()
      };

      if (existing.length > 0) {
        await b.entities.MonthlyRecapPersisted.update(existing[0].id, recapData);
      } else {
        await b.entities.MonthlyRecapPersisted.create(recapData);
      }

      processed++;
    } catch (err) {
      console.error(`  ✗ Error for ${emp.first_name} ${emp.last_name}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n✅ Done: ${processed} persisted, ${errors} errors`);
  console.log(`════════════════════════════════════════════════════════`);

  return Response.json({ success: true, month_key: monthKey, processed, errors });
});