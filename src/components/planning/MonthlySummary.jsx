import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Edit2, AlertTriangle } from 'lucide-react';
import { calculateMonthlyCPTotal } from './paidLeaveCalculations';
import { calculateMonthlyHours } from './hoursCalculation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function MonthlySummary({ employee, shifts, nonShiftEvents = [], nonShiftTypes = [], monthStart, monthEnd, holidayDates = [] }) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const queryClient = useQueryClient();

  const year = monthStart.getFullYear();
  const month = monthStart.getMonth() + 1;

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

  // Calculate automatic values using new TypeScript implementation
  const monthlyCalc = useMemo(() => {
    // Adapter: Convert employee to the format expected by hoursCalculation.ts
    const employeeForCalc = {
      id: employee.id,
      work_time_type: employee.work_time_type || 'full_time',
      contract_hours_weekly: employee.contract_hours_weekly || '35:00',
      weekly_schedule: employee.weekly_schedule || null
    };

    // Adapter: Convert shifts to the format expected by hoursCalculation.ts
    const shiftsForCalc = shifts
      .filter(s => s.employee_id === employee.id)
      .map(s => ({
        id: s.id,
        date: s.date,
        employee_id: s.employee_id,
        start_time: s.start_time,
        end_time: s.end_time,
        break_minutes: s.break_minutes || 0,
        status: s.status || 'planned'
      }));

    return calculateMonthlyHours(shiftsForCalc, employeeForCalc, year, month, 'overtime');
  }, [shifts, employee, year, month]);

  // Extract calculated values
  const effectiveHours = monthlyCalc.totalEffectiveHours;
  const autoDaysWorked = monthlyCalc.daysWorkedActual > 0
    ? monthlyCalc.daysWorkedActual
    : monthlyCalc.daysWorkedPlanned;
  const autoTotalHours = effectiveHours;
  const autoMonthlyContractHours = monthlyCalc.contractHoursMonthly;

  // Overtime/complementary breakdown (avec hors répartition)
  const overtimeOutside = monthlyCalc.overtime?.outsideContract || 0;
  const overtimeClassic = (monthlyCalc.overtime?.classic25 || 0) + (monthlyCalc.overtime?.classic50 || 0);
  const totalOvertime = monthlyCalc.overtime?.total || 0;

  const complementaryOutside = monthlyCalc.complementary?.outsideContract || 0;
  const complementaryClassic = (monthlyCalc.complementary?.classic10 || 0) + (monthlyCalc.complementary?.classic25 || 0);
  const totalComplementary = monthlyCalc.complementary?.total || 0;

  const hasExcess = totalOvertime > 0 || totalComplementary > 0;
  const hasOutsideContract = overtimeOutside > 0 || complementaryOutside > 0;

  // CP days count
  const autoCPDays = calculateMonthlyCPTotal(cpPeriods, monthStart, monthEnd);

  // Apply manual overrides
  const daysWorked = manualRecap?.manual_days_worked ?? autoDaysWorked;
  const totalHours = manualRecap?.manual_total_hours ?? autoTotalHours;
  const contractHours = manualRecap?.manual_contract_hours ?? autoMonthlyContractHours;
  const cpDays = manualRecap?.manual_cp_days ?? autoCPDays;

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

        {/* Heures effectuées (MAIN) */}
        <div className="text-xl font-bold text-blue-900 mb-0.5">
          {totalHours.toFixed(1)}h
        </div>
        <div className="text-[9px] text-gray-600 font-semibold mb-2">
          Effectuées
        </div>

        {/* Base contractuelle (info statique) */}
        <div className="text-xs text-gray-600 mb-2">
          Base: {contractHours.toFixed(1)}h
        </div>

        {/* Heures supplémentaires / complémentaires avec détail hors répartition */}
        {hasExcess && (
          <div className="bg-orange-50 border border-orange-200 rounded p-1.5 mb-2 text-[10px] space-y-0.5">
            {/* Heures supplémentaires (temps complet) */}
            {totalOvertime > 0 && (
              <>
                <div className="text-orange-700 font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  HS: +{totalOvertime.toFixed(1)}h
                </div>
                {/* Détail si heures hors répartition */}
                {hasOutsideContract && overtimeOutside > 0 && (
                  <div className="text-purple-700 text-[9px] pl-4" title="Heures sur jour hors contrat">
                    dont {overtimeOutside.toFixed(1)}h hors rép.
                  </div>
                )}
                {overtimeClassic > 0 && hasOutsideContract && (
                  <div className="text-orange-600 text-[9px] pl-4">
                    dont {overtimeClassic.toFixed(1)}h classiques
                  </div>
                )}
              </>
            )}
            {/* Heures complémentaires (temps partiel) */}
            {totalComplementary > 0 && (
              <>
                <div className="text-green-700 font-semibold">
                  HC: +{totalComplementary.toFixed(1)}h
                </div>
                {/* Détail si heures hors répartition */}
                {hasOutsideContract && complementaryOutside > 0 && (
                  <div className="text-purple-700 text-[9px] pl-4" title="Heures sur jour hors contrat">
                    dont {complementaryOutside.toFixed(1)}h hors rép.
                  </div>
                )}
                {complementaryClassic > 0 && hasOutsideContract && (
                  <div className="text-green-600 text-[9px] pl-4">
                    dont {complementaryClassic.toFixed(1)}h classiques
                  </div>
                )}
              </>
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
          contractHours: autoMonthlyContractHours,
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

  const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-blue-600">
            Éditer le récapitulatif mensuel
          </DialogTitle>
          <p className="text-sm text-gray-600">
            {employee.first_name} {employee.last_name} - {monthNames[month - 1]} {year}
          </p>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-gray-700">
            ℹ️ <strong>Récapitulatif simple :</strong> Saisir les heures effectuées et la base contractuelle.
          </div>

          {/* Days and hours */}
          <div className="grid grid-cols-2 gap-4">
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
              <Label className="text-xs text-gray-700">Heures effectuées</Label>
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
          </div>

          <div>
            <Label className="text-xs text-gray-700">Base contractuelle</Label>
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

          {/* CP Days */}
          <div>
            <Label className="text-xs text-gray-700">CP décomptés</Label>
            <Input
              type="number"
              step="0.5"
              min="0"
              placeholder={`Auto: ${autoValues.cpDays || 0}`}
              value={formData.manual_cp_days}
              onChange={(e) => setFormData({...formData, manual_cp_days: e.target.value})}
              className="mt-1"
            />
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs text-gray-700">Notes</Label>
            <textarea
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
              rows={3}
              placeholder="Commentaires..."
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
              Enregistrer
            </Button>
            {currentRecap && (
              <Button
                onClick={() => deleteMutation.mutate()}
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50"
              >
                Supprimer les modifications
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