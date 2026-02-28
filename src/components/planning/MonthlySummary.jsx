import React, { useState, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Edit2, RotateCcw, AlertCircle, Clock, Calendar, Coffee, Sun, Briefcase, Eye, EyeOff, Trash2 } from 'lucide-react';
import { useHiddenItems } from './useHiddenItems';
import { calculateMonthlyCPTotal } from './paidLeaveCalculations';
import { parseContractHours } from '@/components/utils/weeklyHoursCalculation';
import { calculateDayHours } from '@/components/utils/nonShiftHoursCalculation';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  calculateMonthlyRecap,
  applyManualOverrides,
  calculateShiftDuration as calcShiftDuration,
  parseHoursString
} from '@/components/utils/monthlyRecapCalculations';
import { resolveRecapFinal } from './resolveMonthlyPayrollValues';
import { getRecapExtras, upsertRecapExtras, clearRecapExtras } from './monthlyRecapExtrasOverrideService';
import { deleteRecapPersisted } from './monthlyRecapPersistedService';
import { useHoursDisplayMode } from '@/components/planning/useHoursDisplayMode';
import { formatHours } from '@/components/utils/hoursFormat';

/**
 * Récap mensuel avec support 3 modes de calcul
 *
 * MODES:
 * - disabled: Aucun calcul, affichage basique
 * - weekly: Calcul hebdomadaire des heures sup/complémentaires
 * - monthly: Lissage mensuel pour temps partiel
 *
 * Toutes les valeurs sont TOUJOURS modifiables manuellement.
 * Les champs modifiés sont visuellement distincts avec bouton reset.
 */
export default function MonthlySummary({
  employee,
  shifts,
  nonShiftEvents = [],
  nonShiftTypes = [],
  monthStart,
  monthEnd,
  holidayDates = [],
  cpPeriods = [],
  monthlyRecap = null,
  onRecapUpdate,
  currentUser,
  weeklyRecaps = [], // NOUVEAU: pour utiliser les overrides du BASE hebdomadaire
  disabled = false, // Mode lecture seule
  onClearEmployeeMonth = null // Callback to clear this employee's month
}) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const queryClient = useQueryClient();
  
  // Hidden items management
  const { hideItem, showItem, isHidden, showAll, hasHiddenItems, hiddenCount } = useHiddenItems(currentUser?.id);

  const year = monthStart.getFullYear();
  const month = monthStart.getMonth(); // 0-indexed for calculation engine
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`; // e.g. "2026-02"

  // Fetch calculation mode from AppSettings
  const { data: calculationSettings = [] } = useQuery({
    queryKey: ['appSettings', 'planning_calculation_mode'],
    queryFn: () => base44.entities.AppSettings.filter({ setting_key: 'planning_calculation_mode' }),
    staleTime: 5 * 60 * 1000
  });

  const calculationMode = calculationSettings[0]?.planning_calculation_mode || 'disabled';
  const hoursMode = useHoursDisplayMode();

  // Fetch MonthlyRecapPersisted — clé UNIQUE par (monthKey, employee.id) pour éviter les caches partagés
  const { data: recapPersisted = null } = useQuery({
    queryKey: ['monthlyRecapPersisted', monthKey, employee.id],
    queryFn: async () => {
      const results = await base44.entities.MonthlyRecapPersisted.filter({ month_key: monthKey, employee_id: employee.id });
      return results[0] || null;
    },
    staleTime: 0,
    enabled: !!employee?.id && !!monthKey
  });

  // Fetch MonthlyRecapExtrasOverride — clé UNIQUE par (monthKey, employee.id)
  const { data: recapExtras = null } = useQuery({
    queryKey: ['recapExtrasOverride', monthKey, employee.id],
    queryFn: async () => {
      const results = await base44.entities.MonthlyRecapExtrasOverride.filter({ month_key: monthKey, employee_id: employee.id });
      return results[0] || null;
    },
    staleTime: 0,
    enabled: !!employee?.id && !!monthKey
  });

  // Calculate automatic values using the calculation engine
  const calculatedRecap = useMemo(() => {
    // Convert holidayDates array of objects to array of date strings
    const holidayDateStrings = holidayDates.map(h => h.date || h);

    // Filter WeeklyRecaps for this employee
    const employeeWeeklyRecaps = weeklyRecaps.filter(wr => wr.employee_id === employee.id);

    return calculateMonthlyRecap(
      calculationMode,
      employee,
      shifts,
      nonShiftEvents,
      nonShiftTypes,
      holidayDateStrings,
      year,
      month,
      employeeWeeklyRecaps // Pass employee's weekly recaps
    );
  }, [calculationMode, employee, shifts, nonShiftEvents, nonShiftTypes, holidayDates, year, month, weeklyRecaps]);

  // 🎯 SOURCE DE VÉRITÉ UNIQUE : (monthKey, employee.id) — pas de liste, pas de find()
  const recapResolved = useMemo(() => {
    return resolveRecapFinal(calculatedRecap, recapPersisted, recapExtras);
  }, [calculatedRecap, recapPersisted, recapExtras]);

  // Adapter recapResolved vers la structure attendue par l'UI (noms camelCase legacy)
  const recapWithOverrides = useMemo(() => {
    return {
      ...calculatedRecap,
      // Jours
      workedDays:             recapResolved.jours_travailles,
      expectedDays:           recapResolved.jours_prevus,
      extraDays:              recapResolved.jours_supp,
      // Heures
      workedHours:            recapResolved.worked_hours,
      // Complémentaires
      complementaryHours10:   recapResolved.complementary_hours_10,
      complementaryHours25:   recapResolved.complementary_hours_25,
      totalComplementaryHours: recapResolved.complementary_hours_ui,
      // Supplémentaires
      overtimeHours25:        recapResolved.overtime_hours_25,
      overtimeHours50:        recapResolved.overtime_hours_50,
      totalOvertimeHours:     recapResolved.overtime_hours_ui,
      // Fériés
      holidaysWorkedDays:     recapResolved.ferie_jours,
      holidaysWorkedHours:    recapResolved.ferie_heures,
      // CP
      cpDays:                 recapResolved.cp_decomptes,
      // Indicateurs
      overriddenFields: [],
      hasRecapOverride: recapResolved.hasRecapOverride,
    };
  }, [recapResolved, calculatedRecap]);

  // ⚠️ Auto-persist SUPPRIMÉ intentionnellement.
  // MonthlyRecapPersisted est écrit UNIQUEMENT via la modale de saisie manuelle.
  // Le récap auto est toujours calculé live depuis les shifts (calculatedRecap via useMemo).

  // CP days from periods (for fallback in disabled mode)
  const autoCPDays = calculateMonthlyCPTotal(cpPeriods, monthStart, monthEnd);

  // Final values to display
  const {
    expectedDays,
    workedDays,
    extraDays,
    contractMonthlyHours,
    adjustedContractHours,
    workedHours,
    isPartTime,
    overtimeHours25,
    overtimeHours50,
    totalOvertimeHours,
    complementaryHours10,
    complementaryHours25,
    totalComplementaryHours,
    nonShiftsByType,
    holidaysWorkedDays,
    holidaysWorkedHours,
    eligibleForHolidayPay,
    cpDays,
    overriddenFields = []
  } = recapWithOverrides;

  // Calculate paid hours (contract hours - non-shifts impacting payroll)
  const paidHours = useMemo(() => {
    // Use monthly contract hours from employee record
    const monthlyContractHours = parseContractHours(employee.contract_hours);
    if (!monthlyContractHours) return null;

    // CRITICAL: Filter non-shifts for THIS employee only
    const employeeNonShifts = nonShiftEvents.filter(ns => ns.employee_id === employee.id);

    // Get day-specific hours from weekly_schedule if available
    const getDailyHoursForDate = (dateStr) => {
      const date = new Date(dateStr);
      const dayIndex = date.getDay(); // 0=Sunday, 1=Monday, etc.
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayName = dayNames[dayIndex];

      // Priority 1: Check weekly_schedule for specific day
      if (employee.weekly_schedule?.[dayName]) {
        const dayConfig = employee.weekly_schedule[dayName];
        if (dayConfig.worked) {
          return dayConfig.hours || 0;
        } else {
          return 0; // Not a working day
        }
      }

      // Priority 2: Fallback to average daily hours
      const weeklyHours = parseContractHours(employee.contract_hours_weekly);
      const workDaysPerWeek = employee.work_days_per_week || 5;
      return weeklyHours / workDaysPerWeek;
    };

    // Calculate total deductions from non-shifts impacting payroll FOR THIS EMPLOYEE
    let totalDeduction = 0;
    const deductionDetails = [];
    
    employeeNonShifts.forEach(ns => {
      const nsType = nonShiftTypes.find(t => t.id === ns.non_shift_type_id);
      if (nsType?.impacts_payroll === true) {
        const dailyHours = getDailyHoursForDate(ns.date);
        totalDeduction += dailyHours;
        deductionDetails.push({
          date: ns.date,
          type: nsType.label,
          code: nsType.code,
          dayOfWeek: new Date(ns.date).toLocaleDateString('fr-FR', { weekday: 'long' }),
          hoursDeducted: dailyHours
        });
      }
    });

    const result = monthlyContractHours - totalDeduction;
    return Math.max(0, result); // Never go below 0
  }, [employee.id, employee.contract_hours, employee.contract_hours_weekly, employee.work_days_per_week, employee.weekly_schedule, nonShiftEvents, nonShiftTypes, year, month]);

  // Use CP from calculation or fallback
  const displayCPDays = cpDays ?? autoCPDays ?? 0;

  const hasManualOverride = recapResolved.hasRecapOverride;

  // Mode badge colors
  const getModeColor = () => {
    if (calculationMode === 'disabled') return 'bg-gray-400';
    if (calculationMode === 'weekly') return 'bg-blue-500';
    return 'bg-purple-500';
  };

  const getModeLabel = () => {
    if (calculationMode === 'disabled') return 'Manuel';
    if (calculationMode === 'weekly') return 'Hebdo';
    return 'Mensuel';
  };

  // Check if a field is overridden
  const isOverridden = (fieldName) => overriddenFields.includes(fieldName);

  // Render value with override indicator
  // isHours: if true, format with hoursMode; otherwise plain number
  const renderValue = (value, fieldName, unit = '', decimals = 0, isHours = false) => {
    const isOvr = isOverridden(fieldName);
    let displayVal;
    if (value === null || value === undefined) {
      displayVal = '-';
    } else if (isHours && typeof value === 'number') {
      displayVal = formatHours(value, hoursMode);
    } else if (typeof value === 'number') {
      displayVal = value.toFixed(decimals) + unit;
    } else {
      displayVal = value + unit;
    }

    return (
      <span className={cn(isOvr && 'text-blue-700 font-semibold')}>
        {displayVal}
        {isOvr && <span className="text-[8px] ml-0.5 text-blue-500">*</span>}
      </span>
    );
  };

  // Hideable item wrapper component
  const HideableItem = ({ itemKey, children, className = "" }) => {
    const hidden = isHidden(itemKey);
    const [hovering, setHovering] = useState(false);

    if (hidden) {
      return (
        <div className={cn("mb-2 pb-2", className)}>
          {!disabled && (
            <button
              onClick={() => showItem(itemKey)}
              className="w-full py-1.5 px-2 bg-gray-100 hover:bg-gray-200 rounded text-[9px] text-gray-500 flex items-center justify-center gap-1 transition-colors"
            >
              <EyeOff className="w-3 h-3" />
              Élément masqué - Cliquer pour afficher
            </button>
          )}
        </div>
      );
    }

    return (
      <div
        className={cn("relative group/hide mb-2 pb-2", className)}
        onMouseEnter={() => !disabled && setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        {hovering && !disabled && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              hideItem(itemKey);
            }}
            className="absolute -left-1 top-1/2 -translate-y-1/2 z-10 p-0.5 bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-100 transition-colors"
            title="Masquer cet élément (visuel uniquement)"
          >
            <Eye className="w-3 h-3 text-gray-500" />
          </button>
        )}
        {children}
      </div>
    );
  };

  return (
    <>
      <div className={cn(
        "px-2 py-3 text-center relative group border-t-2 border-gray-300",
        hasManualOverride && "bg-blue-50",
        calculationMode !== 'disabled' && "bg-gradient-to-b from-gray-50 to-white"
      )}>
        {/* Edit button */}
        {!disabled && (
          <button
            onClick={() => setShowEditDialog(true)}
            className="absolute top-1 right-1 p-1 rounded hover:bg-gray-200 transition-colors opacity-0 group-hover:opacity-100"
            title="Éditer le récapitulatif"
          >
            <Edit2 className="w-3 h-3 text-blue-600" />
          </button>
        )}

        {/* Clear employee month button */}
        {!disabled && onClearEmployeeMonth && (
          <button
            onClick={(e) => { e.stopPropagation(); onClearEmployeeMonth(); }}
            className="absolute bottom-1 right-1 p-1 rounded hover:bg-red-100 transition-colors opacity-0 group-hover:opacity-100"
            title="Vider le mois de cet employé (shifts, non-shifts, CP, récaps)"
          >
            <Trash2 className="w-3 h-3 text-red-500" />
          </button>
        )}
        
        {/* Show all button (if items hidden) */}
        {!disabled && hasHiddenItems && (
          <button
            onClick={showAll}
            className="absolute top-1 right-10 p-1 rounded hover:bg-gray-200 transition-colors text-[9px] text-blue-600 flex items-center gap-1"
            title={`${hiddenCount} élément(s) masqué(s)`}
          >
            <EyeOff className="w-3 h-3" />
            <span className="hidden lg:inline">Tout afficher</span>
          </button>
        )}

        {/* Mode indicator */}
        <div className="absolute top-1 left-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Badge className={cn("text-[8px] px-1 py-0", getModeColor())}>
                  {getModeLabel()}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  Mode de calcul: {calculationMode === 'disabled' ? 'Désactivé (manuel)' :
                    calculationMode === 'weekly' ? 'Hebdomadaire' : 'Mensuel (lissage)'}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="text-[10px] font-bold text-gray-600 uppercase mb-2 mt-3">
          Récap mois
        </div>

        {/* SECTION 1: Days */}
        {calculationMode !== 'disabled' ? (
          <HideableItem itemKey="workedDays" className="border-b border-gray-200">
            <div className="flex items-center justify-center gap-1 text-xs text-gray-700">
              <Calendar className="w-3 h-3" />
              <span className="font-semibold">{renderValue(workedDays, 'workedDays', '', 0)}</span>
              <span className="text-gray-500">/ {expectedDays || '-'} j</span>
            </div>
            {extraDays > 0 && (
              <div className="text-[10px] text-orange-600 font-medium">
                +{renderValue(extraDays, 'extraDays', ' j sup', 0)}
              </div>
            )}
          </HideableItem>
        ) : (
          <HideableItem itemKey="workedDays" className="">
            <div className="text-xs text-gray-700">
              <span className="font-semibold">{renderValue(workedDays, 'workedDays', '', 0)}</span> jour{(workedDays || 0) > 1 ? 's' : ''}
            </div>
          </HideableItem>
        )}

        {/* SECTION 2: Hours */}
        {paidHours !== null && (
          <HideableItem itemKey="paidHours">
            <div className="text-[10px] text-gray-500">
              Payées (hors sup/comp): {formatHours(paidHours, hoursMode)}
            </div>
          </HideableItem>
        )}

        {/* SECTION 3: Overtime / Complementary Hours */}
        {calculationMode !== 'disabled' && (
          <>
            {isPartTime ? (
              // Part-time: Heures complémentaires (only show if >= 0.05)
              totalComplementaryHours >= 0.05 && (
                <HideableItem itemKey="complementaryHours" className="border-b border-gray-200">
                  <div className="bg-green-50 rounded p-1.5">
                    <div className="text-[10px] font-bold text-green-800 mb-0.5 flex items-center justify-center gap-1">
                      <Clock className="w-3 h-3" />
                      H. Complémentaires
                    </div>
                    <div className="text-sm font-bold text-green-700">
                      {renderValue(totalComplementaryHours, 'totalComplementaryHours', '', 0, true)}
                    </div>
                    <div className="text-[9px] text-green-600 space-y-0.5">
                      {complementaryHours10 > 0 && (
                        <div>+10%: {renderValue(complementaryHours10, 'complementaryHours10', '', 0, true)}</div>
                      )}
                      {complementaryHours25 > 0 && (
                        <div>+25%: {renderValue(complementaryHours25, 'complementaryHours25', '', 0, true)}</div>
                      )}
                    </div>
                    {calculatedRecap?.complementaryExcessWarning > 0 && (
                      <div className="mt-1 text-[8px] text-orange-700 bg-orange-50 rounded px-1 py-0.5 leading-tight">
                        ⚠️ +{calculatedRecap.complementaryExcessWarning.toFixed(1)}h au-delà du 1/3
                      </div>
                    )}
                  </div>
                </HideableItem>
              )
            ) : (
              // Full-time: Heures supplémentaires (only show if >= 0.05)
              totalOvertimeHours >= 0.05 && (
                <HideableItem itemKey="overtimeHours" className="border-b border-gray-200">
                  <div className="bg-orange-50 rounded p-1.5">
                    <div className="text-[10px] font-bold text-orange-800 mb-0.5 flex items-center justify-center gap-1">
                      <Briefcase className="w-3 h-3" />
                      H. Supplémentaires
                    </div>
                    <div className="text-sm font-bold text-orange-700">
                      {renderValue(totalOvertimeHours, 'totalOvertimeHours', '', 0, true)}
                    </div>
                    <div className="text-[9px] text-orange-600 space-y-0.5">
                      {overtimeHours25 > 0 && (
                        <div>+25%: {renderValue(overtimeHours25, 'overtimeHours25', '', 0, true)}</div>
                      )}
                      {overtimeHours50 > 0 && (
                        <div>+50%: {renderValue(overtimeHours50, 'overtimeHours50', '', 0, true)}</div>
                      )}
                    </div>
                  </div>
                </HideableItem>
              )
            )}
          </>
        )}

        {/* SECTION 4: Holidays worked */}
        {calculationMode !== 'disabled' && holidaysWorkedDays > 0 && eligibleForHolidayPay && (
          <HideableItem itemKey="holidaysWorked">
            <div className="text-[10px]">
              <div className="flex items-center justify-center gap-1 text-red-700 font-medium">
                <Sun className="w-3 h-3" />
                Jours fériés: {renderValue(holidaysWorkedDays, 'holidaysWorkedDays', '', 0)}j
                ({renderValue(holidaysWorkedHours, 'holidaysWorkedHours', '', 0, true)})
              </div>
              <div className="text-[9px] text-red-600">
                Éligible majoration férié
              </div>
            </div>
          </HideableItem>
        )}

        {/* SECTION 5: Non-shifts summary (filtered by visible_in_recap) */}
        {calculationMode !== 'disabled' && (() => {
          // Filter non-shifts to only show those with visible_in_recap === true
          const visibleStatuses = nonShiftTypes.filter(t => t.visible_in_recap === true);
          
          // Calculate occurrences per status (unique days per employee)
          const employeeNonShifts = nonShiftEvents.filter(ns => ns.employee_id === employee.id);
          const occurrencesByStatus = {};
          
          employeeNonShifts.forEach(ns => {
            const statusId = ns.non_shift_type_id;
            if (!occurrencesByStatus[statusId]) {
              occurrencesByStatus[statusId] = new Set();
            }
            occurrencesByStatus[statusId].add(ns.date);
          });
          
          // Build display lines for visible statuses only
          const displayLines = visibleStatuses
            .map(status => {
              const uniqueDays = occurrencesByStatus[status.id]?.size || 0;
              return {
                code: status.code || status.label?.substring(0, 3).toUpperCase(),
                statusId: status.id,
                count: uniqueDays
              };
            })
            .filter(line => line.count > 0);
          
          return displayLines.length > 0 && (
            <div className="mb-2 text-[9px] text-gray-600 space-y-0.5">
              {displayLines.map((line, idx) => (
                <HideableItem key={idx} itemKey={`nonShift_${line.statusId}`}>
                  <div className="flex items-center justify-center gap-1">
                    <span className="font-mono bg-gray-100 px-1 rounded">{line.code}</span>
                    <span>{line.count}j</span>
                  </div>
                </HideableItem>
              ))}
            </div>
          );
        })()}

        {/* SECTION 6: CP décomptés (always show if CP periods exist) */}
        {cpPeriods.length > 0 && displayCPDays > 0 && (
          <HideableItem itemKey="cpDays" className="mt-2 pt-2 border-t border-gray-200">
            <div className="text-[10px] font-semibold text-green-700 flex items-center justify-center gap-1">
              <Coffee className="w-3 h-3" />
              CP décomptés: {renderValue(displayCPDays, 'cpDays', ' j', 0)}
            </div>
          </HideableItem>
        )}

        {/* DEBUG — source des données (temporaire) */}
        <div className="mt-2 pt-1 border-t border-dashed border-gray-300 text-[8px] text-gray-400 text-left space-y-0.5">
          <div>src: <span className={cn(
            "font-mono",
            recapResolved._source === 'auto' ? 'text-gray-400' : 'text-blue-600 font-bold'
          )}>{recapResolved._source}</span></div>
          <div>HC10: {recapResolved.complementary_hours_10?.toFixed(2) ?? '-'} HC25: {recapResolved.complementary_hours_25?.toFixed(2) ?? '-'}</div>
          <div>HS25: {recapResolved.overtime_hours_25?.toFixed(2) ?? '-'} HS50: {recapResolved.overtime_hours_50?.toFixed(2) ?? '-'}</div>
          {recapResolved._source !== 'auto' && (
            <div className="text-blue-500">⚡ override actif</div>
          )}
        </div>

      </div>

      <EditMonthlyRecapDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        employee={employee}
        year={year}
        month={month + 1}
        calculatedValues={calculatedRecap}
        currentRecap={monthlyRecap}
        onRecapUpdate={onRecapUpdate}
        calculationMode={calculationMode}
        autoCPDays={autoCPDays}
        monthKey={monthKey}
        resetVersion={undefined}
      />
    </>
  );
}

function EditMonthlyRecapDialog({
  open,
  onOpenChange,
  employee,
  year,
  month,
  calculatedValues,
  currentRecap,
  onRecapUpdate,
  calculationMode,
  autoCPDays,
  monthKey,
  resetVersion
}) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({});
  const [loadingExtras, setLoadingExtras] = useState(false);

  // Clé pour invalider les queries après save
  const queryKey = ['recapExtrasOverride', monthKey, employee?.id];

  React.useEffect(() => {
    if (!open || !employee?.id) return;
    setLoadingExtras(true);

    // Charger en parallèle : MonthlyRecap (legacy heures) + MonthlyRecapExtrasOverride (jours/CP/fériés)
    Promise.all([
      base44.entities.MonthlyRecapExtrasOverride.filter({ month_key: monthKey, employee_id: employee.id }),
      base44.entities.MonthlyRecapPersisted.filter({ month_key: monthKey, employee_id: employee.id })
    ]).then(([extrasArr, persistedArr]) => {
      const extras = extrasArr[0] || null;
      const persisted = persistedArr[0] || null;

      setFormData({
        // Jours (depuis extras override)
        jours_prevus:   extras?.jours_prevus ?? '',
        jours_travailles: extras?.jours_travailles ?? '',
        jours_supp:     extras?.jours_supp ?? '',
        // Heures (depuis persisted override)
        worked_hours:   persisted?.worked_hours ?? '',
        // Complémentaires
        complementary_10: persisted?.complementary_hours_10 ?? '',
        complementary_25: persisted?.complementary_hours_25 ?? '',
        // Supplémentaires
        overtime_25:    persisted?.overtime_hours_25 ?? '',
        overtime_50:    persisted?.overtime_hours_50 ?? '',
        // Fériés
        ferie_jours:    extras?.ferie_jours ?? '',
        ferie_heures:   extras?.ferie_heures ?? '',
        // CP
        cp_decomptes:   extras?.cp_decomptes ?? '',
        // Payées
        payees_hors_sup_comp: extras?.payees_hors_sup_comp ?? '',
        // Non-shifts / Notes
        non_shifts_visibles: extras?.non_shifts_visibles ?? '',
        notes: extras?.notes || ''
      });
    }).finally(() => setLoadingExtras(false));
  }, [open, employee?.id, monthKey]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const toNum = (v) => (v !== '' && v !== null && v !== undefined ? parseFloat(v) : null);
      const toStr = (v) => (v !== '' && v !== null && v !== undefined ? String(v) : null);

      // Détecter si les extras sont tous vides (=> DELETE plutôt qu'upsert null)
      const extrasFields = ['jours_travailles', 'jours_prevus', 'jours_supp', 'ferie_jours', 'ferie_heures', 'cp_decomptes', 'payees_hors_sup_comp', 'non_shifts_visibles', 'notes'];
      const hasAnyExtras = extrasFields.some(f => formData[f] !== '' && formData[f] !== null && formData[f] !== undefined);

      // Détecter si les heures sont toutes vides
      const hoursFields = ['worked_hours', 'complementary_10', 'complementary_25', 'overtime_25', 'overtime_50'];
      const hasAnyHours = hoursFields.some(v => formData[v] !== '' && formData[v] !== null && formData[v] !== undefined);

      // 1) Extras : upsert si au moins 1 champ rempli, sinon DELETE
      if (hasAnyExtras) {
        await upsertRecapExtras(monthKey, employee.id, {
          jours_travailles:     toNum(formData.jours_travailles),
          jours_prevus:         toNum(formData.jours_prevus),
          jours_supp:           toNum(formData.jours_supp),
          ferie_jours:          toNum(formData.ferie_jours),
          ferie_heures:         toNum(formData.ferie_heures),
          cp_decomptes:         toNum(formData.cp_decomptes),
          payees_hors_sup_comp: toNum(formData.payees_hors_sup_comp),
          non_shifts_visibles:  toStr(formData.non_shifts_visibles),
          notes:                toStr(formData.notes)
        }, resetVersion);
      } else {
        await clearRecapExtras(monthKey, employee.id);
      }

      // 2) Heures : upsert si au moins 1 champ rempli, sinon DELETE
      if (hasAnyHours) {
        const c10 = toNum(formData.complementary_10) || 0;
        const c25 = toNum(formData.complementary_25) || 0;
        const o25 = toNum(formData.overtime_25) || 0;
        const o50 = toNum(formData.overtime_50) || 0;

        await base44.functions.invoke('saveSingleMonthlyRecap', {
          month_key: monthKey,
          employee_id: employee.id,
          worked_hours:           toNum(formData.worked_hours) ?? undefined,
          complementary_hours_10: c10,
          complementary_hours_25: c25,
          overtime_hours_25:      o25,
          overtime_hours_50:      o50,
          complementary_hours_ui: c10 + c25,
          overtime_hours_ui:      o25 + o50
        });
      } else {
        await deleteRecapPersisted(monthKey, employee.id);
      }
    },
    onSuccess: () => {
      // Invalider TOUTES les queries utilisées par la carte récap ET l'export
      queryClient.invalidateQueries({ queryKey: ['recapExtrasOverride', monthKey] });
      queryClient.invalidateQueries({ queryKey: ['monthlyRecapsPersisted', monthKey] });
      queryClient.invalidateQueries({ queryKey: ['exportOverrides', monthKey] });
      queryClient.invalidateQueries({ queryKey: ['monthlyExportOverrides', monthKey] });
      if (onRecapUpdate) onRecapUpdate();
      toast.success('Récapitulatif enregistré');
      onOpenChange(false);
    },
    onError: (e) => toast.error('Erreur: ' + e.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await Promise.all([
        deleteRecapPersisted(monthKey, employee.id),
        clearRecapExtras(monthKey, employee.id)
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recapExtrasOverride', monthKey] });
      queryClient.invalidateQueries({ queryKey: ['monthlyRecapsPersisted', monthKey] });
      queryClient.invalidateQueries({ queryKey: ['exportOverrides', monthKey] });
      queryClient.invalidateQueries({ queryKey: ['monthlyExportOverrides', monthKey] });
      // Forcer recalcul auto : invalider aussi shifts + weekly recaps
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.invalidateQueries({ queryKey: ['allWeeklyRecaps'] });
      queryClient.invalidateQueries({ queryKey: ['allMonthlyRecaps'] });
      setFormData({});
      if (onRecapUpdate) onRecapUpdate();
      toast.success('Modifications supprimées');
      onOpenChange(false);
    },
    onError: (e) => toast.error('Erreur lors de la réinitialisation: ' + e.message)
  });

  const handleSave = () => {
    saveMutation.mutate();
  };

  const resetField = (fieldName) => {
    setFormData(prev => ({ ...prev, [fieldName]: '' }));
  };

  const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

  const isPartTime = employee.work_time_type === 'part_time';

  // Get calculated value for display
  const getCalcValue = (fieldName) => {
    const mapping = {
      jours_prevus:         'expectedDays',
      jours_travailles:     'workedDays',
      jours_supp:           'extraDays',
      worked_hours:         'workedHours',
      complementary_10:     'complementaryHours10',
      complementary_25:     'complementaryHours25',
      overtime_25:          'overtimeHours25',
      overtime_50:          'overtimeHours50',
      ferie_jours:          'holidaysWorkedDays',
      ferie_heures:         'holidaysWorkedHours',
      cp_decomptes:         'cpDays',
      payees_hors_sup_comp: 'workedHours'
    };

    const calcField = mapping[fieldName];
    const value = calculatedValues?.[calcField];

    if (fieldName === 'cp_decomptes' && (value === null || value === undefined)) {
      return autoCPDays || 0;
    }

    return value !== null && value !== undefined
      ? (typeof value === 'number' ? value.toFixed(1) : value)
      : '-';
  };

  // Input with reset button
  const FieldInput = ({ name, label, step = '0.1', disabled = false }) => {
    const hasValue = formData[name] !== '' && formData[name] !== null && formData[name] !== undefined;
    const calcValue = getCalcValue(name);

    return (
      <div>
        <Label className="text-xs text-gray-700 flex items-center justify-between">
          <span>{label}</span>
          {hasValue && (
            <button
              type="button"
              onClick={() => resetField(name)}
              className="text-blue-600 hover:text-blue-800 p-0.5"
              title="Réinitialiser au calcul auto"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
        </Label>
        <Input
          type="number"
          step={step}
          min="0"
          placeholder={calculationMode !== 'disabled' ? `Auto: ${calcValue}` : 'Saisir...'}
          value={formData[name]}
          onChange={(e) => setFormData({...formData, [name]: e.target.value})}
          disabled={disabled}
          className={cn(
            "mt-1",
            hasValue && "border-blue-400 bg-blue-50"
          )}
        />
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-blue-600">
            Éditer le récapitulatif mensuel
          </DialogTitle>
          <p className="text-sm text-gray-600">
            {employee.first_name} {employee.last_name} - {monthNames[month - 1]} {year}
          </p>
          <Badge className={cn("w-fit mt-1",
            calculationMode === 'disabled' ? 'bg-gray-400' :
            calculationMode === 'weekly' ? 'bg-blue-500' : 'bg-purple-500'
          )}>
            Mode: {calculationMode === 'disabled' ? 'Manuel' : calculationMode === 'weekly' ? 'Hebdomadaire' : 'Mensuel'}
          </Badge>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Info box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-gray-700">
            <strong>Mode de saisie :</strong> Les champs vides utilisent le calcul automatique.
            Saisissez une valeur pour la remplacer. L'icône <RotateCcw className="w-3 h-3 inline" /> réinitialise au calcul.
          </div>

          {loadingExtras && (
            <div className="text-center py-4 text-gray-400 text-sm">Chargement des surcharges...</div>
          )}

          {/* Section 1: Days */}
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-600" />
              Jours
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <FieldInput name="jours_prevus" label="Jours prévus" step="1" />
              <FieldInput name="jours_travailles" label="Jours travaillés" step="1" />
              <FieldInput name="jours_supp" label="Jours supplémentaires" step="1" />
            </div>
          </div>

          {/* Section 2: Hours */}
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-600" />
              Heures effectuées
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <FieldInput name="worked_hours" label="Heures effectuées" />
              <FieldInput name="payees_hors_sup_comp" label="Payées (hors sup/comp)" />
            </div>
          </div>

          {/* Section 3: Overtime / Complementary */}
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-gray-600" />
              {isPartTime ? 'Heures complémentaires (temps partiel)' : 'Heures supplémentaires (temps plein)'}
            </h3>

            {isPartTime ? (
              <div className="grid grid-cols-2 gap-4">
                <FieldInput name="complementary_10" label="H. compl. +10%" />
                <FieldInput name="complementary_25" label="H. compl. +25%" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <FieldInput name="overtime_25" label="H. sup. +25%" />
                <FieldInput name="overtime_50" label="H. sup. +50%" />
              </div>
            )}

            <p className="text-[10px] text-gray-500 mt-2">
              {isPartTime
                ? 'Temps partiel: +10% jusqu\'à 10% du contrat, +25% au-delà. Max 1/3 du contrat.'
                : 'Temps plein: +25% de 36h à 43h/sem, +50% au-delà de 43h/sem.'}
            </p>
          </div>

          {/* Section 4: Holidays */}
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Sun className="w-4 h-4 text-gray-600" />
              Jours fériés travaillés
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <FieldInput name="ferie_jours" label="Nombre de jours" step="1" />
              <FieldInput name="ferie_heures" label="Heures fériées" />
            </div>
            <p className="text-[10px] text-gray-500 mt-2">
              Majoration applicable après 8 mois d'ancienneté.
            </p>
          </div>

          {/* Section 5: CP */}
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Coffee className="w-4 h-4 text-gray-600" />
              Congés payés
            </h3>
            <div className="w-1/3">
              <FieldInput name="cp_decomptes" label="CP décomptés" step="0.5" />
            </div>
          </div>

          {/* Section 6: Non-shifts visibles */}
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-gray-600" />
              Non-shifts visibles (texte libre)
            </h3>
            <div className="flex items-start gap-2">
              <textarea
                className="flex-1 mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                rows={2}
                placeholder="Auto (calculé)..."
                value={formData.non_shifts_visibles ?? ''}
                onChange={(e) => setFormData({...formData, non_shifts_visibles: e.target.value || null})}
              />
              {formData.non_shifts_visibles && (
                <button type="button" onClick={() => setFormData({...formData, non_shifts_visibles: null})}
                  className="mt-1 p-1 text-blue-500 hover:text-blue-700" title="Réinitialiser">
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Section 7: Notes */}
          <div className="border rounded-lg p-4">
            <Label className="text-xs text-gray-700">Notes / Commentaires</Label>
            <textarea
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
              rows={3}
              placeholder="Commentaires sur ce mois..."
              value={formData.notes ?? ''}
              onChange={(e) => setFormData({...formData, notes: e.target.value || null})}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              type="button"
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {saveMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
            <Button
              type="button"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-50"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Tout réinitialiser
            </Button>
            <Button
              type="button"
              onClick={() => onOpenChange(false)}
              variant="outline"
            >
              Annuler
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}