import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Send, Download, Loader2, AlertCircle, Edit3 } from 'lucide-react';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { calculateMonthlyRecap } from '@/components/utils/monthlyRecapCalculations';
import { getActiveMonthContext } from './monthContext';
import ExportOverrideModal from './ExportOverrideModal';

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
 * SOURCE DE VÉRITÉ UNIQUE: RÉCAP MENSUEL CALCULÉ + OVERRIDES
 * Construit une ligne d'export en lisant les valeurs du récap calculé,
 * puis applique les overrides s'ils existent
 */
function buildExportRow(employee, calculatedRecap, nonShiftTypes, cpPeriods, nonShiftEvents, override) {
  console.log('═════════════════════════════════════════════════');
  console.log('📊 BUILDING EXPORT ROW FROM CALCULATED RECAP');
  console.log('═════════════════════════════════════════════════');
  console.log('Employee:', employee.first_name, employee.last_name);
  console.log('CalculatedRecap:', calculatedRecap);

  const employeeName = `${employee.first_name} ${employee.last_name}`;

  // === VALEURS AUTO (calculées) ===
  const autoNbJoursTravailles = calculatedRecap?.workedDays || 0;
  const autoExtraDays = calculatedRecap?.extraDays || 0;
  const autoJoursSupp = autoExtraDays > 0 ? autoExtraDays : 0;

  // === PAYÉES (HORS SUP/COMP) - CALCUL AUTO ===
  const parseContractHours = (hoursStr) => {
    if (!hoursStr) return null;
    const cleanStr = String(hoursStr).trim().replace(/h/gi, '').replace(/,/g, '.');
    const hours = parseFloat(cleanStr);
    return isNaN(hours) ? null : hours;
  };

  let autoPayeesHorsSup = calculatedRecap?.workedHours || 0;
  
  const monthlyContractHours = parseContractHours(employee.contract_hours);
  if (monthlyContractHours) {
    const employeeNonShifts = nonShiftEvents.filter(ns => ns.employee_id === employee.id);
    
    const getDailyHoursForDate = (dateStr) => {
      const date = new Date(dateStr);
      const dayIndex = date.getDay();
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayName = dayNames[dayIndex];

      if (employee.weekly_schedule?.[dayName]) {
        const dayConfig = employee.weekly_schedule[dayName];
        if (dayConfig.worked) {
          return dayConfig.hours || 0;
        } else {
          return 0;
        }
      }

      const weeklyHours = parseContractHours(employee.contract_hours_weekly);
      const workDaysPerWeek = employee.work_days_per_week || 5;
      return weeklyHours / workDaysPerWeek;
    };

    let totalDeduction = 0;
    employeeNonShifts.forEach(ns => {
      const nsType = nonShiftTypes.find(t => t.id === ns.non_shift_type_id);
      if (nsType?.impacts_payroll === true) {
        const dailyHours = getDailyHoursForDate(ns.date);
        totalDeduction += dailyHours;
      }
    });

    autoPayeesHorsSup = Math.max(0, monthlyContractHours - totalDeduction);
  }

  // === HEURES COMPL/SUPP - VALEURS AUTO ===
  const autoCompl10 = calculatedRecap?.complementaryHours10 || 0;
  const autoCompl25 = calculatedRecap?.complementaryHours25 || 0;
  const autoSupp25 = calculatedRecap?.overtimeHours25 || 0;
  const autoSupp50 = calculatedRecap?.overtimeHours50 || 0;

  // === FÉRIÉ - VALEURS AUTO ===
  const autoFerieEligible = calculatedRecap?.ferieEligible === true;
  const autoFerieDays = calculatedRecap?.ferieDays || 0;
  const autoFerieHours = calculatedRecap?.ferieHours || 0;
  
  // === NON-SHIFTS VISIBLES - CALCUL AUTO ===
  const nonShiftsVisible = [];
  const employeeNonShifts = nonShiftEvents.filter(ns => ns.employee_id === employee.id);
  
  const nonShiftsByType = {};
  employeeNonShifts.forEach(ns => {
    const nsType = nonShiftTypes.find(t => t.id === ns.non_shift_type_id);
    if (nsType && nsType.visible_in_recap) {
      if (!nonShiftsByType[nsType.id]) {
        nonShiftsByType[nsType.id] = {
          type: nsType,
          dates: []
        };
      }
      nonShiftsByType[nsType.id].dates.push(ns.date);
    }
  });

  Object.values(nonShiftsByType).forEach(({ type, dates }) => {
    const code = type.code || type.label?.substring(0, 3).toUpperCase();
    const count = dates.length;
    const firstDate = dates.sort()[0];
    const dateFormatted = formatDateFR(firstDate);
    nonShiftsVisible.push(`${code} ${count}j le ${dateFormatted}`);
  });
  
  const autoNonShiftsStr = nonShiftsVisible.join('\n') || '';

  // === CP DÉCOMPTÉS - CALCUL AUTO ===
  const employeeCPPeriods = cpPeriods.filter(cp => cp.employee_id === employee.id);
  const cpLines = [];
  
  employeeCPPeriods.forEach(cp => {
    const cpDays = cp.cp_days_manual || cp.cp_days_auto || 0;
    const departDate = formatDateFR(cp.cp_start_date);
    const repriseDate = formatDateFR(cp.return_date);
    cpLines.push(`${cpDays} CP (départ le ${departDate}, reprise le ${repriseDate})`);
  });
  
  const autoCpStr = cpLines.join('\n') || '';

  // ═══════════════════════════════════════════════
  // APPLIQUER LES OVERRIDES (source de vérité finale)
  // ═══════════════════════════════════════════════
  const nbJoursTravailles = override?.override_nbJoursTravailles ?? autoNbJoursTravailles;
  const joursSupp = override?.override_joursSupp ?? autoJoursSupp;
  const payeesHorsSup = override?.override_payeesHorsSupComp ?? autoPayeesHorsSup;
  const compl10 = override?.override_compl10 ?? autoCompl10;
  const compl25 = override?.override_compl25 ?? autoCompl25;
  const supp25 = override?.override_supp25 ?? autoSupp25;
  const supp50 = override?.override_supp50 ?? autoSupp50;
  const ferieDays = override?.override_ferieDays ?? autoFerieDays;
  const ferieHours = override?.override_ferieHours ?? autoFerieHours;
  const nonShiftsStr = override?.override_nonShiftsText ?? autoNonShiftsStr;
  const cpStr = override?.override_cpText ?? autoCpStr;

  // Format hours: remove .0 if integer (9.0 → 9, 9.5 → 9.5)
  const formatHours = (h) => h % 1 === 0 ? h.toFixed(0) : h.toFixed(1);
  
  // Férié display
  const ferieEligible = ferieDays > 0 && ferieHours > 0;
  const ferieStr = ferieEligible ? `${ferieDays}j, ${formatHours(ferieHours)}h` : '';
  
  // Jours supp display
  const joursSupp_display = joursSupp > 0 ? `+${joursSupp}` : '';

  // === TOTAL PAYÉ (avec valeurs finales) ===
  let totalPaid = payeesHorsSup + compl10 + compl25 + supp25 + supp50;
  if (ferieEligible) {
    totalPaid += ferieHours;
  }

  return {
    employeeName,
    nbJoursTravailles,
    joursSupp: joursSupp_display,
    totalPaid,
    payeesHorsSup,
    compl10,
    compl25,
    supp25,
    supp50,
    ferieStr,
    ferieEligible,
    nonShiftsStr,
    cpStr,
    // Valeurs auto pour la modale override
    autoValues: {
      nbJoursTravailles: autoNbJoursTravailles,
      joursSupp: autoJoursSupp,
      payeesHorsSup: autoPayeesHorsSup,
      compl10: autoCompl10,
      compl25: autoCompl25,
      supp25: autoSupp25,
      supp50: autoSupp50,
      ferieDays: autoFerieDays,
      ferieHours: autoFerieHours,
      nonShiftsStr: autoNonShiftsStr,
      cpStr: autoCpStr
    }
  };
}

export default function ExportComptaModal({ open, onOpenChange, monthStart, monthEnd, holidayDates: holidayDatesFromPlanning = [] }) {
  const [customMessage, setCustomMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState(null);
  const [debugData, setDebugData] = useState([]);
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [selectedAutoValues, setSelectedAutoValues] = useState(null);

  // DEBUG: Confirm modal is mounted
  React.useEffect(() => {
    if (open) {
      console.log('[FERIE DEBUG] Export modal mounted - monthStart:', monthStart, 'monthEnd:', monthEnd);
    }
  }, [open, monthStart, monthEnd]);

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

  // Refresh recaps before exporting (sync step)
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [syncMessage, setSyncMessage] = React.useState(null);
  
  React.useEffect(() => {
    if (open && activeResetVersion !== undefined) {
      setIsSyncing(true);
      setSyncMessage('🔄 Synchronisation des recaps...');
      base44.functions.invoke('refreshMonthlyRecapPersistedForMonth', { month_key: monthKey })
        .then(() => {
          setSyncMessage(null);
          setIsSyncing(false);
          // Refresh the persisted recaps after sync
          queryClient?.invalidateQueries(['monthlyRecapsPersisted', monthKey]);
        })
        .catch(err => {
          console.error('Sync error:', err);
          setSyncMessage(null);
          setIsSyncing(false);
        });
    }
  }, [open, activeResetVersion, monthKey]);

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

  // Extract holiday dates from HolidayDate entity (source de vérité)
  const holidayDates = React.useMemo(() => {
    const dates = (holidayDatesFromPlanning || []).map(h => h.date);
    console.log('🎉 Holiday dates (from HolidayDate entity):', dates);
    return dates;
  }, [holidayDatesFromPlanning]);

  const { data: calculationSettings = [] } = useQuery({
    queryKey: ['appSettings', 'planning_calculation_mode'],
    queryFn: async () => {
      return await base44.entities.AppSettings.filter({ setting_key: 'planning_calculation_mode' });
    },
    enabled: open
  });

  const calculationMode = calculationSettings[0]?.planning_calculation_mode || 'disabled';

  // Fetch export overrides
  const { data: overrides = [] } = useQuery({
    queryKey: ['exportOverrides', monthKey, activeResetVersion],
    queryFn: async () => {
      return await base44.entities.ExportComptaOverride.filter({ month_key: monthKey });
    },
    enabled: open && activeResetVersion !== undefined
  });

  // Fetch MonthlyRecapPersisted (source unique pour export compta)
  const { data: recapsPersisted = [] } = useQuery({
    queryKey: ['monthlyRecapsPersisted', monthKey],
    queryFn: async () => {
      return await base44.entities.MonthlyRecapPersisted.filter({ month_key: monthKey });
    },
    enabled: open && !isSyncing
  });

  // 🎯 SOURCE UNIQUE: MonthlyRecapPersisted (UI values)
  // Pour chaque employé, chercher son recap persisté et construire la ligne d'export
  const exportData = employees
    .map(employee => {
      const employeeShifts = shifts.filter(s => s.employee_id === employee.id);
      const employeeNonShifts = nonShiftEvents.filter(e => e.employee_id === employee.id);

      // Skip if no activity at all
      if (employeeShifts.length === 0 && employeeNonShifts.length === 0) {
        return null;
      }

      // Chercher le recap persisté (source de vérité)
      const recapPersisted = recapsPersisted.find(r => r.employee_id === employee.id);

      // Si pas de recap persisté, utiliser un fallback vide + warning
      const hasPersistedRecap = !!recapPersisted;
      const complementary_hours_10 = recapPersisted?.complementary_hours_10 || 0;
      const complementary_hours_25 = recapPersisted?.complementary_hours_25 || 0;
      const complementary_hours_ui = recapPersisted?.complementary_hours_ui || 
                                       (complementary_hours_10 + complementary_hours_25);
      const overtime_hours_25 = recapPersisted?.overtime_hours_25 || 0;
      const overtime_hours_50 = recapPersisted?.overtime_hours_50 || 0;
      const overtime_hours_ui = recapPersisted?.overtime_hours_ui || 
                                (overtime_hours_25 + overtime_hours_50);
      const worked_hours = recapPersisted?.worked_hours || 0;

      // Skip si aucune heure travaillée
      if (worked_hours === 0) {
        return null;
      }

      // Chercher l'override export pour cet employé
      const override = overrides.find(o => o.employee_id === employee.id);

      // Construire la ligne d'export depuis les valeurs persistées
      const employeeName = `${employee.first_name} ${employee.last_name}`;

      // === PAYÉES (HORS SUP/COMP) - depuis calcul auto (nécessaire, pas dans persisted)
      const parseContractHours = (hoursStr) => {
        if (!hoursStr) return null;
        const cleanStr = String(hoursStr).trim().replace(/h/gi, '').replace(/,/g, '.');
        const hours = parseFloat(cleanStr);
        return isNaN(hours) ? null : hours;
      };

      let payeesHorsSup = worked_hours - complementary_hours_ui - overtime_hours_ui;
      
      const monthlyContractHours = parseContractHours(employee.contract_hours);
      if (monthlyContractHours) {
        const getDailyHoursForDate = (dateStr) => {
          const date = new Date(dateStr);
          const dayIndex = date.getDay();
          const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
          const dayName = dayNames[dayIndex];

          if (employee.weekly_schedule?.[dayName]) {
            const dayConfig = employee.weekly_schedule[dayName];
            if (dayConfig.worked) {
              return dayConfig.hours || 0;
            } else {
              return 0;
            }
          }

          const weeklyHours = parseContractHours(employee.contract_hours_weekly);
          const workDaysPerWeek = employee.work_days_per_week || 5;
          return weeklyHours / workDaysPerWeek;
        };

        let totalDeduction = 0;
        employeeNonShifts.forEach(ns => {
          const nsType = nonShiftTypes.find(t => t.id === ns.non_shift_type_id);
          if (nsType?.impacts_payroll === true) {
            const dailyHours = getDailyHoursForDate(ns.date);
            totalDeduction += dailyHours;
          }
        });

        payeesHorsSup = Math.max(0, monthlyContractHours - totalDeduction);
      }

      // === TOTAL PAYÉ
      let totalPaid = payeesHorsSup + complementary_hours_ui + overtime_hours_ui;

      // Format hours
      const formatHours = (h) => h % 1 === 0 ? h.toFixed(0) : h.toFixed(1);
      
      // === NON-SHIFTS & CP (depuis calcul auto)
      const nonShiftsVisible = [];
      const nonShiftsByType = {};
      employeeNonShifts.forEach(ns => {
        const nsType = nonShiftTypes.find(t => t.id === ns.non_shift_type_id);
        if (nsType && nsType.visible_in_recap) {
          if (!nonShiftsByType[nsType.id]) {
            nonShiftsByType[nsType.id] = { type: nsType, dates: [] };
          }
          nonShiftsByType[nsType.id].dates.push(ns.date);
        }
      });

      Object.values(nonShiftsByType).forEach(({ type, dates }) => {
        const code = type.code || type.label?.substring(0, 3).toUpperCase();
        const count = dates.length;
        const firstDate = dates.sort()[0];
        const dateFormatted = formatDateFR(firstDate);
        nonShiftsVisible.push(`${code} ${count}j le ${dateFormatted}`);
      });
      const nonShiftsStr = nonShiftsVisible.join('\n') || '';

      const employeeCPPeriods = cpPeriods.filter(cp => cp.employee_id === employee.id);
      const cpLines = [];
      employeeCPPeriods.forEach(cp => {
        const cpDays = cp.cp_days_manual || cp.cp_days_auto || 0;
        const departDate = formatDateFR(cp.cp_start_date);
        const repriseDate = formatDateFR(cp.return_date);
        cpLines.push(`${cpDays} CP (départ le ${departDate}, reprise le ${repriseDate})`);
      });
      const cpStr = cpLines.join('\n') || '';

      // Jours travaillés (depuis shifts)
      const workedDays = employeeShifts.length;

      const row = {
        employeeName,
        nbJoursTravailles: workedDays,
        joursSupp: '',
        totalPaid,
        payeesHorsSup,
        compl10: complementary_hours_10,
        compl25: complementary_hours_25,
        supp25: overtime_hours_25,
        supp50: overtime_hours_50,
        ferieStr: '',
        ferieEligible: false,
        nonShiftsStr,
        cpStr,
        hasPersistedRecap,
        autoValues: {
          nbJoursTravailles: workedDays,
          payeesHorsSup,
          compl10: complementary_hours_10,
          compl25: complementary_hours_25,
          supp25: overtime_hours_25,
          supp50: overtime_hours_50
        }
      };
      
      return { ...row, employee, override };
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
    nbJoursTravailles: acc.nbJoursTravailles + (row.nbJoursTravailles || 0),
    totalPaid: acc.totalPaid + row.totalPaid,
    payeesHorsSup: acc.payeesHorsSup + row.payeesHorsSup,
    compl10: acc.compl10 + row.compl10,
    compl25: acc.compl25 + row.compl25,
    supp25: acc.supp25 + row.supp25,
    supp50: acc.supp50 + row.supp50
  }), {
    nbJoursTravailles: 0,
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
    
    // ============================================
    // PAGE 1: TABLEAU ÉLÉMENTS DE PAIE
    // ============================================
    
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

    // Tableau - COLONNES OPTIMISÉES
    const tableData = exportData.map(row => [
      row.employeeName,
      row.nbJoursTravailles || 0,
      row.joursSupp || '',
      row.totalPaid.toFixed(1) + 'h',
      row.payeesHorsSup.toFixed(1) + 'h',
      row.compl10 > 0 ? row.compl10.toFixed(1) + 'h' : '',
      row.compl25 > 0 ? row.compl25.toFixed(1) + 'h' : '',
      row.supp25 > 0 ? row.supp25.toFixed(1) + 'h' : '',
      row.supp50 > 0 ? row.supp50.toFixed(1) + 'h' : '',
      row.ferieStr || '',
      row.nonShiftsStr || '',
      row.cpStr || ''
    ]);

    // Ligne TOTAL
    tableData.push([
      'TOTAL',
      totals.nbJoursTravailles,
      '',
      totals.totalPaid.toFixed(1) + 'h',
      totals.payeesHorsSup.toFixed(1) + 'h',
      totals.compl10 > 0 ? totals.compl10.toFixed(1) + 'h' : '',
      totals.compl25 > 0 ? totals.compl25.toFixed(1) + 'h' : '',
      totals.supp25 > 0 ? totals.supp25.toFixed(1) + 'h' : '',
      totals.supp50 > 0 ? totals.supp50.toFixed(1) + 'h' : '',
      '',
      '',
      ''
    ]);

    doc.autoTable({
      startY: margin + 25,
      head: [[
        'Employé', 'Nb j.\ntrav.', 'Jours\nsupp', 'Total payé', 'Payées\n(hors sup/comp)', 
        'Compl\n+10%', 'Compl\n+25%', 'Supp\n+25%', 'Supp\n+50%', 
        'Férié', 'Non-shifts\nvisibles', 'CP\ndécomptés'
      ]],
      body: tableData,
      styles: {
        fontSize: 7,
        cellPadding: { top: 1.5, right: 1, bottom: 1.5, left: 1 },
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
        0: { cellWidth: 30 }, // Employé
        1: { cellWidth: 9, halign: 'center' }, // Nb j. trav (réduit)
        2: { cellWidth: 9, halign: 'center', fontSize: 6 }, // Jours supp (réduit)
        3: { cellWidth: 18, halign: 'right', fillColor: [219, 234, 254], fontStyle: 'bold' }, // Total payé
        4: { cellWidth: 17, halign: 'right' }, // Payées
        5: { cellWidth: 12, halign: 'right' }, // Compl 10%
        6: { cellWidth: 12, halign: 'right' }, // Compl 25%
        7: { cellWidth: 11, halign: 'right' }, // Supp 25% (réduit)
        8: { cellWidth: 11, halign: 'right' }, // Supp 50% (réduit)
        9: { cellWidth: 13, halign: 'center', fontSize: 6, textColor: [147, 51, 234] }, // Férié (réduit)
        10: { cellWidth: 40, fontSize: 6, cellPadding: { top: 1.5, right: 1, bottom: 1.5, left: 1 } }, // Non-shifts (augmenté)
        11: { cellWidth: 38, fontSize: 6, cellPadding: { top: 1.5, right: 1, bottom: 1.5, left: 1 } } // CP (très augmenté)
      },
      didParseCell: (data) => {
        if (data.row.index === tableData.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [229, 231, 235];
        }
      },
      margin: { left: margin, right: margin }
    });

    // Pied de page 1
    doc.setFontSize(7);
    doc.setTextColor(128, 128, 128);
    doc.text('Page 1/2 - Tableau récapitulatif de paie', pageWidth / 2, pageHeight - 5, { align: 'center' });

    // ============================================
    // PAGES 2+: PLANNING PAR SEMAINE (HAUTE RÉSOLUTION)
    // ============================================
    
    const planningElement = document.querySelector('[data-planning-calendar]');
    
    if (planningElement) {
      try {
        console.log('📸 Capture planning par semaine...');
        
        // Structure DOM: planningElement > div.inline-block > (header sticky + div body)
        const container = planningElement.querySelector('.inline-block');
        if (!container) {
          console.error('Container inline-block introuvable');
          return doc;
        }
        
        // Body = 2ème enfant du container (après le header)
        const bodyDiv = container.children[1];
        if (!bodyDiv) {
          console.error('Body div introuvable');
          return doc;
        }
        
        // Tous les enfants du body (jours + récaps)
        const allRows = Array.from(bodyDiv.children);
        console.log(`📦 ${allRows.length} éléments trouvés dans le body`);
        
        // Filtrer les récaps hebdomadaires (pas le mensuel)
        const weeklyRecapRows = allRows.filter(row => 
          row.classList.contains('from-gray-200') && 
          row.classList.contains('to-gray-100') &&
          !row.classList.contains('from-blue-100') // Exclure récap mensuel
        );
        
        console.log(`📅 ${weeklyRecapRows.length} semaines détectées`);
        
        if (weeklyRecapRows.length === 0) {
          console.warn('⚠️ Aucune semaine trouvée - vérifier structure DOM');
          return doc;
        }
        
        // En-tête avec noms des employés
        const headerRow = container.children[0];
        
        // Pour chaque semaine
        for (let weekIndex = 0; weekIndex < weeklyRecapRows.length; weekIndex++) {
          toast.info(`📸 Semaine ${weekIndex + 1}/${weeklyRecapRows.length}...`, { duration: 2000 });
          
          const weekRecapRow = weeklyRecapRows[weekIndex];
          const weekElements = [];
          
          // Remonter jusqu'à 7 jours avant le récap
          let sibling = weekRecapRow.previousElementSibling;
          let daysCount = 0;
          
          while (sibling && daysCount < 7) {
            // Stop si on atteint un autre récap
            if (sibling.classList.contains('from-gray-200') || sibling.classList.contains('from-blue-100')) {
              break;
            }
            weekElements.unshift(sibling);
            sibling = sibling.previousElementSibling;
            daysCount++;
          }
          
          // Ajouter le récap à la fin
          weekElements.push(weekRecapRow);
          
          if (weekElements.length <= 1) continue; // Skip si pas de jours
          
          // Créer conteneur temporaire
          const tempContainer = document.createElement('div');
          tempContainer.style.position = 'fixed';
          tempContainer.style.left = '-9999px';
          tempContainer.style.top = '0';
          tempContainer.style.backgroundColor = '#ffffff';
          tempContainer.style.padding = '10px';
          
          // Cloner l'en-tête avec les noms
          if (headerRow) {
            const headerClone = headerRow.cloneNode(true);
            headerClone.style.position = 'relative';
            headerClone.style.fontSize = '12px'; // Optimisé
            tempContainer.appendChild(headerClone);
          }
          
          // Ajouter les lignes de la semaine
          weekElements.forEach(el => {
            const clone = el.cloneNode(true);
            clone.style.fontSize = '11px'; // Optimisé
            tempContainer.appendChild(clone);
          });
          
          document.body.appendChild(tempContainer);
          
          // Capturer RAPIDEMENT (optimisé pour performance)
          const canvas = await html2canvas(tempContainer, {
            scale: 1.2, // Balance qualité/vitesse
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            width: tempContainer.scrollWidth,
            height: tempContainer.scrollHeight
          });
          
          document.body.removeChild(tempContainer);
          
          // Convertir en JPEG léger
          const imgData = canvas.toDataURL('image/jpeg', 0.5);
          const imgSizeKB = Math.round((imgData.length * 3) / 4 / 1024);
          console.log(`📦 Semaine ${weekIndex + 1}: ${imgSizeKB} KB`);
          
          // Nouvelle page en paysage
          doc.addPage('a4', 'landscape');
          doc.setTextColor(0, 0, 0);
          
          // En-tête
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.text(`Planning ${monthName} ${year} - Semaine ${weekIndex + 1}`, pageWidth / 2, margin + 5, { align: 'center' });
          
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(80, 80, 80);
          doc.text(settings.etablissement_name || '', pageWidth / 2, margin + 10, { align: 'center' });
          
          // Image
          const imgWidth = pageWidth - 2 * margin;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          const yPosition = margin + 14;
          const maxHeight = pageHeight - yPosition - 8;
          
          if (imgHeight > maxHeight) {
            const ratio = maxHeight / imgHeight;
            const scaledWidth = imgWidth * ratio;
            const scaledHeight = maxHeight;
            const xOffset = (pageWidth - scaledWidth) / 2;
            doc.addImage(imgData, 'JPEG', xOffset, yPosition, scaledWidth, scaledHeight);
          } else {
            doc.addImage(imgData, 'JPEG', margin, yPosition, imgWidth, imgHeight);
          }
          
          // Pied de page
          doc.setFontSize(7);
          doc.setTextColor(128, 128, 128);
          doc.text(`Semaine ${weekIndex + 1}/${weeklyRecapRows.length}`, pageWidth / 2, pageHeight - 5, { align: 'center' });
          
          console.log(`✅ Semaine ${weekIndex + 1} OK`);
        }
        
      } catch (err) {
        console.error('❌ Erreur capture:', err);
        toast.error('Erreur capture planning: ' + err.message);
      }
    }

    return doc;
  };

  const handleDownloadPDF = async () => {
    setIsGenerating(true);
    setError(null);
    
    toast.info('⏳ Génération en cours...', { duration: 5000 });

    try {
      const doc = await generatePDF();
      doc.save(`Export_Compta_${monthName}_${year}.pdf`);
      toast.success('✅ PDF téléchargé');
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
    
    toast.info('📄 Génération PDF...', { duration: 5000 });
    
    try {
      console.log('🔄 Génération PDF en cours...');
      const doc = await generatePDF();
      
      toast.info('📤 Upload en cours...', { duration: 5000 });
      
      console.log('✅ PDF généré, extraction blob...');
      const pdfBlob = doc.output('blob');
      console.log('📦 PDF blob size:', pdfBlob.size, 'bytes');

      if (!pdfBlob || pdfBlob.size === 0) {
        throw new Error('PDF non généré ou vide');
      }

      const pdfFilename = `Export_Compta_${monthName}_${year}.pdf`;
      const pdfFile = new File([pdfBlob], pdfFilename, { type: 'application/pdf' });

      console.log('📤 Upload du PDF vers storage...');
      const uploadResult = await base44.integrations.Core.UploadFile({ file: pdfFile });
      console.log('✅ Upload terminé, URL:', uploadResult?.file_url);
      
      if (!uploadResult || !uploadResult.file_url) {
        throw new Error('Upload échoué: aucune URL retournée');
      }

      toast.info('📧 Envoi email...', { duration: 5000 });
      
      console.log('📧 Envoi de l\'email via backend function...');
      const response = await base44.functions.invoke('sendComptaExport', {
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

      console.log('✅ Réponse backend:', response);

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      toast.success('✅ Email envoyé avec succès');
      onOpenChange(false);
    } catch (error) {
      const errorMsg = error?.response?.data?.error || error.message;
      setError(`Erreur envoi : ${errorMsg}`);
      toast.error('Erreur lors de l\'envoi : ' + errorMsg);
      console.error('❌ Send email error:', error);
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

        {/* Sync status */}
        {syncMessage && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
            <div className="text-sm text-blue-900">
              {syncMessage}
            </div>
          </div>
        )}

        {/* DEBUG UI - AFFICHÉ EN PREMIER pour être visible */}
        {new URLSearchParams(window.location.search).get('debug') === '1' && (
          <div className="bg-yellow-100 border-2 border-yellow-500 rounded-lg p-3 mb-4">
            <h3 className="text-sm font-bold text-yellow-900 mb-2">🔍 DEBUG MODE ACTIF - Diagnostic Férié</h3>
            <div className="text-xs space-y-2">
              <div className="bg-white p-2 rounded">
                <strong>Contexte mois:</strong> {monthName} {year} (monthKey: {monthKey})<br/>
                <strong>Jours fériés actifs:</strong> {holidayDates.length} jour(s) → {holidayDates.join(', ') || 'AUCUN'}
              </div>
              
              {debugData.length > 0 ? (
                debugData.map((d, idx) => (
                  <div key={idx} className="bg-white p-2 rounded border border-yellow-400">
                    <div className="font-bold text-purple-900">{d.employee} (ID: {d.id})</div>
                    <div className="mt-1 grid grid-cols-2 gap-2 text-[10px]">
                      <div>
                        <strong className="text-green-700">RECAP:</strong><br/>
                        ferieEligible = {String(d.recap_ferieEligible)}<br/>
                        ferieDays = {d.recap_ferieDays}<br/>
                        ferieHours = {d.recap_ferieHours}
                      </div>
                      <div>
                        <strong className="text-blue-700">ROW:</strong><br/>
                        ferieStr = "{d.row_ferieStr}"<br/>
                        {d.row_ferieStr ? 
                          <span className="text-green-600 font-bold">✅ OK</span> : 
                          <span className="text-red-600 font-bold">❌ VIDE</span>
                        }
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-red-600 font-bold">⚠️ Aucune donnée debug collectée pour Giuliano/Maliwan</div>
              )}
            </div>
          </div>
        )}

        <div className="space-y-6">

          {/* Tableau récapitulatif */}
          <div>
            <h3 className="text-lg font-semibold mb-3 text-gray-900">📊 Récapitulatif global de paie</h3>
            
            {/* Légende des codes non-shifts */}
            {(() => {
              // Extract all codes from export data
              const codesSet = new Set();
              exportData.forEach(row => {
                if (row.nonShiftsStr) {
                  const matches = row.nonShiftsStr.match(/[A-Z]+(?=\s+\d+j)/g);
                  if (matches) {
                    matches.forEach(code => codesSet.add(code));
                  }
                }
              });
              
              if (codesSet.size === 0) return null;
              
              // Build legend mapping
              const legendMap = {
                'SS': 'Sans solde',
                'MAL': 'Malade',
                'CP': 'Congés payés',
                'ABS': 'Absence',
                'ABSNJ': 'Absence non justifiée',
                'RTT': 'RTT',
                'FORM': 'Formation',
                'CONGE': 'Congé'
              };
              
              const legendParts = Array.from(codesSet).map(code => 
                `${code} = ${legendMap[code] || '(à définir)'}`
              );
              
              return (
                <div className="text-xs text-gray-500 mb-3 italic">
                  * Légende : {legendParts.join(' • ')}
                </div>
              );
            })()}
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold">Employé</th>
                    <th className="px-2 py-2 text-center font-semibold">Nb j.<br/>trav.</th>
                    <th className="px-2 py-2 text-center font-semibold">Jours<br/>supp</th>
                    <th className="px-2 py-2 text-right font-semibold bg-blue-50">Total payé</th>
                    <th className="px-2 py-2 text-right font-semibold">Payées<br/>(hors sup/comp)</th>
                    <th className="px-2 py-2 text-right font-semibold">Compl<br/>+10%</th>
                    <th className="px-2 py-2 text-right font-semibold">Compl<br/>+25%</th>
                    <th className="px-2 py-2 text-right font-semibold">Supp<br/>+25%</th>
                    <th className="px-2 py-2 text-right font-semibold">Supp<br/>+50%</th>
                    <th className="px-2 py-2 text-center font-semibold">Férié</th>
                    <th className="px-2 py-2 text-left font-semibold">Non-shifts<br/>visibles</th>
                    <th className="px-2 py-2 text-left font-semibold">CP<br/>décomptés</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {exportData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-2 py-2 font-medium flex items-center gap-2">
                        {row.employeeName}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setSelectedEmployee(row.employee);
                            setSelectedAutoValues(row.autoValues);
                            setOverrideModalOpen(true);
                          }}
                          className="h-6 w-6 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                          title="Surcharger les valeurs"
                        >
                          <Edit3 className="w-3 h-3" />
                        </Button>
                        {row.override && (
                          <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded" title="Valeurs surchargées">
                            ⚠
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center">{row.nbJoursTravailles || 0}</td>
                      <td className="px-2 py-2 text-center text-red-600 font-semibold">{row.joursSupp || ''}</td>
                      <td className="px-2 py-2 text-right font-bold bg-blue-50">{row.totalPaid.toFixed(1)}h</td>
                      <td className="px-2 py-2 text-right">{row.payeesHorsSup.toFixed(1)}h</td>
                      <td className="px-2 py-2 text-right">{row.compl10 > 0 ? `${row.compl10.toFixed(1)}h` : ''}</td>
                      <td className="px-2 py-2 text-right">{row.compl25 > 0 ? `${row.compl25.toFixed(1)}h` : ''}</td>
                      <td className="px-2 py-2 text-right">{row.supp25 > 0 ? `${row.supp25.toFixed(1)}h` : ''}</td>
                      <td className="px-2 py-2 text-right">{row.supp50 > 0 ? `${row.supp50.toFixed(1)}h` : ''}</td>
                      <td className="px-2 py-2 text-center text-[10px] text-purple-700 whitespace-pre-line">{row.ferieStr || ''}</td>
                      <td className="px-2 py-2 text-[10px] whitespace-pre-line">{row.nonShiftsStr || ''}</td>
                      <td className="px-2 py-2 text-[10px] whitespace-pre-line">{row.cpStr || ''}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-200 font-bold">
                    <td className="px-2 py-2">TOTAL</td>
                    <td className="px-2 py-2 text-center">{totals.nbJoursTravailles}</td>
                    <td className="px-2 py-2"></td>
                    <td className="px-2 py-2 text-right bg-blue-100">{totals.totalPaid.toFixed(1)}h</td>
                    <td className="px-2 py-2 text-right">{totals.payeesHorsSup.toFixed(1)}h</td>
                    <td className="px-2 py-2 text-right">{totals.compl10 > 0 ? `${totals.compl10.toFixed(1)}h` : ''}</td>
                    <td className="px-2 py-2 text-right">{totals.compl25 > 0 ? `${totals.compl25.toFixed(1)}h` : ''}</td>
                    <td className="px-2 py-2 text-right">{totals.supp25 > 0 ? `${totals.supp25.toFixed(1)}h` : ''}</td>
                    <td className="px-2 py-2 text-right">{totals.supp50 > 0 ? `${totals.supp50.toFixed(1)}h` : ''}</td>
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

        {/* Modal d'override */}
        {selectedEmployee && selectedAutoValues && (
          <ExportOverrideModal
            open={overrideModalOpen}
            onOpenChange={setOverrideModalOpen}
            employee={selectedEmployee}
            monthKey={monthKey}
            autoValues={selectedAutoValues}
            existingOverride={overrides.find(o => o.employee_id === selectedEmployee.id)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}