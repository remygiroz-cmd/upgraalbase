import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Trash2, ArrowDown, Check, X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import {
  calculateShiftDuration,
  parseContractHours,
  formatLocalDate
} from '@/components/utils/weeklyHoursCalculation';
import { calculateDayHours } from '@/components/utils/nonShiftHoursCalculation';
import { usePlanningVersion, withPlanningVersion } from '@/components/planning/usePlanningVersion';
import { useHoursDisplayMode } from '@/components/planning/useHoursDisplayMode';
import { formatHours, formatMinutes } from '@/components/utils/hoursFormat';

/**
 * Récap semaine simplifié
 *
 * OPTIMISÉ: Ne fait plus de requête individuelle.
 * Les données weeklyRecap sont passées en props depuis le parent.
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
  weeklyRecap = null, // NOUVEAU: reçu depuis le parent, plus de requête individuelle
  onDeleteWeek,
  onCopyFromAbove,
  onRecapUpdate, // NOUVEAU: callback pour notifier le parent de rafraîchir
  currentMonth,
  currentYear,
  nonShiftEvents = [],
  nonShiftTypes = [],
  disabled = false // Mode lecture seule
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isEditingBase, setIsEditingBase] = useState(false);
  const [baseDraft, setBaseDraft] = useState('');

  const queryClient = useQueryClient();
  const weekStartStr = formatLocalDate(weekStart);
  const hoursMode = useHoursDisplayMode();
  
  // Get planning version for reset system
  const { resetVersion, monthKey } = usePlanningVersion(currentYear, currentMonth);

  // Heures contractuelles par semaine depuis l'employé
  const contractHoursPerWeek = parseContractHours(employee?.contract_hours_weekly) || 0;
  const workDaysPerWeek = employee?.work_days_per_week || 5;

  // weeklyRecap est maintenant passé en props depuis le parent
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
    
    // Calculer base proratisée avec arrondi au quart d'heure
    const basePerDay = contractHoursPerWeek / workDaysPerWeek;
    const prorated = basePerDay * workingDaysCount;
    
    // Arrondir au quart d'heure: convertir en minutes, arrondir à 15min, reconvertir
    const proratedMinutes = Math.round((prorated * 60) / 15) * 15;
    const proratedRounded = proratedMinutes / 60;
    
    return {
      isPartialWeek: true,
      workingDaysInPartialWeek: workingDaysCount,
      proratedBase: proratedRounded
    };
  }, [weekStart, currentMonth, currentYear, employee, contractHoursPerWeek, workDaysPerWeek]);

  // Base par défaut (proratisée si semaine incomplète, sinon contrat)
  const baseDefault = isPartialWeek ? proratedBase : contractHoursPerWeek;

  // ============================================
  // SOURCE DE VÉRITÉ UNIQUE POUR L'AFFICHAGE
  // Priorité: override > baseDefault
  // ============================================
  const displayedBase = useMemo(() => {
    const value = baseOverrideFromDB !== null ? baseOverrideFromDB : baseDefault;
    
    console.log('═══════════════════════════════════════════════════');
    console.log('🎨 RENDER VALUE - VALEUR RÉELLEMENT AFFICHÉE');
    console.log('═══════════════════════════════════════════════════');
    console.log('employeeId:', employee.id);
    console.log('employeeName:', employee.first_name + ' ' + employee.last_name);
    console.log('weekStartStr:', weekStartStr);
    console.log('baseOverrideFromDB:', baseOverrideFromDB);
    console.log('baseDefault:', baseDefault);
    console.log('isEditingBase:', isEditingBase);
    console.log('baseDraft:', baseDraft);
    console.log('weeklyRecap:', weeklyRecap);
    console.log('VALEUR FINALE AFFICHÉE:', value);
    console.log('═══════════════════════════════════════════════════\n');
    
    return value;
  }, [baseOverrideFromDB, baseDefault, employee.id, weekStartStr, isEditingBase, baseDraft, weeklyRecap, employee.first_name, employee.last_name]);

  // Calculer les heures travaillées (workedHours) - including non-shifts that generate hours
  const { workedHours, debugStrict, debugUsed } = useMemo(() => {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = formatLocalDate(weekEnd);

    const weekShifts = shifts.filter(s => {
      if (s.employee_id !== employee.id) return false;
      if (s.date < weekStartStr || s.date > weekEndStr) return false;
      if (s.status === 'cancelled') return false;
      return true;
    });

    const weekNonShifts = nonShiftEvents.filter(ns => 
      ns.employee_id === employee.id && ns.date >= weekStartStr && ns.date <= weekEndStr
    );

    // Group by date
    const dateMap = new Map();
    
    weekShifts.forEach(shift => {
      if (!dateMap.has(shift.date)) {
        dateMap.set(shift.date, { shifts: [], nonShifts: [] });
      }
      dateMap.get(shift.date).shifts.push(shift);
    });
    
    weekNonShifts.forEach(ns => {
      if (!dateMap.has(ns.date)) {
        dateMap.set(ns.date, { shifts: [], nonShifts: [] });
      }
      dateMap.get(ns.date).nonShifts.push(ns);
    });
    
    // Calculate total hours for the week — STRICT: always use real times (end-start), never override
    let totalStrict = 0; // minutes from raw end-start times only
    let totalUsed = 0;   // minutes from current calculation (for debug comparison)
    const debugShifts = [];

    dateMap.forEach((dayData, date) => {
      let dayStrict = 0;
      let dayUsed = 0;

      if (dayData.shifts.length > 0) {
        dayData.shifts.forEach(shift => {
          // STRICT: always raw end-start
          const [sh, sm] = shift.start_time.split(':').map(Number);
          const [eh, em] = shift.end_time.split(':').map(Number);
          let rawMins = (eh * 60 + em) - (sh * 60 + sm);
          if (rawMins < 0) rawMins += 24 * 60;
          rawMins -= (shift.break_minutes || 0);
          const strictMins = Math.max(0, rawMins);

          // USED: what we used to use (with override)
          let usedMins;
          const hasOverride = shift.base_hours_override !== null && shift.base_hours_override !== undefined;
          if (hasOverride) {
            usedMins = Math.round(shift.base_hours_override * 60);
          } else {
            usedMins = strictMins;
          }

          dayStrict += strictMins;
          dayUsed += usedMins;

          debugShifts.push({
            date,
            time: `${shift.start_time}-${shift.end_time}`,
            break: shift.break_minutes || 0,
            strict: strictMins,
            used: usedMins,
            override: hasOverride ? `base_hours_override=${shift.base_hours_override}` : 'none',
            delta: usedMins - strictMins
          });
        });
      } else {
        const { hours } = calculateDayHours([], dayData.nonShifts, nonShiftTypes, employee, calculateShiftDuration);
        const nonShiftMins = Math.round(hours * 60);
        dayStrict += nonShiftMins;
        dayUsed += nonShiftMins;
      }

      totalStrict += dayStrict;
      totalUsed += dayUsed;
    });

    console.log(`[WeeklySummary] ${employee.first_name} ${employee.last_name} ${weekStartStr}`, {
      shifts: debugShifts,
      totalStrict,
      totalUsed,
      delta: totalUsed - totalStrict,
      conclusion: totalUsed === totalStrict ? '✅ no drift' : `⚠️ +${totalUsed - totalStrict}min from overrides`
    });

    // FIX: Réalisé = strict real times, never base_hours_override
    return { workedHours: totalStrict / 60, debugStrict: totalStrict, debugUsed: totalUsed, debugShifts };
  }, [shifts, employee.id, weekStart, weekStartStr, nonShiftEvents, nonShiftTypes, employee]);



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
      if (resetVersion === undefined || !monthKey) {
        throw new Error('Planning version non disponible');
      }

      const dataToSave = {
        employee_id: employee.id,
        week_start: weekStartStr,
        base_override_hours: baseValue
      };

      console.log('💾 SAVE BASE - Mutation');
      console.log('  employee:', employee.first_name, employee.last_name);
      console.log('  week_start:', weekStartStr);
      console.log('  base_override_hours:', baseValue);
      console.log('  monthKey:', monthKey);
      console.log('  resetVersion:', resetVersion);
      console.log('  action:', weeklyRecap?.id ? `UPDATE (${weeklyRecap.id})` : 'CREATE');

      try {
        let result;
        if (weeklyRecap?.id) {
          // Update existing recap
          result = await base44.entities.WeeklyRecap.update(weeklyRecap.id, {
            base_override_hours: baseValue
          });
          console.log('✅ UPDATE SUCCESS - base saved:', result.base_override_hours);
        } else {
          // Create new recap with versioning
          const dataWithVersion = withPlanningVersion(dataToSave, resetVersion, monthKey);
          result = await base44.entities.WeeklyRecap.create(dataWithVersion);
          console.log('✅ CREATE SUCCESS - base saved:', result.base_override_hours);
        }
        
        return result;
      } catch (err) {
        console.error('❌ SAVE ERROR:', err);
        throw err;
      }
    },
    onSuccess: async (data) => {
      console.log('✅ SAVE SUCCESS - base_override_hours:', data.base_override_hours);
      
      setIsEditingBase(false);
      setBaseDraft('');
      
      queryClient.invalidateQueries({ queryKey: ['allWeeklyRecaps'] });
      if (onRecapUpdate) {
        await onRecapUpdate();
      }
      
      toast.success('Base hebdo enregistrée ✓');
    },
    onError: (error) => {
      console.error('❌ SAVE ERROR:', error);
      toast.error(`Erreur d'enregistrement de la base hebdo: ${error.message || 'Échec'}`);
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
      // Notifier le parent de rafraîchir les données (1 seule requête pour tous)
      queryClient.invalidateQueries({ queryKey: ['allWeeklyRecaps'] });
      if (onRecapUpdate) onRecapUpdate();
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
    if (disabled) {
      toast.error('Lecture seule — vous n\'avez pas la permission de modifier le planning', {
        duration: 3000,
        icon: '🔒'
      });
      return;
    }
    // Initialiser baseDraft avec la valeur RÉELLEMENT AFFICHÉE (source de vérité)
    const currentBase = displayedBase;
    console.log('[WeeklySummary] 🖊️ START EDIT - initializing baseDraft with:', currentBase);
    setBaseDraft(currentBase.toString());
    setIsEditingBase(true);
  }, [displayedBase, disabled]);

  const handleCancelEdit = useCallback(() => {
    setIsEditingBase(false);
    setBaseDraft('');
  }, []);

  const handleSaveBase = useCallback(() => {
    const trimmed = baseDraft.trim().replace(',', '.'); // Support virgule française

    // Si vide, on supprime le override (retour à la base par défaut)
    if (trimmed === '') {
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

    // Toujours sauvegarder la valeur entrée, même si elle est égale au défaut
    // L'utilisateur peut vouloir "verrouiller" une valeur spécifique
    console.log('═══════════════════════════════════════════════════');
    console.log('B) CLÉ DE MATCHING (point critique)');
    console.log('═══════════════════════════════════════════════════');
    console.log('employeeId:', employee.id);
    console.log('weekStartStr (DOIT être YYYY-MM-DD):', weekStartStr);
    console.log('format correct?:', /^\d{4}-\d{2}-\d{2}$/.test(weekStartStr));
    console.log('clé de matching attendue:', `${employee.id}_${weekStartStr}`);
    console.log('valeur à sauvegarder:', newValue);
    console.log('═══════════════════════════════════════════════════\n');
    
    saveMutation.mutate(newValue);
  }, [baseDraft, weeklyRecap, saveMutation, deleteMutation, weekStartStr, employee.id]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      handleSaveBase();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  }, [handleSaveBase, handleCancelEdit]);

  // Retirer le blur automatique pour éviter les conflits avec le clic sur valider
  const handleBlur = useCallback(() => {
    // Ne rien faire - la sauvegarde se fait uniquement via Enter ou le bouton Valider
  }, []);

  const hasShifts = shiftsCount > 0;
  const hasOverride = baseOverrideFromDB !== null;

  return (
    <div className={cn(
      "px-2 py-2 text-center relative group",
      hasOverride && "bg-blue-50",
      isPartialWeek && !hasOverride && "bg-amber-50/30"
    )}>
      {/* Bouton supprimer semaine */}
      {hasShifts && !disabled && (
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
              type="text"
              inputMode="decimal"
              value={baseDraft}
              onChange={(e) => setBaseDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              className="w-14 text-center text-sm font-bold border rounded px-1 py-0.5"
              placeholder="7.5"
              autoFocus
              disabled={saveMutation.isPending}
            />
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                handleSaveBase();
              }}
              className="p-0.5 hover:bg-green-100 rounded disabled:opacity-50"
              title="Valider"
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <div className="w-3 h-3 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Check className="w-3 h-3 text-green-600" />
              )}
            </button>
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                handleCancelEdit();
              }}
              className="p-0.5 hover:bg-red-100 rounded"
              title="Annuler"
            >
              <X className="w-3 h-3 text-red-600" />
            </button>
          </div>
        ) : (
          <button
            onClick={handleStartEdit}
            disabled={disabled}
            className={cn(
              "text-sm font-bold hover:bg-gray-100 px-2 py-0.5 rounded transition-colors",
              hasOverride ? "text-blue-700" : "text-gray-700",
              disabled && "cursor-not-allowed opacity-70 hover:bg-transparent"
            )}
            title={disabled ? "Lecture seule" : "Cliquer pour modifier"}
          >
            {formatHours(displayedBase, hoursMode)}
            {hasOverride && <span className="text-[8px] ml-1">*</span>}
          </button>
        )}
      </div>

      {/* RÉALISÉ */}
      <div className="mb-1">
        <div className="text-[9px] text-gray-500 uppercase font-semibold">Réalisé</div>
        <div className="text-lg font-bold text-gray-900">
          {formatHours(workedHours, hoursMode)}
        </div>
        {debugUsed !== debugStrict && (
          <div className="text-[7px] text-red-500 font-mono">
            strict={debugStrict} used={debugUsed} Δ=+{debugUsed - debugStrict}
          </div>
        )}
      </div>

      {/* HEURES + / HEURES - (toujours positifs dans l'affichage) */}
      <div className="flex justify-center gap-2 text-[11px]">
        {plusHours > 0 && (
          <div className="text-green-700 font-bold bg-green-50 px-1.5 py-0.5 rounded">
            +{formatHours(plusHours, hoursMode)}
          </div>
        )}
        {minusHours > 0 && (
          <div className="text-red-700 font-bold bg-red-50 px-1.5 py-0.5 rounded">
            {formatHours(minusHours, hoursMode)} -
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
          (défaut: {baseDefault.toFixed(2)}h)
        </div>
      )}
      {isPartialWeek && !hasOverride && (
        <div className="mt-1 text-[8px] text-amber-700">
          Semaine incomplète ({workingDaysInPartialWeek}j)
        </div>
      )}

      {/* Bouton copier */}
      {onCopyFromAbove && !disabled && (
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