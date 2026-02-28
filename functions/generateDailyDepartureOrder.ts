import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * generateDailyDepartureOrder
 *
 * Calcule l'ordre de départ en utilisant la MÊME source de vérité que l'UI et l'export :
 *   MonthlyExportOverride > MonthlyRecapPersisted (is_manual_override=true) > MonthlyRecapExtrasOverride > calcul auto live
 *
 * PAS d'appel à persistMonthlyRecaps : les données sont calculées live depuis les shifts.
 */

// ─── Helpers (mêmes que l'UI) ─────────────────────────────────────────────────

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

/**
 * Durée en MINUTES ENTIÈRES — même logique que shiftStrictMinutes dans l'UI :
 * jamais base_hours_override, toujours start/end times brutes.
 */
function shiftStrictMinutes(shift) {
  if (!shift.start_time || !shift.end_time) return 0;
  const [sh, sm] = shift.start_time.split(':').map(Number);
  const [eh, em] = shift.end_time.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  mins -= (shift.break_minutes || 0);
  return Math.max(0, mins);
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
 * Calcul AUTO live (même logique que calculateMonthlyRecap en mode weekly)
 */
function calcAutoLive(emp, empShifts, year, month, monthStart, monthEnd) {
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

  let totalComp = 0, totalOt25 = 0, totalOt50 = 0, totalWorkedHours = 0, totalWeeklyBase = 0;

  for (const mondayStr of weeks) {
    const allWeekDates = getFullWeekDates(mondayStr);
    const visibleDates = allWeekDates.filter(d => d >= monthStart && d <= monthEnd);

    let contractDaysVisible = 0;
    for (const dateStr of visibleDates) {
      if (workedDaysOfWeek.has(new Date(dateStr + 'T00:00:00').getDay())) contractDaysVisible++;
    }
    const weekBase = contractDaysVisible * dailyContractHours;
    totalWeeklyBase += weekBase;

    // En MINUTES ENTIÈRES (identique à l'UI — shiftStrictMinutes)
    let weekMinutes = 0;
    for (const dateStr of visibleDates) {
      const dayShifts = empShifts.filter(s =>
        s.date === dateStr && s.status !== 'absent' && s.status !== 'leave' && s.status !== 'cancelled'
      );
      weekMinutes += dayShifts.reduce((sum, s) => sum + shiftStrictMinutes(s), 0);
    }
    totalWorkedHours += weekMinutes / 60;

    const weekBaseMinutes = Math.round(weekBase * 60);
    const diffMin = weekMinutes - weekBaseMinutes;

    if (isPartTime) {
      totalComp += Math.max(0, diffMin);
    } else {
      const weekOtMin = Math.max(0, diffMin);
      // HS25 = jusqu'à 480 min (8h) au-delà de la base, HS50 au-delà
      totalOt25 += Math.min(weekOtMin, 480);
      if (weekOtMin > 480) totalOt50 += weekOtMin - 480;
    }
  }

  let comp10 = 0, comp25 = 0;
  if (isPartTime) {
    // totalWeeklyBase est en heures → convertir en minutes pour le calcul
    const totalBaseMin = Math.round(totalWeeklyBase * 60);
    const limit10Min = Math.round(totalBaseMin * 0.10);
    comp10 = Math.min(totalComp, limit10Min) / 60;
    comp25 = Math.max(0, totalComp - limit10Min) / 60;
  }

  const ot25 = totalOt25 / 60;
  const ot50 = totalOt50 / 60;

  return { comp10, comp25, ot25, ot50, workedHours: totalWorkedHours };
}

/**
 * Resolver FINAL — même règle que resolveRecapFinal + resolveExportFinal :
 *   exportOverride > recapPersisted (manual only) > auto
 * Retourne { comp10, comp25, ot25, ot50, scoreMinutes, src }
 */
function resolveFinalScore(empId, autoValues, allPersistedRecaps, allRecapExtras, allExportOverrides, hoursType) {
  const persisted = allPersistedRecaps.find(r => r.employee_id === empId) || null;
  const extras    = allRecapExtras.find(r => r.employee_id === empId) || null;
  const expOvr    = allExportOverrides.find(r => r.employee_id === empId) || null;

  const isManualPersisted = persisted?.is_manual_override === true;

  // Priorité : exportOverride > manualPersisted > auto
  let comp10, comp25, ot25, ot50, src;

  if (expOvr && (expOvr.compl_10 !== null && expOvr.compl_10 !== undefined ||
                  expOvr.compl_25 !== null && expOvr.compl_25 !== undefined)) {
    comp10 = expOvr.compl_10  ?? autoValues.comp10;
    comp25 = expOvr.compl_25  ?? autoValues.comp25;
    ot25   = expOvr.supp_25   ?? (isManualPersisted ? (persisted.overtime_hours_25 ?? autoValues.ot25) : autoValues.ot25);
    ot50   = expOvr.supp_50   ?? (isManualPersisted ? (persisted.overtime_hours_50 ?? autoValues.ot50) : autoValues.ot50);
    src = 'exportOverride';
  } else if (isManualPersisted) {
    comp10 = persisted.complementary_hours_10 ?? autoValues.comp10;
    comp25 = persisted.complementary_hours_25 ?? autoValues.comp25;
    ot25   = persisted.overtime_hours_25       ?? autoValues.ot25;
    ot50   = persisted.overtime_hours_50       ?? autoValues.ot50;
    src = 'manualOverride';
  } else {
    comp10 = autoValues.comp10;
    comp25 = autoValues.comp25;
    ot25   = autoValues.ot25;
    ot50   = autoValues.ot50;
    src = 'auto';
  }

  const compMinutes = Math.round((comp10 + comp25) * 60);
  const otMinutes   = Math.round((ot25   + ot50)   * 60);

  let scoreMinutes = 0;
  if (hoursType === 'complementary') scoreMinutes = compMinutes;
  else if (hoursType === 'overtime')  scoreMinutes = otMinutes;
  else scoreMinutes = compMinutes + otMinutes;

  return { comp10, comp25, ot25, ot50, compMinutes, otMinutes, scoreMinutes, src };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

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
  const monthKey = todayStr.substring(0, 7);
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-indexed

  const monthStart = `${monthKey}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const monthEnd = `${monthKey}-${String(lastDay).padStart(2, '0')}`;

  // Load planning version
  const planningMonths = await b.entities.PlanningMonth.filter({ month_key: monthKey });
  const activeResetVersion = planningMonths[0]?.reset_version ?? 0;

  console.log(`📅 Génération ordre de départ — ${todayStr} (month=${monthKey} v${activeResetVersion})`);
  console.log(`⚙️  hoursType=${hoursType}, services=${services.join(',')}`);
  console.log(`ℹ️  Source de vérité : calcul live + resolver FINAL (exportOverride > manualPersisted > auto)`);

  // Chargement parallèle de toutes les données nécessaires
  const [
    allNonShifts,
    allMonthShifts,
    allPersistedRecaps,
    allRecapExtras,
    allExportOverrides,
    allEmployees,
    allTeams
  ] = await Promise.all([
    b.entities.NonShiftEvent.filter({ date: todayStr }),
    b.entities.Shift.filter({ month_key: monthKey, reset_version: activeResetVersion }),
    b.entities.MonthlyRecapPersisted.filter({ month_key: monthKey, reset_version: activeResetVersion }),
    b.entities.MonthlyRecapExtrasOverride.filter({ month_key: monthKey }),
    b.entities.MonthlyExportOverride.filter({ month_key: monthKey }),
    b.entities.Employee.filter({ is_active: true }),
    b.entities.Team.filter({ is_active: true })
  ]);

  // Filtrage strict reset_version
  const persistedFiltered = allPersistedRecaps.filter(r => r.reset_version === activeResetVersion);

  const employeeIdsOnNonShift = new Set(allNonShifts.map(ns => ns.employee_id));
  const allTodayShifts = allMonthShifts.filter(s => s.date === todayStr);

  console.log(`📋 Shifts mois: ${allMonthShifts.length} | Persisted (manual): ${persistedFiltered.filter(r => r.is_manual_override).length}/${persistedFiltered.length} | ExportOverrides: ${allExportOverrides.length}`);

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
    console.log(`\n🏷️  Service: ${service} | ${employeeIds.length} employés présents`);

    const employeeData = employeeIds.map(empId => {
      const emp = allEmployees.find(e => e.id === empId);
      if (!emp) return null;

      // Calcul auto live (depuis les shifts du mois)
      const empShifts = allMonthShifts.filter(s => s.employee_id === empId);
      const autoValues = calcAutoLive(emp, empShifts, year, month, monthStart, monthEnd);

      // Resolver FINAL : exportOverride > manualPersisted > auto
      const { comp10, comp25, ot25, ot50, compMinutes, otMinutes, scoreMinutes, src } =
        resolveFinalScore(empId, autoValues, persistedFiltered, allRecapExtras, allExportOverrides, hoursType);

      console.log(`  SCORE ${emp.first_name} ${emp.last_name}: comp=${compMinutes}min ot=${otMinutes}min score=${scoreMinutes}min src=${src}`);

      return {
        employee_id: empId,
        first_name: emp.first_name,
        last_name: emp.last_name,
        score: comp10 + comp25 + ot25 + ot50,
        scoreMinutes,
        compMinutes,
        otMinutes,
        workedHours: autoValues.workedHours,
        src
      };
    }).filter(Boolean);

    // Tri : scoreMinutes DESC, workedHours DESC, nom alphabétique
    employeeData.sort((a, b) => {
      if (b.scoreMinutes !== a.scoreMinutes) return b.scoreMinutes - a.scoreMinutes;
      if (Math.abs(b.workedHours - a.workedHours) > 0.001) return b.workedHours - a.workedHours;
      return a.last_name.localeCompare(b.last_name, 'fr');
    });

    const orderStr = employeeData.map((e, i) => `${i + 1}. ${e.first_name} ${e.last_name}`).join(', ');
    const debugStr = employeeData.map(e => `${e.first_name}=${e.scoreMinutes}min(${e.src})`).join(' | ');
    const message = `Ordre de départ pour le service ${service} aujourd'hui :\n${orderStr}\nDEBUG scores: ${debugStr}`;

    console.log(`📋 Ordre final: ${orderStr}`);
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
        score_minutes: e.scoreMinutes,
        src: e.src,
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