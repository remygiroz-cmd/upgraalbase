import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle, Trash2, ArrowDown, Bug } from 'lucide-react';
import {
  calculateWeeklyHours as newCalculateWeeklyHours,
  getEffectiveHours
} from './hoursCalculation';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export default function WeeklySummary({ employee, shifts, weekStart, onDeleteWeek, onCopyFromAbove, nonShiftEvents = [], nonShiftTypes = [] }) {
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

  // Calculate hours using new TypeScript implementation
  const weekHours = useMemo(() => {
    // Adapter: Convert employee to the format expected by hoursCalculation.ts
    const employeeForCalc = {
      id: employee.id,
      work_time_type: employee.work_time_type || 'full_time',
      contract_hours_weekly: employee.contract_hours_weekly || '35:00',
      weekly_schedule: employee.weekly_schedule || null
    };

    // Adapter: Convert shifts to the format expected by hoursCalculation.ts
    const shiftsForCalc = shifts
      .filter(s => s.employee_id === employee.id)
      .map(s => ({
        id: s.id,
        date: s.date,
        employee_id: s.employee_id,
        start_time: s.start_time,
        end_time: s.end_time,
        break_minutes: s.break_minutes || 0,
        status: s.status || 'planned'
      }));

    // Call new calculation function with 'overtime' policy for outside contract hours
    const result = newCalculateWeeklyHours(shiftsForCalc, employeeForCalc, weekStart, 'overtime');

    // Get effective hours (actual if available, otherwise planned)
    const effectiveHours = getEffectiveHours(result);

    // Adapter: Convert result to format expected by UI (enrichi avec hors répartition)
    return {
      total: effectiveHours,
      totalPlanned: result.totalPlannedHours,
      totalActual: result.totalActualHours,
      contractHoursWeekly: result.contractHoursWeekly,
      type: result.workTimeType,
      hasWeeklySchedule: result.hasWeeklySchedule,
      // Heures hors répartition
      hoursOutsideContract: result.hoursOutsideContract,
      // Overtime breakdown (temps complet)
      overtime: result.overtime,
      overtime_outside: result.overtime.outsideContract,
      overtime_25: result.overtime.classic25,
      overtime_50: result.overtime.classic50,
      total_overtime: result.overtime.total,
      // Complementary breakdown (temps partiel)
      complementary: result.complementary,
      complementary_outside: result.complementary.outsideContract,
      complementary_10: result.complementary.classic10,
      complementary_25: result.complementary.classic25,
      total_complementary: result.complementary.total,
      exceeds_limit: result.complementary.exceedsLimit,
      // Legacy
      hasOvertime: result.overtime.total > 0,
      alerts: result.alerts,
      dailyBreakdown: result.dailyBreakdown,
      // Debug info
      debugInfo: debugMode ? result.dailyBreakdown.map(d => ({
        type: 'shift',
        date: d.date,
        dayOfWeek: d.dayOfWeek,
        isContractDay: d.isContractDay,
        durationMinutes: Math.round((d.totalPlanned + d.totalActual) * 60),
        hoursOutside: d.hoursOutsideContract,
        included: d.totalPlanned > 0 || d.totalActual > 0
      })) : null,
      nonShiftHours: 0
    };
  }, [shifts, employee, weekStart, debugMode]);

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
      
      {debugMode && weekHours.debugInfo && (
        <div className="absolute left-0 top-full mt-1 bg-white border-2 border-purple-500 rounded p-2 shadow-lg z-50 text-[9px] w-64 max-h-96 overflow-y-auto">
          <div className="font-bold text-purple-900 mb-1">Debug:</div>
          
          <div className="mb-2">
            <div className="font-semibold text-gray-700">Shifts:</div>
            {weekHours.debugInfo.filter(i => i.type === 'shift').map((info, i) => (
              <div key={i} className={cn(
                "font-mono",
                info.included ? "text-green-700" : "text-red-500"
              )}>
                {info.date}: {info.durationMinutes}min {info.included ? '✓' : '✗'}
              </div>
            ))}
          </div>
          
          {weekHours.debugInfo.filter(i => i.type === 'non-shift').length > 0 && (
            <div className="mb-2 border-t border-purple-200 pt-1">
              <div className="font-semibold text-blue-700">Non-shifts (génère heures):</div>
              {weekHours.debugInfo.filter(i => i.type === 'non-shift').map((info, i) => (
                <div key={i} className={cn(
                  "font-mono text-[8px]",
                  info.generatesHours ? "text-blue-600" : "text-gray-400"
                )}>
                  {info.date}: {info.label}<br/>
                  {info.generatesHours ? `✓ ${info.hoursGenerated.toFixed(2)}h (${info.method})` : '✗ Pas d\'heures'}
                </div>
              ))}
            </div>
          )}
          
          <div className="border-t border-purple-300 mt-1 pt-1">
            <div className="font-bold text-green-700">
              Shifts: {(weekHours.total - (weekHours.nonShiftHours || 0)).toFixed(2)}h
            </div>
            {weekHours.nonShiftHours > 0 && (
              <div className="font-bold text-blue-700">
                Non-shifts: {weekHours.nonShiftHours.toFixed(2)}h
              </div>
            )}
            <div className="font-bold text-purple-900">
              Total: {weekHours.total.toFixed(2)}h
            </div>
          </div>
        </div>
      )}
      
      {/* Mode hebdomadaire activé - Temps complet */}
      {calculationMode === 'weekly' && weekHours.type === 'full_time' && (
        <div className="text-[10px] space-y-0.5">
          {/* Heures manquantes */}
          {weekHours.missingHours > 0 && (
            <div className="text-red-600 font-semibold" title="Heures manquantes par rapport au contrat">
              -{weekHours.missingHours.toFixed(1)}h manquantes
            </div>
          )}
          {/* HS hors répartition (jour non prévu au contrat) */}
          {weekHours.overtime_outside > 0 && (
            <div className="text-purple-700 font-semibold" title="Heures sur jour hors contrat">
              +{weekHours.overtime_outside.toFixed(1)}h (hors rép.)
            </div>
          )}
          {/* HS classiques 25% */}
          {weekHours.overtime_25 > 0 && (
            <div className="text-orange-700 font-semibold">
              +{weekHours.overtime_25.toFixed(1)}h (+25%)
            </div>
          )}
          {/* HS classiques 50% */}
          {weekHours.overtime_50 > 0 && (
            <div className="text-red-700 font-semibold">
              +{weekHours.overtime_50.toFixed(1)}h (+50%)
            </div>
          )}
        </div>
      )}

      {/* Mode hebdomadaire activé - Temps partiel */}
      {calculationMode === 'weekly' && weekHours.type === 'part_time' && (
        <div className="text-[10px] space-y-0.5">
          {/* Heures manquantes */}
          {weekHours.missingHours > 0 && (
            <div className="text-red-600 font-semibold" title="Heures manquantes par rapport au contrat">
              -{weekHours.missingHours.toFixed(1)}h manquantes
            </div>
          )}
          {/* HC hors répartition */}
          {weekHours.complementary_outside > 0 && (
            <div className="text-purple-700 font-semibold" title="Heures sur jour hors contrat">
              +{weekHours.complementary_outside.toFixed(1)}h (hors rép.)
            </div>
          )}
          {/* HC classiques 10% */}
          {weekHours.complementary_10 > 0 && (
            <div className="text-green-700 font-semibold">
              +{weekHours.complementary_10.toFixed(1)}h (+10%)
            </div>
          )}
          {/* HC classiques 25% */}
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