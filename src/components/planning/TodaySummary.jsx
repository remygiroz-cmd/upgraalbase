import React, { useState, useEffect } from 'react';
import { Users, ChevronDown, ChevronUp, AlertTriangle, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatLocalDate } from '@/components/planning/dateUtils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

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
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [deleting, setDeleting] = useState(null);

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
    
    // Sort shifts by start time and deduplicate identical times
    const sortedShifts = [...empShifts].sort((a, b) => a.start_time.localeCompare(b.start_time));
    
    // Merge identical shift times (keep only unique start_time-end_time pairs)
    const uniqueShifts = [];
    const seen = new Set();
    sortedShifts.forEach(shift => {
      const key = `${shift.start_time}-${shift.end_time}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueShifts.push(shift);
      }
    });
    
    teamGroups.get(team).push({
      employee,
      shifts: uniqueShifts
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
  
  const handleDeleteShift = async (shiftId) => {
    if (!window.confirm('Supprimer ce shift fantôme ?')) return;
    
    setDeleting(shiftId);
    try {
      await base44.entities.Shift.delete(shiftId);
      toast.success('Shift supprimé');
      window.location.reload();
    } catch (error) {
      toast.error('Erreur: ' + error.message);
    } finally {
      setDeleting(null);
    }
  };

  // Detect phantom shifts (shifts for employees not in the list or without real data)
  const phantomShifts = todayShifts.filter(shift => {
    const employee = employees.find(e => e.id === shift.employee_id);
    return !employee; // Employee not found = phantom
  });

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
    <>
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg overflow-hidden">
        {/* Header - clickable */}
        <div className="w-full p-3 flex items-center justify-between">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-2 hover:opacity-70 transition-opacity flex-1"
          >
            <Users className="w-4 h-4 text-blue-600" />
            <span className="font-bold text-sm text-blue-900">
              Aujourd'hui — Effectif : {totalPresent}
            </span>
            {phantomShifts.length > 0 && (
              <span className="ml-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {phantomShifts.length} fantôme{phantomShifts.length > 1 ? 's' : ''}
              </span>
            )}
          </button>
          
          <div className="flex items-center gap-2">
            {todayShifts.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDiagnostic(true)}
                className="text-xs h-7"
                title="Diagnostic des shifts"
              >
                <AlertTriangle className="w-3 h-3 mr-1" />
                Debug
              </Button>
            )}
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-blue-600" />
            ) : (
              <ChevronDown className="w-4 h-4 text-blue-600" />
            )}
          </div>
        </div>
      
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

      {/* Diagnostic Modal */}
      <Dialog open={showDiagnostic} onOpenChange={setShowDiagnostic}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
              Diagnostic des shifts du jour
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-sm text-gray-700">
                <strong>Total shifts aujourd'hui :</strong> {todayShifts.length}
              </p>
              <p className="text-sm text-gray-700">
                <strong>Employés uniques :</strong> {employeeShiftsMap.size}
              </p>
              {phantomShifts.length > 0 && (
                <p className="text-sm text-red-600 font-semibold mt-2">
                  ⚠️ {phantomShifts.length} shift(s) fantôme(s) détecté(s)
                </p>
              )}
            </div>

            {phantomShifts.length > 0 && (
              <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
                <h3 className="font-bold text-red-900 mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Shifts fantômes (employé introuvable)
                </h3>
                <div className="space-y-2">
                  {phantomShifts.map(shift => (
                    <div key={shift.id} className="bg-white border border-red-200 rounded p-3 flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-mono text-xs text-gray-500">ID: {shift.id}</p>
                        <p className="text-sm"><strong>Employee ID:</strong> {shift.employee_id || 'NULL'}</p>
                        <p className="text-sm"><strong>Employee Name:</strong> {shift.employee_name || 'NULL'}</p>
                        <p className="text-sm"><strong>Horaire:</strong> {shift.start_time} - {shift.end_time}</p>
                        <p className="text-sm"><strong>Position:</strong> {shift.position || 'N/A'}</p>
                        <p className="text-sm text-gray-500"><strong>Créé le:</strong> {new Date(shift.created_date).toLocaleString('fr-FR')}</p>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteShift(shift.id)}
                        disabled={deleting === shift.id}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="font-bold text-gray-900 mb-3">Tous les shifts du jour</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {todayShifts.map(shift => {
                  const employee = employees.find(e => e.id === shift.employee_id);
                  const isPhantom = !employee;
                  
                  return (
                    <div 
                      key={shift.id} 
                      className={cn(
                        "border rounded p-3 text-sm",
                        isPhantom ? "bg-red-50 border-red-300" : "bg-white border-gray-200"
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className={cn("font-semibold", isPhantom && "text-red-700")}>
                            {employee ? `${employee.first_name} ${employee.last_name}` : '❌ EMPLOYÉ INTROUVABLE'}
                          </p>
                          <p className="text-gray-600">{shift.start_time} - {shift.end_time}</p>
                          <p className="text-gray-500 text-xs">Position: {shift.position || 'N/A'}</p>
                          <p className="text-gray-400 text-xs font-mono">ID: {shift.id}</p>
                        </div>
                        {isPhantom && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteShift(shift.id)}
                            disabled={deleting === shift.id}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}