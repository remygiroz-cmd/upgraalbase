import { base44 } from '@/api/base44Client';
import { calculateMonthlyRecap } from '@/components/utils/monthlyRecapCalculations';

/**
 * Recalcule et persiste les recaps (monthly) pour un employé sur un mois donné
 * 
 * @param {string} employeeId - ID de l'employé
 * @param {Object} employee - Objet employé complet
 * @param {string} monthKey - Clé du mois (YYYY-MM)
 * @param {number} activeResetVersion - Version active du mois
 * @param {number} year - Année (ex: 2026)
 * @param {number} monthIndex - Index du mois (0-11)
 * @param {Array} shifts - Tous les shifts du mois (déjà filtrés par version)
 * @param {Array} nonShiftEvents - Tous les non-shifts du mois (déjà filtrés par version)
 * @param {Array} nonShiftTypes - Types de non-shifts
 * @param {Array} holidayDates - Dates de jours fériés
 * @param {string} calculationMode - Mode de calcul ('disabled', 'weekly', 'monthly')
 */
export async function recomputeAndPersistRecapForEmployee({
  employeeId,
  employee,
  monthKey,
  activeResetVersion,
  year,
  monthIndex,
  shifts,
  nonShiftEvents,
  nonShiftTypes,
  holidayDates,
  calculationMode
}) {
  console.log(`📊 Recalculating recap for employee ${employee.first_name} ${employee.last_name}...`);
  
  // Filter data for this employee
  const employeeShifts = shifts.filter(s => s.employee_id === employeeId);
  const employeeNonShifts = nonShiftEvents.filter(e => e.employee_id === employeeId);

  console.log(`  - Shifts: ${employeeShifts.length}`);
  console.log(`  - Non-shifts: ${employeeNonShifts.length}`);

  // Calculate full recap
  const calculatedRecap = calculateMonthlyRecap(
    calculationMode,
    employee,
    employeeShifts,
    employeeNonShifts,
    nonShiftTypes,
    holidayDates,
    year,
    monthIndex
  );

  // Check if recap already exists
  const existingRecaps = await base44.entities.MonthlyRecap.filter({
    employee_id: employeeId,
    month_key: monthKey,
    reset_version: activeResetVersion
  });

  const recapData = {
    employee_id: employeeId,
    employee_name: `${employee.first_name} ${employee.last_name}`,
    month_key: monthKey,
    reset_version: activeResetVersion,
    // Store calculated values as reference (not manual overrides)
    shifts_count: employeeShifts.length,
    days_worked: calculatedRecap.workedDays || 0,
    worked_hours: calculatedRecap.workedHours || 0,
    contract_hours: calculatedRecap.contractMonthlyHours || 0,
    // Standard field names used by generateDailyDepartureOrder
    overtimeHours25: calculatedRecap.overtimeHours25 || 0,
    overtimeHours50: calculatedRecap.overtimeHours50 || 0,
    complementaryHours10: calculatedRecap.complementaryHours10 || 0,
    complementaryHours25: calculatedRecap.complementaryHours25 || 0,
    holiday_days_count: calculatedRecap.holidaysWorkedDays || 0,
    holiday_hours_worked: calculatedRecap.holidaysWorkedHours || 0,
    holiday_eligible: calculatedRecap.eligibleForHolidayPay || false,
    non_shifts_by_type: calculatedRecap.nonShiftsByType || {},
    cp_days_total: calculatedRecap.cpDays || 0
  };

  let savedRecap;
  if (existingRecaps.length > 0) {
    // Update existing recap
    savedRecap = await base44.entities.MonthlyRecap.update(existingRecaps[0].id, recapData);
    console.log(`  ✓ Recap updated (ID: ${existingRecaps[0].id})`);
  } else {
    // Create new recap
    savedRecap = await base44.entities.MonthlyRecap.create(recapData);
    console.log(`  ✓ Recap created (ID: ${savedRecap.id})`);
  }

  // CRITICAL DEBUG LOG - Verify persisted data
  console.log('  📋 RECAP PERSISTED:');
  console.log(`     Entity: MonthlyRecap`);
  console.log(`     ID: ${savedRecap.id}`);
  console.log(`     employee_id: ${savedRecap.employee_id}`);
  console.log(`     month_key: "${savedRecap.month_key}" (type: ${typeof savedRecap.month_key})`);
  console.log(`     reset_version: ${savedRecap.reset_version} (type: ${typeof savedRecap.reset_version})`);
  console.log(`     worked_hours: ${savedRecap.worked_hours}`);
  console.log(`     shifts_count: ${savedRecap.shifts_count}`);

  return savedRecap;
}

/**
 * Recalcule et persiste les recaps pour plusieurs employés en parallèle
 * 
 * @param {Array<string>} employeeIds - Liste des IDs d'employés
 * @param {Object} context - Contexte avec toutes les données nécessaires
 * @returns {Object} Résultats de l'opération
 */
export async function recomputeAndPersistRecapsForEmployees(employeeIds, context) {
  const {
    monthKey,
    activeResetVersion,
    year,
    monthIndex,
    shifts,
    nonShiftEvents,
    nonShiftTypes,
    holidayDates,
    calculationMode,
    employees
  } = context;

  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 BATCH RECAP RECALCULATION');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Month: ${monthKey}`);
  console.log(`Reset version: ${activeResetVersion}`);
  console.log(`Calculation mode: ${calculationMode}`);
  console.log(`Employees to process: ${employeeIds.length}`);
  console.log(`Total shifts: ${shifts.length}`);
  console.log(`Total non-shifts: ${nonShiftEvents.length}`);
  console.log('───────────────────────────────────────────────────────────');

  const results = await Promise.allSettled(
    employeeIds.map(async (employeeId) => {
      const employee = employees.find(e => e.id === employeeId);
      if (!employee) {
        throw new Error(`Employee ${employeeId} not found`);
      }

      return await recomputeAndPersistRecapForEmployee({
        employeeId,
        employee,
        monthKey,
        activeResetVersion,
        year,
        monthIndex,
        shifts,
        nonShiftEvents,
        nonShiftTypes,
        holidayDates,
        calculationMode
      });
    })
  );

  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected');

  console.log('───────────────────────────────────────────────────────────');
  console.log(`✓ Succeeded: ${succeeded} / ${employeeIds.length}`);
  if (failed.length > 0) {
    console.error(`✗ Failed: ${failed.length}`);
    failed.forEach((f, idx) => {
      console.error(`  Failure ${idx + 1}:`, f.reason);
    });
  }
  
  // CRITICAL DEBUG LOG - Show sample persisted recaps
  const succeededRecaps = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value)
    .slice(0, 3);
  
  if (succeededRecaps.length > 0) {
    console.log('\n📊 SAMPLE PERSISTED RECAPS (first 3):');
    succeededRecaps.forEach((recap, idx) => {
      console.log(`  Recap ${idx + 1}:`);
      console.log(`    - ID: ${recap.id}`);
      console.log(`    - employee_id: ${recap.employee_id}`);
      console.log(`    - month_key: "${recap.month_key}"`);
      console.log(`    - reset_version: ${recap.reset_version}`);
      console.log(`    - worked_hours: ${recap.worked_hours}`);
      console.log(`    - shifts_count: ${recap.shifts_count}`);
    });
  }
  
  console.log('═══════════════════════════════════════════════════════════');

  return {
    total: employeeIds.length,
    succeeded,
    failed: failed.length,
    errors: failed.map(f => f.reason?.message || String(f.reason)),
    persistedRecaps: succeededRecaps
  };
}