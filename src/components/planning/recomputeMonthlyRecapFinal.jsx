/**
 * recomputeMonthlyRecapFinal
 *
 * Recalcule le recap mensuel final pour un (ou plusieurs) employés
 * après une mutation shift, SANS dépendre d'un rendu UI.
 *
 * Utilise exactement les mêmes règles que MonthlySummary :
 *   resolveRecapFinal(autoRecap, recapPersisted, recapExtras)
 * puis upsert dans MonthlyRecapFinal.
 */

import { base44 } from '@/api/base44Client';
import { calculateMonthlyRecap } from '@/components/utils/monthlyRecapCalculations';
import { resolveRecapFinal } from './resolveMonthlyPayrollValues';
import { upsertMonthlyRecapFinal } from './monthlyRecapFinalService';

/**
 * @param {string}   monthKey     - "YYYY-MM"
 * @param {string[]} employeeIds  - IDs des employés à recalculer
 * @param {number}   resetVersion - version active du mois
 * @param {string}   calculationMode - 'disabled' | 'weekly' | 'monthly'
 */
export async function recomputeAndUpsertForEmployees(monthKey, employeeIds, resetVersion, calculationMode) {
  if (!employeeIds || employeeIds.length === 0) return;

  const [year, monthNum] = monthKey.split('-').map(Number);
  const month = monthNum - 1; // 0-indexed pour calculateMonthlyRecap

  const monthStart = `${monthKey}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const monthEnd = `${monthKey}-${String(lastDay).padStart(2, '0')}`;

  // Chargement parallèle de tout ce qui est nécessaire
  const [
    allEmployees,
    allShifts,
    allNonShifts,
    allWeeklyRecaps,
    allHolidays,
    allNonShiftTypes,
    allPersisted,
    allExtras,
  ] = await Promise.all([
    base44.entities.Employee.filter({ is_active: true }),
    base44.entities.Shift.filter({ month_key: monthKey, reset_version: resetVersion }),
    base44.entities.NonShiftEvent.list().then(events =>
      events.filter(e => e.date >= monthStart && e.date <= monthEnd)
    ),
    base44.entities.WeeklyRecap.list().then(recaps => {
      // Inclure les semaines qui touchent le mois (jusqu'à 7 jours avant)
      const rangeStart = new Date(year, month, 1);
      rangeStart.setDate(rangeStart.getDate() - 7);
      const rangeStartStr = `${rangeStart.getFullYear()}-${String(rangeStart.getMonth()+1).padStart(2,'0')}-${String(rangeStart.getDate()).padStart(2,'0')}`;
      return recaps.filter(r => r.week_start >= rangeStartStr && r.week_start <= monthEnd &&
        (r.reset_version === resetVersion || r.reset_version == null));
    }),
    base44.entities.HolidayDate.list().then(h =>
      h.filter(d => d.date >= monthStart && d.date <= monthEnd).map(d => d.date)
    ),
    base44.entities.NonShiftType.filter({ is_active: true }),
    base44.entities.MonthlyRecapPersisted.filter({ month_key: monthKey }),
    base44.entities.MonthlyRecapExtrasOverride.filter({ month_key: monthKey }),
  ]);

  // Recalcul pour chaque employé concerné
  await Promise.all(employeeIds.map(async (empId) => {
    const employee = allEmployees.find(e => e.id === empId);
    if (!employee) return;

    const empShifts = allShifts.filter(s => s.employee_id === empId);
    const empNonShifts = allNonShifts.filter(ns => ns.employee_id === empId);
    const empWeeklyRecaps = allWeeklyRecaps.filter(wr => wr.employee_id === empId);
    const recapPersisted = allPersisted.find(r => r.employee_id === empId) || null;
    const recapExtras = allExtras.find(r => r.employee_id === empId) || null;

    // Même calcul que MonthlySummary
    const autoRecap = calculateMonthlyRecap(
      calculationMode,
      employee,
      empShifts,
      empNonShifts,
      allNonShiftTypes,
      allHolidays,
      year,
      month,
      empWeeklyRecaps
    );

    // Même resolver que MonthlySummary
    const recapResolved = resolveRecapFinal(autoRecap, recapPersisted, recapExtras);

    // Upsert dans MonthlyRecapFinal
    await upsertMonthlyRecapFinal(monthKey, empId, recapResolved);
  }));
}