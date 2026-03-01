import React, { useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';
import ShiftCard from './ShiftCard';
import NonShiftCard from './NonShiftCard';
import { isDateInCPPeriod } from './paidLeaveCalculations';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Cellule unique d'une journée pour UN employé.
 * Isolée en React.memo pour éviter le re-render de toutes les cellules
 * quand une seule cellule change.
 */
const PlanningDayCell = React.memo(function PlanningDayCell({
  employee,
  dateStr,
  dayInfo,
  employeeShifts,
  employeeNonShifts,
  maxEventsInRow,
  isCPDay,
  cpPeriod,
  isDisplayDateForCPBadge,
  positions,
  nonShiftTypes,
  swapLookup,
  canModifyPlanning,
  onCellClick,
  onDeleteShift,
  onSaveShift,
  onDeleteNonShift,
  onSetModalState,
  onSetSelectedCPPeriod,
}) {
  const queryClient = useQueryClient();
  const totalEvents = employeeShifts.length + employeeNonShifts.length;

  const handleCellClick = useCallback(() => {
    onCellClick(employee.id, dateStr, dayInfo);
  }, [employee.id, dateStr, dayInfo, onCellClick]);

  const handleDeleteNonShift = useCallback((ns) => {
    if (window.confirm('Supprimer cet événement ?')) {
      base44.entities.NonShiftEvent.delete(ns.id).then(() => {
        queryClient.invalidateQueries({ queryKey: ['nonShiftEvents'] });
        toast.success('Événement supprimé');
      });
    }
  }, [queryClient]);

  const handleNonShiftClick = useCallback((e) => {
    e.stopPropagation();
    if (!canModifyPlanning) {
      toast.error('Vous n\'avez pas la permission de modifier le planning');
      return;
    }
    onCellClick(employee.id, dateStr, dayInfo);
  }, [canModifyPlanning, employee.id, dateStr, dayInfo, onCellClick]);

  const handleShiftClick = useCallback((e) => {
    e.stopPropagation();
    if (!canModifyPlanning) {
      toast.error('Vous n\'avez pas la permission de modifier le planning');
      return;
    }
    onCellClick(employee.id, dateStr, dayInfo);
  }, [canModifyPlanning, employee.id, dateStr, dayInfo, onCellClick]);

  const handleCPBadgeClick = useCallback((e) => {
    e.stopPropagation();
    if (!canModifyPlanning) {
      toast.error('Lecture seule — vous n\'avez pas la permission de modifier le planning', { duration: 3000, icon: '🔒' });
      return;
    }
    onSetModalState({ isOpen: true, actionType: 'DELETE_CP', selectedEmployee: employee });
    onSetSelectedCPPeriod(cpPeriod);
  }, [canModifyPlanning, employee, cpPeriod, onSetModalState, onSetSelectedCPPeriod]);

  return (
    <div
      onClick={handleCellClick}
      data-employee-date={`${employee.id}-${dateStr}`}
      className={cn(
        "border-r border-gray-200 px-1.5 lg:px-2 py-1.5 lg:py-2 cursor-pointer hover:bg-orange-50 transition-all group relative min-w-[150px] w-[150px] lg:min-w-[180px] lg:w-[180px] flex",
        dayInfo.isWeekend && "bg-orange-50/20",
        isCPDay && "bg-green-100/40"
      )}
    >
      <div className="space-y-1.5 w-full flex flex-col relative" style={{ minHeight: `${Math.max(60, maxEventsInRow * 52)}px` }}>
        {isDisplayDateForCPBadge && cpPeriod && (
          <div
            onClick={handleCPBadgeClick}
            className={cn(
              "absolute -top-1 -right-1 z-10 text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-md transition-colors",
              canModifyPlanning
                ? "bg-green-600 text-white cursor-pointer hover:bg-red-600"
                : "bg-gray-400 text-gray-200 cursor-not-allowed opacity-60"
            )}
            title={canModifyPlanning ? "Cliquer pour supprimer" : "Lecture seule"}
          >
            🟢 {cpPeriod.cp_days_manual || cpPeriod.cp_days_auto} CP
          </div>
        )}

        {employeeNonShifts.map((nonShift) => {
          const type = nonShiftTypes.find(t => t.id === nonShift.non_shift_type_id);
          return (
            <div key={nonShift.id} className={totalEvents === 1 ? "flex-1" : ""}>
              <NonShiftCard
                nonShift={nonShift}
                nonShiftType={type}
                onClick={handleNonShiftClick}
                onDelete={handleDeleteNonShift}
                disabled={!canModifyPlanning}
              />
            </div>
          );
        })}

        {employeeShifts.map((shift) => {
          const swapInfo = swapLookup.get(`${shift.employee_id}_${shift.date}`) || null;
          return (
            <div key={shift.id} className={totalEvents === 1 ? "flex-1" : ""}>
              <ShiftCard
                shift={shift}
                positions={positions}
                swapInfo={swapInfo}
                onClick={handleShiftClick}
                onDelete={onDeleteShift}
                hasRestWarning={false}
                hasOvertimeWarning={false}
                onSave={canModifyPlanning ? onSaveShift : null}
                disabled={!canModifyPlanning}
              />
            </div>
          );
        })}

        {employeeShifts.length === 0 && employeeNonShifts.length === 0 && (
          <div className="flex items-center justify-center flex-1 text-gray-300 group-hover:text-orange-400 transition-colors">
            <Plus className="w-6 h-6" />
          </div>
        )}
      </div>
    </div>
  );
});

export default PlanningDayCell;