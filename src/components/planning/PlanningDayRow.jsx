import React, { useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Calendar } from 'lucide-react';
import { toast } from 'sonner';
import PlanningDayCell from './PlanningDayCell';
import { isDateInCPPeriod } from './paidLeaveCalculations';
import { formatLocalDate } from './dateUtils';

/**
 * Ligne-jour complète du planning.
 * Mémoïsée via React.memo avec comparaison fine des props.
 * Ne re-rend que si les shifts/absences/employés de ce jour changent.
 */
const PlanningDayRow = React.memo(function PlanningDayRow({
  dayInfo,
  dateStr,
  visibleEmployees,
  getShiftsForEmployeeAndDate,
  getNonShiftsForEmployeeAndDate,
  paidLeavePeriods,
  currentYear,
  currentMonth,
  positions,
  nonShiftTypes,
  swapLookup,
  canModifyPlanning,
  isHoliday,
  onCellClick,
  onDeleteShift,
  onSaveShift,
  onToggleHoliday,
  onSetModalState,
  onSetSelectedCPPeriod,
}) {
  const maxEventsInRow = Math.max(
    1,
    ...visibleEmployees.map(emp => {
      const s = getShiftsForEmployeeAndDate(emp.id, dateStr);
      const ns = getNonShiftsForEmployeeAndDate(emp.id, dateStr);
      return s.length + ns.length;
    })
  );

  const monthStart = formatLocalDate(new Date(currentYear, currentMonth, 1));
  const monthEnd = formatLocalDate(new Date(currentYear, currentMonth + 1, 0));

  const handleHolidayToggle = useCallback((e) => {
    e.stopPropagation();
    if (!canModifyPlanning) {
      toast.error('Lecture seule — vous n\'avez pas la permission de modifier le planning', {
        duration: 3000,
        icon: '🔒'
      });
      return;
    }
    onToggleHoliday(dateStr);
  }, [canModifyPlanning, dateStr, onToggleHoliday]);

  return (
    <div
      className={cn(
        "flex border-b border-gray-200 hover:bg-gray-50/50 transition-colors",
        dayInfo.isWeekend && "bg-orange-50/30",
        dayInfo.isToday && "bg-blue-50/80"
      )}
      data-day={dateStr}
      data-today={dayInfo.isToday ? "true" : undefined}
    >
      {/* Sticky date column */}
      <div className={cn(
        "sticky left-0 z-20 border-r-2 border-gray-300 px-2 lg:px-4 py-2 lg:py-3 shadow-sm w-[80px] lg:w-[120px] flex flex-col justify-center bg-white",
        dayInfo.isWeekend && "bg-orange-50/30",
        dayInfo.isToday && "bg-gradient-to-r from-blue-100 to-blue-50 border-l-4 border-l-blue-500"
      )}>
        <div className={cn(
          "font-bold text-[9px] lg:text-xs uppercase tracking-wide",
          dayInfo.isToday ? "text-blue-900" : "text-gray-600"
        )}>
          {dayInfo.dayName.substring(0, 3)}
        </div>
        <div className={cn(
          "text-xl lg:text-2xl font-bold",
          dayInfo.isToday ? "text-blue-700" : "text-gray-900"
        )}>
          {dayInfo.day}
        </div>
        <button
          onClick={handleHolidayToggle}
          disabled={!canModifyPlanning}
          className={cn(
            "mt-1 text-[8px] lg:text-[9px] px-1 lg:px-1.5 py-0.5 rounded-full font-semibold transition-all",
            !canModifyPlanning
              ? "bg-gray-200 text-gray-400 cursor-not-allowed opacity-60"
              : isHoliday
              ? "bg-purple-600 text-white hover:bg-purple-700 cursor-pointer"
              : "bg-gray-200 text-gray-600 hover:bg-purple-100 hover:text-purple-700 cursor-pointer"
          )}
          title={!canModifyPlanning ? "Lecture seule" : (isHoliday ? "Retirer jour férié" : "Marquer jour férié")}
        >
          {isHoliday ? "🎉" : "+F"}
        </button>
      </div>

      {/* Employee cells */}
      <div className="flex flex-1">
        {visibleEmployees.map(employee => {
          const employeeShifts = getShiftsForEmployeeAndDate(employee.id, dateStr);
          const employeeNonShifts = getNonShiftsForEmployeeAndDate(employee.id, dateStr);
          const employeeCPPeriods = paidLeavePeriods.filter(p => p.employee_id === employee.id);
          const cpPeriod = isDateInCPPeriod(dateStr, employeeCPPeriods);
          const isCPDay = !!cpPeriod;

          let isDisplayDateForCPBadge = false;
          if (cpPeriod) {
            const periodEnd = cpPeriod.end_cp;
            const displayDate = periodEnd <= monthEnd ? periodEnd : monthEnd;
            isDisplayDateForCPBadge = dateStr === displayDate;
          }

          return (
            <PlanningDayCell
              key={employee.id}
              employee={employee}
              dateStr={dateStr}
              dayInfo={dayInfo}
              employeeShifts={employeeShifts}
              employeeNonShifts={employeeNonShifts}
              maxEventsInRow={maxEventsInRow}
              isCPDay={isCPDay}
              cpPeriod={cpPeriod}
              isDisplayDateForCPBadge={isDisplayDateForCPBadge}
              positions={positions}
              nonShiftTypes={nonShiftTypes}
              swapLookup={swapLookup}
              canModifyPlanning={canModifyPlanning}
              onCellClick={onCellClick}
              onDeleteShift={onDeleteShift}
              onSaveShift={onSaveShift}
              onDeleteNonShift={null}
              onSetModalState={onSetModalState}
              onSetSelectedCPPeriod={onSetSelectedCPPeriod}
            />
          );
        })}
      </div>
    </div>
  );
}, (prev, next) => {
  // Custom comparator : ne re-rendre que si les données de ce jour ont changé
  if (prev.dateStr !== next.dateStr) return false;
  if (prev.canModifyPlanning !== next.canModifyPlanning) return false;
  if (prev.isHoliday !== next.isHoliday) return false;
  if (prev.visibleEmployees !== next.visibleEmployees) return false;
  if (prev.positions !== next.positions) return false;
  if (prev.nonShiftTypes !== next.nonShiftTypes) return false;
  if (prev.swapLookup !== next.swapLookup) return false;
  if (prev.paidLeavePeriods !== next.paidLeavePeriods) return false;
  if (prev.getShiftsForEmployeeAndDate !== next.getShiftsForEmployeeAndDate) return false;
  if (prev.getNonShiftsForEmployeeAndDate !== next.getNonShiftsForEmployeeAndDate) return false;
  // callbacks stabilisés via useCallback dans le parent → refs stables
  if (prev.onCellClick !== next.onCellClick) return false;
  if (prev.onDeleteShift !== next.onDeleteShift) return false;
  if (prev.onSaveShift !== next.onSaveShift) return false;
  if (prev.onToggleHoliday !== next.onToggleHoliday) return false;
  if (prev.onSetModalState !== next.onSetModalState) return false;
  if (prev.onSetSelectedCPPeriod !== next.onSetSelectedCPPeriod) return false;
  return true;
});

export default PlanningDayRow;