import React, { useState } from 'react';
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
    staleTime: 5 * 60 * 1000 // 5 minutes
  });

  // Fetch non-shift events for today
  const { data: nonShiftEvents = [], refetch: refetchEvents } = useQuery({
    queryKey: ['todayNonShifts', todayStr],
    queryFn: () => base44.entities.NonShiftEvent.filter({ date: todayStr }),
    staleTime: 5 * 60 * 1000
  });

  // Fetch all employees
  const { data: employees = [] } = useQuery({
    queryKey: ['allEmployees'],
    queryFn: () => base44.entities.Employee.list(),
    staleTime: 10 * 60 * 1000
  });

  // Fetch positions
  const { data: positions = [] } = useQuery({
    queryKey: ['positions'],
    queryFn: () => base44.entities.Position.list(),
    staleTime: 10 * 60 * 1000
  });

  // Fetch non-shift types
  const { data: nonShiftTypes = [] } = useQuery({
    queryKey: ['nonShiftTypes'],
    queryFn: () => base44.entities.NonShiftType.list(),
    staleTime: 10 * 60 * 1000
  });

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
      <button
        onClick={handleRefresh}
        className="absolute top-3 right-3 p-1.5 hover:bg-blue-100 rounded-full transition-colors z-10"
        title="Actualiser"
      >
        <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
      </button>
      
      <TodaySummary
        shifts={shifts}
        nonShiftEvents={nonShiftEvents}
        nonShiftTypes={nonShiftTypes}
        employees={employees}
        positions={positions}
      />
    </div>
  );
}