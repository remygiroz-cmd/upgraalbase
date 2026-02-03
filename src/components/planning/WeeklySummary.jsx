import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle, Trash2, ArrowDown } from 'lucide-react';
import { calculateWeeklyHours } from './LegalChecks';

export default function WeeklySummary({ employee, shifts, weekStart, onDeleteWeek, onCopyFromAbove }) {
  const weekHours = calculateWeeklyHours(shifts, employee.id, weekStart);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDelete = () => {
    if (onDeleteWeek) {
      onDeleteWeek(employee.id, weekStart);
    }
    setShowConfirm(false);
  };

  return (
    <div className={cn(
      "px-2 py-3 text-center relative group",
      weekHours.hasOvertime && "bg-orange-100"
    )}>
      {weekHours.hasOvertime && (
        <div className="absolute top-1 right-1">
          <AlertTriangle className="w-4 h-4 text-orange-600" />
        </div>
      )}

      {weekHours.total > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowConfirm(true);
          }}
          className="absolute top-1 left-1 p-1 rounded hover:bg-red-100 transition-colors opacity-0 group-hover:opacity-100"
          title="Supprimer la semaine"
        >
          <Trash2 className="w-3 h-3 text-red-600" />
        </button>
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

      {onCopyFromAbove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCopyFromAbove();
          }}
          className="mt-1 text-[9px] px-1.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center gap-1 font-semibold shadow-sm transition-colors mx-auto"
          title="Copier ma semaine du dessus"
        >
          <ArrowDown className="w-3 h-3" />
          Copier ↑
        </button>
      )}

      {showConfirm && (
        <div className="absolute inset-0 bg-white border-2 border-red-500 rounded z-50 flex flex-col items-center justify-center p-2 shadow-lg">
          <p className="text-xs font-semibold text-red-900 mb-2 text-center">
            Supprimer tous les shifts de cette semaine ?
          </p>
          <div className="flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
              className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
            >
              Oui
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowConfirm(false);
              }}
              className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300"
            >
              Non
            </button>
          </div>
        </div>
      )}
    </div>
  );
}