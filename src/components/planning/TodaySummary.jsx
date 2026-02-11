import React, { useState } from 'react';
import { Users, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatLocalDate } from '@/components/planning/dateUtils';

export default function TodaySummary({ 
  shifts = [], 
  nonShiftEvents = [], 
  nonShiftTypes = [],
  employees = [],
  positions = [],
  onEmployeeClick 
}) {
  const [expanded, setExpanded] = useState(false);
  
  // Get today's date
  const today = new Date();
  const todayStr = formatLocalDate(today);
  
  // Get today's shifts
  const todayShifts = shifts.filter(s => s.date === todayStr);
  
  // Get today's absences
  const todayAbsences = nonShiftEvents.filter(e => e.date === todayStr);
  
  // Group shifts by employee
  const employeeShiftsMap = new Map();
  todayShifts.forEach(shift => {
    if (!employeeShiftsMap.has(shift.employee_id)) {
      employeeShiftsMap.set(shift.employee_id, []);
    }
    employeeShiftsMap.get(shift.employee_id).push(shift);
  });
  
  // Group by position
  const positionGroups = new Map();
  employeeShiftsMap.forEach((empShifts, employeeId) => {
    const employee = employees.find(e => e.id === employeeId);
    if (!employee) return;
    
    // Sort shifts by start time
    empShifts.sort((a, b) => a.start_time.localeCompare(b.start_time));
    
    empShifts.forEach(shift => {
      const position = shift.position || 'Autre';
      if (!positionGroups.has(position)) {
        positionGroups.set(position, []);
      }
      
      positionGroups.get(position).push({
        employee,
        shift
      });
    });
  });
  
  // Sort positions by their order
  const sortedPositions = Array.from(positionGroups.keys()).sort((a, b) => {
    const posA = positions.find(p => p.label === a);
    const posB = positions.find(p => p.label === b);
    return (posA?.order || 999) - (posB?.order || 999);
  });
  
  // Total count
  const totalPresent = employeeShiftsMap.size;
  
  // Format absences
  const absences = todayAbsences.map(absence => {
    const employee = employees.find(e => e.id === absence.employee_id);
    const type = nonShiftTypes.find(t => t.id === absence.non_shift_type_id);
    return {
      employee,
      type: type?.label || 'Absence'
    };
  }).filter(a => a.employee);
  
  if (totalPresent === 0 && absences.length === 0) {
    return (
      <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-3 mb-2">
        <div className="flex items-center gap-2 text-blue-900">
          <Users className="w-4 h-4" />
          <span className="font-semibold text-sm">Aujourd'hui : aucun employé prévu</span>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-3 mb-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-600" />
          <span className="font-bold text-sm text-blue-900">
            Aujourd'hui — Effectif : {totalPresent}
          </span>
        </div>
        
        {/* Mobile toggle button */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="lg:hidden p-1 hover:bg-blue-100 rounded transition-colors"
        >
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-blue-600" />
          ) : (
            <ChevronDown className="w-4 h-4 text-blue-600" />
          )}
        </button>
      </div>
      
      {/* Content - always visible on desktop, toggleable on mobile */}
      <div className={cn(
        "space-y-2",
        "lg:block",
        expanded ? "block" : "hidden"
      )}>
        {/* Present by position */}
        {sortedPositions.map(position => {
          const group = positionGroups.get(position);
          const positionObj = positions.find(p => p.label === position);
          const positionColor = positionObj?.color || '#3b82f6';
          
          return (
            <div key={position} className="text-xs">
              <span 
                className="font-semibold mr-2"
                style={{ color: positionColor }}
              >
                {position}:
              </span>
              <span className="text-gray-700">
                {group.map(({ employee, shift }, idx) => (
                  <React.Fragment key={`${employee.id}-${shift.id}`}>
                    {idx > 0 && ', '}
                    <button
                      onClick={() => onEmployeeClick?.(employee.id, todayStr)}
                      className="hover:underline hover:text-blue-600 transition-colors"
                    >
                      {employee.first_name} {employee.last_name.charAt(0)}.
                    </button>
                    <span className="text-gray-500 ml-1">
                      {shift.start_time.substring(0, 5)}
                    </span>
                  </React.Fragment>
                ))}
              </span>
            </div>
          );
        })}
        
        {/* Absences */}
        {absences.length > 0 && (
          <div className="text-xs pt-2 border-t border-blue-200">
            <span className="font-semibold text-gray-500 mr-2">Absents:</span>
            <span className="text-gray-400">
              {absences.map((absence, idx) => (
                <React.Fragment key={absence.employee.id}>
                  {idx > 0 && ', '}
                  {absence.employee.first_name} {absence.employee.last_name.charAt(0)}. ({absence.type})
                </React.Fragment>
              ))}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}