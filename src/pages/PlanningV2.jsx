import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
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
import { computeMonthKey, usePlanningLayout } from '@/components/planning/usePlanningLayout';
import { isDateInCPPeriod } from '@/components/planning/paidLeaveCalculations';
import { usePlanningVersion, withPlanningVersion, filterByVersion } from '@/components/planning/usePlanningVersion';
import { getActiveShiftsForMonth, shiftsQueryKey } from '@/components/planning/shiftService';
import { useUndoStack } from '@/components/planning/useUndoStack';
import UndoRedoButtons from '@/components/planning/UndoRedoButtons';
import PinchZoomContainer from '@/components/planning/PinchZoomContainer';
import TodaySummary from '@/components/planning/TodaySummary';
import DepartureOrderBlock from '@/components/planning/DepartureOrderBlock';

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export default function PlanningV2() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showShiftModal, setShowShiftModal] = useState(false);
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

  // Hook: Planning layout persistence (order + hidden columns)
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

  // Fetch shifts for current month
  const { data: shifts = [] } = useQuery({
    queryKey: shiftsQueryKey(currentYear, currentMonth, resetVersion),
    queryFn: () => getActiveShiftsForMonth(monthKey, resetVersion),
    enabled: resetVersion !== undefined
  });

  // Filter and sort employees
  const sortedEmployees = React.useMemo(() => {
    const today = new Date();
    const currentMonthDate = new Date(currentYear, currentMonth, 1);
    const isPastMonth = currentMonthDate < new Date(today.getFullYear(), today.getMonth(), 1);
    const isCurrentMonth = currentMonthDate.getFullYear() === today.getFullYear() && currentMonthDate.getMonth() === today.getMonth();
    
    let filteredEmployees = allEmployees;
    if (!isPastMonth && !isCurrentMonth) {
      filteredEmployees = allEmployees.filter(emp => emp.is_active === true);
    } else if (isCurrentMonth) {
      filteredEmployees = allEmployees.filter(emp => {
        if (emp.is_active === true) return true;
        const hasShiftsThisMonth = shifts.some(s => s.employee_id === emp.id);
        return hasShiftsThisMonth;
      });
    }
    
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

  // Apply layout (reorder + hide) to get visibleEmployees
  const visibleEmployees = React.useMemo(() => {
    if (!layout) return filteredEmployees;
    
    let result = filteredEmployees;
    
    // Apply column order
    if (layout.column_order?.length > 0) {
      const ordered = [];
      const rest = [...filteredEmployees];
      for (const id of layout.column_order) {
        const idx = rest.findIndex(e => e.id === id);
        if (idx !== -1) {
          ordered.push(rest[idx]);
          rest.splice(idx, 1);
        }
      }
      result = [...ordered, ...rest];
    }
    
    // Apply hidden employees filter
    const hiddenIds = layout.hidden_employee_ids || [];
    return result.filter(e => !hiddenIds.includes(e.id));
  }, [filteredEmployees, layout]);

  // Fetch other data (non-shift events, types, positions, etc.)
  const { data: nonShiftEvents = [] } = useQuery({
    queryKey: ['nonShiftEvents', currentYear, currentMonth, resetVersion],
    queryFn: async () => {
      const firstDay = formatLocalDate(new Date(currentYear, currentMonth, 1));
      const lastDay = formatLocalDate(new Date(currentYear, currentMonth + 1, 0));
      const allEvents = await base44.entities.NonShiftEvent.list();
      const monthEvents = allEvents.filter(e => e.date >= firstDay && e.date <= lastDay);
      return filterByVersion(monthEvents, resetVersion);
    },
    enabled: resetVersion !== undefined
  });

  const { data: nonShiftTypes = [] } = useQuery({
    queryKey: ['nonShiftTypes'],
    queryFn: async () => {
      const types = await base44.entities.NonShiftType.filter({ is_active: true });
      return types.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
  });

  const { data: positions = [] } = useQuery({
    queryKey: ['positions'],
    queryFn: async () => {
      const all = await base44.entities.Position.filter({ is_active: true });
      return all.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
  });

  const { data: paidLeavePeriods = [] } = useQuery({
    queryKey: ['paidLeavePeriods', currentYear, currentMonth, resetVersion],
    queryFn: async () => {
      const firstDay = formatLocalDate(new Date(currentYear, currentMonth, 1));
      const lastDay = formatLocalDate(new Date(currentYear, currentMonth + 1, 0));
      const allPeriods = await base44.entities.PaidLeavePeriod.list();
      const monthPeriods = allPeriods.filter(p => p.end_cp >= firstDay && p.start_cp <= lastDay);
      return filterByVersion(monthPeriods, resetVersion);
    },
    enabled: resetVersion !== undefined
  });

  const { data: approvedSwaps = [] } = useQuery({
    queryKey: ['approvedSwaps', monthKey],
    queryFn: () => base44.entities.ShiftSwapRequest.filter({ status: 'APPROVED', month_key: monthKey }),
    enabled: !!monthKey
  });

  const { data: holidayDates = [] } = useQuery({
    queryKey: ['holidayDates', currentYear, currentMonth],
    queryFn: async () => {
      const firstDay = formatLocalDate(new Date(currentYear, currentMonth, 1));
      const lastDay = formatLocalDate(new Date(currentYear, currentMonth + 1, 0));
      const allHolidays = await base44.entities.HolidayDate.list();
      return allHolidays.filter(h => h.date >= firstDay && h.date <= lastDay);
    }
  });

  const { data: allWeeklyRecaps = [] } = useQuery({
    queryKey: ['allWeeklyRecaps', currentYear, currentMonth, resetVersion],
    queryFn: async () => {
      const firstDay = formatLocalDate(new Date(currentYear, currentMonth, 1));
      const lastDay = formatLocalDate(new Date(currentYear, currentMonth + 1, 0));
      const startRange = new Date(currentYear, currentMonth, 1);
      startRange.setDate(startRange.getDate() - 7);
      const startRangeStr = formatLocalDate(startRange);
      const allRecaps = await base44.entities.WeeklyRecap.list();
      const monthRecaps = allRecaps.filter(r => r.week_start >= startRangeStr && r.week_start <= lastDay);
      return filterByVersion(monthRecaps, resetVersion);
    },
    enabled: resetVersion !== undefined
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
    enabled: resetVersion !== undefined
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['shifts'] });
      await queryClient.invalidateQueries({ queryKey: ['allWeeklyRecaps'] });
      await queryClient.invalidateQueries({ queryKey: ['allMonthlyRecaps'] });
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
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
    const newLayout = { column_order: newIds, hidden_employee_ids: layout?.hidden_employee_ids || [] };
    saveLayout(newLayout);
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
    const newLayout = { column_order: layout?.column_order || [], hidden_employee_ids: next };
    saveLayout(newLayout);
  };

  const showAllColumns = () => {
    const newLayout = { column_order: layout?.column_order || [], hidden_employee_ids: [] };
    saveLayout(newLayout);
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

  const getShiftsForEmployeeAndDate = React.useCallback((employeeId, dateStr) => {
    return shiftsLookup.get(`${employeeId}_${dateStr}`) || [];
  }, [shiftsLookup]);

  const getNonShiftsForEmployeeAndDate = React.useCallback((employeeId, dateStr) => {
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
      toast.success(`↪︎ ${action.label} rétabli`);
    } catch (error) {
      toast.error('Impossible de rétablir : ' + error.message);
    } finally {
      setIsRedoing(false);
      undoStack.isRedoingRef.current = false;
    }
  };

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

  // Stub render (copy full render from original Planning.jsx if needed)
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Calendar className="w-4 h-4 lg:w-5 lg:h-5 text-orange-600 flex-shrink-0" />
          <h1 className="text-base lg:text-lg font-bold text-gray-900 truncate">Planning mensuel (V2)</h1>
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

      {/* Placeholder: Full render from original planning copied here */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <p className="text-sm text-gray-600">
          monthKey: {monthKey} | layout: {layout ? 'loaded' : 'loading'} | visibleEmployees: {visibleEmployees.length}
        </p>
        <p className="text-xs text-gray-500 mt-2">PlanningV2 - usePlanningLayout hook integrated</p>
      </div>
    </div>
  );
}