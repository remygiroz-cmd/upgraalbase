import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * generateDailyDepartureOrder
 *
 * RÈGLE SIMPLE : trier sur la valeur VISUELLE affichée dans la carte "Récap Mois"
 * = même resolver que l'UI : resolveRecapFinal(autoRecap, recapPersisted, recapExtras)
 * = la valeur "H. Complémentaires" (ou "H. Supplémentaires") affichée à l'écran.
 *
 * Resolver FINAL (identique à resolveMonthlyPayrollValues.js côté UI) :
 *   - recapPersisted.is_manual_override === true → utiliser ses valeurs d'heures
 *   - MonthlyExportOverride → utilisé pour compl_10/25/supp_25/50 si présent
 *   - sinon → calcul auto depuis les shifts (même logique que calculateMonthlyRecap)
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
 * Durée effective d'un shift en MINUTES, IDENTIQUE à calculateShiftDuration de l'UI :
 * - Si base_hours_override est défini → utiliser cette valeur (en heures → convertir en minutes)
 * - Sinon → calculer depuis start/end times
 * 
 * C'est ce que l'UI utilise pour calculer les HC affichées à l'écran.
 */
function shiftMinutes(shift) {
  if (!shift.start_time || !shift.end_time) return 0;
  // L'UI utilise base_hours_override si défini (calculateShiftDuration)
  if (shift.base_hours_override !== null && shift.base_hours_override !== undefined) {
    return Math.round(shift.base_hours_override * 60);
  }
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
 * Calcul AUTO live depuis les shifts (mode weekly — même logique que calculateMonthlyRecap).
 * Retourne les minutes finales de complémentaires et supplémentaires.
 */
function calcAutoMinutes(emp, empShifts, year, month, monthStart, monthEnd) {
  const contractHoursWeekly = parseContractHours(emp.contract_hours_weekly) || 0;
  const isPartTime = emp.work_time_type === 'part_time';
  const workDaysPerWeek = emp.work_days_per_week || 5;

  const weeklySchedule = emp.weekly_schedule || {};
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const workedDaysOfWeek = new Set();
  dayNames.forEach((name, idx) => { if (weeklySchedule[name]?.worked) workedDaysOfWeek.add(idx); });
  if (workedDaysOfWeek.size === 0) {
    for (let i = 0; i < workDaysPerWeek; i++) workedDaysOfWeek.add((i + 1) % 7);
  }

  const dailyHours = contractHoursWeekly / (workedDaysOfWeek.size || workDaysPerWeek);
  const weeks = getWeeksTouchingMonth(year, month);

  let totalBaseMin = 0, totalCompMin = 0, totalOt25Min = 0, totalOt50Min = 0;

  for (const mondayStr of weeks) {
    const allWeekDates = getFullWeekDates(mondayStr);
    const visibleDates = allWeekDates.filter(d => d >= monthStart && d <= monthEnd);
    if (visibleDates.length === 0) continue;

    let contractDays = 0;
    for (const d of visibleDates) {
      if (workedDaysOfWeek.has(new Date(d + 'T00:00:00').getDay())) contractDays++;
    }
    const weekBaseMin = Math.round(contractDays * dailyHours * 60);
    totalBaseMin += weekBaseMin;

    let weekWorkedMin = 0;
    for (const d of visibleDates) {
      const dayShifts = empShifts.filter(s =>
        s.date === d && s.status !== 'absent' && s.status !== 'leave' && s.status !== 'cancelled'
      );
      weekWorkedMin += dayShifts.reduce((sum, s) => sum + shiftMinutes(s), 0);
    }

    const diffMin = weekWorkedMin - weekBaseMin;
    if (diffMin <= 0) continue;

    if (isPartTime) {
      totalCompMin += diffMin;
    } else {
      totalOt25Min += Math.min(diffMin, 480);
      if (diffMin > 480) totalOt50Min += diffMin - 480;
    }
  }

  // Ventilation comp 10%/25% (temps partiel)
  let comp10Min = 0, comp25Min = 0;
  if (isPartTime) {
    const limit10 = Math.round(totalBaseMin * 0.10);
    comp10Min = Math.min(totalCompMin, limit10);
    comp25Min = Math.max(0, totalCompMin - limit10);
  }

  return {
    comp10: comp10Min / 60,
    comp25: comp25Min / 60,
    ot25: totalOt25Min / 60,
    ot50: totalOt50Min / 60,
    // Total minutes pour le tri
    compTotalMin: comp10Min + comp25Min,
    otTotalMin: totalOt25Min + totalOt50Min,
  };
}

/**
 * Resolver FINAL — SOURCE DE VÉRITÉ = valeurs affichées dans la carte Récap Mois.
 * 
 * Priorité pour les heures (identique à resolveRecapFinal dans l'UI) :
 *   1. MonthlyExportOverride (compl_10/25, supp_25/50)
 *   2. MonthlyRecapPersisted is_manual_override=true (saisie manuelle)
 *   3. MonthlyRecapPersisted is_manual_override=false (cache UI — valeurs calculées par l'UI)
 *   4. Calcul auto live (fallback si aucun record persisté)
 * 
 * IMPORTANT : on utilise MonthlyRecapPersisted même non-manuel car il contient
 * les valeurs exactes calculées par l'UI (incluant weeklyRecaps overrides, etc.)
 * que le backend ne peut pas reproduire parfaitement.
 * 
 * Retourne { scoreMinutes, src, comp10, comp25, ot25, ot50 }
 */
function resolveScore(empId, autoValues, allPersisted, allExtras, allExportOvr, hoursType) {
  const persisted = allPersisted.find(r => r.employee_id === empId) || null;
  const expOvr    = allExportOvr.find(r => r.employee_id === empId) || null;
  const isManual  = persisted?.is_manual_override === true;

  let scoreMinutes, compTotalMin, otTotalMin, src;

  // Priorité 1 : MonthlyExportOverride — surcharge explicite compta
  if (expOvr && (expOvr.compl_10 != null || expOvr.compl_25 != null || expOvr.supp_25 != null)) {
    const comp10 = expOvr.compl_10 ?? (persisted?.complementary_hours_10 ?? autoValues.comp10);
    const comp25 = expOvr.compl_25 ?? (persisted?.complementary_hours_25 ?? autoValues.comp25);
    const ot25   = expOvr.supp_25  ?? (persisted?.overtime_hours_25      ?? autoValues.ot25);
    const ot50   = expOvr.supp_50  ?? (persisted?.overtime_hours_50      ?? autoValues.ot50);
    compTotalMin = Math.round((comp10 + comp25) * 60);
    otTotalMin   = Math.round((ot25   + ot50)   * 60);
    src = 'exportOverride';
  }
  // Priorité 2 : MonthlyRecapPersisted is_manual_override=true (saisie manuelle)
  else if (isManual) {
    const comp10 = persisted.complementary_hours_10 ?? autoValues.comp10;
    const comp25 = persisted.complementary_hours_25 ?? autoValues.comp25;
    const ot25   = persisted.overtime_hours_25      ?? autoValues.ot25;
    const ot50   = persisted.overtime_hours_50      ?? autoValues.ot50;
    compTotalMin = Math.round((comp10 + comp25) * 60);
    otTotalMin   = Math.round((ot25   + ot50)   * 60);
    src = 'manualOverride';
  }
  // Priorité 3 : MonthlyRecapPersisted cache (écrit par l'UI — utilise complementary_hours_ui directement)
  // C'est la valeur EXACTE que la carte affiche à l'écran !
  else if (persisted && persisted.complementary_hours_ui != null) {
    compTotalMin = Math.round(persisted.complementary_hours_ui * 60);
    otTotalMin   = Math.round((persisted.overtime_hours_ui ?? 0) * 60);
    src = 'cachedUI';
  }
  // Priorité 4 : calcul auto live (fallback si aucun record persisté)
  else {
    compTotalMin = Math.round((autoValues.comp10 + autoValues.comp25) * 60);
    otTotalMin   = Math.round((autoValues.ot25   + autoValues.ot50)   * 60);
    src = 'auto';
  }

  if (hoursType === 'complementary') scoreMinutes = compTotalMin;
  else if (hoursType === 'overtime')  scoreMinutes = otTotalMin;
  else                                scoreMinutes = compTotalMin + otTotalMin;

  return { compTotalMin, otTotalMin, scoreMinutes, src };
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
  const todayStr  = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;
  const monthKey  = todayStr.substring(0, 7);
  const year      = today.getFullYear();
  const month     = today.getMonth(); // 0-indexed
  const monthStart = `${monthKey}-01`;
  const lastDay   = new Date(year, month + 1, 0).getDate();
  const monthEnd  = `${monthKey}-${pad(lastDay)}`;

  const planningMonths = await b.entities.PlanningMonth.filter({ month_key: monthKey });
  const resetVersion   = planningMonths[0]?.reset_version ?? 0;

  console.log(`📅 Génération ordre de départ — ${todayStr} (${monthKey} v${resetVersion})`);
  console.log(`⚙️  hoursType=${hoursType}, services=${services.join(',')}`);
  console.log(`ℹ️  Resolver : exportOverride > manualPersisted > auto (IDENTIQUE à l'UI)`);

  // Chargement parallèle
  const [
    allTodayNonShifts,
    allMonthShifts,
    allPersisted,
    allExtras,
    allExportOvr,
    allEmployees,
    allTeams
  ] = await Promise.all([
    b.entities.NonShiftEvent.filter({ date: todayStr }),
    b.entities.Shift.filter({ month_key: monthKey, reset_version: resetVersion }),
    b.entities.MonthlyRecapPersisted.filter({ month_key: monthKey }),
    b.entities.MonthlyRecapExtrasOverride.filter({ month_key: monthKey }),
    b.entities.MonthlyExportOverride.filter({ month_key: monthKey }),
    b.entities.Employee.filter({ is_active: true }),
    b.entities.Team.filter({ is_active: true })
  ]);

  const nonShiftEmpIds  = new Set(allTodayNonShifts.map(ns => ns.employee_id));
  const allTodayShifts  = allMonthShifts.filter(s => s.date === todayStr);

  console.log(`📋 Shifts mois: ${allMonthShifts.length} | Persisted (manual): ${allPersisted.filter(r => r.is_manual_override).length}/${allPersisted.length} | ExportOvr: ${allExportOvr.length}`);

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
      await b.entities.DepartureOrder.create({ date: todayStr, service, ordered_employees: [], message: '', generated_at: new Date().toISOString(), status: 'empty' });
      results.push({ service, status: 'empty' });
      continue;
    }

    const employeeIds = [...new Set(serviceShifts.map(s => s.employee_id))];
    console.log(`\n🏷️  Service: ${service} | ${employeeIds.length} employés présents`);

    const employeeData = employeeIds.map(empId => {
      const emp = allEmployees.find(e => e.id === empId);
      if (!emp) return null;

      // Calcul auto live depuis les shifts du mois
      const empShifts  = allMonthShifts.filter(s => s.employee_id === empId);
      const autoValues = calcAutoMinutes(emp, empShifts, year, month, monthStart, monthEnd);

      // Resolver FINAL (même règle que l'UI)
      const { comp10, comp25, ot25, ot50, compTotalMin, otTotalMin, scoreMinutes, src } =
        resolveScore(empId, autoValues, allPersisted, allExtras, allExportOvr, hoursType);

      console.log(`  ${emp.first_name} ${emp.last_name}: comp=${compTotalMin}min ot=${otTotalMin}min score=${scoreMinutes}min src=${src}`);

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