import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Trash2, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { formatLocalDate } from '@/components/planning/dateUtils';

export default function ClearEmployeeMonthModal({ open, onOpenChange, employee, year, month, monthKey }) {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const monthName = new Date(year, month, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  const handleClear = async () => {
    setLoading(true);
    try {
      const firstDay = formatLocalDate(new Date(year, month, 1));
      const lastDay = formatLocalDate(new Date(year, month + 1, 0));

      // Fetch all data for this employee in this month
      const [allShifts, allNonShifts, allCpPeriods, allWeeklyRecaps, allMonthlyRecaps] = await Promise.all([
        base44.entities.Shift.list(),
        base44.entities.NonShiftEvent.list(),
        base44.entities.PaidLeavePeriod.list(),
        base44.entities.WeeklyRecap.list(),
        base44.entities.MonthlyRecap.filter({ year: year, month: month + 1 }),
      ]);

      const empId = employee.id;

      const shiftsToDelete = allShifts.filter(s => s.employee_id === empId && s.date >= firstDay && s.date <= lastDay);
      const nonShiftsToDelete = allNonShifts.filter(e => e.employee_id === empId && e.date >= firstDay && e.date <= lastDay);
      const cpToDelete = allCpPeriods.filter(p => p.employee_id === empId && p.end_cp >= firstDay && p.start_cp <= lastDay);

      // Weekly recaps: week_start within a range covering the month
      const weekRangeStart = formatLocalDate(new Date(year, month - 1, 24)); // few days before month start
      const weeklyRecapsToDelete = allWeeklyRecaps.filter(r => r.employee_id === empId && r.week_start >= weekRangeStart && r.week_start <= lastDay);
      const monthlyRecapsToDelete = allMonthlyRecaps.filter(r => r.employee_id === empId);

      const toDelete = [
        ...shiftsToDelete.map(s => base44.entities.Shift.delete(s.id)),
        ...nonShiftsToDelete.map(e => base44.entities.NonShiftEvent.delete(e.id)),
        ...cpToDelete.map(p => base44.entities.PaidLeavePeriod.delete(p.id)),
        ...weeklyRecapsToDelete.map(r => base44.entities.WeeklyRecap.delete(r.id)),
        ...monthlyRecapsToDelete.map(r => base44.entities.MonthlyRecap.delete(r.id)),
      ];

      await Promise.all(toDelete);

      const total = shiftsToDelete.length + nonShiftsToDelete.length + cpToDelete.length + weeklyRecapsToDelete.length + monthlyRecapsToDelete.length;

      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.invalidateQueries({ queryKey: ['nonShiftEvents'] });
      queryClient.invalidateQueries({ queryKey: ['paidLeavePeriods'] });
      queryClient.invalidateQueries({ queryKey: ['allWeeklyRecaps'] });
      queryClient.invalidateQueries({ queryKey: ['allMonthlyRecaps'] });

      toast.success(`✓ ${total} élément(s) supprimé(s) pour ${employee.first_name} ${employee.last_name}`);
      onOpenChange(false);
    } catch (err) {
      toast.error('Erreur : ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-red-600 flex items-center gap-2">
            <Trash2 className="w-5 h-5" />
            Vider le mois — {employee?.first_name} {employee?.last_name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-800">
              <p className="font-semibold mb-1">Cette action est irréversible.</p>
              <p>Tous les éléments suivants pour <strong>{monthName}</strong> seront supprimés :</p>
              <ul className="mt-1 list-disc list-inside text-xs space-y-0.5">
                <li>Shifts et non-shifts</li>
                <li>Périodes de congés payés</li>
                <li>Récapitulatifs hebdomadaires et mensuel</li>
              </ul>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={loading}>
              Annuler
            </Button>
            <Button
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              onClick={handleClear}
              disabled={loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Confirmer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}