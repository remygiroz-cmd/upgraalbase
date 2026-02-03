import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle, Trash2, ArrowDown } from 'lucide-react';
import { calculateWeeklyHours } from './LegalChecks';
import { calculateWeeklyEmployeeHours } from './OvertimeCalculations';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export default function WeeklySummary({ employee, shifts, weekStart, onDeleteWeek, onCopyFromAbove }) {
  const [showConfirm, setShowConfirm] = useState(false);

  // Fetch calculation mode
  const { data: settings = [] } = useQuery({
    queryKey: ['appSettings', 'planning_calculation_mode'],
    queryFn: async () => {
      return await base44.entities.AppSettings.filter({ setting_key: 'planning_calculation_mode' });
    }
  });

  const calculationMode = settings[0]?.planning_calculation_mode || 'disabled';

  // Calculate hours based on mode
  let weekHours;
  if (calculationMode === 'weekly') {
    weekHours = calculateWeeklyEmployeeHours(shifts, employee.id, weekStart, employee);
  } else {
    // Fallback to basic calculation
    weekHours = calculateWeeklyHours(shifts, employee.id, weekStart);
  }

  const handleDelete = () => {
    if (onDeleteWeek) {
      onDeleteWeek(employee.id, weekStart);
    }
    setShowConfirm(false);
  };

  const hasOvertime = weekHours.total_overtime > 0 || weekHours.total_complementary > 0 || weekHours.exceeds_limit;

  return (
    <div className={cn(
      "px-2 py-3 text-center relative group",
      hasOvertime && "bg-orange-100"
    )}>
      {hasOvertime && (
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
      
      {/* Mode hebdomadaire activé */}
      {calculationMode === 'weekly' && weekHours.type === 'full_time' && weekHours.total_overtime > 0 && (
        <div className="text-[10px] space-y-0.5">
          {weekHours.overtime_25 > 0 && (
            <div className="text-orange-700 font-semibold">
              +{weekHours.overtime_25.toFixed(1)}h (+25%)
            </div>
          )}
          {weekHours.overtime_50 > 0 && (
            <div className="text-red-700 font-semibold">
              +{weekHours.overtime_50.toFixed(1)}h (+50%)
            </div>
          )}
        </div>
      )}

      {calculationMode === 'weekly' && weekHours.type === 'part_time' && weekHours.total_complementary > 0 && (
        <div className="text-[10px] space-y-0.5">
          {weekHours.complementary_10 > 0 && (
            <div className="text-green-700 font-semibold">
              +{weekHours.complementary_10.toFixed(1)}h (+10%)
            </div>
          )}
          {weekHours.complementary_25 > 0 && (
            <div className="text-orange-700 font-semibold">
              +{weekHours.complementary_25.toFixed(1)}h (+25%)
            </div>
          )}
          {weekHours.exceeds_limit && (
            <div className="text-red-700 font-bold">
              ⚠️ Plafond dépassé
            </div>
          )}
        </div>
      )}

      {/* Mode désactivé - affichage simple */}
      {calculationMode === 'disabled' && weekHours.total > 0 && (
        <div className="text-[10px] text-gray-500">
          {weekHours.hasOvertime ? `+${weekHours.overtime?.toFixed(1)}h` : 'Normal'}
        </div>
      )}

      {/* Mode mensuel - info uniquement */}
      {calculationMode === 'monthly' && weekHours.total > 0 && (
        <div className="text-[10px] text-gray-500">
          Calcul mensuel
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