import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Edit2, Check, X } from 'lucide-react';
import { calculateMonthlyEmployeeHours } from './OvertimeCalculations';
import { calculateShiftDuration } from './LegalChecks';
import { calculateMonthlyCPTotal } from './paidLeaveCalculations';
import { calculateDeductedHours, calculatePaidBaseHours, calculateMonthlyContractHours } from './DeductionCalculations';
import { calculateHolidayHours } from './holidayCalculations';
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

  // For overtime/complementary calculations, we still need weekly contract
  const isFullTime = employee?.work_time_type === 'full_time';
  const contractHoursWeekly = employee?.contract_hours_weekly 
    ? parseFloat(employee.contract_hours_weekly.replace(':', '.').replace(/h/g, ''))
    : (isFullTime ? 35 : 0);

  // Overtime/complementary calculation
  let monthlyHours = { type: 'unknown', total: autoTotalHours };
  if (calculationMode === 'monthly') {
    monthlyHours = calculateMonthlyEmployeeHours(shifts, employee.id, monthStart, monthEnd, employee);
  } else if (calculationMode === 'weekly') {
    // Sum up weekly calculations
    const weeklyData = [];
    let currentDate = new Date(monthStart);
    while (currentDate <= monthEnd) {
      // Get week start (Monday)
      const weekStart = new Date(currentDate);
      const day = weekStart.getDay();
      const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
      weekStart.setDate(diff);
      
      if (weekStart < monthStart) weekStart.setTime(monthStart.getTime());
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      if (weekEnd > monthEnd) weekEnd.setTime(monthEnd.getTime());

      const weekShifts = shifts.filter(s => {
        if (s.employee_id !== employee.id) return false;
        const shiftDate = new Date(s.date);
        return shiftDate >= weekStart && shiftDate <= weekEnd;
      });

      const weekTotalHours = weekShifts.reduce((sum, shift) => sum + calculateShiftDuration(shift), 0);
      
      if (isFullTime || contractHoursWeekly >= 35) {
        const overtime = Math.max(0, weekTotalHours - 35);
        const overtime_25 = Math.min(overtime, 8);
        const overtime_50 = Math.max(0, overtime - 8);
        weeklyData.push({ overtime_25, overtime_50 });
      } else if (contractHoursWeekly > 0) {
        const complementary = Math.max(0, weekTotalHours - contractHoursWeekly);
        const limit_10 = contractHoursWeekly * 0.10;
        const complementary_10 = Math.min(complementary, limit_10);
        const complementary_25 = Math.max(0, complementary - limit_10);
        weeklyData.push({ complementary_10, complementary_25 });
      }

      currentDate = new Date(weekEnd);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Aggregate
    if (isFullTime || contractHoursWeekly >= 35) {
      const total_overtime_25 = weeklyData.reduce((sum, w) => sum + (w.overtime_25 || 0), 0);
      const total_overtime_50 = weeklyData.reduce((sum, w) => sum + (w.overtime_50 || 0), 0);
      monthlyHours = {
        type: 'full_time',
        total: autoTotalHours,
        normal: Math.min(autoTotalHours, autoMonthlyContractHours),
        overtime_25: total_overtime_25,
        overtime_50: total_overtime_50,
        total_overtime: total_overtime_25 + total_overtime_50
      };
    } else if (contractHoursWeekly > 0) {
      const total_complementary_10 = weeklyData.reduce((sum, w) => sum + (w.complementary_10 || 0), 0);
      const total_complementary_25 = weeklyData.reduce((sum, w) => sum + (w.complementary_25 || 0), 0);
      monthlyHours = {
        type: 'part_time',
        total: autoTotalHours,
        contract_hours: autoMonthlyContractHours,
        normal: Math.min(autoTotalHours, autoMonthlyContractHours),
        complementary_10: total_complementary_10,
        complementary_25: total_complementary_25,
        total_complementary: total_complementary_10 + total_complementary_25
      };
    }
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

  // Apply manual overrides
  const daysWorked = manualRecap?.manual_days_worked ?? autoDaysWorked;
  const totalHours = manualRecap?.manual_total_hours ?? autoTotalHours;
  const deductedHours = manualRecap?.manual_deducted_hours ?? autoDeductedHours;
  
  // Paid base can be overridden directly OR calculated from contract - deducted
  const paidBaseHours = manualRecap?.manual_contract_hours 
    ? manualRecap.manual_contract_hours 
    : Math.max(0, autoMonthlyContractHours - deductedHours);
  
  let overtime_25 = monthlyHours.overtime_25 || 0;
  let overtime_50 = monthlyHours.overtime_50 || 0;
  let complementary_10 = monthlyHours.complementary_10 || 0;
  let complementary_25 = monthlyHours.complementary_25 || 0;

  if (manualRecap) {
    if (manualRecap.manual_overtime_25 !== undefined) overtime_25 = manualRecap.manual_overtime_25;
    if (manualRecap.manual_overtime_50 !== undefined) overtime_50 = manualRecap.manual_overtime_50;
    if (manualRecap.manual_complementary_10 !== undefined) complementary_10 = manualRecap.manual_complementary_10;
    if (manualRecap.manual_complementary_25 !== undefined) complementary_25 = manualRecap.manual_complementary_25;
  }

  const nonShiftsCounts = manualRecap?.manual_non_shifts || autoNonShiftsCounts;
  
  const cpDays = manualRecap?.manual_cp_days ?? autoCPDays;
  const hasManualOverride = !!manualRecap;

  // Calculate total paid hours: base + overtime/complementary + holiday bonus
  const holidayBonus = holidayHoursData.paidBonus || 0;
  const totalPaidHours = paidBaseHours + overtime_25 + overtime_50 + complementary_10 + complementary_25 + holidayBonus;

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

        {/* Days worked */}
        <div className="text-xs text-gray-700 mb-1">
          <span className="font-semibold">{daysWorked}</span> jour{daysWorked > 1 ? 's' : ''}
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

        {/* Overtime/Complementary details */}
        {calculationMode !== 'disabled' && (
          <div className="mt-1 space-y-0.5 text-[10px]">
            {monthlyHours.type === 'full_time' && (overtime_25 > 0 || overtime_50 > 0) && (
              <>
                {overtime_25 > 0 && (
                  <div className="text-orange-700 font-semibold">
                    {overtime_25.toFixed(1)}h (+25%)
                  </div>
                )}
                {overtime_50 > 0 && (
                  <div className="text-red-700 font-semibold">
                    {overtime_50.toFixed(1)}h (+50%)
                  </div>
                )}
              </>
            )}

            {monthlyHours.type === 'part_time' && (complementary_10 > 0 || complementary_25 > 0) && (
              <>
                {complementary_10 > 0 && (
                  <div className="text-green-700 font-semibold">
                    {complementary_10.toFixed(1)}h (+10%)
                  </div>
                )}
                {complementary_25 > 0 && (
                  <div className="text-orange-700 font-semibold">
                    {complementary_25.toFixed(1)}h (+25%)
                  </div>
                )}
              </>
            )}

            {/* Total paid hours */}
            {(overtime_25 > 0 || overtime_50 > 0 || complementary_10 > 0 || complementary_25 > 0) && (
              <div className="pt-1 mt-1 border-t border-gray-300 text-blue-900 font-bold">
                Total payé: {totalPaidHours.toFixed(1)}h
              </div>
            )}
          </div>
        )}

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
          overtime_25: monthlyHours.overtime_25 || 0,
          overtime_50: monthlyHours.overtime_50 || 0,
          complementary_10: monthlyHours.complementary_10 || 0,
          complementary_25: monthlyHours.complementary_25 || 0,
          nonShiftsCounts: autoNonShiftsCounts,
          cpDays: autoCPDays
        }}
        currentRecap={manualRecap}
        monthlyHoursType={monthlyHours.type}
      />
    </>
  );
}

function EditMonthlyRecapDialog({ open, onOpenChange, employee, year, month, autoValues, currentRecap, monthlyHoursType }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({});

  React.useEffect(() => {
    if (open) {
      setFormData({
        manual_days_worked: currentRecap?.manual_days_worked ?? '',
        manual_total_hours: currentRecap?.manual_total_hours ?? '',
        manual_deducted_hours: currentRecap?.manual_deducted_hours ?? '',
        manual_contract_hours: currentRecap?.manual_contract_hours ?? '',
        manual_overtime_25: currentRecap?.manual_overtime_25 ?? '',
        manual_overtime_50: currentRecap?.manual_overtime_50 ?? '',
        manual_complementary_10: currentRecap?.manual_complementary_10 ?? '',
        manual_complementary_25: currentRecap?.manual_complementary_25 ?? '',
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

          {/* Overtime/Complementary */}
          {monthlyHoursType === 'full_time' && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Heures supplémentaires</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-gray-700">Heures +25%</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder={`Auto: ${autoValues.overtime_25.toFixed(1)}`}
                    value={formData.manual_overtime_25}
                    onChange={(e) => setFormData({...formData, manual_overtime_25: e.target.value})}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-700">Heures +50%</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder={`Auto: ${autoValues.overtime_50.toFixed(1)}`}
                    value={formData.manual_overtime_50}
                    onChange={(e) => setFormData({...formData, manual_overtime_50: e.target.value})}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
          )}

          {monthlyHoursType === 'part_time' && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Heures complémentaires</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-gray-700">Heures +10%</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder={`Auto: ${autoValues.complementary_10.toFixed(1)}`}
                    value={formData.manual_complementary_10}
                    onChange={(e) => setFormData({...formData, manual_complementary_10: e.target.value})}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-700">Heures +25%</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder={`Auto: ${autoValues.complementary_25.toFixed(1)}`}
                    value={formData.manual_complementary_25}
                    onChange={(e) => setFormData({...formData, manual_complementary_25: e.target.value})}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
          )}

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