import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle, Trash2, ArrowDown, Bug } from 'lucide-react';
import { getSimpleWeeklyBalance } from './simpleOvertimeV1';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export default function WeeklySummary({ employee, shifts, weekStart, onDeleteWeek, onCopyFromAbove, nonShiftEvents = [], nonShiftTypes = [], monthStart, monthEnd }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [debugMode, setDebugMode] = useState(false);

  // Fetch calculation mode
  const { data: settings = [] } = useQuery({
    queryKey: ['appSettings', 'planning_calculation_mode'],
    queryFn: async () => {
      return await base44.entities.AppSettings.filter({ setting_key: 'planning_calculation_mode' });
    }
  });

  const calculationMode = settings[0]?.planning_calculation_mode || 'disabled';

  // V1 SIMPLE : calcul du delta hebdo
  const simpleBalance = getSimpleWeeklyBalance(shifts, employee.id, weekStart, employee);
  
  const weekHours = {
    total: simpleBalance.workedWeek,
    contractWeek: simpleBalance.contractWeek,
    delta: simpleBalance.delta,
    simpleBalance
  };

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
      
      <button
        onClick={(e) => {
          e.stopPropagation();
          setDebugMode(!debugMode);
        }}
        className={cn(
          "absolute bottom-1 right-1 p-1 rounded transition-colors opacity-0 group-hover:opacity-100",
          debugMode ? "bg-purple-200" : "hover:bg-gray-200"
        )}
        title="Mode debug"
      >
        <Bug className="w-3 h-3 text-purple-600" />
      </button>
      
      <div className="text-lg font-bold text-gray-900">
        {weekHours.total.toFixed(1)}h
      </div>
      
      {/* V1 SIMPLE : affichage du delta hebdo */}
      {calculationMode === 'monthly' && simpleBalance.status === 'calculated' && (
        <div className="text-[10px] space-y-0.5">
          <div className="text-gray-600">
            Contrat: {simpleBalance.contractWeek.toFixed(1)}h
          </div>
          <div className={cn(
            "font-semibold px-1 py-0.5 rounded",
            simpleBalance.delta === 0 ? "text-gray-600 bg-gray-50" : simpleBalance.delta > 0 ? "text-blue-700 bg-blue-50" : "text-red-700 bg-red-50"
          )}>
            Écart: {simpleBalance.delta > 0 ? '+' : ''}{simpleBalance.delta.toFixed(1)}h
          </div>
        </div>
      )}

      {debugMode && simpleBalance.status === 'calculated' && (
        <div className="absolute left-0 top-full mt-1 bg-white border-2 border-purple-500 rounded p-2 shadow-lg z-50 text-[9px] w-56">
          <div className="font-bold text-purple-900 mb-1">Debug V1:</div>
          <div className="space-y-1 font-mono text-[8px]">
            <div>weekKey: {simpleBalance.weekKey}</div>
            <div>contractWeek: {simpleBalance.contractWeek.toFixed(2)}h</div>
            <div>workedWeek: {simpleBalance.workedWeek.toFixed(2)}h</div>
            <div className="font-semibold">delta: {simpleBalance.delta > 0 ? '+' : ''}{simpleBalance.delta.toFixed(2)}h</div>
          </div>
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