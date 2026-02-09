/**
 * Monthly Recap Calculation Engine
 *
 * Supports 3 calculation modes:
 * - Mode 1 (disabled): No calculations, all values null
 * - Mode 2 (weekly): Weekly overtime calculation, then sum for month
 * - Mode 3 (monthly): Monthly smoothing for part-time complementary hours
 *
 * IMPORTANT: All calculated values can be manually overridden
 */

// Types
export type CalculationMode = 'disabled' | 'weekly' | 'monthly';
export type WorkTimeType = 'full_time' | 'part_time';

export interface Shift {
  id: string;
  employee_id: string;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  break_minutes?: number;
  status?: string;
}

export interface NonShiftEvent {
  id: string;
  employee_id: string;
  date: string;
  nonshift_type_id: string;
}

export interface NonShiftType {
  id: string;
  key: string;
  label: string;
  code: string;
  impacts_payroll: boolean;
  generates_work_hours: boolean;
  counts_as_work_time?: boolean;
  is_active: boolean;
}

export interface WeeklySchedule {
  monday?: { worked: boolean; hours: number };
  tuesday?: { worked: boolean; hours: number };
  wednesday?: { worked: boolean; hours: number };
  thursday?: { worked: boolean; hours: number };
  friday?: { worked: boolean; hours: number };
  saturday?: { worked: boolean; hours: number };
  sunday?: { worked: boolean; hours: number };
}

export interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  contract_type: string;
  contract_hours_weekly?: string; // "35:00" or "35"
  contract_hours?: string; // Monthly
  work_time_type?: WorkTimeType;
  work_days_per_week?: number;
  weekly_schedule?: WeeklySchedule;
  start_date?: string;
}

export interface MonthlyRecapResult {
  // Mode info
  calculationMode: CalculationMode;

  // 1. Days
  expectedDays: number | null; // Jours prévus
  workedDays: number | null; // Jours travaillés
  extraDays: number | null; // Jours supplémentaires (if worked > expected)

  // 2. Hours
  contractMonthlyHours: number | null; // Base contractuelle mensuelle
  adjustedContractHours: number | null; // Base ajustée (- absences)
  workedHours: number | null; // Heures travaillées

  // 3. Overtime (full-time) / Complementary (part-time)
  isPartTime: boolean;

  // For full-time: Heures supplémentaires
  overtimeHours25: number | null; // 36-43h/week
  overtimeHours50: number | null; // >43h/week
  totalOvertimeHours: number | null;

  // For part-time: Heures complémentaires
  complementaryHours10: number | null; // Up to 10% of contract
  complementaryHours25: number | null; // Beyond 10%
  totalComplementaryHours: number | null;

  // 4. Non-shifts by type
  nonShiftsByType: { [typeKey: string]: { count: number; label: string; code: string } };

  // 5. Holidays worked
  holidaysWorkedDays: number | null;
  holidaysWorkedHours: number | null;
  eligibleForHolidayPay: boolean; // Ancienneté > 8 mois

  // 6. CP (Paid Leave)
  cpDays: number | null;

  // 7. Weekly breakdown (for debugging/display)
  weeklyBreakdown: WeeklyBreakdown[];
}

export interface WeeklyBreakdown {
  weekStart: string;
  weekEnd: string;
  contractHours: number;
  workedHours: number;
  delta: number; // worked - contract
  overtimeHours25?: number;
  overtimeHours50?: number;
  complementaryHours?: number;
}

// Constants
const DAYS_MAP: { [key: string]: number } = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const DAYS_FR: string[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Helper functions
export function parseHoursString(hoursStr: string | undefined | null): number {
  if (!hoursStr) return 0;
  const str = String(hoursStr).trim();

  if (str.includes(':')) {
    const [h, m] = str.split(':').map(Number);
    return h + (m || 0) / 60;
  }

  return parseFloat(str) || 0;
}

export function calculateShiftDuration(shift: Shift): number {
  const [startH, startM] = shift.start_time.split(':').map(Number);
  const [endH, endM] = shift.end_time.split(':').map(Number);

  let totalMinutes = (endH * 60 + endM) - (startH * 60 + startM);
  if (totalMinutes < 0) totalMinutes += 24 * 60; // Overnight shift

  totalMinutes -= (shift.break_minutes || 0);
  return Math.max(0, totalMinutes / 60);
}

function getWeekStartDate(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as first day
  return new Date(d.setDate(diff));
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getExpectedWorkDays(employee: Employee): string[] {
  const schedule = employee.weekly_schedule;
  if (!schedule) {
    // Default: Monday to Friday based on work_days_per_week
    const days = employee.work_days_per_week || 5;
    return DAYS_FR.slice(1, 1 + days); // monday, tuesday, etc.
  }

  const workedDays: string[] = [];
  for (const [day, info] of Object.entries(schedule)) {
    if (info?.worked) {
      workedDays.push(day);
    }
  }
  return workedDays;
}

function countDayOccurrencesInMonth(year: number, month: number, dayNames: string[]): number {
  const daysOfWeek = dayNames.map(d => DAYS_MAP[d.toLowerCase()]);
  let count = 0;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    if (daysOfWeek.includes(date.getDay())) {
      count++;
    }
  }

  return count;
}

function getWeeksInMonth(year: number, month: number): { start: Date; end: Date }[] {
  const weeks: { start: Date; end: Date }[] = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  let currentWeekStart = getWeekStartDate(firstDay);

  while (currentWeekStart <= lastDay) {
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    weeks.push({
      start: new Date(currentWeekStart),
      end: weekEnd,
    });

    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
  }

  return weeks;
}

function isEmployeeEligibleForHolidayPay(employee: Employee, currentDate: Date): boolean {
  if (!employee.start_date) return false;

  const startDate = new Date(employee.start_date);
  const monthsDiff = (currentDate.getFullYear() - startDate.getFullYear()) * 12 +
    (currentDate.getMonth() - startDate.getMonth());

  return monthsDiff >= 8;
}

// Main calculation function
export function calculateMonthlyRecap(
  mode: CalculationMode,
  employee: Employee,
  shifts: Shift[],
  nonShiftEvents: NonShiftEvent[],
  nonShiftTypes: NonShiftType[],
  holidayDates: string[], // Array of YYYY-MM-DD strings for manually marked holidays
  year: number,
  month: number // 0-indexed
): MonthlyRecapResult {
  // Initialize result
  const result: MonthlyRecapResult = {
    calculationMode: mode,
    expectedDays: null,
    workedDays: null,
    extraDays: null,
    contractMonthlyHours: null,
    adjustedContractHours: null,
    workedHours: null,
    isPartTime: employee.work_time_type === 'part_time',
    overtimeHours25: null,
    overtimeHours50: null,
    totalOvertimeHours: null,
    complementaryHours10: null,
    complementaryHours25: null,
    totalComplementaryHours: null,
    nonShiftsByType: {},
    holidaysWorkedDays: null,
    holidaysWorkedHours: null,
    eligibleForHolidayPay: false,
    cpDays: null,
    weeklyBreakdown: [],
  };

  // Mode 1: Disabled - return empty result
  if (mode === 'disabled') {
    return result;
  }

  // Filter data for this employee and month
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const monthStartStr = formatDate(monthStart);
  const monthEndStr = formatDate(monthEnd);

  const employeeShifts = shifts.filter(s =>
    s.employee_id === employee.id &&
    s.date >= monthStartStr &&
    s.date <= monthEndStr &&
    s.status !== 'cancelled'
  );

  const employeeNonShifts = nonShiftEvents.filter(ns =>
    ns.employee_id === employee.id &&
    ns.date >= monthStartStr &&
    ns.date <= monthEndStr
  );

  // Create type lookup
  const typeById: { [id: string]: NonShiftType } = {};
  nonShiftTypes.forEach(t => { typeById[t.id] = t; });

  // ============================================
  // 1. EXPECTED DAYS (from contract)
  // ============================================
  const expectedWorkDays = getExpectedWorkDays(employee);
  result.expectedDays = countDayOccurrencesInMonth(year, month, expectedWorkDays);

  // ============================================
  // 2. WORKED DAYS (unique dates with shifts)
  // ============================================
  const uniqueWorkDates = new Set(employeeShifts.map(s => s.date));
  result.workedDays = uniqueWorkDates.size;

  // ============================================
  // 3. EXTRA DAYS
  // ============================================
  if (result.expectedDays !== null && result.workedDays !== null) {
    const diff = result.workedDays - result.expectedDays;
    result.extraDays = diff > 0 ? diff : null;
  }

  // ============================================
  // 4. CONTRACT HOURS
  // ============================================
  const weeklyContractHours = parseHoursString(employee.contract_hours_weekly);
  const workDaysPerWeek = employee.work_days_per_week || expectedWorkDays.length || 5;
  const hoursPerDay = workDaysPerWeek > 0 ? weeklyContractHours / workDaysPerWeek : 0;

  result.contractMonthlyHours = weeklyContractHours * 4.33;

  // ============================================
  // 5. ADJUSTED CONTRACT HOURS (minus absences)
  // ============================================
  let absenceDeduction = 0;
  employeeNonShifts.forEach(ns => {
    const type = typeById[ns.nonshift_type_id];
    if (type?.impacts_payroll && !type.generates_work_hours) {
      // Deduct one day's worth of hours
      absenceDeduction += hoursPerDay;
    }
  });

  result.adjustedContractHours = result.contractMonthlyHours - absenceDeduction;

  // ============================================
  // 6. WORKED HOURS
  // ============================================
  result.workedHours = employeeShifts.reduce((sum, shift) => {
    return sum + calculateShiftDuration(shift);
  }, 0);

  // ============================================
  // 7. NON-SHIFTS BY TYPE
  // ============================================
  employeeNonShifts.forEach(ns => {
    const type = typeById[ns.nonshift_type_id];
    if (type) {
      if (!result.nonShiftsByType[type.key]) {
        result.nonShiftsByType[type.key] = {
          count: 0,
          label: type.label,
          code: type.code,
        };
      }
      result.nonShiftsByType[type.key].count++;
    }
  });

  // ============================================
  // 8. CP DAYS
  // ============================================
  result.cpDays = employeeNonShifts.filter(ns => {
    const type = typeById[ns.nonshift_type_id];
    return type?.key === 'conges_payes';
  }).length;

  // ============================================
  // 9. HOLIDAYS WORKED
  // ============================================
  const holidaySet = new Set(holidayDates);
  const holidayShifts = employeeShifts.filter(s => holidaySet.has(s.date));
  const uniqueHolidayDates = new Set(holidayShifts.map(s => s.date));

  result.holidaysWorkedDays = uniqueHolidayDates.size;
  result.holidaysWorkedHours = holidayShifts.reduce((sum, s) => sum + calculateShiftDuration(s), 0);
  result.eligibleForHolidayPay = isEmployeeEligibleForHolidayPay(employee, monthEnd);

  // ============================================
  // 10. OVERTIME / COMPLEMENTARY HOURS
  // ============================================
  const weeks = getWeeksInMonth(year, month);
  const isPartTime = employee.work_time_type === 'part_time';

  let totalOvertime25 = 0;
  let totalOvertime50 = 0;
  let weeklyDeltas: number[] = []; // For monthly smoothing

  weeks.forEach(week => {
    const weekStartStr = formatDate(week.start);
    const weekEndStr = formatDate(week.end);

    // Get shifts for this week (that are within the month)
    const weekShifts = employeeShifts.filter(s => {
      const shiftDate = s.date;
      return shiftDate >= weekStartStr &&
        shiftDate <= weekEndStr &&
        shiftDate >= monthStartStr &&
        shiftDate <= monthEndStr;
    });

    // Count days in this week that are within the month
    let daysInWeekWithinMonth = 0;
    for (let d = new Date(week.start); d <= week.end; d.setDate(d.getDate() + 1)) {
      if (d >= monthStart && d <= monthEnd) {
        daysInWeekWithinMonth++;
      }
    }

    // Prorate contract hours for partial weeks
    const weekContractHours = (daysInWeekWithinMonth / 7) * weeklyContractHours;
    const weekWorkedHours = weekShifts.reduce((sum, s) => sum + calculateShiftDuration(s), 0);
    const delta = weekWorkedHours - weekContractHours;

    const weekBreakdown: WeeklyBreakdown = {
      weekStart: weekStartStr,
      weekEnd: weekEndStr,
      contractHours: weekContractHours,
      workedHours: weekWorkedHours,
      delta,
    };

    if (isPartTime) {
      // Part-time: store delta for later processing
      weeklyDeltas.push(delta);
      weekBreakdown.complementaryHours = delta > 0 ? delta : 0;
    } else {
      // Full-time: calculate overtime per week (36-43h = 25%, >43h = 50%)
      if (delta > 0) {
        // Use actual worked hours for full-time overtime thresholds
        if (weekWorkedHours > 43) {
          weekBreakdown.overtimeHours50 = weekWorkedHours - 43;
          weekBreakdown.overtimeHours25 = Math.min(delta - weekBreakdown.overtimeHours50, 7); // 36-43
          totalOvertime50 += weekBreakdown.overtimeHours50;
          totalOvertime25 += weekBreakdown.overtimeHours25;
        } else if (weekWorkedHours > 36) {
          weekBreakdown.overtimeHours25 = weekWorkedHours - 36;
          totalOvertime25 += weekBreakdown.overtimeHours25;
        }
      }
      // Negative weeks are ignored for full-time
    }

    result.weeklyBreakdown.push(weekBreakdown);
  });

  if (isPartTime) {
    if (mode === 'weekly') {
      // Mode 2: Weekly calculation - only sum positive deltas
      const positiveDeltas = weeklyDeltas.filter(d => d > 0);
      const totalComplementary = positiveDeltas.reduce((sum, d) => sum + d, 0);

      // Apply rates: 10% of contract at 10%, rest at 25%
      const limit10Percent = weeklyContractHours * 4.33 * 0.1;
      result.complementaryHours10 = Math.min(totalComplementary, limit10Percent);
      result.complementaryHours25 = Math.max(0, totalComplementary - limit10Percent);
      result.totalComplementaryHours = totalComplementary;
    } else {
      // Mode 3: Monthly smoothing - sum ALL deltas (positive and negative)
      const totalDelta = weeklyDeltas.reduce((sum, d) => sum + d, 0);

      if (totalDelta > 0) {
        const limit10Percent = weeklyContractHours * 4.33 * 0.1;
        result.complementaryHours10 = Math.min(totalDelta, limit10Percent);
        result.complementaryHours25 = Math.max(0, totalDelta - limit10Percent);
        result.totalComplementaryHours = totalDelta;
      } else {
        result.complementaryHours10 = 0;
        result.complementaryHours25 = 0;
        result.totalComplementaryHours = 0;
      }
    }
  } else {
    // Full-time
    result.overtimeHours25 = totalOvertime25;
    result.overtimeHours50 = totalOvertime50;
    result.totalOvertimeHours = totalOvertime25 + totalOvertime50;
  }

  return result;
}

// Apply manual overrides to calculated result
export interface ManualOverrides {
  expectedDays?: number | null;
  workedDays?: number | null;
  extraDays?: number | null;
  contractMonthlyHours?: number | null;
  adjustedContractHours?: number | null;
  workedHours?: number | null;
  overtimeHours25?: number | null;
  overtimeHours50?: number | null;
  totalOvertimeHours?: number | null;
  complementaryHours10?: number | null;
  complementaryHours25?: number | null;
  totalComplementaryHours?: number | null;
  holidaysWorkedDays?: number | null;
  holidaysWorkedHours?: number | null;
  cpDays?: number | null;
}

export function applyManualOverrides(
  calculated: MonthlyRecapResult,
  overrides: ManualOverrides
): MonthlyRecapResult & { overriddenFields: string[] } {
  const result = { ...calculated };
  const overriddenFields: string[] = [];

  const fields = [
    'expectedDays', 'workedDays', 'extraDays',
    'contractMonthlyHours', 'adjustedContractHours', 'workedHours',
    'overtimeHours25', 'overtimeHours50', 'totalOvertimeHours',
    'complementaryHours10', 'complementaryHours25', 'totalComplementaryHours',
    'holidaysWorkedDays', 'holidaysWorkedHours', 'cpDays',
  ] as const;

  fields.forEach(field => {
    if (overrides[field] !== undefined && overrides[field] !== null) {
      (result as any)[field] = overrides[field];
      overriddenFields.push(field);
    }
  });

  return { ...result, overriddenFields };
}
