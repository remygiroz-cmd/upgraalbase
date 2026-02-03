import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Edit2, Check, X } from 'lucide-react';
import { calculateMonthlyEmployeeHours } from './OvertimeCalculations';
import { detectPaidLeavePeriods, getTotalPaidLeaveDays } from './PaidLeaveDetection';
import { calculateShiftDuration } from './LegalChecks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function MonthlySummary({ employee, shifts, nonShiftEvents, nonShiftTypes, monthStart, monthEnd }) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
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

  // Calculate automatic values
  const employeeShifts = shifts.filter(s => s.employee_id === employee.id);
  const employeeNonShifts = nonShiftEvents.filter(e => e.employee_id === employee.id);

  // Days worked (only shifts)
  const daysWithShifts = new Set(employeeShifts.map(s => s.date));
  const autoDaysWorked = daysWithShifts.size;

  // Total hours
  const autoTotalHours = employeeShifts.reduce((sum, shift) => sum + calculateShiftDuration(shift), 0);

  // Contract hours
  const isFullTime = employee?.work_time_type === 'full_time';
  const contractHoursWeekly = employee?.contract_hours_weekly 
    ? parseFloat(employee.contract_hours_weekly.replace(':', '.').replace(/h/g, ''))
    : (isFullTime ? 35 : 0);
  
  const days = Math.ceil((monthEnd - monthStart) / (1000 * 60 * 60 * 24)) + 1;
  const weeks = days / 7;
  const autoContractHours = contractHoursWeekly * weeks;

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
        normal: Math.min(autoTotalHours, autoContractHours),
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
        contract_hours: autoContractHours,
        normal: Math.min(autoTotalHours, autoContractHours),
        complementary_10: total_complementary_10,
        complementary_25: total_complementary_25,
        total_complementary: total_complementary_10 + total_complementary_25
      };
    }
  }

  // Non-shifts count
  const autoNonShiftsCounts = {};
  employeeNonShifts.forEach(ns => {
    const type = nonShiftTypes.find(t => t.id === ns.non_shift_type_id);
    if (type) {
      autoNonShiftsCounts[type.label] = (autoNonShiftsCounts[type.label] || 0) + 1;
    }
  });

  // Apply manual overrides
  const daysWorked = manualRecap?.manual_days_worked ?? autoDaysWorked;
  const totalHours = manualRecap?.manual_total_hours ?? autoTotalHours;
  const contractHours = manualRecap?.manual_contract_hours ?? autoContractHours;
  
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

        {/* Days worked */}
        <div className="text-xs text-gray-700 mb-1">
          <span className="font-semibold">{daysWorked}</span> jour{daysWorked > 1 ? 's' : ''}
        </div>

        {/* Total hours */}
        <div className="text-lg font-bold text-gray-900">
          {totalHours.toFixed(1)}h
        </div>

        {/* Contract base */}
        {contractHours > 0 && (
          <div className="text-[10px] text-gray-500">
            Base: {contractHours.toFixed(1)}h
          </div>
        )}

        {/* Overtime/Complementary details */}
        {calculationMode !== 'disabled' && (
          <div className="mt-2 space-y-0.5 text-[10px]">
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
          contractHours: autoContractHours,
          overtime_25: monthlyHours.overtime_25 || 0,
          overtime_50: monthlyHours.overtime_50 || 0,
          complementary_10: monthlyHours.complementary_10 || 0,
          complementary_25: monthlyHours.complementary_25 || 0,
          nonShiftsCounts: autoNonShiftsCounts
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
        manual_contract_hours: currentRecap?.manual_contract_hours ?? '',
        manual_overtime_25: currentRecap?.manual_overtime_25 ?? '',
        manual_overtime_50: currentRecap?.manual_overtime_50 ?? '',
        manual_complementary_10: currentRecap?.manual_complementary_10 ?? '',
        manual_complementary_25: currentRecap?.manual_complementary_25 ?? '',
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
                placeholder={`Auto: ${autoValues.contractHours.toFixed(1)}`}
                value={formData.manual_contract_hours}
                onChange={(e) => setFormData({...formData, manual_contract_hours: e.target.value})}
                className="mt-1"
              />
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