import { calculateShiftDuration } from '@/components/utils/monthlyRecapCalculations';
import { calculateDayHours } from '@/components/utils/nonShiftHoursCalculation';

/**
 * Calcule la répartition complète des heures de paie pour un employé
 * 
 * @param {Object} employee - Données employé
 * @param {Object} monthContext - { month_key, reset_version }
 * @param {Array} shifts - Shifts du mois (filtrés par version)
 * @param {Array} nonShiftEvents - NonShiftEvents du mois (filtrés par version)
 * @param {Array} nonShiftTypes - Définitions des types de non-shifts
 * @param {Array} cpPeriods - Périodes CP (filtrées par version)
 * @param {Array} holidayDates - Dates de jours fériés
 * 
 * @returns {Object} Breakdown complet pour export
 */
export function computePayrollBreakdown(
  employee,
  monthContext,
  shifts,
  nonShiftEvents,
  nonShiftTypes,
  cpPeriods,
  holidayDates
) {
  console.log(`\n📊 COMPUTING PAYROLL BREAKDOWN`);
  console.log(`   Employee: ${employee.first_name} ${employee.last_name}`);
  console.log(`   Month: ${monthContext.month_key}, Version: ${monthContext.reset_version}`);

  // Filter data for this employee
  const employeeShifts = shifts.filter(s => s.employee_id === employee.id);
  const employeeNonShifts = nonShiftEvents.filter(ns => ns.employee_id === employee.id);
  const employeeCPPeriods = cpPeriods.filter(cp => cp.employee_id === employee.id);

  console.log(`   Shifts: ${employeeShifts.length}, NonShifts: ${employeeNonShifts.length}, CP: ${employeeCPPeriods.length}`);

  // === BASE CALCULATION ===
  // Total work hours from shifts
  let totalShiftHours = 0;
  employeeShifts.forEach(shift => {
    const hours = calculateShiftDuration(shift);
    totalShiftHours += hours;
  });

  console.log(`   → Total shift hours: ${totalShiftHours.toFixed(2)}h`);

  // === NON-SHIFT HOURS (excluding CP) ===
  let nonShiftHoursForPayroll = 0;
  const nonShiftsVisible = {};

  employeeNonShifts.forEach(ns => {
    const nsType = nonShiftTypes.find(t => t.id === ns.non_shift_type_id);
    if (!nsType) return;

    // Only count non-shifts that generate hours (not CP)
    const code = nsType.code || nsType.name;
    const isCP = code === 'CP' || nsType.key === 'conges_payes';

    if (!isCP && nsType.hours_generated) {
      nonShiftHoursForPayroll += nsType.hours_generated;
    }

    // Track visible recap items
    if (nsType.visible_in_recap) {
      if (!nonShiftsVisible[code]) {
        nonShiftsVisible[code] = { code, dates: [], count: 0 };
      }
      nonShiftsVisible[code].dates.push(ns.date);
      nonShiftsVisible[code].count++;
    }
  });

  console.log(`   → Non-shift hours (payable): ${nonShiftHoursForPayroll.toFixed(2)}h`);

  // === CP DAYS COUNT ===
  let cpDaysCount = 0;
  let cpHoursCount = 0;

  employeeCPPeriods.forEach(cp => {
    const manualDays = cp.cp_days_manual || cp.cp_days_auto || 0;
    cpDaysCount += manualDays;
    // Assume 8h per CP day for salary
    cpHoursCount += manualDays * 8;
  });

  console.log(`   → CP days: ${cpDaysCount}, CP hours: ${cpHoursCount.toFixed(2)}h`);

  // === TOTAL WORKED HOURS ===
  const totalWorkedHours = totalShiftHours + nonShiftHoursForPayroll;

  // === CONTRACT HOURS ===
  const contractHoursWeekly = employee.contract_hours_weekly || 35;
  const workDaysPerWeek = employee.work_days_per_week || 5;

  // Approximate monthly contract (very rough)
  // For more precision, use the monthly recap calculation
  const contractHoursMonthly = contractHoursWeekly * (21 / 5); // ~4.2 weeks in a month

  console.log(`   → Contract: ${contractHoursWeekly}h/week, ~${contractHoursMonthly.toFixed(1)}h/month`);

  // === PAYMENT BREAKDOWN ===
  let basePaidHours = totalWorkedHours;
  let supp25Hours = 0;
  let supp50Hours = 0;
  let compl10Hours = 0;
  let compl25Hours = 0;

  // Simple rule: overtime if worked > contract monthly
  // More sophisticated rules should use calculateMonthlyRecap
  const excess = Math.max(0, totalWorkedHours - contractHoursMonthly);

  if (employee.work_time_type === 'part_time') {
    // Part-time: complementary hours
    const limit10 = contractHoursMonthly * 0.1;
    compl10Hours = Math.min(excess, limit10);
    compl25Hours = Math.max(0, excess - limit10);
    
    basePaidHours = contractHoursMonthly;
  } else {
    // Full-time: overtime hours
    supp25Hours = Math.min(excess, 8);
    supp50Hours = Math.max(0, excess - 8);
    
    basePaidHours = contractHoursMonthly;
  }

  // === HOLIDAY HOURS ===
  let holidayHours = 0;
  let holidayDaysCount = 0;

  employeeShifts.forEach(shift => {
    if (holidayDates.includes(shift.date)) {
      holidayHours += calculateShiftDuration(shift);
      holidayDaysCount++;
    }
  });

  console.log(`   → Holiday: ${holidayDaysCount} days, ${holidayHours.toFixed(2)}h`);

  // === FINAL SUMMARY ===
  const summary = {
    basePaidHours: basePaidHours,
    supp25Hours: supp25Hours,
    supp50Hours: supp50Hours,
    compl10Hours: compl10Hours,
    compl25Hours: compl25Hours,
    holidayHours: holidayHours,
    cpDays: cpDaysCount,
    cpHours: cpHoursCount,
    nonShiftsVisible: nonShiftsVisible,
    totalPaid: basePaidHours + supp25Hours + supp50Hours + compl10Hours + compl25Hours + cpHoursCount + holidayHours
  };

  console.log(`   → FINAL: Base=${summary.basePaidHours.toFixed(1)}h, S25=${summary.supp25Hours.toFixed(1)}h, S50=${summary.supp50Hours.toFixed(1)}h, C10=${summary.compl10Hours.toFixed(1)}h, C25=${summary.compl25Hours.toFixed(1)}h, Holiday=${summary.holidayHours.toFixed(1)}h, CP=${summary.cpHours.toFixed(1)}h`);
  console.log(`   → TOTAL PAID: ${summary.totalPaid.toFixed(1)}h`);

  return summary;
}