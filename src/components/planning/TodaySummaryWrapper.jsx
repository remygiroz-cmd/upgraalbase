import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import TodaySummary from './TodaySummary';
import { formatLocalDate } from './dateUtils';
import { RefreshCw } from 'lucide-react';

export default function TodaySummaryWrapper({ currentEmployee }) {
  const today = new Date();
  const todayStr = formatLocalDate(today);

  // Fetch shifts for today
  const { data: shifts = [], refetch: refetchShifts } = useQuery({
    queryKey: ['todayShifts', todayStr],
    queryFn: () => base44.entities.Shift.filter({ date: todayStr }),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000 // Auto-refresh every 5 minutes
  });

  // Fetch non-shift events for today
  const { data: nonShiftEvents = [], refetch: refetchEvents } = useQuery({
    queryKey: ['todayNonShifts', todayStr],
    queryFn: () => base44.entities.NonShiftEvent.filter({ date: todayStr }),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000
  });

  // Fetch all employees (active only for today's display)
  const { data: allEmployees = [] } = useQuery({
    queryKey: ['allEmployees'],
    queryFn: () => base44.entities.Employee.list(),
    staleTime: 10 * 60 * 1000
  });

  // Fetch teams for ordering
  const { data: allTeams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.filter({ is_active: true }),
    staleTime: 10 * 60 * 1000
  });

  // Fetch non-shift types
  const { data: nonShiftTypes = [] } = useQuery({
    queryKey: ['nonShiftTypes'],
    queryFn: () => base44.entities.NonShiftType.list(),
    staleTime: 10 * 60 * 1000
  });

  // Filter and sort employees EXACTLY like Planning does
  const employees = useMemo(() => {
    // Only show employees who have shifts today OR are active
    const activeEmployees = allEmployees.filter(emp => {
      // Active employees
      if (emp.is_active === true) return true;
      
      // Inactive employees with shifts today
      const hasShiftsToday = shifts.some(s => s.employee_id === emp.id);
      return hasShiftsToday;
    });

    // Sort by team order then by name (EXACTLY like Planning)
    return [...activeEmployees].sort((a, b) => {
      const teamA = allTeams.find(t => t.id === a.team_id);
      const teamB = allTeams.find(t => t.id === b.team_id);
      
      const orderA = teamA?.order ?? 999;
      const orderB = teamB?.order ?? 999;
      
      if (orderA !== orderB) return orderA - orderB;
      
      // Same team, sort by first name
      return (a.first_name || '').localeCompare(b.first_name || '');
    });
  }, [allEmployees, allTeams, shifts]);

  const handleRefresh = () => {
    refetchShifts();
    refetchEvents();
  };

  if (!currentEmployee) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
        <p className="text-sm text-yellow-800">
          Effectif indisponible (profil non rattaché)
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute top-3 right-12 z-10">
        <button
          onClick={handleRefresh}
          className="p-1.5 hover:bg-blue-100 rounded-full transition-colors"
          title="Actualiser"
        >
          <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
        </button>
      </div>
      
      <TodaySummary
        shifts={shifts}
        nonShiftEvents={nonShiftEvents}
        nonShiftTypes={nonShiftTypes}
        employees={employees}
        positions={[]}
      />
    </div>
  );
}