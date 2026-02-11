import React, { useState, useMemo, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { RotateCcw, AlertCircle, Clock, Calendar, Coffee, Sun, Briefcase, Check, X } from 'lucide-react';
import { calculateMonthlyCPTotal } from './paidLeaveCalculations';
import { parseContractHours } from '@/components/utils/weeklyHoursCalculation';
import { calculateDayHours } from '@/components/utils/nonShiftHoursCalculation';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import {
  calculateMonthlyRecap,
  applyManualOverrides,
  calculateShiftDuration as calcShiftDuration,
  parseHoursString
} from '@/components/utils/monthlyRecapCalculations';

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
  onRecapUpdate
}) {
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const queryClient = useQueryClient();

  const year = monthStart.getFullYear();
  const month = monthStart.getMonth(); // 0-indexed for calculation engine

  // Fetch calculation mode from AppSettings
  const { data: calculationSettings = [] } = useQuery({
    queryKey: ['appSettings', 'planning_calculation_mode'],
    queryFn: () => base44.entities.AppSettings.filter({ setting_key: 'planning_calculation_mode' }),
    staleTime: 5 * 60 * 1000
  });

  const calculationMode = calculationSettings[0]?.planning_calculation_mode || 'disabled';

  // Calculate automatic values using the calculation engine
  const calculatedRecap = useMemo(() => {
    // Convert holidayDates array of objects to array of date strings
    const holidayDateStrings = holidayDates.map(h => h.date || h);

    return calculateMonthlyRecap(
      calculationMode,
      employee,
      shifts,
      nonShiftEvents,
      nonShiftTypes,
      holidayDateStrings,
      year,
      month
    );
  }, [calculationMode, employee, shifts, nonShiftEvents, nonShiftTypes, holidayDates, year, month]);

  // Apply manual overrides from monthlyRecap entity
  const recapWithOverrides = useMemo(() => {
    if (!monthlyRecap) return { ...calculatedRecap, overriddenFields: [] };

    const overrides = {
      expectedDays: monthlyRecap.manual_expected_days,
      workedDays: monthlyRecap.manual_days_worked,
      extraDays: monthlyRecap.manual_extra_days,
      contractMonthlyHours: monthlyRecap.manual_contract_hours,
      adjustedContractHours: monthlyRecap.manual_adjusted_hours,
      workedHours: monthlyRecap.manual_total_hours,
      overtimeHours25: monthlyRecap.manual_overtime_25,
      overtimeHours50: monthlyRecap.manual_overtime_50,
      totalOvertimeHours: monthlyRecap.manual_total_overtime,
      complementaryHours10: monthlyRecap.manual_complementary_10,
      complementaryHours25: monthlyRecap.manual_complementary_25,
      totalComplementaryHours: monthlyRecap.manual_total_complementary,
      holidaysWorkedDays: monthlyRecap.manual_holidays_days,
      holidaysWorkedHours: monthlyRecap.manual_holidays_hours,
      cpDays: monthlyRecap.manual_cp_days
    };

    return applyManualOverrides(calculatedRecap, overrides);
  }, [calculatedRecap, monthlyRecap]);

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

    // Debug log
    console.log(`
💰 Payées (hors sup/comp) - ${employee.first_name} ${employee.last_name}
  Contract: ${monthlyContractHours.toFixed(2)}h | Non-shifts: ${employeeNonShifts.length} (${deductionDetails.length} impact paie)
  Déductions: ${totalDeduction.toFixed(2)}h | Final: ${Math.max(0, monthlyContractHours - totalDeduction).toFixed(2)}h
${deductionDetails.length > 0 ? `  Détail: ${deductionDetails.map(d => `${d.date} ${d.code} ${d.hoursDeducted.toFixed(2)}h`).join(', ')}` : ''}`);

    const result = monthlyContractHours - totalDeduction;
    return Math.max(0, result); // Never go below 0
  }, [employee.id, employee.contract_hours, employee.contract_hours_weekly, employee.work_days_per_week, employee.weekly_schedule, nonShiftEvents, nonShiftTypes, year, month]);

  // Use CP from calculation or fallback
  const displayCPDays = cpDays ?? autoCPDays ?? 0;

  const hasManualOverride = overriddenFields.length > 0 || !!monthlyRecap;

  // Mutation for saving a single field
  const saveFieldMutation = useMutation({
    mutationFn: async ({ field, value }) => {
      const data = { [field]: value === '' || value === null ? null : value };
      
      if (monthlyRecap?.id) {
        return await base44.entities.MonthlyRecap.update(monthlyRecap.id, data);
      } else {
        return await base44.entities.MonthlyRecap.create({
          employee_id: employee.id,
          employee_name: `${employee.first_name} ${employee.last_name}`,
          year,
          month: month + 1,
          month_key: `${year}-${String(month + 1).padStart(2, '0')}`,
          reset_version: monthlyRecap?.reset_version || 0,
          ...data
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allMonthlyRecaps'] });
      if (onRecapUpdate) onRecapUpdate();
      setEditingField(null);
      setEditValue('');
    }
  });

  // Mutation for resetting a single field
  const resetFieldMutation = useMutation({
    mutationFn: async (field) => {
      if (monthlyRecap?.id) {
        return await base44.entities.MonthlyRecap.update(monthlyRecap.id, { [field]: null });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allMonthlyRecaps'] });
      if (onRecapUpdate) onRecapUpdate();
    }
  });

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

  // Editable field component
  const EditableValue = ({ 
    field, 
    manualField, 
    value, 
    autoValue, 
    unit = '', 
    decimals = 1,
    multiline = false,
    className = ''
  }) => {
    const isEditing = editingField === field;
    const isOvr = isOverridden(field);
    const inputRef = useRef(null);

    useEffect(() => {
      if (isEditing && inputRef.current) {
        inputRef.current.focus();
        if (!multiline) inputRef.current.select();
      }
    }, [isEditing, multiline]);

    const displayVal = value !== null && value !== undefined 
      ? (typeof value === 'number' ? value.toFixed(decimals) : value)
      : (typeof autoValue === 'number' ? autoValue.toFixed(decimals) : autoValue);

    const startEdit = () => {
      const currentVal = value !== null && value !== undefined ? value : autoValue;
      setEditingField(field);
      setEditValue(currentVal !== null && currentVal !== undefined ? String(currentVal) : '');
    };

    const saveEdit = () => {
      if (editValue === '') {
        saveFieldMutation.mutate({ field: manualField, value: null });
      } else {
        const numValue = parseFloat(editValue);
        if (!isNaN(numValue) && !multiline) {
          saveFieldMutation.mutate({ field: manualField, value: numValue });
        } else {
          saveFieldMutation.mutate({ field: manualField, value: editValue });
        }
      }
    };

    const cancelEdit = () => {
      setEditingField(null);
      setEditValue('');
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && !multiline) {
        e.preventDefault();
        saveEdit();
      } else if (e.key === 'Escape') {
        cancelEdit();
      }
    };

    if (isEditing) {
      return (
        <span className="inline-flex items-center gap-0.5">
          {multiline ? (
            <textarea
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={saveEdit}
              className="text-[9px] px-1 py-0.5 border border-blue-400 rounded w-full min-h-[40px]"
              rows={3}
            />
          ) : (
            <input
              ref={inputRef}
              type={typeof autoValue === 'number' ? 'number' : 'text'}
              step={decimals === 0 ? '1' : '0.1'}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={saveEdit}
              className="text-xs px-1 py-0.5 border border-blue-400 rounded w-16 text-center"
            />
          )}
          <button
            onMouseDown={(e) => { e.preventDefault(); saveEdit(); }}
            className="p-0.5 hover:bg-green-100 rounded"
          >
            <Check className="w-3 h-3 text-green-600" />
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); cancelEdit(); }}
            className="p-0.5 hover:bg-red-100 rounded"
          >
            <X className="w-3 h-3 text-red-600" />
          </button>
        </span>
      );
    }

    return (
      <span className={cn("inline-flex items-center gap-1 group", className)}>
        <span
          onClick={startEdit}
          className={cn(
            "cursor-pointer hover:bg-blue-50 px-1 rounded transition-colors",
            isOvr && "text-blue-700 font-semibold"
          )}
        >
          {displayVal}{unit}
        </span>
        {isOvr && (
          <button
            onClick={() => resetFieldMutation.mutate(manualField)}
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-orange-100 rounded transition-opacity"
            title="Revenir au calcul auto"
          >
            <RotateCcw className="w-3 h-3 text-orange-600" />
          </button>
        )}
      </span>
    );
  };

  return (
    <div className={cn(
      "px-2 py-3 text-center relative group border-t-2 border-gray-300",
      hasManualOverride && "bg-blue-50",
      calculationMode !== 'disabled' && "bg-gradient-to-b from-gray-50 to-white"
    )}>

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
        <div className="mb-2 pb-2 border-b border-gray-200">
          <div className="flex items-center justify-center gap-1 text-xs text-gray-700">
            <Calendar className="w-3 h-3" />
            <EditableValue
              field="workedDays"
              manualField="manual_days_worked"
              value={monthlyRecap?.manual_days_worked}
              autoValue={calculatedRecap.workedDays}
              unit=""
              decimals={0}
              className="font-semibold"
            />
            <span className="text-gray-500">/</span>
            <EditableValue
              field="expectedDays"
              manualField="manual_expected_days"
              value={monthlyRecap?.manual_expected_days}
              autoValue={calculatedRecap.expectedDays}
              unit=" j"
              decimals={0}
            />
          </div>
          {extraDays > 0 && (
            <div className="text-[10px] text-orange-600 font-medium">
              +<EditableValue
                field="extraDays"
                manualField="manual_extra_days"
                value={monthlyRecap?.manual_extra_days}
                autoValue={calculatedRecap.extraDays}
                unit=" j sup"
                decimals={0}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="text-xs text-gray-700 mb-1">
          <EditableValue
            field="workedDays"
            manualField="manual_days_worked"
            value={monthlyRecap?.manual_days_worked}
            autoValue={calculatedRecap.workedDays}
            unit=" jour"
            decimals={0}
            className="font-semibold"
          />
        </div>
      )}

      {/* SECTION 2: Hours */}
      <div className="mb-2">
        <div className="text-xl font-bold text-blue-900">
          <EditableValue
            field="workedHours"
            manualField="manual_total_hours"
            value={monthlyRecap?.manual_total_hours}
            autoValue={calculatedRecap.workedHours}
            unit="h"
          />
        </div>
        <div className="text-[9px] text-gray-600 font-semibold">
          Effectuées
        </div>
        {calculationMode !== 'disabled' && (
          <div className="text-xs text-gray-500 mt-0.5">
            Base: <EditableValue
              field="contractMonthlyHours"
              manualField="manual_contract_hours"
              value={monthlyRecap?.manual_contract_hours}
              autoValue={calculatedRecap.contractMonthlyHours}
              unit="h"
            />
            {adjustedContractHours !== contractMonthlyHours && adjustedContractHours !== null && (
              <span className="text-orange-600 ml-1">
                (ajusté: <EditableValue
                  field="adjustedContractHours"
                  manualField="manual_adjusted_hours"
                  value={monthlyRecap?.manual_adjusted_hours}
                  autoValue={calculatedRecap.adjustedContractHours}
                  unit="h"
                />)
              </span>
            )}
          </div>
        )}
        {paidHours !== null && (
          <div className="text-[10px] text-gray-500 mt-1">
            Payées (hors sup/comp): <EditableValue
              field="paidExcludingExtras"
              manualField="manual_paid_excluding_extras"
              value={monthlyRecap?.manual_paid_excluding_extras}
              autoValue={paidHours}
              unit="h"
            />
          </div>
        )}
      </div>

      {/* SECTION 3: Overtime / Complementary Hours */}
      {calculationMode !== 'disabled' && (
        <>
          {isPartTime ? (
            // Part-time: Heures complémentaires
            totalComplementaryHours >= 0.05 && (
              <div className="mb-2 pb-2 border-b border-gray-200">
                <div className="bg-green-50 rounded p-1.5">
                  <div className="text-[10px] font-bold text-green-800 mb-0.5 flex items-center justify-center gap-1">
                    <Clock className="w-3 h-3" />
                    H. Complémentaires
                  </div>
                  <div className="text-sm font-bold text-green-700">
                    <EditableValue
                      field="totalComplementaryHours"
                      manualField="manual_total_complementary"
                      value={monthlyRecap?.manual_total_complementary}
                      autoValue={calculatedRecap.totalComplementaryHours}
                      unit="h"
                    />
                  </div>
                  <div className="text-[9px] text-green-600 space-y-0.5">
                    {complementaryHours10 > 0 && (
                      <div>+10%: <EditableValue
                        field="complementaryHours10"
                        manualField="manual_complementary_10"
                        value={monthlyRecap?.manual_complementary_10}
                        autoValue={calculatedRecap.complementaryHours10}
                        unit="h"
                      /></div>
                    )}
                    {complementaryHours25 > 0 && (
                      <div>+25%: <EditableValue
                        field="complementaryHours25"
                        manualField="manual_complementary_25"
                        value={monthlyRecap?.manual_complementary_25}
                        autoValue={calculatedRecap.complementaryHours25}
                        unit="h"
                      /></div>
                    )}
                  </div>
                </div>
              </div>
            )
          ) : (
            // Full-time: Heures supplémentaires
            totalOvertimeHours >= 0.05 && (
              <div className="mb-2 pb-2 border-b border-gray-200">
                <div className="bg-orange-50 rounded p-1.5">
                  <div className="text-[10px] font-bold text-orange-800 mb-0.5 flex items-center justify-center gap-1">
                    <Briefcase className="w-3 h-3" />
                    H. Supplémentaires
                  </div>
                  <div className="text-sm font-bold text-orange-700">
                    <EditableValue
                      field="totalOvertimeHours"
                      manualField="manual_total_overtime"
                      value={monthlyRecap?.manual_total_overtime}
                      autoValue={calculatedRecap.totalOvertimeHours}
                      unit="h"
                    />
                  </div>
                  <div className="text-[9px] text-orange-600 space-y-0.5">
                    {overtimeHours25 > 0 && (
                      <div>+25%: <EditableValue
                        field="overtimeHours25"
                        manualField="manual_overtime_25"
                        value={monthlyRecap?.manual_overtime_25}
                        autoValue={calculatedRecap.overtimeHours25}
                        unit="h"
                      /></div>
                    )}
                    {overtimeHours50 > 0 && (
                      <div>+50%: <EditableValue
                        field="overtimeHours50"
                        manualField="manual_overtime_50"
                        value={monthlyRecap?.manual_overtime_50}
                        autoValue={calculatedRecap.overtimeHours50}
                        unit="h"
                      /></div>
                    )}
                  </div>
                </div>
              </div>
            )
          )}
        </>
      )}

      {/* SECTION 4: Holidays worked */}
      {calculationMode !== 'disabled' && holidaysWorkedDays > 0 && eligibleForHolidayPay && (
        <div className="mb-2 text-[10px]">
          <div className="flex items-center justify-center gap-1 text-red-700 font-medium">
            <Sun className="w-3 h-3" />
            Jours fériés: <EditableValue
              field="holidaysWorkedDays"
              manualField="manual_holidays_days"
              value={monthlyRecap?.manual_holidays_days}
              autoValue={calculatedRecap.holidaysWorkedDays}
              unit="j"
              decimals={0}
            />
            (<EditableValue
              field="holidaysWorkedHours"
              manualField="manual_holidays_hours"
              value={monthlyRecap?.manual_holidays_hours}
              autoValue={calculatedRecap.holidaysWorkedHours}
              unit="h"
            />)
          </div>
          <div className="text-[9px] text-red-600">
            Éligible majoration férié
          </div>
        </div>
      )}

      {/* SECTION 5: Non-shifts summary */}
      {(() => {
        const visibleStatuses = nonShiftTypes.filter(t => t.visible_in_recap === true);
        const employeeNonShifts = nonShiftEvents.filter(ns => ns.employee_id === employee.id);
        const occurrencesByStatus = {};
        
        employeeNonShifts.forEach(ns => {
          const statusId = ns.non_shift_type_id;
          if (!occurrencesByStatus[statusId]) {
            occurrencesByStatus[statusId] = new Set();
          }
          occurrencesByStatus[statusId].add(ns.date);
        });
        
        const displayLines = visibleStatuses
          .map(status => {
            const uniqueDays = occurrencesByStatus[status.id]?.size || 0;
            return {
              code: status.code || status.label?.substring(0, 3).toUpperCase(),
              count: uniqueDays
            };
          })
          .filter(line => line.count > 0);
        
        const autoText = displayLines.map(l => `${l.code} ${l.count}j`).join('\n');
        
        return displayLines.length > 0 && (
          <div className="mb-2 text-[9px] text-gray-600">
            <EditableValue
              field="nonShiftsText"
              manualField="manual_non_shifts_text"
              value={monthlyRecap?.manual_non_shifts_text}
              autoValue={autoText}
              multiline={true}
            />
          </div>
        );
      })()}

      {/* SECTION 6: CP décomptés */}
      {cpPeriods.length > 0 && displayCPDays > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-200">
          <div className="text-[10px] font-semibold text-green-700 flex items-center justify-center gap-1">
            <Coffee className="w-3 h-3" />
            CP décomptés: <EditableValue
              field="cpDays"
              manualField="manual_cp_days"
              value={monthlyRecap?.manual_cp_days}
              autoValue={autoCPDays}
              unit=" j"
              decimals={0}
            />
          </div>
          {monthlyRecap?.manual_cp_text && (
            <div className="text-[9px] text-gray-500 mt-1">
              <EditableValue
                field="cpText"
                manualField="manual_cp_text"
                value={monthlyRecap?.manual_cp_text}
                autoValue=""
                multiline={true}
              />
            </div>
          )}
        </div>
      )}

      {/* Manual override indicator */}
      {hasManualOverride && (
        <div className="mt-1 text-[9px] text-blue-700 font-semibold flex items-center justify-center gap-1">
          <AlertCircle className="w-3 h-3" />
          Valeurs modifiées
        </div>
      )}
    </div>
  );
}

// Removed EditMonthlyRecapDialog - inline editing only