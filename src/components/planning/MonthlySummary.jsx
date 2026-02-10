import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Edit2, RotateCcw, AlertCircle, Clock, Calendar, Coffee, Sun, Briefcase } from 'lucide-react';
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
  const [showEditDialog, setShowEditDialog] = useState(false);
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

  // Use CP from calculation or fallback
  const displayCPDays = cpDays ?? autoCPDays ?? 0;

  const hasManualOverride = overriddenFields.length > 0 || !!monthlyRecap;

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
  const renderValue = (value, fieldName, unit = '', decimals = 1) => {
    const isOvr = isOverridden(fieldName);
    const displayVal = value !== null && value !== undefined
      ? (typeof value === 'number' ? value.toFixed(decimals) : value)
      : '-';

    return (
      <span className={cn(isOvr && 'text-blue-700 font-semibold')}>
        {displayVal}{unit}
        {isOvr && <span className="text-[8px] ml-0.5 text-blue-500">*</span>}
      </span>
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
        <button
          onClick={() => setShowEditDialog(true)}
          className="absolute top-1 right-1 p-1 rounded hover:bg-gray-200 transition-colors opacity-0 group-hover:opacity-100"
          title="Éditer le récapitulatif"
        >
          <Edit2 className="w-3 h-3 text-blue-600" />
        </button>

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
              <span className="font-semibold">{renderValue(workedDays, 'workedDays', '', 0)}</span>
              <span className="text-gray-500">/ {expectedDays || '-'} j</span>
            </div>
            {extraDays > 0 && (
              <div className="text-[10px] text-orange-600 font-medium">
                +{renderValue(extraDays, 'extraDays', ' j sup', 0)}
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-gray-700 mb-1">
            <span className="font-semibold">{renderValue(workedDays, 'workedDays', '', 0)}</span> jour{(workedDays || 0) > 1 ? 's' : ''}
          </div>
        )}

        {/* SECTION 2: Hours */}
        <div className="mb-2">
          <div className="text-xl font-bold text-blue-900">
            {renderValue(workedHours, 'workedHours', 'h')}
          </div>
          <div className="text-[9px] text-gray-600 font-semibold">
            Effectuées
          </div>
          {calculationMode !== 'disabled' && (
            <div className="text-xs text-gray-500 mt-0.5">
              Base: {renderValue(contractMonthlyHours, 'contractMonthlyHours', 'h')}
              {adjustedContractHours !== contractMonthlyHours && adjustedContractHours !== null && (
                <span className="text-orange-600 ml-1">
                  (ajusté: {renderValue(adjustedContractHours, 'adjustedContractHours', 'h')})
                </span>
              )}
            </div>
          )}
        </div>

        {/* SECTION 3: Overtime / Complementary Hours */}
        {calculationMode !== 'disabled' && (
          <>
            {isPartTime ? (
              // Part-time: Heures complémentaires (only show if > 0)
              totalComplementaryHours > 0 && (
                <div className="mb-2 pb-2 border-b border-gray-200">
                  <div className="bg-green-50 rounded p-1.5">
                    <div className="text-[10px] font-bold text-green-800 mb-0.5 flex items-center justify-center gap-1">
                      <Clock className="w-3 h-3" />
                      H. Complémentaires
                    </div>
                    <div className="text-sm font-bold text-green-700">
                      {renderValue(totalComplementaryHours, 'totalComplementaryHours', 'h')}
                    </div>
                    <div className="text-[9px] text-green-600 space-y-0.5">
                      {complementaryHours10 > 0 && (
                        <div>+10%: {renderValue(complementaryHours10, 'complementaryHours10', 'h')}</div>
                      )}
                      {complementaryHours25 > 0 && (
                        <div>+25%: {renderValue(complementaryHours25, 'complementaryHours25', 'h')}</div>
                      )}
                    </div>
                  </div>
                </div>
              )
            ) : (
              // Full-time: Heures supplémentaires (only show if > 0)
              totalOvertimeHours > 0 && (
                <div className="mb-2 pb-2 border-b border-gray-200">
                  <div className="bg-orange-50 rounded p-1.5">
                    <div className="text-[10px] font-bold text-orange-800 mb-0.5 flex items-center justify-center gap-1">
                      <Briefcase className="w-3 h-3" />
                      H. Supplémentaires
                    </div>
                    <div className="text-sm font-bold text-orange-700">
                      {renderValue(totalOvertimeHours, 'totalOvertimeHours', 'h')}
                    </div>
                    <div className="text-[9px] text-orange-600 space-y-0.5">
                      {overtimeHours25 > 0 && (
                        <div>+25%: {renderValue(overtimeHours25, 'overtimeHours25', 'h')}</div>
                      )}
                      {overtimeHours50 > 0 && (
                        <div>+50%: {renderValue(overtimeHours50, 'overtimeHours50', 'h')}</div>
                      )}
                    </div>
                  </div>
                </div>
              )
            )}
          </>
        )}

        {/* SECTION 4: Holidays worked */}
        {calculationMode !== 'disabled' && holidaysWorkedDays > 0 && (
          <div className="mb-2 text-[10px]">
            <div className="flex items-center justify-center gap-1 text-red-700 font-medium">
              <Sun className="w-3 h-3" />
              Jours fériés: {renderValue(holidaysWorkedDays, 'holidaysWorkedDays', '', 0)}j
              ({renderValue(holidaysWorkedHours, 'holidaysWorkedHours', 'h')})
            </div>
            {eligibleForHolidayPay && (
              <div className="text-[9px] text-red-600">
                Éligible majoration férié
              </div>
            )}
          </div>
        )}

        {/* SECTION 5: Non-shifts summary */}
        {calculationMode !== 'disabled' && nonShiftsByType && Object.keys(nonShiftsByType).length > 0 && (
          <div className="mb-2 text-[9px] text-gray-600 space-y-0.5">
            {Object.entries(nonShiftsByType).map(([key, { count, code }]) => (
              <div key={key} className="flex items-center justify-center gap-1">
                <span className="font-mono bg-gray-100 px-1 rounded">{code}</span>
                <span>{count}j</span>
              </div>
            ))}
          </div>
        )}

        {/* SECTION 6: CP count */}
        {displayCPDays > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="text-[10px] font-semibold text-green-700 flex items-center justify-center gap-1">
              <Coffee className="w-3 h-3" />
              CP décomptés: {renderValue(displayCPDays, 'cpDays', ' j', 0)}
            </div>
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

      <EditMonthlyRecapDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        employee={employee}
        year={year}
        month={month + 1} // DB uses 1-indexed months
        calculatedValues={calculatedRecap}
        currentRecap={monthlyRecap}
        onRecapUpdate={onRecapUpdate}
        calculationMode={calculationMode}
        autoCPDays={autoCPDays}
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
  autoCPDays
}) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({});

  React.useEffect(() => {
    if (open) {
      // Initialize form with current manual values or empty
      setFormData({
        manual_expected_days: currentRecap?.manual_expected_days ?? '',
        manual_days_worked: currentRecap?.manual_days_worked ?? '',
        manual_extra_days: currentRecap?.manual_extra_days ?? '',
        manual_contract_hours: currentRecap?.manual_contract_hours ?? '',
        manual_adjusted_hours: currentRecap?.manual_adjusted_hours ?? '',
        manual_total_hours: currentRecap?.manual_total_hours ?? '',
        manual_overtime_25: currentRecap?.manual_overtime_25 ?? '',
        manual_overtime_50: currentRecap?.manual_overtime_50 ?? '',
        manual_total_overtime: currentRecap?.manual_total_overtime ?? '',
        manual_complementary_10: currentRecap?.manual_complementary_10 ?? '',
        manual_complementary_25: currentRecap?.manual_complementary_25 ?? '',
        manual_total_complementary: currentRecap?.manual_total_complementary ?? '',
        manual_holidays_days: currentRecap?.manual_holidays_days ?? '',
        manual_holidays_hours: currentRecap?.manual_holidays_hours ?? '',
        manual_cp_days: currentRecap?.manual_cp_days ?? '',
        notes: currentRecap?.notes || ''
      });
    }
  }, [open, currentRecap]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (currentRecap) {
        return await base44.entities.MonthlyRecap.update(currentRecap.id, data);
      } else {
        return await base44.entities.MonthlyRecap.create({
          employee_id: employee.id,
          year,
          month,
          ...data
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allMonthlyRecaps'] });
      if (onRecapUpdate) onRecapUpdate();
      toast.success('Récapitulatif enregistré');
      onOpenChange(false);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (currentRecap) {
        return await base44.entities.MonthlyRecap.delete(currentRecap.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allMonthlyRecaps'] });
      if (onRecapUpdate) onRecapUpdate();
      toast.success('Modifications supprimées');
      onOpenChange(false);
    }
  });

  const handleSave = () => {
    const cleanData = {};
    Object.keys(formData).forEach(key => {
      if (formData[key] !== '' && formData[key] !== null && formData[key] !== undefined) {
        if (key === 'notes') {
          cleanData[key] = formData[key];
        } else {
          cleanData[key] = parseFloat(formData[key]);
        }
      }
    });

    saveMutation.mutate(cleanData);
  };

  const resetField = (fieldName) => {
    setFormData(prev => ({ ...prev, [fieldName]: '' }));
  };

  const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

  const isPartTime = employee.work_time_type === 'part_time';

  // Get calculated value for display
  const getCalcValue = (fieldName) => {
    const mapping = {
      manual_expected_days: 'expectedDays',
      manual_days_worked: 'workedDays',
      manual_extra_days: 'extraDays',
      manual_contract_hours: 'contractMonthlyHours',
      manual_adjusted_hours: 'adjustedContractHours',
      manual_total_hours: 'workedHours',
      manual_overtime_25: 'overtimeHours25',
      manual_overtime_50: 'overtimeHours50',
      manual_total_overtime: 'totalOvertimeHours',
      manual_complementary_10: 'complementaryHours10',
      manual_complementary_25: 'complementaryHours25',
      manual_total_complementary: 'totalComplementaryHours',
      manual_holidays_days: 'holidaysWorkedDays',
      manual_holidays_hours: 'holidaysWorkedHours',
      manual_cp_days: 'cpDays'
    };

    const calcField = mapping[fieldName];
    const value = calculatedValues?.[calcField];

    if (fieldName === 'manual_cp_days' && (value === null || value === undefined)) {
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

          {/* Section 1: Days */}
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-600" />
              Jours
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <FieldInput name="manual_expected_days" label="Jours prévus" step="1" />
              <FieldInput name="manual_days_worked" label="Jours travaillés" step="1" />
              <FieldInput name="manual_extra_days" label="Jours supplémentaires" step="1" />
            </div>
          </div>

          {/* Section 2: Hours */}
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-600" />
              Heures
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <FieldInput name="manual_total_hours" label="Heures effectuées" />
              <FieldInput name="manual_contract_hours" label="Base contractuelle" />
              <FieldInput name="manual_adjusted_hours" label="Base ajustée" />
            </div>
          </div>

          {/* Section 3: Overtime / Complementary */}
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-gray-600" />
              {isPartTime ? 'Heures complémentaires (temps partiel)' : 'Heures supplémentaires (temps plein)'}
            </h3>

            {isPartTime ? (
              <div className="grid grid-cols-3 gap-4">
                <FieldInput name="manual_complementary_10" label="H. compl. +10%" />
                <FieldInput name="manual_complementary_25" label="H. compl. +25%" />
                <FieldInput name="manual_total_complementary" label="Total complémentaires" />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                <FieldInput name="manual_overtime_25" label="H. sup. +25%" />
                <FieldInput name="manual_overtime_50" label="H. sup. +50%" />
                <FieldInput name="manual_total_overtime" label="Total supplémentaires" />
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
              <FieldInput name="manual_holidays_days" label="Nombre de jours" step="1" />
              <FieldInput name="manual_holidays_hours" label="Heures fériées" />
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
              <FieldInput name="manual_cp_days" label="CP décomptés" step="0.5" />
            </div>
          </div>

          {/* Section 6: Notes */}
          <div className="border rounded-lg p-4">
            <Label className="text-xs text-gray-700">Notes / Commentaires</Label>
            <textarea
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
              rows={3}
              placeholder="Commentaires sur ce mois..."
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              type="button"
              onClick={handleSave}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              Enregistrer
            </Button>
            {currentRecap && (
              <Button
                type="button"
                onClick={() => deleteMutation.mutate()}
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Tout réinitialiser
              </Button>
            )}
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