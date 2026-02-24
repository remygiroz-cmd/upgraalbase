import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * refreshMonthlyRecapPersistedForMonth
 * 
 * Rafraîchit MonthlyRecapPersisted pour tous les employés actifs du mois.
 * Appelé quotidiennement via cron (03:00) et manuellement si besoin.
 * 
 * Payload: { month_key: "2026-02" } (optionnel — par défaut mois courant)
 */
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  let body = {};
  try { body = await req.json(); } catch { /* no body */ }

  const b = base44.asServiceRole;

  // Déterminer le month_key
  let month_key = body.month_key;
  if (!month_key) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    month_key = `${year}-${month}`;
  }

  const [year, month] = month_key.split('-').map(Number);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);

  // Fetch active employees
  const employees = await b.entities.Employee.filter({ is_active: true });
  if (employees.length === 0) {
    return Response.json({ success: true, processed: 0, errors: 0 });
  }

  // Fetch all shifts for this month
  const shifts = await b.entities.Shift.filter({ month_key });
  const nonShiftEvents = await b.entities.NonShiftEvent.filter({ month_key });
  const nonShiftTypes = await b.entities.NonShiftType.list();
  const cpPeriods = await b.entities.PaidLeavePeriod.filter({});
  const holidays = await b.entities.Holiday.filter({});
  const weeklyRecaps = await b.entities.WeeklyRecap.filter({ month_key });
  const exportOverrides = await b.entities.ExportComptaOverride.filter({ month_key });

  // Settings
  const settings = await b.entities.AppSettings.filter({ setting_key: 'planning_calculation_mode' });
  const calculationMode = settings[0]?.planning_calculation_mode || 'disabled';

  let processed = 0;
  let errors = 0;

  // Process each employee
  for (const employee of employees) {
    try {
      const employeeShifts = shifts.filter(s => s.employee_id === employee.id);
      const employeeNonShifts = nonShiftEvents.filter(ns => ns.employee_id === employee.id);
      const employeeWeeklyRecaps = weeklyRecaps.filter(wr => wr.employee_id === employee.id);

      // Import calculation engine
      const { calculateMonthlyRecap } = await import('file:///components/utils/monthlyRecapCalculations');
      const { getFinalRecap } = await import('file:///components/planning/recapWithOverrides');

      const holidayDateStrings = holidays.map(h => h.date);

      // Calculate auto recap
      const calculatedRecap = calculateMonthlyRecap(
        calculationMode,
        employee,
        employeeShifts,
        employeeNonShifts,
        nonShiftTypes,
        holidayDateStrings,
        year,
        month - 1,
        employeeWeeklyRecaps
      );

      // Apply export overrides
      const finalRecap = getFinalRecap(month_key, employee.id, calculatedRecap, exportOverrides);

      // Prepare persisted data
      const recapData = {
        month_key,
        employee_id: employee.id,
        reset_version: (await b.entities.PlanningMonth.filter({ month_key }))[0]?.reset_version || 0,
        complementary_hours_ui: Math.round(((finalRecap.complementaryHours10 || 0) + (finalRecap.complementaryHours25 || 0)) * 100) / 100,
        overtime_hours_ui: Math.round(((finalRecap.overtimeHours25 || 0) + (finalRecap.overtimeHours50 || 0)) * 100) / 100,
        complementary_hours_10: finalRecap.complementaryHours10 || 0,
        complementary_hours_25: finalRecap.complementaryHours25 || 0,
        overtime_hours_25: finalRecap.overtimeHours25 || 0,
        overtime_hours_50: finalRecap.overtimeHours50 || 0,
        worked_hours: finalRecap.workedHours || 0,
        updated_at: new Date().toISOString()
      };

      // Upsert
      const existing = await b.entities.MonthlyRecapPersisted.filter({ month_key, employee_id: employee.id });
      if (existing.length > 0) {
        await b.entities.MonthlyRecapPersisted.update(existing[0].id, recapData);
      } else {
        await b.entities.MonthlyRecapPersisted.create(recapData);
      }

      processed++;
    } catch (error) {
      console.error(`[ERROR] Employee ${employee.first_name} ${employee.last_name}:`, error.message);
      errors++;
    }
  }

  return Response.json({ success: true, month_key, processed, errors });
});