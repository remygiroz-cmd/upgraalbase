import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Send, Download, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { calculateMonthlyRecap, applyManualOverrides } from '@/components/utils/monthlyRecapCalculations';
import { getActiveMonthContext } from './monthContext';
import { computePayrollBreakdown } from '@/components/utils/payrollBreakdown';

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateFR(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Construit une ligne d'export pour un employé à partir de son récap mensuel
 * IMPORTANT: Le récap mensuel doit être pré-calculé avec toutes les valeurs
 */
function buildExportRow(employee, calculatedRecap, nonShiftTypes, cpPeriods, team, monthStart, monthEnd) {
  const monthStartStr = formatDate(monthStart);
  const monthEndStr = formatDate(monthEnd);

  console.log('Building export row for:', employee.first_name, employee.last_name);
  console.log('  Calculated recap:', calculatedRecap);

  // A) Employé
  const employeeName = `${employee.first_name} ${employee.last_name}`;

  // B) Poste/Équipe
  let posteEquipe = [];
  if (employee.position) posteEquipe.push(employee.position);
  if (team?.name) posteEquipe.push(team.name);
  const posteEquipeStr = posteEquipe.join(' / ') || '-';

  // 2) Payées (hors sup/comp) - depuis recap calculé
  const payeesHorsSup = calculatedRecap?.paidBaseHours || calculatedRecap?.worked_hours || 0;

  // 3) Compl +10%
  const compl10 = calculatedRecap?.complementary_10 || 0;

  // 4) Compl +25%
  const compl25 = calculatedRecap?.complementary_25 || 0;

  // 5) Supp +25%
  const supp25 = calculatedRecap?.overtime_25 || 0;

  // 6) Supp +50%
  const supp50 = calculatedRecap?.overtime_50 || 0;

  // 7) Férié (jours + heures)
  const holidayEligible = calculatedRecap?.holiday_eligible !== false;
  const holidayDays = calculatedRecap?.holiday_days_count || 0;
  const holidayHours = calculatedRecap?.holiday_hours_worked || 0;
  const ferieStr = holidayEligible && holidayDays > 0 
    ? `${holidayDays}j (${holidayHours.toFixed(1)}h)` 
    : '-';

  // 1) Total payé
  const isPartTime = employee.work_time_type === 'part_time';
  let totalPaid = payeesHorsSup;
  
  if (isPartTime) {
    totalPaid += compl10 + compl25;
  } else {
    totalPaid += supp25 + supp50;
  }
  
  if (holidayEligible) {
    totalPaid += holidayHours;
  }

  // 8) Non-shifts visibles récap
  const nonShiftsVisible = [];
  if (calculatedRecap?.nonShiftsByType) {
    Object.entries(calculatedRecap.nonShiftsByType).forEach(([typeId, typeData]) => {
      const nsType = nonShiftTypes.find(t => t.id === typeId);
      if (nsType && nsType.visible_in_recap && typeData.count > 0) {
        const dates = (typeData.dates || []).sort().map(d => {
          const dt = new Date(d + 'T00:00:00');
          return dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
        }).join(', ');
        const code = nsType.code || nsType.label?.substring(0, 3).toUpperCase();
        nonShiftsVisible.push(`${code} (${dates})`);
      }
    });
  }
  const nonShiftsStr = nonShiftsVisible.join('\n') || '-';

  // 9) CP décomptés + détails périodes
  const employeeCPPeriods = cpPeriods.filter(p => 
    p.employee_id === employee.id &&
    p.start_cp <= monthEndStr &&
    p.end_cp >= monthStartStr
  );
  
  let cpStr = '-';
  if (employeeCPPeriods.length > 0) {
    const totalCPDays = calculatedRecap?.cp_days_total || 0;
    const periodDetails = employeeCPPeriods.map(p => {
      // Use the new field names: cp_start_date and return_date
      if (!p.cp_start_date || !p.return_date) {
        console.error('⚠️ CP period with missing dates:', p);
        return '(dates invalides)';
      }
      const departDate = formatDateFR(p.cp_start_date);
      const repriseDate = formatDateFR(p.return_date);
      return `(départ le ${departDate}, reprise le ${repriseDate})`;
    }).join(' ; ');
    cpStr = `${totalCPDays} CP décomptés ${periodDetails}`;
  }

  console.log('  Row result:', {
    totalPaid,
    payeesHorsSup,
    compl10,
    compl25,
    supp25,
    supp50,
    holidayDays,
    holidayHours
  });

  return {
    employeeName,
    posteEquipeStr,
    totalPaid,
    payeesHorsSup,
    compl10,
    compl25,
    supp25,
    supp50,
    ferieStr,
    nonShiftsStr,
    cpStr,
    employee,
    recap: calculatedRecap
  };
}

export default function ExportComptaModal({ open, onOpenChange, monthStart, monthEnd }) {
  const [customMessage, setCustomMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState(null);

  const year = monthStart.getFullYear();
  const month = monthStart.getMonth() + 1;
  const monthName = MONTHS[monthStart.getMonth()];
  const monthKey = `${year}-${String(month).padStart(2, '0')}`; // e.g. "2026-02"
  
  // SOURCE DE VÉRITÉ UNIQUE : récupérer le contexte actif du mois
  const [monthContext, setMonthContext] = React.useState(null);
  
  React.useEffect(() => {
    if (open) {
      getActiveMonthContext(monthKey).then(ctx => {
        console.log('═════════════════════════════════════════════');
        console.log('📊 EXPORT COMPTA - Initialisation');
        console.log('═════════════════════════════════════════════');
        console.log('Month:', monthName, year);
        console.log('MonthKey:', ctx.month_key);
        console.log('Active reset_version:', ctx.reset_version);
        setMonthContext(ctx);
      });
    }
  }, [open, monthKey]);
  
  const activeResetVersion = monthContext?.reset_version;

  // Fetch settings
  const { data: settingsData = [] } = useQuery({
    queryKey: ['appSettings', 'compta_export'],
    queryFn: async () => {
      return await base44.entities.AppSettings.filter({ setting_key: 'compta_export' });
    }
  });

  const settings = settingsData[0] || {};
  const hasRequiredSettings = settings.email_compta && settings.etablissement_name && settings.responsable_name && settings.responsable_email;

  // Fetch all data
  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.filter({ is_active: true }),
    enabled: open
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.filter({ is_active: true }),
    enabled: open
  });

  const { data: recaps = [] } = useQuery({
    queryKey: ['monthlyRecaps', monthKey, activeResetVersion],
    queryFn: async () => {
      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('🔍 EXPORT COMPTA - FETCHING MONTHLY RECAPS');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('Entity: MonthlyRecap');
      console.log(`Query filters: { month_key: "${monthKey}", reset_version: ${activeResetVersion} }`);
      console.log(`month_key type: ${typeof monthKey}`);
      console.log(`reset_version type: ${typeof activeResetVersion}`);
      
      const allRecaps = await base44.entities.MonthlyRecap.filter({ 
        month_key: monthKey,
        reset_version: activeResetVersion 
      });
      
      console.log(`\n📊 RESULTS: ${allRecaps.length} recap(s) found`);
      
      if (allRecaps.length > 0) {
        console.log('✓ Sample recaps (first 3):');
        allRecaps.slice(0, 3).forEach((r, idx) => {
          console.log(`  Recap ${idx + 1}:`);
          console.log(`    - ID: ${r.id}`);
          console.log(`    - employee_id: ${r.employee_id}`);
          console.log(`    - month_key: "${r.month_key}"`);
          console.log(`    - reset_version: ${r.reset_version}`);
          console.log(`    - worked_hours: ${r.worked_hours}`);
          console.log(`    - shifts_count: ${r.shifts_count}`);
        });
      } else {
        console.log('❌ NO RECAPS FOUND - Running fallback debug queries...\n');
        
        // Fallback 1: Try without reset_version filter
        console.log('🔍 Fallback 1: Query with month_key only (no reset_version filter)');
        const fallback1 = await base44.entities.MonthlyRecap.filter({ month_key: monthKey });
        console.log(`  Found: ${fallback1.length} recap(s)`);
        if (fallback1.length > 0) {
          console.log('  Sample (first 3):');
          fallback1.slice(0, 3).forEach((r, idx) => {
            console.log(`    ${idx + 1}. month_key="${r.month_key}", reset_version=${r.reset_version}, employee=${r.employee_name}`);
          });
        }
        
        // Fallback 2: Try without month_key filter
        console.log('\n🔍 Fallback 2: Query with reset_version only (no month_key filter)');
        const fallback2 = await base44.entities.MonthlyRecap.filter({ reset_version: activeResetVersion });
        console.log(`  Found: ${fallback2.length} recap(s)`);
        if (fallback2.length > 0) {
          console.log('  Sample (first 3):');
          fallback2.slice(0, 3).forEach((r, idx) => {
            console.log(`    ${idx + 1}. month_key="${r.month_key}", reset_version=${r.reset_version}, employee=${r.employee_name}`);
          });
        }
        
        // Fallback 3: Get any recaps (no filters)
        console.log('\n🔍 Fallback 3: Query with NO filters (first 5 recaps in database)');
        const fallback3 = await base44.entities.MonthlyRecap.list();
        console.log(`  Total in database: ${fallback3.length} recap(s)`);
        if (fallback3.length > 0) {
          console.log('  Sample (first 5):');
          fallback3.slice(0, 5).forEach((r, idx) => {
            console.log(`    ${idx + 1}. ID=${r.id}, month_key="${r.month_key}", reset_version=${r.reset_version}, employee=${r.employee_name}`);
          });
        }
        
        console.log('\n💡 DIAGNOSIS:');
        if (fallback1.length > 0 && fallback2.length === 0) {
          console.log('  ❌ Recaps exist for this month_key but with DIFFERENT reset_version');
          console.log(`  Expected reset_version: ${activeResetVersion}`);
          console.log(`  Found reset_versions: ${[...new Set(fallback1.map(r => r.reset_version))].join(', ')}`);
          console.log('  → Recaps were persisted with wrong reset_version');
        } else if (fallback1.length === 0 && fallback2.length > 0) {
          console.log('  ❌ Recaps exist for this reset_version but with DIFFERENT month_key');
          console.log(`  Expected month_key: "${monthKey}"`);
          console.log(`  Found month_keys: ${[...new Set(fallback2.map(r => r.month_key))].join(', ')}`);
          console.log('  → Recaps were persisted with wrong month_key');
        } else if (fallback3.length === 0) {
          console.log('  ❌ NO RECAPS EXIST IN DATABASE AT ALL');
          console.log('  → Recaps were never persisted (ApplyTemplate did not write them)');
        } else {
          console.log('  ❌ Recaps exist but with BOTH wrong month_key AND reset_version');
          console.log(`  Expected: month_key="${monthKey}", reset_version=${activeResetVersion}`);
        }
      }
      
      console.log('═══════════════════════════════════════════════════════════\n');
      return allRecaps;
    },
    enabled: open && activeResetVersion !== undefined
  });

  const { data: nonShiftTypes = [] } = useQuery({
    queryKey: ['nonShiftTypes'],
    queryFn: async () => {
      return await base44.entities.NonShiftType.filter({ is_active: true });
    },
    enabled: open
  });

  const { data: cpPeriods = [] } = useQuery({
    queryKey: ['paidLeavePeriods', monthKey, activeResetVersion],
    queryFn: async () => {
      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('🏖️ EXPORT COMPTA - FETCHING CP PERIODS');
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`Query filters: { month_key: "${monthKey}", reset_version: ${activeResetVersion} }`);

      const allPeriods = await base44.entities.PaidLeavePeriod.filter({
        month_key: monthKey,
        reset_version: activeResetVersion
      });

      console.log(`\n📊 RESULTS: ${allPeriods.length} CP period(s) found`);
      if (allPeriods.length > 0) {
        console.log('✓ Sample CP periods (first 3):');
        allPeriods.slice(0, 3).forEach((cp, idx) => {
          console.log(`  CP ${idx + 1}:`);
          console.log(`    - ID: ${cp.id}`);
          console.log(`    - employee: ${cp.employee_name}`);
          console.log(`    - period: ${cp.start_cp} → ${cp.end_cp}`);
          console.log(`    - days: ${cp.cp_days_auto || 0} (auto) + ${cp.cp_days_manual || 0} (manual)`);
        });
      }
      console.log('═══════════════════════════════════════════════════════════\n');

      return allPeriods;
    },
    enabled: open && activeResetVersion !== undefined
  });

  // Fetch shifts and non-shift events for calculations - FILTERED BY ACTIVE VERSION
  const { data: shifts = [] } = useQuery({
    queryKey: ['shifts', monthKey, activeResetVersion],
    queryFn: async () => {
      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('🔍 EXPORT COMPTA - FETCHING SHIFTS');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('Entity: Shift');
      console.log(`Query filters: { month_key: "${monthKey}", reset_version: ${activeResetVersion} }`);
      console.log(`month_key type: ${typeof monthKey}`);
      console.log(`reset_version type: ${typeof activeResetVersion}`);
      
      const monthStartStr = formatDate(monthStart);
      const monthEndStr = formatDate(monthEnd);
      
      const allShifts = await base44.entities.Shift.filter({
        month_key: monthKey,
        reset_version: activeResetVersion
      });
      const filtered = allShifts.filter(s => s.date >= monthStartStr && s.date <= monthEndStr);
      
      console.log(`\n📊 RESULTS: ${filtered.length} shift(s) found`);
      
      if (filtered.length > 0) {
        console.log('✓ Sample shifts (first 3):');
        filtered.slice(0, 3).forEach((s, idx) => {
          console.log(`  Shift ${idx + 1}:`);
          console.log(`    - ID: ${s.id}`);
          console.log(`    - date: ${s.date}`);
          console.log(`    - employee_id: ${s.employee_id}`);
          console.log(`    - month_key: "${s.month_key}"`);
          console.log(`    - reset_version: ${s.reset_version}`);
        });
      } else {
        console.log('❌ NO SHIFTS FOUND - Running fallback debug queries...\n');
        
        // Fallback 1: Try without reset_version filter
        console.log('🔍 Fallback 1: Query with month_key only (no reset_version filter)');
        const fallback1 = await base44.entities.Shift.filter({ month_key: monthKey });
        const f1Filtered = fallback1.filter(s => s.date >= monthStartStr && s.date <= monthEndStr);
        console.log(`  Found: ${f1Filtered.length} shift(s)`);
        if (f1Filtered.length > 0) {
          console.log('  Sample (first 3):');
          f1Filtered.slice(0, 3).forEach((s, idx) => {
            console.log(`    ${idx + 1}. date=${s.date}, month_key="${s.month_key}", reset_version=${s.reset_version}, employee=${s.employee_name}`);
          });
        }
        
        // Fallback 2: Try without month_key filter
        console.log('\n🔍 Fallback 2: Query with reset_version only (no month_key filter)');
        const fallback2 = await base44.entities.Shift.filter({ reset_version: activeResetVersion });
        const f2Filtered = fallback2.filter(s => s.date >= monthStartStr && s.date <= monthEndStr);
        console.log(`  Found: ${f2Filtered.length} shift(s)`);
        if (f2Filtered.length > 0) {
          console.log('  Sample (first 3):');
          f2Filtered.slice(0, 3).forEach((s, idx) => {
            console.log(`    ${idx + 1}. date=${s.date}, month_key="${s.month_key}", reset_version=${s.reset_version}, employee=${s.employee_name}`);
          });
        }
        
        // Fallback 3: Get any shifts in month (no version filters)
        console.log('\n🔍 Fallback 3: Query by date range only (no version filters)');
        const allShiftsNoFilter = await base44.entities.Shift.list();
        const fallback3 = allShiftsNoFilter.filter(s => s.date >= monthStartStr && s.date <= monthEndStr);
        console.log(`  Found in month: ${fallback3.length} shift(s)`);
        if (fallback3.length > 0) {
          console.log('  Sample (first 5):');
          fallback3.slice(0, 5).forEach((s, idx) => {
            console.log(`    ${idx + 1}. ID=${s.id}, date=${s.date}, month_key="${s.month_key}", reset_version=${s.reset_version}, employee=${s.employee_name}`);
          });
        }
        
        // Fallback 4: Get total shifts in database
        console.log('\n🔍 Fallback 4: Total shifts in entire database');
        console.log(`  Total shifts: ${allShiftsNoFilter.length}`);
        if (allShiftsNoFilter.length > 0) {
          console.log('  Sample (first 5):');
          allShiftsNoFilter.slice(0, 5).forEach((s, idx) => {
            console.log(`    ${idx + 1}. ID=${s.id}, date=${s.date}, month_key="${s.month_key}", reset_version=${s.reset_version}`);
          });
        }
        
        console.log('\n💡 DIAGNOSIS:');
        if (f1Filtered.length > 0 && f2Filtered.length === 0) {
          console.log('  ❌ Shifts exist for this month_key but with DIFFERENT reset_version');
          console.log(`  Expected reset_version: ${activeResetVersion}`);
          console.log(`  Found reset_versions: ${[...new Set(f1Filtered.map(s => s.reset_version))].join(', ')}`);
          console.log('  → Shifts were persisted with wrong reset_version');
        } else if (f1Filtered.length === 0 && f2Filtered.length > 0) {
          console.log('  ❌ Shifts exist for this reset_version but with DIFFERENT month_key');
          console.log(`  Expected month_key: "${monthKey}"`);
          console.log(`  Found month_keys: ${[...new Set(f2Filtered.map(s => s.month_key))].join(', ')}`);
          console.log('  → Shifts were persisted with wrong month_key');
        } else if (fallback3.length === 0 && allShiftsNoFilter.length === 0) {
          console.log('  ❌ NO SHIFTS EXIST IN DATABASE AT ALL');
          console.log('  → Shifts were never persisted (ApplyTemplate bulk create failed)');
        } else if (fallback3.length === 0) {
          console.log('  ❌ Shifts exist in database but NOT in this month');
          console.log(`  Expected month range: ${monthStartStr} → ${monthEndStr}`);
        } else {
          console.log('  ❌ Shifts exist in month but with BOTH wrong month_key AND reset_version');
          console.log(`  Expected: month_key="${monthKey}", reset_version=${activeResetVersion}`);
        }
      }
      
      console.log('═══════════════════════════════════════════════════════════\n');
      return filtered;
    },
    enabled: open && activeResetVersion !== undefined
  });

  const { data: nonShiftEvents = [] } = useQuery({
    queryKey: ['nonShiftEvents', monthKey, activeResetVersion],
    queryFn: async () => {
      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('📅 EXPORT COMPTA - FETCHING NON-SHIFT EVENTS');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('Entity: NonShiftEvent');
      console.log(`Query filters: { month_key: "${monthKey}", reset_version: ${activeResetVersion} }`);

      const monthStartStr = formatDate(monthStart);
      const monthEndStr = formatDate(monthEnd);
      const allEvents = await base44.entities.NonShiftEvent.filter({
        month_key: monthKey,
        reset_version: activeResetVersion
      });
      const filtered = allEvents.filter(e => e.date >= monthStartStr && e.date <= monthEndStr);

      console.log(`\n📊 RESULTS: ${filtered.length} non-shift event(s) found`);
      if (filtered.length > 0) {
        console.log('✓ Sample non-shifts (first 3):');
        filtered.slice(0, 3).forEach((ns, idx) => {
          console.log(`  NonShift ${idx + 1}:`);
          console.log(`    - ID: ${ns.id}`);
          console.log(`    - date: ${ns.date}`);
          console.log(`    - employee_id: ${ns.employee_id}`);
          console.log(`    - type: ${ns.non_shift_type_label}`);
          console.log(`    - month_key: "${ns.month_key}"`);
          console.log(`    - reset_version: ${ns.reset_version}`);
        });
      }
      console.log('═══════════════════════════════════════════════════════════\n');

      return filtered;
    },
    enabled: open && activeResetVersion !== undefined
  });

  const { data: holidayDates = [] } = useQuery({
    queryKey: ['holidayDates', monthKey],
    queryFn: async () => {
      const allHolidays = await base44.entities.HolidayDate.filter({ is_active: true });
      const monthStartStr = formatDate(monthStart);
      const monthEndStr = formatDate(monthEnd);
      const filtered = allHolidays
        .filter(h => h.date >= monthStartStr && h.date <= monthEndStr)
        .map(h => h.date);
      console.log('🎉 Holiday dates:', filtered);
      return filtered;
    },
    enabled: open
  });

  const { data: calculationSettings = [] } = useQuery({
    queryKey: ['appSettings', 'planning_calculation_mode'],
    queryFn: async () => {
      return await base44.entities.AppSettings.filter({ setting_key: 'planning_calculation_mode' });
    },
    enabled: open
  });

  const calculationMode = calculationSettings[0]?.planning_calculation_mode || 'disabled';

  // Build export data using computePayrollBreakdown for accurate calculations
  const exportData = employees
    .map(employee => {
      const team = teams.find(t => t.id === employee.team_id);
      
      const employeeShifts = shifts.filter(s => s.employee_id === employee.id);
      const employeeNonShifts = nonShiftEvents.filter(e => e.employee_id === employee.id);

      // Skip if no shifts at all
      if (employeeShifts.length === 0 && employeeNonShifts.length === 0) {
        return null;
      }

      // Compute payroll breakdown (corrected calculation)
      const payrollBreakdown = computePayrollBreakdown(
        employee,
        monthContext,
        shifts,
        nonShiftEvents,
        nonShiftTypes,
        cpPeriods,
        holidayDates
      );

      // Skip if no activity (worked hours = 0)
      if (payrollBreakdown.basePaidHours === 0 && payrollBreakdown.totalPaid === 0) {
        return null;
      }

      // Build export row with payroll breakdown
      const fullRecap = {
        paidBaseHours: payrollBreakdown.basePaidHours,
        worked_hours: payrollBreakdown.basePaidHours,
        overtime_25: payrollBreakdown.supp25Hours,
        overtime_50: payrollBreakdown.supp50Hours,
        complementary_10: payrollBreakdown.compl10Hours,
        complementary_25: payrollBreakdown.compl25Hours,
        holiday_eligible: payrollBreakdown.holidayHours > 0,
        holiday_days_count: 0,
        holiday_hours_worked: payrollBreakdown.holidayHours,
        nonShiftsByType: payrollBreakdown.nonShiftsVisible,
        shifts_count: employeeShifts.length,
        cp_days_total: payrollBreakdown.cpDays
      };

      return buildExportRow(employee, fullRecap, nonShiftTypes, cpPeriods, team, monthStart, monthEnd);
    })
    .filter(Boolean);

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✅ EXPORT DATA FINAL RESULT');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Month:', monthName, year);
  console.log('MonthKey:', monthKey);
  console.log('Active reset_version:', activeResetVersion);
  console.log('Total employees:', employees.length);
  console.log('Shifts (active version):', shifts.length);
  console.log('NonShiftEvents (active version):', nonShiftEvents.length);
  console.log('CP Periods (active version):', cpPeriods.length);
  console.log(`MonthlyRecaps found: ${recaps.length}`);
  console.log(`Export rows generated: ${exportData.length}`);
  if (exportData.length > 0) {
    console.log('✓ First 3 export rows:');
    exportData.slice(0, 3).forEach((r, idx) => {
      console.log(`  Row ${idx + 1}:`);
      console.log(`    - Employee: ${r.employeeName}`);
      console.log(`    - Total paid: ${r.totalPaid.toFixed(1)}h`);
      console.log(`    - Base hours: ${r.payeesHorsSup.toFixed(1)}h`);
      console.log(`    - Compl 10%: ${r.compl10.toFixed(1)}h`);
      console.log(`    - Supp 25%: ${r.supp25.toFixed(1)}h`);
    });
  } else {
    console.log('❌ NO EXPORT DATA GENERATED');
    if (recaps.length === 0) {
      console.log('  ROOT CAUSE: No MonthlyRecaps found for this month+version');
      console.log('  → Check if recaps were persisted after template application');
      console.log('  → Review fallback debug queries above for mismatch diagnosis');
    } else {
      console.log(`  MonthlyRecaps exist (${recaps.length}) but no employees with activity`);
      console.log('  → This may indicate calculation issues or zero shifts');
    }
  }
  console.log('═══════════════════════════════════════════════════════════\n');

  // Calculate totals
  const totals = exportData.reduce((acc, row) => ({
    totalPaid: acc.totalPaid + row.totalPaid,
    payeesHorsSup: acc.payeesHorsSup + row.payeesHorsSup,
    compl10: acc.compl10 + row.compl10,
    compl25: acc.compl25 + row.compl25,
    supp25: acc.supp25 + row.supp25,
    supp50: acc.supp50 + row.supp50
  }), {
    totalPaid: 0,
    payeesHorsSup: 0,
    compl10: 0,
    compl25: 0,
    supp25: 0,
    supp50: 0
  });

  const generatePDF = async () => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    
    // En-tête
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(settings.etablissement_name || 'Établissement', margin, margin + 8);
    
    doc.setFontSize(12);
    doc.text(`Éléments pour établir les fiches de paie - ${monthName} ${year}`, margin, margin + 15);
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(128, 128, 128);
    doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, margin, margin + 20);
    doc.setTextColor(0, 0, 0);

    // Tableau
    const tableData = exportData.map(row => [
      row.employeeName,
      row.posteEquipeStr,
      row.totalPaid.toFixed(1) + 'h',
      row.payeesHorsSup.toFixed(1) + 'h',
      row.compl10 > 0 ? row.compl10.toFixed(1) + 'h' : '-',
      row.compl25 > 0 ? row.compl25.toFixed(1) + 'h' : '-',
      row.supp25 > 0 ? row.supp25.toFixed(1) + 'h' : '-',
      row.supp50 > 0 ? row.supp50.toFixed(1) + 'h' : '-',
      row.ferieStr,
      row.nonShiftsStr,
      row.cpStr
    ]);

    // Ligne TOTAL
    tableData.push([
      'TOTAL',
      '',
      totals.totalPaid.toFixed(1) + 'h',
      totals.payeesHorsSup.toFixed(1) + 'h',
      totals.compl10.toFixed(1) + 'h',
      totals.compl25.toFixed(1) + 'h',
      totals.supp25.toFixed(1) + 'h',
      totals.supp50.toFixed(1) + 'h',
      '',
      '',
      ''
    ]);

    doc.autoTable({
      startY: margin + 25,
      head: [[
        'Employé', 'Poste/Équipe', 'Total payé', 'Payées\n(hors sup/comp)', 
        'Compl\n+10%', 'Compl\n+25%', 'Supp\n+25%', 'Supp\n+50%', 
        'Férié', 'Non-shifts\nvisibles récap', 'CP décomptés'
      ]],
      body: tableData,
      styles: {
        fontSize: 7,
        cellPadding: 2,
        overflow: 'linebreak',
        halign: 'left'
      },
      headStyles: {
        fillColor: [243, 244, 246],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        fontSize: 6.5,
        minCellHeight: 8
      },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 25 },
        2: { cellWidth: 18, halign: 'right', fillColor: [219, 234, 254], fontStyle: 'bold' },
        3: { cellWidth: 18, halign: 'right' },
        4: { cellWidth: 14, halign: 'right' },
        5: { cellWidth: 14, halign: 'right' },
        6: { cellWidth: 14, halign: 'right' },
        7: { cellWidth: 14, halign: 'right' },
        8: { cellWidth: 20, halign: 'right', fontSize: 6, textColor: [147, 51, 234] },
        9: { cellWidth: 40, fontSize: 6 },
        10: { cellWidth: 50, fontSize: 6 }
      },
      didParseCell: (data) => {
        if (data.row.index === tableData.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [229, 231, 235];
        }
      },
      margin: { left: margin, right: margin }
    });

    doc.setFontSize(7);
    doc.setTextColor(128, 128, 128);
    doc.text('Document généré automatiquement via UpGraal', pageWidth / 2, pageHeight - 5, { align: 'center' });

    return doc;
  };

  const handleDownloadPDF = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const doc = await generatePDF();
      doc.save(`Export_Compta_${monthName}_${year}.pdf`);
      toast.success('PDF téléchargé avec succès');
    } catch (error) {
      setError(`Erreur : ${error.message}`);
      toast.error('Échec : ' + error.message);
      console.error('ExportCompta error:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendEmail = async () => {
    if (!hasRequiredSettings) {
      toast.error('Paramètres comptabilité incomplets');
      return;
    }

    setIsSending(true);
    setError(null);
    
    try {
      const doc = await generatePDF();
      const pdfBlob = doc.output('blob');

      if (!pdfBlob || pdfBlob.size === 0) {
        throw new Error('PDF non généré ou vide');
      }

      const pdfFilename = `Export_Compta_${monthName}_${year}.pdf`;
      const pdfFile = new File([pdfBlob], pdfFilename, { type: 'application/pdf' });

      const uploadResult = await base44.integrations.Core.UploadFile({ file: pdfFile });
      
      if (!uploadResult || !uploadResult.file_url) {
        throw new Error('Upload échoué: aucune URL retournée');
      }

      await base44.functions.invoke('sendComptaExport', {
        pdfUrl: uploadResult.file_url,
        pdfFilename,
        monthName,
        year,
        settings: {
          emailCompta: settings.email_compta,
          etablissementName: settings.etablissement_name,
          responsableName: settings.responsable_name,
          responsableEmail: settings.responsable_email,
          responsableCoords: settings.responsable_coords || ''
        },
        customMessage
      });

      toast.success('Email envoyé à la comptabilité avec PDF en pièce jointe');
      onOpenChange(false);
    } catch (error) {
      setError(`Erreur envoi : ${error.message}`);
      toast.error('Erreur lors de l\'envoi : ' + error.message);
      console.error('Send email error:', error);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-orange-600 flex items-center gap-2">
            <FileText className="w-6 h-6" />
            Export compta – {monthName} {year}
          </DialogTitle>
        </DialogHeader>

        {!hasRequiredSettings && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-900">
              <p className="font-semibold">Paramètres manquants</p>
              <p>Configurez les paramètres de comptabilité dans Paramètres &gt; Planning &gt; Comptabilité</p>
            </div>
          </div>
        )}

        <div className="space-y-6">
          {/* Tableau récapitulatif */}
          <div>
            <h3 className="text-lg font-semibold mb-3 text-gray-900">📊 Récapitulatif global de paie</h3>
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold">Employé</th>
                    <th className="px-2 py-2 text-left font-semibold">Poste/Équipe</th>
                    <th className="px-2 py-2 text-right font-semibold bg-blue-50">Total payé</th>
                    <th className="px-2 py-2 text-right font-semibold">Payées<br/>(hors sup/comp)</th>
                    <th className="px-2 py-2 text-right font-semibold">Compl<br/>+10%</th>
                    <th className="px-2 py-2 text-right font-semibold">Compl<br/>+25%</th>
                    <th className="px-2 py-2 text-right font-semibold">Supp<br/>+25%</th>
                    <th className="px-2 py-2 text-right font-semibold">Supp<br/>+50%</th>
                    <th className="px-2 py-2 text-right font-semibold">Férié</th>
                    <th className="px-2 py-2 text-left font-semibold">Non-shifts<br/>visibles récap</th>
                    <th className="px-2 py-2 text-left font-semibold">CP décomptés</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {exportData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-2 py-2 font-medium">{row.employeeName}</td>
                      <td className="px-2 py-2 text-gray-600">{row.posteEquipeStr}</td>
                      <td className="px-2 py-2 text-right font-bold bg-blue-50">{row.totalPaid.toFixed(1)}h</td>
                      <td className="px-2 py-2 text-right">{row.payeesHorsSup.toFixed(1)}h</td>
                      <td className="px-2 py-2 text-right">{row.compl10 > 0 ? `${row.compl10.toFixed(1)}h` : '-'}</td>
                      <td className="px-2 py-2 text-right">{row.compl25 > 0 ? `${row.compl25.toFixed(1)}h` : '-'}</td>
                      <td className="px-2 py-2 text-right">{row.supp25 > 0 ? `${row.supp25.toFixed(1)}h` : '-'}</td>
                      <td className="px-2 py-2 text-right">{row.supp50 > 0 ? `${row.supp50.toFixed(1)}h` : '-'}</td>
                      <td className="px-2 py-2 text-right text-[10px] text-purple-700">{row.ferieStr}</td>
                      <td className="px-2 py-2 text-[10px] whitespace-pre-line">{row.nonShiftsStr}</td>
                      <td className="px-2 py-2 text-[10px]">{row.cpStr}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-200 font-bold">
                    <td className="px-2 py-2" colSpan="2">TOTAL</td>
                    <td className="px-2 py-2 text-right bg-blue-100">{totals.totalPaid.toFixed(1)}h</td>
                    <td className="px-2 py-2 text-right">{totals.payeesHorsSup.toFixed(1)}h</td>
                    <td className="px-2 py-2 text-right">{totals.compl10.toFixed(1)}h</td>
                    <td className="px-2 py-2 text-right">{totals.compl25.toFixed(1)}h</td>
                    <td className="px-2 py-2 text-right">{totals.supp25.toFixed(1)}h</td>
                    <td className="px-2 py-2 text-right">{totals.supp50.toFixed(1)}h</td>
                    <td colSpan="3"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-red-900 text-sm">Erreur de génération</p>
                  <p className="text-red-800 text-xs mt-1">{error}</p>
                  <Button
                    onClick={() => { setError(null); handleDownloadPDF(); }}
                    size="sm"
                    variant="outline"
                    className="mt-2 border-red-300 text-red-700 hover:bg-red-100"
                  >
                    Réessayer
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div>
            <Label className="text-sm font-semibold text-gray-700">Message personnalisé pour l'email</Label>
            <Textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Ajoutez un message libre qui sera inclus dans le corps de l'email envoyé au comptable...

Exemple:
Bonjour,

Ci-joint les éléments de paie pour février 2026.
Merci de traiter cette demande en priorité.

Cordialement"
              rows={6}
              className="mt-1 font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              💡 Ce message sera affiché dans le corps de l'email + PDF en pièce jointe
            </p>
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <Button
              onClick={handleDownloadPDF}
              disabled={isGenerating || isSending}
              variant="outline"
              className="flex-1"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Génération...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Télécharger le PDF
                </>
              )}
            </Button>
            <Button
              onClick={handleSendEmail}
              disabled={!hasRequiredSettings || isGenerating || isSending}
              className="flex-1 bg-orange-600 hover:bg-orange-700"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Envoi en cours...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Envoyer à la compta
                </>
              )}
            </Button>
            <Button
              onClick={() => onOpenChange(false)}
              variant="outline"
              disabled={isGenerating || isSending}
            >
              Fermer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}