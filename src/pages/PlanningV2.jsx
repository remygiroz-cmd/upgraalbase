import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useSearchParams } from 'react-router-dom';
import { Calendar, ChevronLeft, ChevronRight, Plus, Filter, GripVertical, Settings, MoreVertical, Copy, ArrowDown, FileText, X, EyeOff, Eye } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import ShiftCard from '@/components/planning/ShiftCard';
import ShiftFormModal from '@/components/planning/ShiftFormModal';
import WeeklySummary from '@/components/planning/WeeklySummary';
import MonthlySummary from '@/components/planning/MonthlySummary';
import NonShiftCard from '@/components/planning/NonShiftCard';
import PlanningSettingsModal from '@/components/planning/PlanningSettingsModal';
import AddCPGlobalModal from '@/components/planning/AddCPGlobalModal';
import ApplyTemplateGlobalModal from '@/components/planning/ApplyTemplateGlobalModal';
import LeaveRequestModal from '@/components/planning/LeaveRequestModal';
import EmployeeHeaderCell from '@/components/planning/EmployeeHeaderCell';
import ExportComptaModal from '@/components/planning/ExportComptaModal';
import ApplyTemplatesModal from '@/components/planning/ApplyTemplatesModal';
import ClearMonthModal from '@/components/planning/ClearMonthModal';
import ClearEmployeeMonthModal from '@/components/planning/ClearEmployeeMonthModal';
import DeleteCPModal from '@/components/planning/DeleteCPModal';
import ShiftSwapModal from '@/components/planning/ShiftSwapModal';
import DirectShiftSwapModal, { canDirectSwap } from '@/components/planning/DirectShiftSwapModal';
import { calculateShiftDuration, checkMinimumRest } from '@/components/planning/LegalChecks';
import PlanningColumnsManager from '@/components/planning/PlanningColumnsManager';
import { applyLayoutToEmployees } from '@/components/planning/planningLayoutService';
import { parseLocalDate, formatLocalDate } from '@/components/planning/dateUtils';
import { shouldDisplayEmployeeInPlanning } from '@/components/planning/employeeDisplayFilter';
import { computeMonthKey, usePlanningLayout } from '@/components/planning/usePlanningLayout';
import { useGlobalColumnOrder } from '@/components/planning/useGlobalColumnOrder';
import { isDateInCPPeriod } from '@/components/planning/paidLeaveCalculations';
import { usePlanningVersion, withPlanningVersion, filterByVersion } from '@/components/planning/usePlanningVersion';
import { getActiveShiftsForMonth, shiftsQueryKey } from '@/components/planning/shiftService';
import { useUndoStack } from '@/components/planning/useUndoStack';
import UndoRedoButtons from '@/components/planning/UndoRedoButtons';
import PinchZoomContainer from '@/components/planning/PinchZoomContainer';
import TodaySummary from '@/components/planning/TodaySummary';
import DepartureOrderPlanningBlock from '@/components/planning/DepartureOrderPlanningBlock';

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export default function PlanningV2() {
  const [searchParams] = useSearchParams();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [isPlanningReady, setIsPlanningReady] = useState(false);
  const [pendingGoToToday, setPendingGoToToday] = useState(null);
  const [lastUrlToken, setLastUrlToken] = useState(null);
  const planningGridRef = useRef(null);
  const scrollAttemptRef = useRef(0);
  const maxScrollAttemptsRef = useRef(20);
  const [showPlanningSettings, setShowPlanningSettings] = useState(false);
  const [showExportComptaModal, setShowExportComptaModal] = useState(false);
  const [showApplyTemplatesModal, setShowApplyTemplatesModal] = useState(false);
  const [showClearMonthModal, setShowClearMonthModal] = useState(false);
  const [clearEmployeeMonthTarget, setClearEmployeeMonthTarget] = useState(null);
  const [selectedCPPeriod, setSelectedCPPeriod] = useState(null);
  const [showLeaveRequestModal, setShowLeaveRequestModal] = useState(false);
  const [showShiftSwapModal, setShowShiftSwapModal] = useState(false);
  const [showDirectSwapModal, setShowDirectSwapModal] = useState(false);
  const [modalState, setModalState] = useState({
    isOpen: false,
    actionType: null,
    selectedEmployee: null
  });
  const [selectedCell, setSelectedCell] = useState(null);
  const [filterType, setFilterType] = useState('global');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [copyWeekModal, setCopyWeekModal] = useState({ open: false, weekStart: null, weekAbove: null });
  const [weekConflictMode, setWeekConflictMode] = useState('replace');
  const [displayMode, setDisplayMode] = useState('normal');
  const [showFab, setShowFab] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [isRedoing, setIsRedoing] = useState(false);
  const [showColumnsManager, setShowColumnsManager] = useState(false);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const queryClient = useQueryClient();
  const undoStack = useUndoStack();
  const tableContainerRef = useRef(null);

  // Get current month info
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  // Compute monthKey (YYYY-MM format)
  const monthKey = computeMonthKey(currentYear, currentMonth);

  // Hook: Global column order (applies to ALL months)
  const { globalColumnOrder, saveGlobalColumnOrder } = useGlobalColumnOrder();

  // Hook: Planning layout for THIS month (hidden columns only)
  const { layout, saveLayout, clearLayout } = usePlanningLayout(monthKey);

  // Get reset version for shifts
  const { resetVersion, monthKey: computedMonthKey } = usePlanningVersion(currentYear, currentMonth);

  // Fetch current user
  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  // Fetch user role
  const { data: userRole } = useQuery({
    queryKey: ['userRole', currentUser?.role_id],
    queryFn: async () => {
      if (!currentUser?.role_id) return null;
      const roles = await base44.entities.Role.filter({ id: currentUser.role_id });
      return roles[0] || null;
    },
    enabled: !!currentUser?.role_id
  });

  const canModifyPlanning = currentUser?.role === 'admin' || userRole?.permissions?.planning_modify || false;
  const canDoDirectSwap = canDirectSwap(currentUser, userRole);
  const HIDE_COLS_ROLES = ['gérant', 'gerant', 'bureau', 'manager'];
  const canHideColumns = currentUser?.role === 'admin' || HIDE_COLS_ROLES.some(r => userRole?.name?.toLowerCase() === r.toLowerCase());

  // Fetch all employees
  const { data: allEmployees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.list()
  });

  // Fetch teams
  const { data: allTeams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.filter({ is_active: true })
  });

  // Fetch shifts for current month — keepPreviousData pour éviter l'écran vide au changement de mois
  const { data: shifts = [], isFetching: isFetchingShifts } = useQuery({
    queryKey: shiftsQueryKey(currentYear, currentMonth, resetVersion),
    queryFn: () => {
      console.time('[Planning] fetch shifts');
      return getActiveShiftsForMonth(monthKey, resetVersion).then(r => {
        console.timeEnd('[Planning] fetch shifts');
        return r;
      });
    },
    enabled: resetVersion !== undefined,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000
  });

  // Filter and sort employees
  const sortedEmployees = React.useMemo(() => {
    // Utiliser la fonction centralisée shouldDisplayEmployeeInPlanning
    const filteredEmployees = allEmployees.filter(emp =>
      shouldDisplayEmployeeInPlanning(emp, currentYear, currentMonth)
    );

    return [...filteredEmployees].sort((a, b) => {
      const teamA = allTeams.find(t => t.id === a.team_id);
      const teamB = allTeams.find(t => t.id === b.team_id);
      const orderA = teamA?.order ?? 999;
      const orderB = teamB?.order ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return (a.first_name || '').localeCompare(b.first_name || '');
    });
  }, [allEmployees, allTeams, currentYear, currentMonth, shifts]);

  const teams = React.useMemo(() => {
    return [...allTeams].sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [allTeams]);

  // Filter employees by view type
  const filteredEmployees = React.useMemo(() => {
    if (filterType === 'employee' && selectedEmployee) {
      return sortedEmployees.filter(e => e.id === selectedEmployee);
    }
    if (filterType === 'team' && selectedTeam) {
      return sortedEmployees.filter(e => e.team_id === selectedTeam);
    }
    return sortedEmployees;
  }, [sortedEmployees, filterType, selectedEmployee, selectedTeam]);

  // Apply layout (order + hide) to get visibleEmployees
  // Étape 1: Appliquer l'ordre GLOBAL + masquage du mois
  const visibleEmployees = React.useMemo(() => {
    return applyLayoutToEmployees(
      filteredEmployees,
      globalColumnOrder,
      layout?.hidden_employee_ids || []
    );
  }, [filteredEmployees, globalColumnOrder, layout]);

  // Bornes du mois — stables, partagées par toutes les requêtes dépendantes
  const monthFirstDay = React.useMemo(() => formatLocalDate(new Date(currentYear, currentMonth, 1)), [currentYear, currentMonth]);
  const monthLastDay = React.useMemo(() => formatLocalDate(new Date(currentYear, currentMonth + 1, 0)), [currentYear, currentMonth]);

  // ✅ shiftsReady : les shifts sont chargés ET appartiennent tous à la bonne version
  const shiftsReady = React.useMemo(() => {
    if (resetVersion === undefined) return false;
    if (isFetchingShifts) return false;
    // Tous les shifts retournés doivent avoir la reset_version attendue (sauf si mois vide)
    if (shifts.length > 0 && shifts.some(s => (s.reset_version ?? 0) !== resetVersion)) return false;
    return true;
  }, [resetVersion, isFetchingShifts, shifts]);

  // Fetch other data (non-shift events, types, positions, etc.)
  const { data: nonShiftEvents = [], isFetching: isFetchingNonShifts } = useQuery({
    queryKey: ['nonShiftEvents', monthKey, resetVersion],
    queryFn: async () => {
      const allEvents = await base44.entities.NonShiftEvent.filter({ month_key: monthKey });
      // Fallback: si aucun non-shift avec month_key, récupérer par date
      if (allEvents.length === 0) {
        const byDate = await base44.entities.NonShiftEvent.list();
        const filtered = byDate.filter(e => e.date >= monthFirstDay && e.date <= monthLastDay);
        console.log(`[Planning] nonShiftEvents fallback by date: ${filtered.length} events`);
        return filterByVersion(filtered, resetVersion);
      }
      const versioned = filterByVersion(allEvents, resetVersion);
      console.log(`[Planning] nonShiftEvents: ${versioned.length} / ${allEvents.length} (v${resetVersion})`);
      return versioned;
    },
    enabled: resetVersion !== undefined,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000
  });

  const { data: nonShiftTypes = [] } = useQuery({
    queryKey: ['nonShiftTypes'],
    queryFn: async () => {
      const types = await base44.entities.NonShiftType.filter({ is_active: true });
      return types.sort((a, b) => (a.order || 0) - (b.order || 0));
    },
    staleTime: 10 * 60 * 1000
  });

  const { data: positions = [] } = useQuery({
    queryKey: ['positions'],
    queryFn: async () => {
      const all = await base44.entities.Position.filter({ is_active: true });
      return all.sort((a, b) => (a.order || 0) - (b.order || 0));
    },
    staleTime: 10 * 60 * 1000
  });

  const { data: paidLeavePeriods = [], isFetching: isFetchingCP } = useQuery({
    queryKey: ['paidLeavePeriods', monthKey, resetVersion],
    queryFn: async () => {
      const allPeriods = await base44.entities.PaidLeavePeriod.list();
      const monthPeriods = allPeriods.filter(p => p.end_cp >= monthFirstDay && p.start_cp <= monthLastDay);
      const versioned = filterByVersion(monthPeriods, resetVersion);
      console.log(`[Planning] paidLeavePeriods: ${versioned.length} / ${monthPeriods.length} (v${resetVersion})`);
      return versioned;
    },
    enabled: resetVersion !== undefined,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000
  });

  const { data: approvedSwaps = [] } = useQuery({
    queryKey: ['approvedSwaps', monthKey],
    queryFn: () => base44.entities.ShiftSwapRequest.filter({ status: 'APPROVED', month_key: monthKey }),
    enabled: !!monthKey,
    staleTime: 60 * 1000
  });

  const { data: holidayDates = [] } = useQuery({
    queryKey: ['holidayDates', currentYear, currentMonth],
    queryFn: async () => {
      const firstDay = formatLocalDate(new Date(currentYear, currentMonth, 1));
      const lastDay = formatLocalDate(new Date(currentYear, currentMonth + 1, 0));
      const allHolidays = await base44.entities.HolidayDate.list();
      return allHolidays.filter(h => h.date >= firstDay && h.date <= lastDay);
    },
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000
  });

  const { data: allWeeklyRecaps = [] } = useQuery({
    queryKey: ['allWeeklyRecaps', currentYear, currentMonth, resetVersion],
    queryFn: async () => {
      const lastDay = formatLocalDate(new Date(currentYear, currentMonth + 1, 0));
      const startRange = new Date(currentYear, currentMonth, 1);
      startRange.setDate(startRange.getDate() - 7);
      const startRangeStr = formatLocalDate(startRange);
      const allRecaps = await base44.entities.WeeklyRecap.list();
      const monthRecaps = allRecaps.filter(r => r.week_start >= startRangeStr && r.week_start <= lastDay);
      return filterByVersion(monthRecaps, resetVersion);
    },
    enabled: resetVersion !== undefined,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000
  });

  const { data: allMonthlyRecaps = [] } = useQuery({
    queryKey: ['allMonthlyRecaps', currentYear, currentMonth, resetVersion],
    queryFn: async () => {
      const allRecaps = await base44.entities.MonthlyRecap.filter({
        year: currentYear,
        month: currentMonth + 1
      });
      return filterByVersion(allRecaps, resetVersion);
    },
    enabled: resetVersion !== undefined,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000
  });

  // Lookups
  const swapLookup = React.useMemo(() => {
    const map = new Map();
    for (const swap of approvedSwaps) {
      const keyA = `${swap.employee_a_id}_${swap.shift_b_date}`;
      const keyB = `${swap.employee_b_id}_${swap.shift_a_date}`;
      map.set(keyA, { otherName: swap.employee_b_name, originalDate: swap.shift_a_date, otherDate: swap.shift_b_date, swapRequestId: swap.id });
      map.set(keyB, { otherName: swap.employee_a_name, originalDate: swap.shift_b_date, otherDate: swap.shift_a_date, swapRequestId: swap.id });
    }
    return map;
  }, [approvedSwaps]);

  const weeklyRecapsLookup = React.useMemo(() => {
    const lookup = new Map();
    for (const recap of allWeeklyRecaps) {
      const key = `${recap.employee_id}_${recap.week_start}`;
      lookup.set(key, recap);
    }
    return lookup;
  }, [allWeeklyRecaps]);

  const monthlyRecapsLookup = React.useMemo(() => {
    const lookup = new Map();
    for (const recap of allMonthlyRecaps) {
      lookup.set(recap.employee_id, recap);
    }
    return lookup;
  }, [allMonthlyRecaps]);

  const cpPeriodsLookup = React.useMemo(() => {
    const lookup = new Map();
    for (const period of paidLeavePeriods) {
      if (!lookup.has(period.employee_id)) {
        lookup.set(period.employee_id, []);
      }
      lookup.get(period.employee_id).push(period);
    }
    return lookup;
  }, [paidLeavePeriods]);

  // Mutations
  const { data: calculationSettings = [] } = useQuery({
    queryKey: ['appSettings', 'planning_calculation_mode'],
    queryFn: () => base44.entities.AppSettings.filter({ setting_key: 'planning_calculation_mode' }),
    staleTime: 5 * 60 * 1000
  });
  const calculationMode = calculationSettings[0]?.planning_calculation_mode || 'disabled';

  const saveShiftMutation = useMutation({
    mutationFn: async ({ id, data, captureForUndo = false, beforeData = null }) => {
      let before = beforeData;
      if (captureForUndo && id && !before) {
        const existing = shifts.find(s => s.id === id);
        before = existing ? { ...existing } : null;
      }

      let result;
      if (id) {
        result = await base44.entities.Shift.update(id, data);
      } else {
        result = await base44.entities.Shift.create(withPlanningVersion(data, resetVersion, monthKey));
      }

      if (captureForUndo && !undoStack.isUndoingRef.current && !undoStack.isRedoingRef.current) {
        undoStack.pushAction({
          actionType: id ? 'updateShift' : 'createShift',
          label: id ? 'Shift modifié' : 'Shift créé',
          monthKey,
          before: id ? { shift: before } : null,
          after: { shift: result }
        });
      }

      return result;
    },
    onSuccess: async (result, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['shifts'] });
      await queryClient.invalidateQueries({ queryKey: ['allWeeklyRecaps'] });
      await queryClient.invalidateQueries({ queryKey: ['allMonthlyRecaps'] });
      queryClient.invalidateQueries({ queryKey: ['monthlyRecapsPersisted', monthKey] });
      queryClient.invalidateQueries({ queryKey: ['recapExtrasOverride', monthKey] });
      queryClient.invalidateQueries({ queryKey: ['exportOverrides', monthKey] });
      queryClient.invalidateQueries({ queryKey: ['monthlyExportOverrides', monthKey] });
      if (!undoStack.isUndoingRef.current && !undoStack.isRedoingRef.current) toast.success('Shift enregistré');
    },
    onError: (error) => {
      toast.error('Erreur lors de l\'enregistrement : ' + error.message);
    }
  });

  const deleteShiftMutation = useMutation({
    mutationFn: async ({ shiftId, captureForUndo = false }) => {
      let before = null;
      if (captureForUndo) {
        const existing = shifts.find(s => s.id === shiftId);
        before = existing ? { ...existing } : null;
      }
      await base44.entities.Shift.delete(shiftId);
      if (captureForUndo && before && !undoStack.isUndoingRef.current && !undoStack.isRedoingRef.current) {
        undoStack.pushAction({
          actionType: 'deleteShift',
          label: 'Shift supprimé',
          monthKey,
          before: { shift: before },
          after: null
        });
      }
      return { employeeId: before?.employee_id };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.invalidateQueries({ queryKey: ['allWeeklyRecaps'] });
      queryClient.invalidateQueries({ queryKey: ['allMonthlyRecaps'] });
      queryClient.invalidateQueries({ queryKey: ['monthlyRecapsPersisted', monthKey] });
      queryClient.invalidateQueries({ queryKey: ['recapExtrasOverride', monthKey] });
      queryClient.invalidateQueries({ queryKey: ['exportOverrides', monthKey] });
      queryClient.invalidateQueries({ queryKey: ['monthlyExportOverrides', monthKey] });
      if (!undoStack.isUndoingRef.current && !undoStack.isRedoingRef.current) {
        toast.success('Shift supprimé');
      }
    },
    onError: (error) => {
      toast.error('Erreur lors de la suppression : ' + error.message);
    }
  });

  const toggleHolidayMutation = useMutation({
    mutationFn: async ({ date, isHoliday }) => {
      if (isHoliday) {
        const existing = holidayDates.find(h => h.date === date);
        if (existing) {
          return await base44.entities.HolidayDate.delete(existing.id);
        }
      } else {
        return await base44.entities.HolidayDate.create({ date });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holidayDates'] });
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      toast.success('Jour férié mis à jour');
    }
  });

  // Days array
  const daysArray = React.useMemo(() => {
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const days = [];
    const today = new Date();
    const todayDay = today.getDate();
    const todayMonth = today.getMonth();
    const todayYear = today.getFullYear();

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentYear, currentMonth, day);
      const dayOfWeek = date.getDay();
      const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const isFirstDayOfWeek = adjustedDay === 0;
      const isLastDayOfWeek = adjustedDay === 6;

      days.push({
        day,
        date,
        dayOfWeek: adjustedDay,
        dayName: DAYS[adjustedDay],
        isFirstDayOfWeek,
        isLastDayOfWeek,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        isToday: day === todayDay && currentMonth === todayMonth && currentYear === todayYear
      });
    }

    return days;
  }, [currentYear, currentMonth]);

  // Prefetch mois adjacent dès que les données courantes sont prêtes
  // IMPORTANT: chaque mois a sa propre reset_version → on doit la lire depuis PlanningMonth
  useEffect(() => {
    if (resetVersion === undefined) return;
    const prefetchAdjacentMonth = async (yr, mo) => {
      const mk = computeMonthKey(yr, mo);
      try {
        // Lire la reset_version propre au mois adjacent (ne pas réutiliser celle du mois courant)
        const { getActiveMonthContext } = await import('@/components/planning/monthContext');
        const ctx = await getActiveMonthContext(mk);
        const adjResetVersion = ctx.reset_version;
        console.log(`[Prefetch] ${mk} reset_version=${adjResetVersion}`);
        queryClient.prefetchQuery({
          queryKey: shiftsQueryKey(yr, mo, adjResetVersion),
          queryFn: () => getActiveShiftsForMonth(mk, adjResetVersion),
          staleTime: 30 * 1000
        });
      } catch (e) {
        // Prefetch silencieux — pas critique
      }
    };
    prefetchAdjacentMonth(currentYear, currentMonth + 1);
    prefetchAdjacentMonth(currentYear, currentMonth - 1);
  }, [currentYear, currentMonth, resetVersion]);

  // Navigation
  const previousMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  // Column handlers using layout hook
  const handleColumnDragStart = (id) => setDraggingId(id);
  const handleColumnDragOver = (id) => setDragOverId(id);
  
  const handleColumnDrop = (sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const current = [...visibleEmployees];
    const fromIdx = current.findIndex(e => e.id === sourceId);
    const toIdx = current.findIndex(e => e.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const newOrder = [...current];
    const [moved] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, moved);
    const newIds = newOrder.map(e => e.id);
    // Sauvegarder l'ordre GLOBAL (s'applique à tous les mois)
    saveGlobalColumnOrder(newIds);
    setDraggingId(null);
    setDragOverId(null);
  };

  const handleColumnDragEnd = () => {
    setDraggingId(null);
    setDragOverId(null);
  };

  const toggleHideColumn = (employeeId) => {
    const hiddenIds = layout?.hidden_employee_ids || [];
    const next = hiddenIds.includes(employeeId) ? hiddenIds.filter(id => id !== employeeId) : [...hiddenIds, employeeId];
    // Sauvegarder le masquage du MOIS (hidden_employee_ids uniquement)
    saveLayout({ hidden_employee_ids: next });
  };

  const showAllColumns = () => {
    // Réafficher tous les employés du mois
    saveLayout({ hidden_employee_ids: [] });
  };

  // Shifts lookup
  const shiftsLookup = React.useMemo(() => {
    const lookup = new Map();
    for (const shift of shifts) {
      const key = `${shift.employee_id}_${shift.date}`;
      if (!lookup.has(key)) {
        lookup.set(key, []);
      }
      lookup.get(key).push(shift);
    }
    for (const [key, empShifts] of lookup) {
      empShifts.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return lookup;
  }, [shifts]);

  const nonShiftsLookup = React.useMemo(() => {
    const lookup = new Map();
    for (const event of nonShiftEvents) {
      const key = `${event.employee_id}_${event.date}`;
      if (!lookup.has(key)) {
        lookup.set(key, []);
      }
      lookup.get(key).push(event);
    }
    return lookup;
  }, [nonShiftEvents]);

  const getShiftsForEmployeeAndDate = useCallback((employeeId, dateStr) => {
    return shiftsLookup.get(`${employeeId}_${dateStr}`) || [];
  }, [shiftsLookup]);

  const getNonShiftsForEmployeeAndDate = useCallback((employeeId, dateStr) => {
    return nonShiftsLookup.get(`${employeeId}_${dateStr}`) || [];
  }, [nonShiftsLookup]);

  // Other handlers (simplified for brevity - copy from original Planning.jsx if needed)
  const getLastNonEmptyCellAbove = (employeeId, dateStr) => {
    const currentDate = parseLocalDate(dateStr);
    for (let i = 1; i <= 60; i++) {
      const checkDate = new Date(currentDate);
      checkDate.setDate(checkDate.getDate() - i);
      const checkDateStr = formatLocalDate(checkDate);
      const shiftsAbove = getShiftsForEmployeeAndDate(employeeId, checkDateStr);
      const nonShiftsAbove = getNonShiftsForEmployeeAndDate(employeeId, checkDateStr);
      if (shiftsAbove.length > 0 || nonShiftsAbove.length > 0) {
        return { date: checkDateStr, shifts: shiftsAbove, nonShifts: nonShiftsAbove };
      }
    }
    return null;
  };

  const handleCellClick = (employeeId, dateStr, dayInfo) => {
    if (!canModifyPlanning) {
      toast.error('Lecture seule — vous n\'avez pas la permission de modifier le planning', {
        duration: 3000,
        icon: '🔒'
      });
      return;
    }
    const employee = visibleEmployees.find(e => e.id === employeeId);
    const date = parseLocalDate(dateStr);
    const cellAbove = getLastNonEmptyCellAbove(employeeId, dateStr);
    setSelectedCell({
      employeeId,
      employeeName: employee ? `${employee.first_name} ${employee.last_name}` : '',
      date: dateStr,
      dayInfo,
      monthName: MONTHS[date.getMonth()],
      year: date.getFullYear(),
      cellAbove
    });
    setShowShiftModal(true);
  };

  const handleDeleteShift = (shift) => {
    if (window.confirm(`Supprimer ce shift de ${shift.start_time} à ${shift.end_time} ?`)) {
      deleteShiftMutation.mutate({ shiftId: shift.id, captureForUndo: true });
    }
  };

  const handleToggleHoliday = (dateStr) => {
    const isCurrentlyHoliday = holidayDates.some(h => h.date === dateStr);
    toggleHolidayMutation.mutate({ date: dateStr, isHoliday: isCurrentlyHoliday });
  };

  const isHolidayDate = (dateStr) => {
    return holidayDates.some(h => h.date === dateStr);
  };

  const handleUndo = async () => {
    if (!undoStack.canUndo) return;
    setIsUndoing(true);
    undoStack.isUndoingRef.current = true;
    try {
      const action = undoStack.popUndo();
      if (!action) return;
      switch (action.actionType) {
        case 'createShift':
          await base44.entities.Shift.delete(action.after.shift.id);
          break;
        case 'updateShift':
          await base44.entities.Shift.update(action.before.shift.id, action.before.shift);
          break;
        case 'deleteShift':
          await base44.entities.Shift.create(withPlanningVersion(action.before.shift, resetVersion, monthKey));
          break;
        default:
          break;
      }
      await queryClient.invalidateQueries({ queryKey: ['shifts'] });
      await queryClient.invalidateQueries({ queryKey: ['allWeeklyRecaps'] });
      await queryClient.invalidateQueries({ queryKey: ['allMonthlyRecaps'] });
      queryClient.invalidateQueries({ queryKey: ['monthlyRecapsPersisted', monthKey] });
      queryClient.invalidateQueries({ queryKey: ['recapExtrasOverride', monthKey] });
      toast.success(`↩︎ ${action.label} annulé`);
    } catch (error) {
      toast.error('Impossible d\'annuler : ' + error.message);
    } finally {
      setIsUndoing(false);
      undoStack.isUndoingRef.current = false;
    }
  };

  const handleRedo = async () => {
    if (!undoStack.canRedo) return;
    setIsRedoing(true);
    undoStack.isRedoingRef.current = true;
    try {
      const action = undoStack.popRedo();
      if (!action) return;
      switch (action.actionType) {
        case 'createShift':
          await base44.entities.Shift.create(withPlanningVersion(action.after.shift, resetVersion, monthKey));
          break;
        case 'updateShift':
          await base44.entities.Shift.update(action.after.shift.id, action.after.shift);
          break;
        case 'deleteShift':
          await base44.entities.Shift.delete(action.before.shift.id);
          break;
        default:
          break;
      }
      await queryClient.invalidateQueries({ queryKey: ['shifts'] });
      await queryClient.invalidateQueries({ queryKey: ['allWeeklyRecaps'] });
      await queryClient.invalidateQueries({ queryKey: ['allMonthlyRecaps'] });
      queryClient.invalidateQueries({ queryKey: ['monthlyRecapsPersisted', monthKey] });
      queryClient.invalidateQueries({ queryKey: ['recapExtrasOverride', monthKey] });
      toast.success(`↪︎ ${action.label} rétabli`);
    } catch (error) {
      toast.error('Impossible de rétablir : ' + error.message);
    } finally {
      setIsRedoing(false);
      undoStack.isRedoingRef.current = false;
    }
  };

  // Fonction robuste : aller à aujourd'hui avec scroll fiable
  const goToToday = React.useCallback((reason = 'manual') => {
    const today = new Date();
    
    if (!isPlanningReady) {
      console.log(`[GO_TO_TODAY] not ready yet, deferring (reason=${reason})`);
      setPendingGoToToday(reason);
      return;
    }

    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // 1. METTRE À JOUR L'ÉTAT (date logique)
    setCurrentDate(today);
    console.log(`GO_TO_TODAY_SET_STATE todayKey=${todayKey} reason=${reason}`);

    // 2. SCROLL : attendre que le DOM soit prêt et scroller vers [data-today="true"]
    scrollAttemptRef.current = 0;

    const attemptScroll = () => {
      const todayRowElement = document.querySelector('[data-today="true"]');
      const container = tableContainerRef.current;
      
      const found = !!todayRowElement;
      console.log(`SCROLL_TRY n=${scrollAttemptRef.current + 1} found=${found}`);
      
      if (found && container) {
        try {
          todayRowElement.scrollIntoView({ behavior: 'auto', block: 'start' });
          console.log('SCROLL_DONE');
        } catch (e) {
          console.warn(`SCROLL_EXCEPTION ${e.message}`);
        }
        return;
      }

      scrollAttemptRef.current += 1;
      if (scrollAttemptRef.current < maxScrollAttemptsRef.current) {
        // RAF x2 au début, puis setTimeout
        if (scrollAttemptRef.current <= 2) {
          requestAnimationFrame(() => requestAnimationFrame(attemptScroll));
        } else {
          setTimeout(attemptScroll, 100);
        }
      } else {
        console.warn(`SCROLL_FAILED max_attempts=${maxScrollAttemptsRef.current}`);
      }
    };

    // Lancer la première tentative (RAF x2 + scroll)
    requestAnimationFrame(() => requestAnimationFrame(attemptScroll));
  }, [isPlanningReady]);

  // Exécuter goToToday si pending et maintenant prêt
  useEffect(() => {
    if (isPlanningReady && pendingGoToToday !== null) {
      goToToday(pendingGoToToday);
      setPendingGoToToday(null);
    }
  }, [isPlanningReady, pendingGoToToday, goToToday]);

  // Écouter les changements d'URL params (focus + token)
  useEffect(() => {
    const focus = searchParams.get('focus');
    const token = searchParams.get('t');
    
    if (focus && token) {
      console.log(`PLANNING_ROUTE_PARAMS focus=${focus} t=${token}`);
      
      if (focus === 'today' && token !== lastUrlToken) {
        setLastUrlToken(token);
        goToToday('sidebar_click');
      }
    }
  }, [searchParams, lastUrlToken, goToToday]);

  // Marquer Planning comme prêt quand les données clés sont là
  useEffect(() => {
    const isReady = !!monthKey && shifts.length >= 0 && daysArray.length > 0;
    if (isReady && !isPlanningReady) {
      console.log('PLANNING_READY');
      setIsPlanningReady(true);
    }
  }, [monthKey, shifts, daysArray, isPlanningReady]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const target = e.target;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
      if (ctrlOrCmd && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if (ctrlOrCmd && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoStack.canUndo, undoStack.canRedo, isUndoing, isRedoing]);

  // Skeleton grid — affiché pendant le chargement initial (version OU shifts)
  // CRITIQUE : ne jamais afficher le planning avant d'avoir la bonne version
  const isLoading = resetVersion === undefined || (isFetchingShifts && shifts.length === 0);

  return (
    <div className="space-y-2">
      {/* Indicateur discret de chargement en haut lors des changements de mois */}
      {isFetchingShifts && shifts.length > 0 && (
        <div className="fixed top-0 left-0 right-0 z-[100] h-0.5">
          <div className="h-full bg-orange-500 animate-pulse" style={{ width: '100%' }} />
        </div>
      )}
      {/* Header - responsive mobile */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Calendar className="w-4 h-4 lg:w-5 lg:h-5 text-orange-600 flex-shrink-0" />
          <h1 className="text-base lg:text-lg font-bold text-gray-900 truncate">Planning mensuel</h1>
        </div>
        {canModifyPlanning && (
          <Button
            onClick={() => setShowPlanningSettings(true)}
            variant="outline"
            size="icon"
            className="h-8 w-8 border border-gray-300 hover:border-orange-500 hover:bg-orange-50 flex-shrink-0"
            title="Paramètres du planning"
          >
            <Settings className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
          </Button>
        )}
      </div>

      {/* Month Navigation & Filters - Mobile optimized */}
      <div className="bg-white border border-gray-200 rounded-lg p-2 lg:p-3">
        {/* Row 1: Navigation + Undo/Redo */}
        <div className="flex items-center justify-between gap-2 mb-2 lg:mb-3">
          <div className="flex items-center gap-1.5 lg:gap-2 flex-1 min-w-0">
            <Button 
              onClick={previousMonth} 
              variant="outline" 
              size="sm"
              className="border border-gray-300 hover:border-orange-500 hover:bg-orange-50 h-7 lg:h-8 px-2 lg:px-3"
            >
              <ChevronLeft className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
              <span className="ml-1 hidden sm:inline text-xs">Préc.</span>
            </Button>
            <h2 className="text-sm lg:text-lg font-bold text-orange-600 truncate flex-1 text-center">
              {MONTHS[currentMonth]} {currentYear}
            </h2>
            <Button 
              onClick={nextMonth} 
              variant="outline"
              size="sm"
              className="border border-gray-300 hover:border-orange-500 hover:bg-orange-50 h-7 lg:h-8 px-2 lg:px-3"
            >
              <span className="mr-1 hidden sm:inline text-xs">Suiv.</span>
              <ChevronRight className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            </Button>
          </div>

          {/* Hidden columns indicator */}
          {canHideColumns && (layout?.hidden_employee_ids?.length || 0) > 0 && (
            <button
              onClick={() => setShowColumnsManager(true)}
              className="hidden sm:flex items-center gap-1 px-2 py-1 bg-orange-100 border border-orange-300 rounded text-xs text-orange-700 hover:bg-orange-200 transition-colors"
               title="Colonnes masquées"
              >
               <EyeOff className="w-3 h-3" />
               {layout?.hidden_employee_ids?.length || 0}
              </button>
              )}

          {/* Undo/Redo buttons - hidden on very small screens */}
          <div className="hidden sm:block">
            <UndoRedoButtons
              canUndo={undoStack.canUndo}
              canRedo={undoStack.canRedo}
              onUndo={handleUndo}
              onRedo={handleRedo}
              isUndoing={isUndoing}
              isRedoing={isRedoing}
            />
          </div>
        </div>

        {/* Row 2: Filters - Mobile collapsible */}
        <div className="flex flex-col sm:flex-row gap-2 text-xs lg:text-sm">
          <div className="flex-1">
            <Label className="text-[9px] lg:text-[10px] font-semibold text-gray-600 mb-1 flex items-center gap-1">
              <Filter className="w-2.5 h-2.5 lg:w-3 lg:h-3" />
              Type de vue
            </Label>
            <Select value={filterType} onValueChange={(value) => {
              setFilterType(value);
              setSelectedTeam('');
              setSelectedEmployee('');
            }}>
              <SelectTrigger className="h-7 lg:h-8 text-[11px] lg:text-xs border border-gray-300 hover:border-orange-400">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">🌍 Vue globale</SelectItem>
                <SelectItem value="team">👥 Par équipe</SelectItem>
                <SelectItem value="employee">👤 Par employé</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filterType === 'team' && (
            <div className="flex-1">
              <Label className="text-[9px] lg:text-[10px] font-semibold text-gray-600 mb-1">Équipe</Label>
              <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                <SelectTrigger className="h-7 lg:h-8 text-[11px] lg:text-xs border border-gray-300 hover:border-orange-400">
                  <SelectValue placeholder="Choisir..." />
                </SelectTrigger>
                <SelectContent>
                  {teams.map(team => (
                    <SelectItem key={team.id} value={team.id}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-2 h-2 rounded-full" 
                          style={{ backgroundColor: team.color || '#3b82f6' }}
                        />
                        {team.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {filterType === 'employee' && (
            <div className="flex-1">
              <Label className="text-[9px] lg:text-[10px] font-semibold text-gray-600 mb-1">Employé</Label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger className="h-7 lg:h-8 text-[11px] lg:text-xs border border-gray-300 hover:border-orange-400">
                  <SelectValue placeholder="Choisir..." />
                </SelectTrigger>
                <SelectContent>
                  {sortedEmployees.map(emp => {
                    const team = allTeams.find(t => t.id === emp.team_id);
                    return (
                      <SelectItem key={emp.id} value={emp.id}>
                        <div className="flex items-center gap-2">
                          {team && (
                            <div 
                              className="w-2 h-2 rounded-full" 
                              style={{ backgroundColor: team.color || '#3b82f6' }}
                            />
                          )}
                          {emp.first_name} {emp.last_name}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {/* Departure Order Block — front-only, basé sur les shifts du jour + MonthlyRecapPersisted */}
      <DepartureOrderPlanningBlock
        date={formatLocalDate(new Date())}
        monthKey={monthKey}
        shifts={shifts}
        employees={sortedEmployees}
        nonShiftEvents={nonShiftEvents}
        nonShiftTypes={nonShiftTypes}
        holidayDates={holidayDates}
        weeklyRecaps={allWeeklyRecaps}
        currentUser={currentUser}
      />

      {/* Today Summary */}
      <TodaySummary
        shifts={shifts}
        nonShiftEvents={nonShiftEvents}
        nonShiftTypes={nonShiftTypes}
        employees={visibleEmployees}
        positions={positions}
        onEmployeeClick={(employeeId, dateStr) => {
          const element = document.querySelector(`[data-employee-date="${employeeId}-${dateStr}"]`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }}
      />

      {/* Scrollbar miroir en haut - toujours visible */}
      <div
        className="overflow-x-auto overflow-y-hidden border border-gray-200 rounded-t-lg bg-gray-50"
        style={{ height: '12px' }}
        ref={(el) => {
          if (!el) return;
          el._mirror = true;
          el.addEventListener('scroll', () => {
            const grid = tableContainerRef.current?.closest('.planning-scroll-container');
            if (grid && !grid._scrolling) {
              grid._scrolling = true;
              grid.scrollLeft = el.scrollLeft;
              grid._scrolling = false;
            }
          });
        }}
        id="planning-top-scrollbar"
      >
        <div style={{ height: '1px', width: `${(visibleEmployees.length * 180) + 120}px` }} />
      </div>

      {/* Calendar Grid - Direct scrolling, no zoom wrapper */}
      <div
        id="planningGridScroll"
        className="planning-scroll-container bg-white border-2 border-gray-200 rounded-b-xl shadow-xl overflow-auto"
        style={{ height: 'calc(100vh - 240px)' }}
        ref={(el) => {
          tableContainerRef.current = el;
          planningGridRef.current = el;
          if (!el) return;
          el.addEventListener('scroll', () => {
            const topBar = document.getElementById('planning-top-scrollbar');
            if (topBar && !el._scrolling) {
              el._scrolling = true;
              topBar.scrollLeft = el.scrollLeft;
              el._scrolling = false;
            }
          });
        }}
      >
        <div className="min-w-full" data-planning-calendar ref={planningGridRef}>
          <div className="inline-block min-w-full">
            {/* Header - Sticky */}
              <div className="bg-gradient-to-r from-gray-100 to-gray-50 flex border-b-2 border-gray-300 sticky top-0 z-40 shadow-md">
                <div className="sticky left-0 z-50 bg-gradient-to-r from-gray-100 to-gray-50 border-r-2 border-gray-300 px-2 lg:px-4 py-2 lg:py-3 text-left text-xs lg:text-sm font-bold text-gray-900 w-[80px] lg:w-[120px] shadow-md flex items-center gap-1 lg:gap-2">
                  <Calendar className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-orange-600" />
                  <span className="hidden sm:inline">Jour</span>
                </div>
                <div className="flex overflow-x-auto">
                  {visibleEmployees.map((employee) => {
                    const team = allTeams.find(t => t.id === employee.team_id);
                    return (
                      <div key={employee.id} className="relative group/header">
                        <EmployeeHeaderCell
                          employee={employee} team={team}
                          isDragging={draggingId === employee.id}
                          isDragOver={dragOverId === employee.id}
                          onDragStart={handleColumnDragStart}
                          onDragOver={handleColumnDragOver}
                          onDrop={handleColumnDrop}
                          onDragEnd={handleColumnDragEnd}
                          displayMode={displayMode}
                        />
                        {canHideColumns && (
                          <button onClick={(e) => { e.stopPropagation(); toggleHideColumn(employee.id); }}
                            className="absolute top-1 right-1 p-0.5 rounded bg-white/80 hover:bg-red-100 opacity-0 group-hover/header:opacity-100 transition-opacity z-10"
                            title="Masquer cette colonne">
                            <EyeOff className="w-3 h-3 text-gray-400 hover:text-red-500" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

            {/* Body */}
            <div>
              {isLoading ? (
                /* Skeleton grid — montre immédiatement la structure */
                <div className="animate-pulse">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex border-b border-gray-200 h-16">
                      <div className="w-[120px] flex-shrink-0 bg-gray-100 border-r-2 border-gray-300" />
                      {Array.from({ length: Math.max(visibleEmployees.length, 4) }).map((_, j) => (
                        <div key={j} className="min-w-[180px] w-[180px] border-r border-gray-200 bg-gray-50 p-2">
                          <div className="h-3 bg-gray-200 rounded mb-1.5" style={{ width: `${60 + Math.random() * 30}%` }} />
                          <div className="h-2 bg-gray-100 rounded" style={{ width: `${40 + Math.random() * 20}%` }} />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : daysArray.length === 0 ? (
                <div className="px-4 py-16 text-center text-gray-500">
                  <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg">Aucun jour à afficher</p>
                </div>
              ) : (
                <>
                  {daysArray.map((dayInfo, index) => {
                    const dateStr = formatLocalDate(dayInfo.date);
                    const todayStr = formatLocalDate(new Date());
                    const maxEventsInRow = Math.max(
                      1,
                      ...visibleEmployees.map(emp => {
                        const shifts = getShiftsForEmployeeAndDate(emp.id, dateStr);
                        const nonShifts = getNonShiftsForEmployeeAndDate(emp.id, dateStr);
                        return shifts.length + nonShifts.length;
                      })
                    );

                    // Is this the last visible day of this week (Sunday or last day of month)?
                    const isLastDayOfWeekInMonth = dayInfo.isLastDayOfWeek || index === daysArray.length - 1;
                    // Compute week start (Monday) for this day
                    const thisDate = dayInfo.date;
                    const dayOfWeekAdj = thisDate.getDay() === 0 ? 6 : thisDate.getDay() - 1;
                    const weekStartDate = new Date(thisDate);
                    weekStartDate.setDate(thisDate.getDate() - dayOfWeekAdj);

                    return (
                      <>
                      <div 
                        className={cn(
                          "flex border-b border-gray-200 hover:bg-gray-50/50 transition-colors",
                          dayInfo.isWeekend && "bg-orange-50/30",
                          dayInfo.isToday && "bg-blue-50/80"
                        )}
                        data-day={dateStr}
                        data-today={dayInfo.isToday ? "true" : undefined}
                      >
                        <div className={cn(
                          "sticky left-0 z-20 border-r-2 border-gray-300 px-2 lg:px-4 py-2 lg:py-3 shadow-sm w-[80px] lg:w-[120px] flex flex-col justify-center bg-white",
                          dayInfo.isWeekend && "bg-orange-50/30",
                          dayInfo.isToday && "bg-gradient-to-r from-blue-100 to-blue-50 border-l-4 border-l-blue-500"
                        )}>
                          <div className={cn(
                            "font-bold text-[9px] lg:text-xs uppercase tracking-wide",
                            dayInfo.isToday ? "text-blue-900" : "text-gray-600"
                          )}>
                            {dayInfo.dayName.substring(0, 3)}
                          </div>
                          <div className={cn(
                            "text-xl lg:text-2xl font-bold",
                            dayInfo.isToday ? "text-blue-700" : "text-gray-900"
                          )}>
                            {dayInfo.day}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!canModifyPlanning) {
                                toast.error('Lecture seule — vous n\'avez pas la permission de modifier le planning', {
                                  duration: 3000,
                                  icon: '🔒'
                                });
                                return;
                              }
                              handleToggleHoliday(dateStr);
                            }}
                            disabled={!canModifyPlanning}
                            className={cn(
                              "mt-1 text-[8px] lg:text-[9px] px-1 lg:px-1.5 py-0.5 rounded-full font-semibold transition-all",
                              !canModifyPlanning
                                ? "bg-gray-200 text-gray-400 cursor-not-allowed opacity-60"
                                : isHolidayDate(dateStr)
                                ? "bg-purple-600 text-white hover:bg-purple-700 cursor-pointer"
                                : "bg-gray-200 text-gray-600 hover:bg-purple-100 hover:text-purple-700 cursor-pointer"
                            )}
                            title={!canModifyPlanning ? "Lecture seule" : (isHolidayDate(dateStr) ? "Retirer jour férié" : "Marquer jour férié")}
                          >
                            {isHolidayDate(dateStr) ? "🎉" : "+F"}
                          </button>
                        </div>
                        <div className="flex flex-1">
                          {visibleEmployees.map(employee => {
                            const employeeShifts = getShiftsForEmployeeAndDate(employee.id, dateStr);
                            const employeeNonShifts = getNonShiftsForEmployeeAndDate(employee.id, dateStr);
                            const totalEvents = employeeShifts.length + employeeNonShifts.length;
                            
                            const employeeCPPeriods = paidLeavePeriods.filter(p => p.employee_id === employee.id);
                            const cpPeriod = isDateInCPPeriod(dateStr, employeeCPPeriods);
                            const isCPDay = !!cpPeriod;
                            
                            let isDisplayDateForCPBadge = false;
                            if (cpPeriod) {
                              const monthStart = formatLocalDate(new Date(currentYear, currentMonth, 1));
                              const monthEnd = formatLocalDate(new Date(currentYear, currentMonth + 1, 0));
                              const periodEnd = cpPeriod.end_cp;
                              const displayDate = periodEnd <= monthEnd ? periodEnd : monthEnd;
                              isDisplayDateForCPBadge = dateStr === displayDate;
                            }

                            return (
                              <div
                                key={employee.id}
                                onClick={() => handleCellClick(employee.id, dateStr, dayInfo)}
                                data-employee-date={`${employee.id}-${dateStr}`}
                                className={cn(
                                  "border-r border-gray-200 px-1.5 lg:px-2 py-1.5 lg:py-2 cursor-pointer hover:bg-orange-50 transition-all group relative min-w-[150px] w-[150px] lg:min-w-[180px] lg:w-[180px] flex",
                                  dayInfo.isWeekend && "bg-orange-50/20",
                                  isCPDay && "bg-green-100/40"
                                )}
                              >
                                <div className="space-y-1.5 w-full flex flex-col relative" style={{ minHeight: `${Math.max(60, maxEventsInRow * 52)}px` }}>
                                  {isDisplayDateForCPBadge && cpPeriod && (
                                   <div 
                                     onClick={(e) => {
                                       e.stopPropagation();
                                       if (!canModifyPlanning) {
                                         toast.error('Lecture seule — vous n\'avez pas la permission de modifier le planning', {
                                           duration: 3000,
                                           icon: '🔒'
                                         });
                                         return;
                                       }
                                       setModalState({
                                         isOpen: true,
                                         actionType: 'DELETE_CP',
                                         selectedEmployee: employee
                                       });
                                       setSelectedCPPeriod(cpPeriod);
                                     }}
                                     className={cn(
                                       "absolute -top-1 -right-1 z-10 text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-md transition-colors",
                                       canModifyPlanning
                                         ? "bg-green-600 text-white cursor-pointer hover:bg-red-600"
                                         : "bg-gray-400 text-gray-200 cursor-not-allowed opacity-60"
                                     )}
                                     title={canModifyPlanning ? "Cliquer pour supprimer" : "Lecture seule"}
                                   >
                                     🟢 {cpPeriod.cp_days_manual || cpPeriod.cp_days_auto} CP
                                   </div>
                                  )}
                                  
                                  {employeeNonShifts.map((nonShift) => {
                                    const type = nonShiftTypes.find(t => t.id === nonShift.non_shift_type_id);
                                    return (
                                      <div key={nonShift.id} className={totalEvents === 1 ? "flex-1" : ""}>
                                        <NonShiftCard
                                          nonShift={nonShift}
                                          nonShiftType={type}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (!canModifyPlanning) {
                                              toast.error('Vous n\'avez pas la permission de modifier le planning');
                                              return;
                                            }
                                            handleCellClick(employee.id, dateStr, dayInfo);
                                          }}
                                          onDelete={(ns) => {
                                            if (!canModifyPlanning) {
                                              toast.error('Vous n\'avez pas la permission de modifier le planning');
                                              return;
                                            }
                                            if (window.confirm('Supprimer cet événement ?')) {
                                              base44.entities.NonShiftEvent.delete(ns.id).then(() => {
                                                queryClient.invalidateQueries({ queryKey: ['nonShiftEvents'] });
                                                toast.success('Événement supprimé');
                                              });
                                            }
                                          }}
                                          disabled={!canModifyPlanning}
                                        />
                                      </div>
                                    );
                                  })}
                                  {employeeShifts.map((shift) => {
                                    const swapInfo = swapLookup.get(`${shift.employee_id}_${shift.date}`) || null;
                                    return (
                                      <div key={shift.id} className={totalEvents === 1 ? "flex-1" : ""}>
                                        <ShiftCard
                                          shift={shift}
                                          positions={positions}
                                          swapInfo={swapInfo}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (!canModifyPlanning) {
                                              toast.error('Vous n\'avez pas la permission de modifier le planning');
                                              return;
                                            }
                                            handleCellClick(employee.id, dateStr, dayInfo);
                                          }}
                                          onDelete={(s) => {
                                            if (!canModifyPlanning) {
                                              toast.error('Vous n\'avez pas la permission de modifier le planning');
                                              return;
                                            }
                                            handleDeleteShift(s);
                                          }}
                                          hasRestWarning={false}
                                          hasOvertimeWarning={false}
                                          onSave={canModifyPlanning ? (id, data) => saveShiftMutation.mutate({ id, data, captureForUndo: true }) : null}
                                          disabled={!canModifyPlanning}
                                        />
                                      </div>
                                    );
                                  })}
                                  {employeeShifts.length === 0 && employeeNonShifts.length === 0 && (
                                    <div className="flex items-center justify-center flex-1 text-gray-300 group-hover:text-orange-400 transition-colors">
                                      <Plus className="w-6 h-6" />
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      {/* Weekly Summary Row - shown after Sunday or last day of month */}
                      {isLastDayOfWeekInMonth && (
                        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border-t-2 border-purple-300 flex">
                          <div className="sticky left-0 z-20 bg-gradient-to-r from-purple-50 to-indigo-50 border-r-2 border-purple-200 px-1 lg:px-2 py-1 shadow-sm w-[80px] lg:w-[120px]">
                            <div className="text-[8px] lg:text-[10px] font-bold text-purple-900 uppercase tracking-wide text-center">
                              <span className="hidden lg:inline">📅 Semaine</span>
                              <span className="lg:hidden">📅 Sem</span>
                            </div>
                          </div>
                          <div className="flex flex-1">
                            {visibleEmployees.map(employee => {
                              const weekRecapKey = `${employee.id}_${formatLocalDate(weekStartDate)}`;
                              const weeklyRecap = weeklyRecapsLookup.get(weekRecapKey) || null;
                              return (
                                <div key={employee.id} className="border-r border-purple-200 min-w-[150px] w-[150px] lg:min-w-[180px] lg:w-[180px]">
                                  <WeeklySummary
                                    employee={employee}
                                    shifts={shifts}
                                    weekStart={weekStartDate}
                                    weeklyRecap={weeklyRecap}
                                    onRecapUpdate={() => queryClient.invalidateQueries({ queryKey: ['allWeeklyRecaps'] })}
                                    currentMonth={currentMonth}
                                    currentYear={currentYear}
                                    nonShiftEvents={nonShiftEvents}
                                    nonShiftTypes={nonShiftTypes}
                                    disabled={!canModifyPlanning}
                                    clipToMonth={true}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      </>
                      );
                      })}

                      {/* Monthly Summary Row */}
                   <div className="bg-gradient-to-r from-blue-100 to-blue-50 border-t-4 border-blue-500 flex">
                     <div className="sticky left-0 z-20 bg-gradient-to-r from-blue-100 to-blue-50 border-r-2 border-blue-300 px-1 lg:px-2 py-2 lg:py-3 shadow-sm w-[80px] lg:w-[120px]">
                       <div className="text-[9px] lg:text-[11px] font-bold text-blue-900 uppercase tracking-wide text-center">
                         <span className="hidden lg:inline">📊 Récap mensuel</span>
                         <span className="lg:hidden">📊 Mois</span>
                       </div>
                     </div>
                     <div className="flex flex-1">
                       {visibleEmployees.map(employee => {
                         const employeeCpPeriods = cpPeriodsLookup.get(employee.id) || [];
                         const monthlyRecap = monthlyRecapsLookup.get(employee.id) || null;

                         return (
                           <div key={employee.id} className="border-r border-blue-200 min-w-[150px] w-[150px] lg:min-w-[180px] lg:w-[180px]">
                             <MonthlySummary
                               employee={employee}
                               shifts={shifts}
                               nonShiftEvents={nonShiftEvents}
                               nonShiftTypes={nonShiftTypes}
                               monthStart={new Date(currentYear, currentMonth, 1)}
                               monthEnd={new Date(currentYear, currentMonth + 1, 0)}
                               holidayDates={holidayDates}
                               cpPeriods={employeeCpPeriods}
                               monthlyRecap={monthlyRecap}
                               currentUser={currentUser}
                               weeklyRecaps={allWeeklyRecaps}
                               disabled={!canModifyPlanning}
                               onClearEmployeeMonth={canModifyPlanning ? () => setClearEmployeeMonthTarget(employee) : null}
                             />
                           </div>
                         );
                       })}
                     </div>
                     </div>
                     </>
                     )}
                     </div>
                     </div>
                     </div>
                     </div>

                     <ShiftFormModal
                     open={showShiftModal}
                     onOpenChange={(open) => {
                       setShowShiftModal(open);
                       // Ne pas effacer selectedCell ici — le modal le fait en interne après settled
                       if (!open) setSelectedCell(null);
                     }}
                     selectedCell={selectedCell}
                     existingShifts={selectedCell ? getShiftsForEmployeeAndDate(selectedCell.employeeId, selectedCell.date) : []}
                     existingNonShifts={selectedCell ? getNonShiftsForEmployeeAndDate(selectedCell.employeeId, selectedCell.date) : []}
                     allShifts={shifts}
                     onSave={(id, data) => saveShiftMutation.mutateAsync({ id, data, captureForUndo: true })}
                     currentUser={currentUser}
                     />

                     <PlanningSettingsModal
         open={showPlanningSettings}
         onOpenChange={setShowPlanningSettings}
         displayMode={displayMode}
         setDisplayMode={setDisplayMode}
       />

       {/* Modale centralisée pour les actions globales */}
       {modalState.isOpen && (
         <Dialog 
           open={true}
           onOpenChange={(open) => {
             if (!open) {
               setModalState({ isOpen: false, actionType: null, selectedEmployee: null });
               setSelectedCPPeriod(null);
             }
           }}
         >
           <DialogContent className="max-w-4xl w-[90vw] max-h-[90vh] overflow-y-auto">
             {modalState.actionType === 'ADD_CP' && (
               <>
                 <DialogHeader>
                   <DialogTitle className="text-xl font-bold text-green-600">
                     🟢 Ajouter Congés Payés
                   </DialogTitle>
                 </DialogHeader>
                 <AddCPGlobalModal
                   year={currentYear}
                   month={currentMonth}
                   onClose={() => {
                     setModalState({ isOpen: false, actionType: null, selectedEmployee: null });
                     setSelectedCPPeriod(null);
                   }}
                 />
               </>
             )}
             {modalState.actionType === 'APPLY_TEMPLATE' && (
               <>
                 <DialogHeader>
                   <DialogTitle className="text-xl font-bold text-blue-600">
                     📋 Appliquer des plannings types — {MONTHS[currentMonth]} {currentYear}
                   </DialogTitle>
                 </DialogHeader>
                 <ApplyTemplateGlobalModal
                   currentMonth={currentMonth}
                   currentYear={currentYear}
                   onClose={() => {
                     setModalState({ isOpen: false, actionType: null, selectedEmployee: null });
                   }}
                 />
               </>
             )}
             {modalState.actionType === 'DELETE_CP' && selectedCPPeriod && (
               <>
                 <DialogHeader>
                   <DialogTitle className="text-xl font-bold text-red-600">
                     🗑️ Supprimer Congés Payés
                   </DialogTitle>
                 </DialogHeader>
                 <DeleteCPModal
                   cpPeriod={selectedCPPeriod}
                   employee={modalState.selectedEmployee}
                   onClose={() => {
                     setModalState({ isOpen: false, actionType: null, selectedEmployee: null });
                     setSelectedCPPeriod(null);
                   }}
                 />
               </>
             )}
           </DialogContent>
         </Dialog>
       )}

       {/* Export Compta Modal */}
       <ExportComptaModal
         open={showExportComptaModal}
         onOpenChange={setShowExportComptaModal}
         monthStart={new Date(currentYear, currentMonth, 1)}
         monthEnd={new Date(currentYear, currentMonth + 1, 0)}
         holidayDates={holidayDates}
         employees={sortedEmployees}
         shifts={shifts}
         nonShiftEvents={nonShiftEvents}
         nonShiftTypes={nonShiftTypes}
         positions={positions}
       />

       {/* Clear Month Modal */}
       <ClearMonthModal
         isOpen={showClearMonthModal}
         onClose={() => setShowClearMonthModal(false)}
         year={currentYear}
         month={currentMonth}
       />

       {/* Hidden Columns Panel */}
       {showColumnsManager && (
         <Dialog open={showColumnsManager} onOpenChange={setShowColumnsManager}>
           <DialogContent className="max-w-sm">
             <DialogHeader>
               <DialogTitle className="flex items-center gap-2 text-base">
                  <EyeOff className="w-4 h-4 text-orange-500" />
                  Colonnes masquées ({layout?.hidden_employee_ids?.length || 0})
               </DialogTitle>
             </DialogHeader>
             <div className="space-y-2">
                {(layout?.hidden_employee_ids || []).map(id => {
                 const emp = allEmployees.find(e => e.id === id);
                 if (!emp) return null;
                 return (
                   <div key={id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg border">
                     <span className="text-sm font-medium">{emp.first_name} {emp.last_name}</span>
                     <button onClick={() => toggleHideColumn(id)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
                       <Eye className="w-3.5 h-3.5" /> Afficher
                     </button>
                   </div>
                 );
               })}
             </div>
             <div className="flex gap-2 pt-2 border-t">
                <Button onClick={showAllColumns} variant="outline" size="sm" className="flex-1 text-xs"><Eye className="w-3.5 h-3.5 mr-1" />Tout afficher</Button>
                <Button onClick={() => setShowColumnsManager(false)} size="sm" className="flex-1 text-xs bg-orange-500 hover:bg-orange-600">Fermer</Button>
              </div>
           </DialogContent>
         </Dialog>
       )}

       {/* Clear Employee Month Modal */}
       <ClearEmployeeMonthModal
         open={!!clearEmployeeMonthTarget}
         onOpenChange={(open) => { if (!open) setClearEmployeeMonthTarget(null); }}
         employee={clearEmployeeMonthTarget}
         year={currentYear}
         month={currentMonth}
         monthKey={monthKey}
       />

       {/* Copy Week Modal */}
       <Dialog open={copyWeekModal.open} onOpenChange={(open) => !open && setCopyWeekModal({ open: false, weekStart: null, weekAbove: null })}>
         <DialogContent className="max-w-md">
           <DialogHeader>
             <DialogTitle className="text-lg font-bold text-orange-600">
               Copier la semaine du dessus
             </DialogTitle>
           </DialogHeader>
           
           <div className="space-y-4">
             <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-3 flex items-start gap-2">
               <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
               <div>
                 <p className="font-semibold text-yellow-900 text-sm">
                   Cette semaine contient déjà des données
                 </p>
                 <p className="text-xs text-yellow-700 mt-1">
                   Choisissez comment gérer les événements existants :
                 </p>
               </div>
             </div>

             <div className="space-y-2">
               <label className="flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                 <input
                   type="radio"
                   name="mode"
                   value="replace"
                   checked={weekConflictMode === 'replace'}
                   onChange={(e) => setWeekConflictMode(e.target.value)}
                   className="mt-1"
                 />
                 <div>
                   <div className="font-semibold text-sm text-gray-900">🔁 Remplacer</div>
                   <div className="text-xs text-gray-600">
                     Supprimer tous les événements existants et les remplacer par ceux de la semaine du dessus
                   </div>
                 </div>
               </label>

               <label className="flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                 <input
                   type="radio"
                   name="mode"
                   value="merge"
                   checked={weekConflictMode === 'merge'}
                   onChange={(e) => setWeekConflictMode(e.target.value)}
                   className="mt-1"
                 />
                 <div>
                   <div className="font-semibold text-sm text-gray-900">➕ Fusionner</div>
                   <div className="text-xs text-gray-600">
                     Conserver les événements existants et ajouter uniquement ceux qui ne créent pas de doublon
                   </div>
                 </div>
               </label>
             </div>

             <div className="flex gap-3 pt-2">
               <Button
                 onClick={() => setCopyWeekModal({ open: false, weekStart: null, weekAbove: null })}
                 variant="outline"
                 className="flex-1"
               >
                 Annuler
               </Button>
               <Button
                 onClick={() => {}}
                 className="flex-1 bg-orange-600 hover:bg-orange-700"
               >
                 Confirmer
               </Button>
             </div>
           </div>
         </DialogContent>
       </Dialog>

       {/* Leave Request Modal */}
       <LeaveRequestModal
         open={showLeaveRequestModal}
         onOpenChange={setShowLeaveRequestModal}
       />

       {/* Shift Swap Modal */}
       <ShiftSwapModal
         open={showShiftSwapModal}
         onOpenChange={setShowShiftSwapModal}
         currentYear={currentYear}
         currentMonth={currentMonth}
         monthKey={monthKey}
       />

       {/* Direct Shift Swap Modal */}
       <DirectShiftSwapModal
         open={showDirectSwapModal}
         onOpenChange={setShowDirectSwapModal}
         currentYear={currentYear}
         currentMonth={currentMonth}
         resetVersion={resetVersion}
         monthKey={monthKey}
       />

       {/* Floating Action Button - Only for users with modify permission */}
       {canModifyPlanning ? (
         <div className="fixed bottom-6 right-6 z-50">
           {showFab && (
             <div className="absolute bottom-16 right-0 bg-white rounded-lg shadow-2xl border-2 border-gray-200 p-2 space-y-2 min-w-[240px] animate-in slide-in-from-bottom-2">
               <button
                 onClick={() => {
                   setShowLeaveRequestModal(true);
                   setShowFab(false);
                 }}
                 className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 rounded-lg transition-colors group"
               >
                 <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                   <span className="text-lg">📝</span>
                 </div>
                 <div className="text-left flex-1">
                   <div className="font-semibold text-sm text-gray-900">Demande de CP</div>
                   <div className="text-xs text-gray-500">Nouvelle demande</div>
                 </div>
               </button>

               <button
                 onClick={() => {
                   setShowShiftSwapModal(true);
                   setShowFab(false);
                 }}
                 className="w-full flex items-center gap-3 px-4 py-3 hover:bg-purple-50 rounded-lg transition-colors group"
               >
                 <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                   <span className="text-lg">🔄</span>
                 </div>
                 <div className="text-left flex-1">
                   <div className="font-semibold text-sm text-gray-900">Demande d'échange</div>
                   <div className="text-xs text-gray-500">Échanger un shift</div>
                 </div>
               </button>

               {canDoDirectSwap && (
                 <button
                   onClick={() => {
                     setShowDirectSwapModal(true);
                     setShowFab(false);
                   }}
                   className="w-full flex items-center gap-3 px-4 py-3 hover:bg-orange-50 rounded-lg transition-colors group"
                 >
                   <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center group-hover:bg-orange-200 transition-colors">
                     <span className="text-lg">⚡</span>
                   </div>
                   <div className="text-left flex-1">
                     <div className="font-semibold text-sm text-gray-900">Échange direct</div>
                     <div className="text-xs text-gray-500">Immédiat, sans validation</div>
                   </div>
                 </button>
               )}

               <button
                 onClick={() => {
                   setModalState({ isOpen: true, actionType: 'ADD_CP', selectedEmployee: null });
                   setShowFab(false);
                 }}
                 className="w-full flex items-center gap-3 px-4 py-3 hover:bg-green-50 rounded-lg transition-colors group"
               >
                 <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center group-hover:bg-green-200 transition-colors">
                   <span className="text-lg">🟢</span>
                 </div>
                 <div className="text-left flex-1">
                   <div className="font-semibold text-sm text-gray-900">Ajouter CP</div>
                   <div className="text-xs text-gray-500">Congés payés</div>
                 </div>
               </button>

               <button
                 onClick={() => {
                   setModalState({ isOpen: true, actionType: 'APPLY_TEMPLATE', selectedEmployee: null });
                   setShowFab(false);
                 }}
                 className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 rounded-lg transition-colors group"
               >
                 <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                   <Calendar className="w-5 h-5 text-blue-600" />
                 </div>
                 <div className="text-left flex-1">
                   <div className="font-semibold text-sm text-gray-900">Appliquer templates</div>
                   <div className="text-xs text-gray-500">Plannings types</div>
                 </div>
               </button>

               <button
                 onClick={() => {
                   setShowClearMonthModal(true);
                   setShowFab(false);
                 }}
                 className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 rounded-lg transition-colors group"
               >
                 <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center group-hover:bg-red-200 transition-colors">
                   <AlertTriangle className="w-5 h-5 text-red-600" />
                 </div>
                 <div className="text-left flex-1">
                   <div className="font-semibold text-sm text-gray-900">Réinitialiser mois</div>
                   <div className="text-xs text-gray-500">Effacer le planning</div>
                 </div>
               </button>

               <button
                 onClick={() => {
                   setShowExportComptaModal(true);
                   setShowFab(false);
                 }}
                 className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 rounded-lg transition-colors group"
               >
                 <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center group-hover:bg-gray-200 transition-colors">
                   <FileText className="w-5 h-5 text-gray-600" />
                 </div>
                 <div className="text-left flex-1">
                   <div className="font-semibold text-sm text-gray-900">Export compta</div>
                   <div className="text-xs text-gray-500">Envoi comptabilité</div>
                 </div>
               </button>
             </div>
           )}

           <button
             onClick={() => setShowFab(!showFab)}
             className="w-14 h-14 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 rounded-full shadow-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95"
           >
             {showFab ? (
               <X className="w-6 h-6 text-white" />
             ) : (
               <Plus className="w-6 h-6 text-white" />
             )}
           </button>
         </div>
       ) : (
         <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
           {/* Demande CP accessible à tous */}
           <button
             onClick={() => setShowLeaveRequestModal(true)}
             className="w-14 h-14 bg-blue-600 hover:bg-blue-700 rounded-full shadow-xl flex items-center justify-center transition-all hover:scale-110 active:scale-95"
             title="Demande de CP"
           >
             <span className="text-2xl">📝</span>
           </button>

           {/* Demande d'échange accessible à tous */}
           <button
             onClick={() => setShowShiftSwapModal(true)}
             className="w-14 h-14 bg-purple-600 hover:bg-purple-700 rounded-full shadow-xl flex items-center justify-center transition-all hover:scale-110 active:scale-95"
             title="Demande d'échange de shift"
           >
             <span className="text-2xl">🔄</span>
           </button>
           
           <div className="w-14 h-14 bg-gray-300 rounded-full shadow-lg flex items-center justify-center opacity-40 cursor-not-allowed" title="Lecture seule — vous n'avez pas la permission de modifier le planning">
             <Plus className="w-6 h-6 text-gray-500" />
           </div>
         </div>
       )}
       </div>
    );
}