import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Trash2, ArrowDown, Check, X } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import {
  calculateWeeklyHours,
  parseContractHours,
  formatLocalDate
} from '@/lib/weeklyHoursCalculation';

/**
 * Récap semaine simplifié
 *
 * Affiche:
 * - Base: heures contractuelles (éditable pour surcharger)
 * - Réalisé: heures effectivement travaillées
 * - Heures +: max(0, Réalisé - Base)
 * - Heures -: max(0, Base - Réalisé)
 */
export default function WeeklySummary({
  employee,
  shifts,
  weekStart,
  onDeleteWeek,
  onCopyFromAbove
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isEditingBase, setIsEditingBase] = useState(false);
  const [tempBaseValue, setTempBaseValue] = useState('');

  const queryClient = useQueryClient();
  const weekStartStr = formatLocalDate(weekStart);

  // Heures contractuelles par semaine depuis l'employé
  const contractHoursPerWeek = parseContractHours(employee?.contract_hours_weekly) || 0;

  // Fetch weekly recap override
  const { data: weeklyRecaps = [] } = useQuery({
    queryKey: ['weeklyRecaps', employee.id, weekStartStr],
    queryFn: async () => {
      return await base44.entities.WeeklyRecap.filter({
        employee_id: employee.id,
        week_start: weekStartStr
      });
    },
    staleTime: 30000
  });

  const weeklyRecap = weeklyRecaps[0];
  const baseOverride = weeklyRecap?.base_override_hours ?? null;

  // Calcul des heures
  const weekHours = useMemo(() => {
    return calculateWeeklyHours(
      shifts,
      employee.id,
      weekStart,
      contractHoursPerWeek,
      baseOverride
    );
  }, [shifts, employee.id, weekStart, contractHoursPerWeek, baseOverride]);

  // Mutation pour sauvegarder/mettre à jour le recap
  const saveMutation = useMutation({
    mutationFn: async (baseValue) => {
      const data = {
        employee_id: employee.id,
        week_start: weekStartStr,
        base_override_hours: baseValue
      };

      if (weeklyRecap) {
        return await base44.entities.WeeklyRecap.update(weeklyRecap.id, {
          base_override_hours: baseValue
        });
      } else {
        return await base44.entities.WeeklyRecap.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weeklyRecaps', employee.id] });
      toast.success('Base mise à jour');
    },
    onError: (error) => {
      console.error('Error saving weekly recap:', error);
      toast.error('Erreur lors de la sauvegarde');
    }
  });

  // Mutation pour supprimer le recap (reset à défaut)
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (weeklyRecap) {
        return await base44.entities.WeeklyRecap.delete(weeklyRecap.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weeklyRecaps', employee.id] });
      toast.success('Base remise par défaut');
    }
  });

  const handleDelete = () => {
    if (onDeleteWeek) {
      onDeleteWeek(employee.id, weekStart);
    }
    setShowConfirm(false);
  };

  const handleStartEdit = useCallback(() => {
    setTempBaseValue(weekHours.baseUsed.toString());
    setIsEditingBase(true);
  }, [weekHours.baseUsed]);

  const handleCancelEdit = useCallback(() => {
    setIsEditingBase(false);
    setTempBaseValue('');
  }, []);

  const handleSaveBase = useCallback(() => {
    const newValue = parseFloat(tempBaseValue);

    if (isNaN(newValue) || newValue < 0) {
      toast.error('Valeur invalide');
      return;
    }

    // Si la valeur est identique au contrat, supprimer le override
    if (Math.abs(newValue - contractHoursPerWeek) < 0.01) {
      if (weeklyRecap) {
        deleteMutation.mutate();
      }
    } else {
      saveMutation.mutate(newValue);
    }

    setIsEditingBase(false);
    setTempBaseValue('');
  }, [tempBaseValue, contractHoursPerWeek, weeklyRecap, saveMutation, deleteMutation]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      handleSaveBase();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  }, [handleSaveBase, handleCancelEdit]);

  const hasShifts = weekHours.shiftsCount > 0;
  const hasOverride = baseOverride !== null;

  return (
    <div className={cn(
      "px-2 py-2 text-center relative group",
      hasOverride && "bg-blue-50"
    )}>
      {/* Bouton supprimer semaine */}
      {hasShifts && (
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

      {/* BASE (éditable) */}
      <div className="mb-1">
        <div className="text-[9px] text-gray-500 uppercase font-semibold">Base</div>
        {isEditingBase ? (
          <div className="flex items-center justify-center gap-1">
            <input
              type="number"
              step="0.5"
              min="0"
              value={tempBaseValue}
              onChange={(e) => setTempBaseValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-14 text-center text-sm font-bold border rounded px-1 py-0.5"
              autoFocus
            />
            <button
              onClick={handleSaveBase}
              className="p-0.5 hover:bg-green-100 rounded"
              title="Valider"
            >
              <Check className="w-3 h-3 text-green-600" />
            </button>
            <button
              onClick={handleCancelEdit}
              className="p-0.5 hover:bg-red-100 rounded"
              title="Annuler"
            >
              <X className="w-3 h-3 text-red-600" />
            </button>
          </div>
        ) : (
          <button
            onClick={handleStartEdit}
            className={cn(
              "text-sm font-bold hover:bg-gray-100 px-2 py-0.5 rounded transition-colors",
              hasOverride ? "text-blue-700" : "text-gray-700"
            )}
            title="Cliquer pour modifier"
          >
            {weekHours.baseUsed.toFixed(1)}h
            {hasOverride && <span className="text-[8px] ml-1">*</span>}
          </button>
        )}
      </div>

      {/* RÉALISÉ */}
      <div className="mb-1">
        <div className="text-[9px] text-gray-500 uppercase font-semibold">Réalisé</div>
        <div className="text-lg font-bold text-gray-900">
          {weekHours.workedHours.toFixed(1)}h
        </div>
      </div>

      {/* HEURES + / HEURES - */}
      <div className="flex justify-center gap-2 text-[11px]">
        {weekHours.plusHours > 0 && (
          <div className="text-green-700 font-bold bg-green-50 px-1.5 py-0.5 rounded">
            +{weekHours.plusHours.toFixed(1)}h
          </div>
        )}
        {weekHours.minusHours > 0 && (
          <div className="text-red-700 font-bold bg-red-50 px-1.5 py-0.5 rounded">
            -{weekHours.minusHours.toFixed(1)}h
          </div>
        )}
        {weekHours.plusHours === 0 && weekHours.minusHours === 0 && weekHours.workedHours > 0 && (
          <div className="text-gray-500 font-medium">
            = 0h
          </div>
        )}
      </div>

      {/* Indicateur de surcharge */}
      {hasOverride && (
        <div className="mt-1 text-[8px] text-blue-600">
          (contrat: {contractHoursPerWeek}h)
        </div>
      )}

      {/* Bouton copier */}
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
          Copier
        </button>
      )}

      {/* Confirmation suppression */}
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
