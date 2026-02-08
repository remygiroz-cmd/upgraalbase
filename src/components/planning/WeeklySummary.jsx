import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Trash2, ArrowDown, Check, X } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import {
  calculateShiftDuration,
  parseContractHours,
  formatLocalDate
} from '@/lib/weeklyHoursCalculation';

/**
 * Récap semaine simplifié
 *
 * Affiche:
 * - Base: heures contractuelles (éditable pour surcharger)
 * - Réalisé: heures effectivement travaillées
 * - Heures +: max(0, Réalisé - Base) - toujours >= 0
 * - Heures -: max(0, Base - Réalisé) - toujours >= 0, affiché SANS signe négatif
 */
export default function WeeklySummary({
  employee,
  shifts,
  weekStart,
  onDeleteWeek,
  onCopyFromAbove,
  currentMonth,
  currentYear
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isEditingBase, setIsEditingBase] = useState(false);
  const [baseDraft, setBaseDraft] = useState('');

  const queryClient = useQueryClient();
  const weekStartStr = formatLocalDate(weekStart);

  // Heures contractuelles par semaine depuis l'employé
  const contractHoursPerWeek = parseContractHours(employee?.contract_hours_weekly) || 0;
  const workDaysPerWeek = employee?.work_days_per_week || 5;

  // Fetch weekly recap override
  const { data: weeklyRecaps = [], isLoading, error } = useQuery({
    queryKey: ['weeklyRecaps', employee.id, weekStartStr],
    queryFn: async () => {
      try {
        const result = await base44.entities.WeeklyRecap.filter({
          employee_id: employee.id,
          week_start: weekStartStr
        });
        console.log('[WeeklySummary] Loaded WeeklyRecap:', { employeeId: employee.id, weekStart: weekStartStr, result });
        return result;
      } catch (err) {
        console.error('[WeeklySummary] Error loading WeeklyRecap:', err);
        return [];
      }
    },
    staleTime: 10000
  });

  const weeklyRecap = weeklyRecaps[0];
  const baseOverrideFromDB = weeklyRecap?.base_override_hours ?? null;

  // =====================================================
  // PRORATISATION SEMAINE INCOMPLÈTE
  // =====================================================
  const { isPartialWeek, workingDaysInPartialWeek, proratedBase } = useMemo(() => {
    if (!currentMonth || currentMonth === undefined || !currentYear || currentYear === undefined) {
      // Si pas de mois/année fourni, pas de proratisation
      return { isPartialWeek: false, workingDaysInPartialWeek: workDaysPerWeek, proratedBase: contractHoursPerWeek };
    }

    const monthStart = new Date(currentYear, currentMonth, 1);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0);
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    
    // Vérifier si la semaine est incomplète (ne contient pas 7 jours dans le mois)
    const daysInMonth = [];
    for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
      const current = new Date(d);
      if (current >= monthStart && current <= monthEnd) {
        daysInMonth.push(current.getDay()); // 0=dimanche, 1=lundi, etc.
      }
    }
    
    const totalDaysInWeekWithinMonth = daysInMonth.length;
    const isPartial = totalDaysInWeekWithinMonth < 7;
    
    if (!isPartial) {
      return { isPartialWeek: false, workingDaysInPartialWeek: workDaysPerWeek, proratedBase: contractHoursPerWeek };
    }
    
    // Déterminer les jours travaillés attendus pour cet employé
    // On utilise weekly_schedule si disponible, sinon on suppose une répartition uniforme
    const weeklySchedule = employee?.weekly_schedule;
    let expectedWorkingDays = new Set();
    
    if (weeklySchedule) {
      // Mapper les jours travaillés depuis weekly_schedule
      const dayMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      dayMap.forEach((dayName, dayIndex) => {
        if (weeklySchedule[dayName]?.worked) {
          expectedWorkingDays.add(dayIndex);
        }
      });
    }
    
    // Si pas de schedule ou vide, on suppose que l'employé travaille workDaysPerWeek jours consécutifs à partir du lundi
    if (expectedWorkingDays.size === 0) {
      // Par défaut : lundi à vendredi pour 5 jours, etc.
      for (let i = 0; i < workDaysPerWeek; i++) {
        expectedWorkingDays.add((i + 1) % 7); // 1=lundi, 2=mardi, etc.
      }
    }
    
    // Compter combien de jours travaillés dans la portion de semaine dans le mois
    const workingDaysCount = daysInMonth.filter(dayOfWeek => expectedWorkingDays.has(dayOfWeek)).length;
    
    // Calculer base proratisée
    const basePerDay = contractHoursPerWeek / workDaysPerWeek;
    const prorated = basePerDay * workingDaysCount;
    
    return {
      isPartialWeek: true,
      workingDaysInPartialWeek: workingDaysCount,
      proratedBase: prorated
    };
  }, [weekStart, currentMonth, currentYear, employee, contractHoursPerWeek, workDaysPerWeek]);

  // Base par défaut (proratisée si semaine incomplète, sinon contrat)
  const baseDefault = isPartialWeek ? proratedBase : contractHoursPerWeek;

  // Calculer les heures travaillées (workedHours)
  const workedHours = useMemo(() => {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = formatLocalDate(weekEnd);

    const weekShifts = shifts.filter(s => {
      if (s.employee_id !== employee.id) return false;
      if (s.date < weekStartStr || s.date > weekEndStr) return false;
      if (s.status === 'cancelled') return false;
      return true;
    });

    return weekShifts.reduce((sum, shift) => {
      return sum + calculateShiftDuration(shift);
    }, 0);
  }, [shifts, employee.id, weekStart, weekStartStr]);

  // Compter les shifts
  const shiftsCount = useMemo(() => {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = formatLocalDate(weekEnd);

    return shifts.filter(s => {
      if (s.employee_id !== employee.id) return false;
      if (s.date < weekStartStr || s.date > weekEndStr) return false;
      if (s.status === 'cancelled') return false;
      return true;
    }).length;
  }, [shifts, employee.id, weekStart, weekStartStr]);

  // =====================================================
  // CALCUL OPTIMISTE: baseUsed prend en compte baseDraft
  // =====================================================
  const baseUsedForUI = useMemo(() => {
    // Si on est en train d'éditer et qu'il y a une valeur draft valide, l'utiliser
    if (isEditingBase && baseDraft !== '') {
      const parsed = parseFloat(baseDraft);
      if (!isNaN(parsed) && parsed >= 0) {
        return parsed;
      }
    }
    // Sinon, utiliser la valeur DB ou la base par défaut (proratisée si nécessaire)
    return baseOverrideFromDB !== null ? baseOverrideFromDB : baseDefault;
  }, [isEditingBase, baseDraft, baseOverrideFromDB, baseDefault]);

  // Calcul des écarts - TOUJOURS POSITIFS
  const plusHours = Math.max(0, workedHours - baseUsedForUI);
  const minusHours = Math.max(0, baseUsedForUI - workedHours);

  // Mutation pour sauvegarder/mettre à jour le recap
  const saveMutation = useMutation({
    mutationFn: async (baseValue) => {
      console.log('[WeeklySummary] Saving base override:', {
        employeeId: employee.id,
        weekStart: weekStartStr,
        baseValue,
        existingRecap: weeklyRecap
      });

      const data = {
        employee_id: employee.id,
        week_start: weekStartStr,
        base_override_hours: baseValue
      };

      try {
        let result;
        if (weeklyRecap) {
          console.log('[WeeklySummary] Updating existing recap:', weeklyRecap.id);
          result = await base44.entities.WeeklyRecap.update(weeklyRecap.id, {
            base_override_hours: baseValue
          });
        } else {
          console.log('[WeeklySummary] Creating new recap');
          result = await base44.entities.WeeklyRecap.create(data);
        }
        console.log('[WeeklySummary] Save result:', result);
        return result;
      } catch (err) {
        console.error('[WeeklySummary] Save error:', err);
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weeklyRecaps', employee.id] });
      toast.success('Base mise à jour');
    },
    onError: (error) => {
      console.error('[WeeklySummary] Mutation error:', error);
      toast.error(`Erreur: ${error.message || 'Échec de la sauvegarde'}`);
    }
  });

  // Mutation pour supprimer le recap (reset à défaut)
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (weeklyRecap) {
        console.log('[WeeklySummary] Deleting recap:', weeklyRecap.id);
        return await base44.entities.WeeklyRecap.delete(weeklyRecap.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weeklyRecaps', employee.id] });
      toast.success('Base remise par défaut');
    },
    onError: (error) => {
      console.error('[WeeklySummary] Delete error:', error);
      toast.error(`Erreur: ${error.message}`);
    }
  });

  const handleDelete = () => {
    if (onDeleteWeek) {
      onDeleteWeek(employee.id, weekStart);
    }
    setShowConfirm(false);
  };

  const handleStartEdit = useCallback(() => {
    // Initialiser baseDraft avec la valeur actuelle
    const currentBase = baseOverrideFromDB !== null ? baseOverrideFromDB : baseDefault;
    setBaseDraft(currentBase.toString());
    setIsEditingBase(true);
  }, [baseOverrideFromDB, baseDefault]);

  const handleCancelEdit = useCallback(() => {
    setIsEditingBase(false);
    setBaseDraft('');
  }, []);

  const handleSaveBase = useCallback(() => {
    const trimmed = baseDraft.trim();

    // Si vide, on supprime le override (retour à la base par défaut)
    if (trimmed === '' || trimmed === baseDefault.toString()) {
      console.log('[WeeklySummary] Resetting to default base');
      if (weeklyRecap) {
        deleteMutation.mutate();
      }
      setIsEditingBase(false);
      setBaseDraft('');
      return;
    }

    const newValue = parseFloat(trimmed);

    if (isNaN(newValue) || newValue < 0) {
      toast.error('Valeur invalide');
      return;
    }

    // Si identique à la base par défaut, supprimer l'override
    if (Math.abs(newValue - baseDefault) < 0.01) {
      console.log('[WeeklySummary] Value equals default base, removing override');
      if (weeklyRecap) {
        deleteMutation.mutate();
      }
    } else {
      console.log('[WeeklySummary] Saving new override:', newValue);
      saveMutation.mutate(newValue);
    }

    setIsEditingBase(false);
    setBaseDraft('');
  }, [baseDraft, baseDefault, weeklyRecap, saveMutation, deleteMutation]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      handleSaveBase();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  }, [handleSaveBase, handleCancelEdit]);

  // Sauvegarder aussi sur blur
  const handleBlur = useCallback(() => {
    handleSaveBase();
  }, [handleSaveBase]);

  const hasShifts = shiftsCount > 0;
  const hasOverride = baseOverrideFromDB !== null;

  // Valeur affichée pour la base (quand pas en édition)
  const displayedBase = baseOverrideFromDB !== null ? baseOverrideFromDB : baseDefault;

  return (
    <div className={cn(
      "px-2 py-2 text-center relative group",
      hasOverride && "bg-blue-50",
      isPartialWeek && !hasOverride && "bg-amber-50/30"
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
        <div className="text-[9px] text-gray-500 uppercase font-semibold flex items-center justify-center gap-1">
          Base
          {isPartialWeek && !hasOverride && (
            <span title="Semaine incomplète - base proratisée">⚠️</span>
          )}
        </div>
        {isEditingBase ? (
          <div className="flex items-center justify-center gap-1">
            <input
              type="number"
              step="0.5"
              min="0"
              value={baseDraft}
              onChange={(e) => setBaseDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
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
            {displayedBase.toFixed(1)}h
            {hasOverride && <span className="text-[8px] ml-1">*</span>}
          </button>
        )}
      </div>

      {/* RÉALISÉ */}
      <div className="mb-1">
        <div className="text-[9px] text-gray-500 uppercase font-semibold">Réalisé</div>
        <div className="text-lg font-bold text-gray-900">
          {workedHours.toFixed(1)}h
        </div>
      </div>

      {/* HEURES + / HEURES - (toujours positifs dans l'affichage) */}
      <div className="flex justify-center gap-2 text-[11px]">
        {plusHours > 0 && (
          <div className="text-green-700 font-bold bg-green-50 px-1.5 py-0.5 rounded">
            +{plusHours.toFixed(1)}h
          </div>
        )}
        {minusHours > 0 && (
          <div className="text-red-700 font-bold bg-red-50 px-1.5 py-0.5 rounded">
            {/* CORRECTION: pas de signe négatif, minusHours est déjà positif */}
            {minusHours.toFixed(1)}h -
          </div>
        )}
        {plusHours === 0 && minusHours === 0 && workedHours > 0 && (
          <div className="text-gray-500 font-medium">
            = 0h
          </div>
        )}
      </div>

      {/* Indicateur de surcharge ou proratisation */}
      {hasOverride && (
        <div className="mt-1 text-[8px] text-blue-600">
          (défaut: {baseDefault.toFixed(1)}h)
        </div>
      )}
      {isPartialWeek && !hasOverride && (
        <div className="mt-1 text-[8px] text-amber-700">
          Semaine incomplète ({workingDaysInPartialWeek}j)
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