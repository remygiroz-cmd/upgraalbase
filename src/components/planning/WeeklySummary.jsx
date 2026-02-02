import React from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';
import { calculateWeeklyHours } from './LegalChecks';

export default function WeeklySummary({ employee, shifts, weekStart }) {
  const weekHours = calculateWeeklyHours(shifts, employee.id, weekStart);

  return (
    <div className={cn(
      "px-2 py-3 text-center relative",
      weekHours.hasOvertime && "bg-orange-100"
    )}>
      {weekHours.hasOvertime && (
        <div className="absolute top-1 right-1">
          <AlertTriangle className="w-4 h-4 text-orange-600" />
        </div>
      )}
      
      <div className="text-lg font-bold text-gray-900">
        {weekHours.total.toFixed(1)}h
      </div>
      
      {weekHours.hasOvertime && (
        <div className="text-[10px] text-orange-700 font-semibold">
          +{weekHours.overtime.toFixed(1)}h supp.
        </div>
      )}
      
      {!weekHours.hasOvertime && weekHours.total > 0 && (
        <div className="text-[10px] text-gray-500">
          Normal
        </div>
      )}
    </div>
  );
}