import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Edit2, Check, X } from 'lucide-react';
import { calculateShiftDuration } from './LegalChecks';
import { calculateMonthlyCPTotal } from './paidLeaveCalculations';
import { calculateDeductedHours, calculatePaidBaseHours, calculateMonthlyContractHours } from './DeductionCalculations';
import { calculateHolidayHours } from './holidayCalculations';
import { calculateExpectedDaysOfMonth, calculateRealizedDays, getGapColor, getGapTextColor } from './expectedDaysCalculations';
import { getSimpleMonthlyBalance } from './simpleOvertimeV1';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';

export default function MonthlySummary({ employee, shifts, nonShiftEvents, nonShiftTypes, monthStart, monthEnd, holidayDates = [] }) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const queryClient = useQueryClient();

  const year = monthStart.getFullYear();
  const month = monthStart.getMonth() + 1;

  // Fetch calculation mode
  const { data: settingsData = [] } = useQuery({
    queryKey: ['appSettings', 'planning_calculation_mode'],
    queryFn: async () => {
      return await base44.entities.AppSettings.filter({ setting_key: 'planning_calculation_mode' });
    }
  });

  const calculationMode = settingsData[0]?.planning_calculation_mode || 'disabled';

  // Fetch manual overrides
  const { data: recaps = [] } = useQuery({
    queryKey: ['monthlyRecaps', employee.id, year, month],
    queryFn: async () => {
      return await base44.entities.MonthlyRecap.filter({
        employee_id: employee.id,
        year,
        month
      });
    }
  });

  const manualRecap = recaps[0];

  // Fetch CP periods
  const { data: cpPeriods = [] } = useQuery({
    queryKey: ['paidLeavePeriods', employee.id, year, month],
    queryFn: async () => {
      const all = await base44.entities.PaidLeavePeriod.filter({
        employee_id: employee.id
      });
      return all;
    }
  });

  // Fetch template weeks for expected days calculation
  const { data: templateWeeks = [] } = useQuery({
    queryKey: ['templateWeeks', employee.id],
    queryFn: () => base44.entities.TemplateWeek.filter({ employee_id: employee.id })
  });

  // Fetch template shifts
  const { data: templateShifts = [] } = useQuery({
    queryKey: ['templateShifts'],
    queryFn: () => base44.entities.TemplateShift.list()
  });

  // Calculate automatic values
  const employeeShifts = shifts.filter(s => s.employee_id === employee.id);
  const employeeNonShifts = nonShiftEvents.filter(e => e.employee_id === employee.id);

  // Days worked (only shifts)
  const daysWithShifts = new Set(employeeShifts.map(s => s.date));
  const autoDaysWorked = daysWithShifts.size;

  // Total hours actually worked
  const autoTotalHours = employeeShifts.reduce((sum, shift) => sum + calculateShiftDuration(shift), 0);

  // Contract hours: monthly base from employee record
  const autoMonthlyContractHours = calculateMonthlyContractHours(employee);
  
  // Deducted hours from non-shift events (with details)
  const autoDeductedData = calculateDeductedHours(employee, employeeNonShifts, nonShiftTypes, monthStart, monthEnd);
  const autoDeductedHours = autoDeductedData.total;
  const autoDeductedDetails = autoDeductedData.details;
  
  // Paid base hours: contract - deducted
  const autoPaidBaseHours = calculatePaidBaseHours(employee, employeeNonShifts, nonShiftTypes, monthStart, monthEnd);

  // V1 SIMPLE : calcul mensuel du delta
  let monthlyBalance = { status: 'not_calculable', suppCompRetained: 0, weekBalances: [] };
  if (calculationMode === 'monthly') {
    monthlyBalance = getSimpleMonthlyBalance(
      shifts,
      employee.id,
      monthStart,
      monthEnd,
      employee
    );
  }

  // Non-shifts count (only visible_in_recap = true)
  const autoNonShiftsCounts = {};
  employeeNonShifts.forEach(ns => {
    const type = nonShiftTypes.find(t => t.id === ns.non_shift_type_id);
    if (type && type.visible_in_recap) {
      autoNonShiftsCounts[type.label] = (autoNonShiftsCounts[type.label] || 0) + 1;
    }
  });

  // CP days count
  const autoCPDays = calculateMonthlyCPTotal(cpPeriods, monthStart, monthEnd);

  // Holiday hours calculation
  const holidayHoursData = calculateHolidayHours(employeeShifts, employee, monthStart, monthEnd, holidayDates) || { count: 0, dates: [], workedHours: 0, paidBonus: 0 };

  // Expected days calculation
  const expectedDaysData = calculateExpectedDaysOfMonth(templateWeeks, templateShifts, monthStart, monthEnd);
  const realizedDays = calculateRealizedDays(shifts, employee.id, monthStart, monthEnd);

  // Apply manual overrides
  const daysWorked = manualRecap?.manual_days_worked ?? autoDaysWorked;
  const totalHours = manualRecap?.manual_total_hours ?? autoTotalHours;
  const deductedHours = manualRecap?.manual_deducted_hours ?? autoDeductedHours;
  
  // Paid base can be overridden directly OR calculated from contract - deducted
  const paidBaseHours = manualRecap?.manual_contract_hours 
    ? manualRecap.manual_contract_hours 
    : Math.max(0, autoMonthlyContractHours - deductedHours);
  
  // V1 : pas de majorations encore, juste le delta retenu (suppComp)
  const suppCompRetained = monthlyBalance.suppCompRetained || 0;
  const nonShiftsCounts = autoNonShiftsCounts;
  const cpDays = autoCPDays;
  const hasManualOverride = !!manualRecap;

  return (
    <>
      <div className={cn(
        "px-2 py-3 text-center relative group border-t-2 border-gray-300",
        hasManualOverride && "bg-blue-50"
      )}>
        <button
          onClick={() => setShowEditDialog(true)}
          className="absolute top-1 right-1 p-1 rounded hover:bg-gray-200 transition-colors opacity-0 group-hover:opacity-100"
          title="Éditer le récapitulatif"
        >
          <Edit2 className="w-3 h-3 text-blue-600" />
        </button>

        <div className="text-[10px] font-bold text-gray-600 uppercase mb-1">
          📊 Récap mois
        </div>

        {/* Days worked vs Expected */}
        <div className="mb-2 pb-2 border-b border-gray-200 space-y-1">
          {expectedDaysData.status === 'calculated' ? (
            <>
              <div className="text-xs text-gray-600">
                <span className="font-semibold text-gray-700">{expectedDaysData.expectedDays}</span> jour(s) prévus
              </div>
              <div className="text-xs text-gray-600">
                <span className="font-semibold text-gray-700">{realizedDays}</span> jour(s) réalisés
              </div>
              {(() => {
                const gap = realizedDays - expectedDaysData.expectedDays;
                const gapColor = getGapColor(gap);
                const gapTextColor = getGapTextColor(gap);
                const gapLabel = gap >= 0 ? `+${gap}` : `${gap}`;
                return (
                  <div className={cn(
                    "text-xs font-bold px-2 py-1 rounded border-2",
                    gapColor
                  )}>
                    <span className={gapTextColor}>
                      Écart: {gapLabel}
                    </span>
                  </div>
                );
              })()}
            </>
          ) : expectedDaysData.status === 'undefined' ? (
            <div className="text-xs text-gray-500 italic">
              📋 Planning type: non défini
            </div>
          ) : (
            <div className="text-xs text-orange-600 italic">
              ⚠️ Planning type: non calculable
            </div>
          )}
        </div>

        {/* Base contractuelle payée (MAIN) */}
        <div className="text-xl font-bold text-blue-900 mb-0.5">
          {paidBaseHours.toFixed(1)}h
        </div>
        <div className="text-[9px] text-gray-600 font-semibold mb-2">
          Base: {autoMonthlyContractHours.toFixed(1)}h
        </div>

        {/* Deducted hours detail */}
        {deductedHours > 0 && (
          <div className="mb-2 pb-2 border-b border-gray-200">
            <div className="text-[10px] text-red-700 font-bold mb-1">
              – {deductedHours.toFixed(1)}h décomptées
            </div>
            {autoDeductedDetails.length > 0 && (
              <div className="text-[9px] text-gray-600 space-y-0.5">
                {autoDeductedDetails.map((detail, idx) => (
                  <div key={idx} className="flex justify-between items-center">
                    <span>{detail.label}: {detail.count}j</span>
                    <span className="font-semibold">{detail.totalHours.toFixed(1)}h</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Heures effectuées (smaller) */}
        <div className="text-xs text-gray-600 mb-2">
          Effectuées: {totalHours.toFixed(1)}h
        </div>

        {/* V1 SIMPLE : détail des semaines et delta mensuel */}
        {calculationMode === 'monthly' && monthlyBalance.status === 'calculated' && (
          <div className="mt-2 pt-2 border-t border-gray-200 space-y-1 text-[10px]">
            {monthlyBalance.weekBalances.length > 0 && (
              <div className="text-[9px] text-gray-500 space-y-0.5 mb-2 pb-2 border-b border-gray-200">
                <div className="font-semibold">Détail par semaine:</div>
                {monthlyBalance.weekBalances.map((week, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span>Sem {idx + 1}:</span>
                    <span className="font-mono">{week.delta > 0 ? '+' : ''}{week.delta.toFixed(1)}h</span>
                  </div>
                ))}
              </div>
            )}
            <div className={cn(
              "font-bold px-2 py-1 rounded",
              monthlyBalance.monthlyDelta <= 0 ? "bg-gray-100 text-gray-700" : "bg-blue-50 text-blue-900"
            )}>
              Écart mensuel: {monthlyBalance.monthlyDelta > 0 ? '+' : ''}{monthlyBalance.monthlyDelta.toFixed(1)}h
            </div>
            <div className={cn(
              "font-bold px-2 py-1 rounded",
              suppCompRetained <= 0 ? "text-gray-600" : "text-blue-700 bg-blue-50"
            )}>
              Supp/Comp retenues: {suppCompRetained.toFixed(1)}h
            </div>
          </div>
        )}
        {calculationMode === 'monthly' && monthlyBalance.status === 'not_calculable' && (
          <div className="mt-2 pt-2 border-t border-gray-200 text-[10px] text-orange-600 italic">
            ⚠️ {monthlyBalance.reason}
          </div>
        )}

        {/* V1 : pas de majorations pour le moment */}

        {/* CP count */}
        {cpDays > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="text-[10px] font-semibold text-green-700">
              🟢 CP décomptés : {cpDays} j
            </div>
          </div>
        )}

        {/* Holiday hours */}
        {holidayHoursData.count > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="text-[10px] font-semibold text-purple-700 mb-1">
              🎉 Jours fériés : {holidayHoursData.count}j
            </div>
            <div className="text-[9px] text-gray-600">
              <div className="font-semibold text-purple-700">
                Heures fériées travaillées: {holidayHoursData.workedHours.toFixed(1)}h
              </div>
            </div>
          </div>
        )}

        {/* Non-shifts count */}
        {Object.keys(nonShiftsCounts).length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-200 text-[10px] text-gray-600 space-y-0.5">
            {Object.entries(nonShiftsCounts).map(([type, count]) => (
              <div key={type}>
                {type}: {count}
              </div>
            ))}
          </div>
        )}

        {hasManualOverride && (
          <div className="mt-1 text-[9px] text-blue-700 font-semibold">
            ✏️ Modifié
          </div>
        )}
      </div>

      <EditMonthlyRecapDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        employee={employee}
        year={year}
        month={month}
        autoValues={{
          daysWorked: autoDaysWorked,
          totalHours: autoTotalHours,
          monthlyContractHours: autoMonthlyContractHours,
          deductedHours: autoDeductedHours,
          deductedDetails: autoDeductedDetails,
          paidBaseHours: autoPaidBaseHours,
          suppCompRetained: suppCompRetained,
          nonShiftsCounts: autoNonShiftsCounts,
          cpDays: autoCPDays
        }}
        currentRecap={manualRecap}
      />
    </>
  );
}

function EditMonthlyRecapDialog({ open, onOpenChange, employee, year, month, autoValues, currentRecap }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({});

  React.useEffect(() => {
    if (open) {
      setFormData({
        manual_days_worked: currentRecap?.manual_days_worked ?? '',
        manual_total_hours: currentRecap?.manual_total_hours ?? '',
        manual_deducted_hours: currentRecap?.manual_deducted_hours ?? '',
        manual_contract_hours: currentRecap?.manual_contract_hours ?? '',
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
      queryClient.invalidateQueries({ queryKey: ['monthlyRecaps'] });
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
      queryClient.invalidateQueries({ queryKey: ['monthlyRecaps'] });
      toast.success('Surcharges supprimées');
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

  const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-blue-600">
            Éditer le récapitulatif mensuel
          </DialogTitle>
          <p className="text-sm text-gray-600">
            {employee.first_name} {employee.last_name} - {monthNames[month - 1]} {year}
          </p>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-xs text-gray-700">
            ⚠️ <strong>Surcharges manuelles :</strong> Les valeurs saisies remplacent les calculs automatiques. 
            Laissez vide pour conserver les valeurs auto. Ces modifications n'altèrent jamais les shifts sources.
          </div>

          {/* Days and hours */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-xs text-gray-700">Jours travaillés</Label>
              <Input
                type="number"
                step="1"
                min="0"
                placeholder={`Auto: ${autoValues.daysWorked}`}
                value={formData.manual_days_worked}
                onChange={(e) => setFormData({...formData, manual_days_worked: e.target.value})}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-700">Total heures effectuées</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                placeholder={`Auto: ${autoValues.totalHours.toFixed(1)}`}
                value={formData.manual_total_hours}
                onChange={(e) => setFormData({...formData, manual_total_hours: e.target.value})}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-700">Base contractuelle payée</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                placeholder={`Auto: ${autoValues.paidBaseHours.toFixed(1)}`}
                value={formData.manual_contract_hours}
                onChange={(e) => setFormData({...formData, manual_contract_hours: e.target.value})}
                className="mt-1"
              />
              <div className="text-[10px] text-gray-500 mt-1">
                Contrat: {autoValues.monthlyContractHours.toFixed(1)}h
                {autoValues.deductedHours > 0 && ` – ${autoValues.deductedHours.toFixed(1)}h décomptées`}
              </div>
            </div>
          </div>

          {/* Deducted hours */}
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
            <Label className="text-xs text-gray-700 font-semibold">Heures décomptées paie</Label>
            <Input
              type="number"
              step="0.1"
              min="0"
              placeholder={`Auto: ${autoValues.deductedHours.toFixed(1)}`}
              value={formData.manual_deducted_hours}
              onChange={(e) => setFormData({...formData, manual_deducted_hours: e.target.value})}
              className="mt-1"
            />
            {autoValues.deductedDetails && autoValues.deductedDetails.length > 0 && (
              <div className="mt-2 text-[10px] text-gray-700 space-y-1">
                <div className="font-semibold mb-1">Détail auto :</div>
                {autoValues.deductedDetails.map((detail, idx) => (
                  <div key={idx} className="flex justify-between items-center">
                    <span>{detail.label}: {detail.count}j × {detail.hoursPerDay.toFixed(2)}h</span>
                    <span className="font-semibold">{detail.totalHours.toFixed(1)}h</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-start gap-2 mt-2">
              <AlertTriangle className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-gray-600">
                Heures déduites via les statuts ayant "Impacte la paie" activé. Calcul basé sur heures contractuelles/jour.
              </p>
            </div>
          </div>



          {/* CP Days */}
          <div>
            <Label className="text-xs text-gray-700">CP décomptés (surcharge)</Label>
            <Input
              type="number"
              step="0.5"
              min="0"
              placeholder={`Auto: ${autoValues.cpDays || 0}`}
              value={formData.manual_cp_days}
              onChange={(e) => setFormData({...formData, manual_cp_days: e.target.value})}
              className="mt-1"
            />
            <p className="text-[10px] text-gray-500 mt-1">
              Surcharge manuelle du total CP affiché dans le récap mensuel
            </p>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs text-gray-700">Notes / Commentaires</Label>
            <textarea
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
              rows={3}
              placeholder="Commentaires sur les ajustements..."
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              onClick={handleSave}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              <Check className="w-4 h-4 mr-2" />
              Enregistrer
            </Button>
            {currentRecap && (
              <Button
                onClick={() => deleteMutation.mutate()}
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50"
              >
                <X className="w-4 h-4 mr-2" />
                Supprimer les surcharges
              </Button>
            )}
            <Button
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