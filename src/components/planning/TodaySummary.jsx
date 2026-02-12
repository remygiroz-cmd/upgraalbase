import React, { useState, useEffect } from 'react';
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
  const [expanded, setExpanded] = useState(() => {
    const saved = localStorage.getItem('todaySummary_expanded');
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    localStorage.setItem('todaySummary_expanded', expanded);
  }, [expanded]);
  
  // Get today's date
  const today = new Date();
  const todayStr = formatLocalDate(today);
  
  // Get today's shifts
  const todayShifts = shifts.filter(s => s.date === todayStr);
  
  // Get today's absences
  const todayAbsences = nonShiftEvents.filter(e => e.date === todayStr);
  
  // Group shifts by employee (deduplicate)
  const employeeShiftsMap = new Map();
  todayShifts.forEach(shift => {
    if (!employeeShiftsMap.has(shift.employee_id)) {
      employeeShiftsMap.set(shift.employee_id, []);
    }
    employeeShiftsMap.get(shift.employee_id).push(shift);
  });
  
  // Total UNIQUE employees present
  const totalPresent = employeeShiftsMap.size;
  
  // Group by team (équipe)
  const teamGroups = new Map();
  employeeShiftsMap.forEach((empShifts, employeeId) => {
    const employee = employees.find(e => e.id === employeeId);
    if (!employee) return;
    
    const team = employee.team || 'Autre';
    if (!teamGroups.has(team)) {
      teamGroups.set(team, []);
    }
    
    // Sort shifts by start time
    const sortedShifts = [...empShifts].sort((a, b) => a.start_time.localeCompare(b.start_time));
    
    teamGroups.get(team).push({
      employee,
      shifts: sortedShifts
    });
  });
  
  // Sort teams alphabetically
  const sortedTeams = Array.from(teamGroups.keys()).sort((a, b) => {
    if (a === 'Autre') return 1;
    if (b === 'Autre') return -1;
    return a.localeCompare(b);
  });
  
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
          <span className="font-semibold text-sm">Aujourd'hui : aucun shift prévu</span>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg overflow-hidden">
      {/* Header - clickable */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-center justify-between hover:bg-blue-100/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-600" />
          <span className="font-bold text-sm text-blue-900">
            Aujourd'hui — Effectif : {totalPresent}
          </span>
        </div>
        
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-blue-600" />
        ) : (
          <ChevronDown className="w-4 h-4 text-blue-600" />
        )}
      </button>
      
      {/* Content */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-blue-200 pt-2">
          {/* Present by team */}
          {sortedTeams.map(team => {
            const group = teamGroups.get(team);
            
            return (
              <div key={team} className="text-xs">
                <span className="font-semibold text-blue-800 mr-2">
                  {team}:
                </span>
                <span className="text-gray-700">
                  {group.map(({ employee, shifts }, idx) => (
                    <React.Fragment key={employee.id}>
                      {idx > 0 && ', '}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEmployeeClick?.(employee.id, todayStr);
                        }}
                        className="hover:underline hover:text-blue-600 transition-colors uppercase"
                      >
                        {employee.first_name} {employee.last_name.charAt(0)}.
                      </button>
                      <span className="text-gray-500 ml-1">
                        {shifts.map((s, i) => (
                          <React.Fragment key={s.id}>
                            {i > 0 && ', '}
                            {s.start_time.substring(0, 5)}
                          </React.Fragment>
                        ))}
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
      )}
    </div>
  );
}