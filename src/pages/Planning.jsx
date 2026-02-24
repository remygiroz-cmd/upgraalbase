import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Calendar, ChevronLeft, ChevronRight, Plus, Filter, GripVertical, Settings, MoreVertical, Copy, ArrowDown, FileText, X } from 'lucide-react';
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
import DeleteCPModal from '@/components/planning/DeleteCPModal';
import ShiftSwapModal from '@/components/planning/ShiftSwapModal';
import DirectShiftSwapModal, { canDirectSwap } from '@/components/planning/DirectShiftSwapModal';
import { calculateShiftDuration, checkMinimumRest } from '@/components/planning/LegalChecks';
import { parseLocalDate, formatLocalDate } from '@/components/planning/dateUtils';
import { isDateInCPPeriod } from '@/components/planning/paidLeaveCalculations';
import { usePlanningVersion, withPlanningVersion, filterByVersion } from '@/components/planning/usePlanningVersion';
import { useUndoStack } from '@/components/planning/useUndoStack';
import UndoRedoButtons from '@/components/planning/UndoRedoButtons';
import PinchZoomContainer from '@/components/planning/PinchZoomContainer';
import TodaySummary from '@/components/planning/TodaySummary';

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export default function Planning() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showPlanningSettings, setShowPlanningSettings] = useState(false);
  const [showExportComptaModal, setShowExportComptaModal] = useState(false);
  const [showApplyTemplatesModal, setShowApplyTemplatesModal] = useState(false);
  const [showClearMonthModal, setShowClearMonthModal] = useState(false);
  const [selectedCPPeriod, setSelectedCPPeriod] = useState(null);
  const [showLeaveRequestModal, setShowLeaveRequestModal] = useState(false);
  const [showShiftSwapModal, setShowShiftSwapModal] = useState(false);
  const [showDirectSwapModal, setShowDirectSwapModal] = useState(false);
  
  // État centralisé pour les actions depuis le dropdown
  const [modalState, setModalState] = useState({
    isOpen: false,
    actionType: null, // 'ADD_CP' | 'APPLY_TEMPLATE' | 'DELETE_CP'
    selectedEmployee: null
  });
  const [selectedCell, setSelectedCell] = useState(null);
  const [filterType, setFilterType] = useState('global');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [copyWeekModal, setCopyWeekModal] = useState({ open: false, weekStart: null, weekAbove: null });
  const [weekConflictMode, setWeekConflictMode] = useState('replace');
  const [displayMode, setDisplayMode] = useState('normal'); // 'compact' | 'normal'
  const [showFab, setShowFab] = useState(false); // Floating Action Button
  const [isUndoing, setIsUndoing] = useState(false);
  const [isRedoing, setIsRedoing] = useState(false);
  const [columnOrder, setColumnOrder] = useState(() => {
    try {
      const saved = localStorage.getItem('planning_column_order');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const queryClient = useQueryClient();

  // Undo/Redo system
  const undoStack = useUndoStack();
  
  const tableContainerRef = useRef(null);

  // Fetch current user
  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  // Fetch user role to check planning_modify permission
  const { data: userRole } = useQuery({
    queryKey: ['userRole', currentUser?.role_id],
    queryFn: async () => {
      if (!currentUser?.role_id) return null;
      const roles = await base44.entities.Role.filter({ id: currentUser.role_id });
      return roles[0] || null;
    },
    enabled: !!currentUser?.role_id
  });

  // Check if user can modify planning (admin or has planning_modify permission)
  const canModifyPlanning = currentUser?.role === 'admin' || userRole?.permissions?.planning_modify || false;
  // Check if user can do direct swap (manager/admin roles)
  const canDoDirectSwap = canDirectSwap(currentUser, userRole);

  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  // Get current planning version for reset system
  const { resetVersion, monthKey } = usePlanningVersion(currentYear, currentMonth);

  // Fetch ALL employees (including archived)
  const { data: allEmployees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.list()
  });

  // Fetch teams
  const { data: allTeams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.filter({ is_active: true })
  });

  // Fetch shifts for current month (filtered by reset_version)
  const { data: shifts = [] } = useQuery({
    queryKey: ['shifts', currentYear, currentMonth, resetVersion],
    queryFn: async () => {
      const firstDay = formatLocalDate(new Date(currentYear, currentMonth, 1));
      const lastDay = formatLocalDate(new Date(currentYear, currentMonth + 1, 0));
      
      const allShifts = await base44.entities.Shift.list();
      const monthShifts = allShifts.filter(s => s.date >= firstDay && s.date <= lastDay);
      return filterByVersion(monthShifts, resetVersion);
    },
    enabled: resetVersion !== undefined
  });

  const updateTeamMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Team.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    }
  });

  // Filter and sort employees based on archive status and month
  const sortedEmployees = React.useMemo(() => {
    const today = new Date();
    const currentMonthDate = new Date(currentYear, currentMonth, 1);
    
    // Déterminer si le mois affiché est passé, présent ou futur
    const isPastMonth = currentMonthDate < new Date(today.getFullYear(), today.getMonth(), 1);
    const isCurrentMonth = currentMonthDate.getFullYear() === today.getFullYear() && 
                           currentMonthDate.getMonth() === today.getMonth();
    const isFutureMonth = currentMonthDate > new Date(today.getFullYear(), today.getMonth(), 1);
    
    // Filtrer les employés selon la règle
    let filteredEmployees = allEmployees;
    
    if (isFutureMonth) {
      // Mois futur: uniquement employés actifs
      filteredEmployees = allEmployees.filter(emp => emp.is_active === true);
    } else if (isCurrentMonth) {
      // Mois en cours: employés actifs + archivés avec au moins 1 shift ce mois
      filteredEmployees = allEmployees.filter(emp => {
        if (emp.is_active === true) return true;
        
        // Employé archivé: vérifier s'il a au moins 1 shift ce mois
        const hasShiftsThisMonth = shifts.some(s => s.employee_id === emp.id);
        return hasShiftsThisMonth;
      });
    }
    // Si mois passé (isPastMonth): afficher tous les employés (pas de filtre)
    
    // Trier par équipe puis par nom
    return [...filteredEmployees].sort((a, b) => {
      const teamA = allTeams.find(t => t.id === a.team_id);
      const teamB = allTeams.find(t => t.id === b.team_id);
      
      const orderA = teamA?.order ?? 999;
      const orderB = teamB?.order ?? 999;
      
      if (orderA !== orderB) return orderA - orderB;
      
      // Same team, sort by name
      return (a.first_name || '').localeCompare(b.first_name || '');
    });
  }, [allEmployees, allTeams, currentYear, currentMonth, shifts]);

  // Get teams sorted by order
  const teams = React.useMemo(() => {
    return [...allTeams].sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [allTeams]);

  // Filter employees based on selection
  const filteredEmployees = React.useMemo(() => {
    if (filterType === 'employee' && selectedEmployee) {
      return sortedEmployees.filter(e => e.id === selectedEmployee);
    }
    if (filterType === 'team' && selectedTeam) {
      return sortedEmployees.filter(e => e.team_id === selectedTeam);
    }
    return sortedEmployees;
  }, [sortedEmployees, filterType, selectedEmployee, selectedTeam]);

  // Apply column order on top of filtered employees
  const employees = React.useMemo(() => {
    if (columnOrder.length === 0) return filteredEmployees;
    const ordered = [];
    const rest = [...filteredEmployees];
    for (const id of columnOrder) {
      const idx = rest.findIndex(e => e.id === id);
      if (idx !== -1) {
        ordered.push(rest[idx]);
        rest.splice(idx, 1);
      }
    }
    return [...ordered, ...rest];
  }, [filteredEmployees, columnOrder]);

  // Fetch non-shift events for current month (filtered by reset_version)
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

  // Fetch non-shift types
  const { data: nonShiftTypes = [] } = useQuery({
    queryKey: ['nonShiftTypes'],
    queryFn: async () => {
      const types = await base44.entities.NonShiftType.filter({ is_active: true });
      return types.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
  });

  // Fetch positions (once for all ShiftCards)
  const { data: positions = [] } = useQuery({
    queryKey: ['positions'],
    queryFn: async () => {
      const all = await base44.entities.Position.filter({ is_active: true });
      return all.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
  });

  // Fetch CP periods for current month (filtered by reset_version)
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

  // Fetch approved swap requests for current month
  const { data: approvedSwaps = [] } = useQuery({
    queryKey: ['approvedSwaps', monthKey],
    queryFn: () => base44.entities.ShiftSwapRequest.filter({ status: 'APPROVED', month_key: monthKey }),
    enabled: !!monthKey
  });

  // Build a lookup: shiftId → swap info
  const swapLookup = React.useMemo(() => {
    const map = new Map();
    for (const swap of approvedSwaps) {
      map.set(swap.shift_a_id, { otherName: swap.employee_b_name, otherDate: swap.shift_b_date, otherTime: `${swap.shift_b_start_time}-${swap.shift_b_end_time}`, myDate: swap.shift_a_date, myTime: `${swap.shift_a_start_time}-${swap.shift_a_end_time}` });
      map.set(swap.shift_b_id, { otherName: swap.employee_a_name, otherDate: swap.shift_a_date, otherTime: `${swap.shift_a_start_time}-${swap.shift_a_end_time}`, myDate: swap.shift_b_date, myTime: `${swap.shift_b_start_time}-${swap.shift_b_end_time}` });
    }
    return map;
  }, [approvedSwaps]);

  // Fetch holiday dates for current month
  const { data: holidayDates = [] } = useQuery({
    queryKey: ['holidayDates', currentYear, currentMonth],
    queryFn: async () => {
      const firstDay = formatLocalDate(new Date(currentYear, currentMonth, 1));
      const lastDay = formatLocalDate(new Date(currentYear, currentMonth + 1, 0));

      const allHolidays = await base44.entities.HolidayDate.list();
      return allHolidays.filter(h => h.date >= firstDay && h.date <= lastDay);
    }
  });

  // =====================================================
  // OPTIMISATION: Fetch ALL weekly recaps in ONE query
  // Instead of N queries (one per employee per week)
  // =====================================================
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

  // =====================================================
  // OPTIMISATION: Fetch ALL monthly recaps in ONE query
  // Instead of N queries (one per employee)
  // =====================================================
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

  // Create lookup maps for quick access (O(1) instead of O(n))
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

  // Create lookup for CP periods by employee
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

  const saveShiftMutation = useMutation({
    mutationFn: async ({ id, data, captureForUndo = false, beforeData = null }) => {
      // Capturer l'état "before" si demandé
      let before = beforeData;
      if (captureForUndo && id && !before) {
        const existing = shifts.find(s => s.id === id);
        before = existing ? { ...existing } : null;
      }

      // Exécuter la mutation
      let result;
      if (id) {
        result = await base44.entities.Shift.update(id, data);
      } else {
        result = await base44.entities.Shift.create(withPlanningVersion(data, resetVersion, monthKey));
      }

      // Enregistrer dans undo stack si demandé
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
      
      await queryClient.refetchQueries({ 
        queryKey: ['allWeeklyRecaps', currentYear, currentMonth, resetVersion],
        exact: true 
      });
      
      if (!undoStack.isUndoingRef.current && !undoStack.isRedoingRef.current) {
        toast.success('Shift enregistré');
      }
    },
    onError: (error) => {
      toast.error('Erreur lors de l\'enregistrement : ' + error.message);
    }
  });

  const deleteShiftMutation = useMutation({
    mutationFn: async ({ shiftId, captureForUndo = false }) => {
      // Capturer l'état avant suppression si demandé
      let before = null;
      if (captureForUndo) {
        const existing = shifts.find(s => s.id === shiftId);
        before = existing ? { ...existing } : null;
      }

      // Exécuter la suppression
      await base44.entities.Shift.delete(shiftId);

      // Enregistrer dans undo stack si demandé
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

  const saveNonShiftMutation = useMutation({
    mutationFn: (data) => base44.entities.NonShiftEvent.create(withPlanningVersion(data, resetVersion, monthKey)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nonShiftEvents'] });
    }
  });

  const toggleHolidayMutation = useMutation({
    mutationFn: async ({ date, isHoliday }) => {
      if (isHoliday) {
        // Find and delete existing holiday
        const existing = holidayDates.find(h => h.date === date);
        if (existing) {
          return await base44.entities.HolidayDate.delete(existing.id);
        }
      } else {
        // Create new holiday
        return await base44.entities.HolidayDate.create({ date });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holidayDates'] });
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      toast.success('Jour férié mis à jour');
    }
  });

  // Get days in month with week info - memoized for performance
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
      const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = 0, Sunday = 6
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
        isToday: day === todayDay &&
                 currentMonth === todayMonth &&
                 currentYear === todayYear
      });
    }

    return days;
  }, [currentYear, currentMonth]);

  // Navigate months
  const previousMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  // Handle column reordering via native HTML5 drag & drop
  const handleColumnDragStart = (id) => setDraggingId(id);
  const handleColumnDragOver = (id) => setDragOverId(id);
  const handleColumnDrop = (sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const current = [...employees];
    const fromIdx = current.findIndex(e => e.id === sourceId);
    const toIdx = current.findIndex(e => e.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const newOrder = [...current];
    const [moved] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, moved);
    const newIds = newOrder.map(e => e.id);
    setColumnOrder(newIds);
    localStorage.setItem('planning_column_order', JSON.stringify(newIds));
    setDraggingId(null);
    setDragOverId(null);
  };
  const handleColumnDragEnd = () => {
    setDraggingId(null);
    setDragOverId(null);
  };



  // Pre-compute shift lookups for O(1) access - major performance improvement
  const shiftsLookup = React.useMemo(() => {
    const lookup = new Map();
    for (const shift of shifts) {
      const key = `${shift.employee_id}_${shift.date}`;
      if (!lookup.has(key)) {
        lookup.set(key, []);
      }
      lookup.get(key).push(shift);
    }
    // Sort each employee's shifts by start_time
    for (const [key, empShifts] of lookup) {
      empShifts.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return lookup;
  }, [shifts]);

  // Pre-compute non-shift lookups for O(1) access
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

  // Get shifts for employee and date (O(1) lookup)
  const getShiftsForEmployeeAndDate = React.useCallback((employeeId, dateStr) => {
    return shiftsLookup.get(`${employeeId}_${dateStr}`) || [];
  }, [shiftsLookup]);

  // Get non-shift events for employee and date (O(1) lookup)
  const getNonShiftsForEmployeeAndDate = React.useCallback((employeeId, dateStr) => {
    return nonShiftsLookup.get(`${employeeId}_${dateStr}`) || [];
  }, [nonShiftsLookup]);

  // Find the last non-empty cell above for copying
  const getLastNonEmptyCellAbove = (employeeId, dateStr) => {
    const currentDate = parseLocalDate(dateStr);
    
    // Look backwards day by day
    for (let i = 1; i <= 60; i++) { // Max 60 days back
      const checkDate = new Date(currentDate);
      checkDate.setDate(checkDate.getDate() - i);
      const checkDateStr = formatLocalDate(checkDate);
      
      const shiftsAbove = getShiftsForEmployeeAndDate(employeeId, checkDateStr);
      const nonShiftsAbove = getNonShiftsForEmployeeAndDate(employeeId, checkDateStr);
      
      if (shiftsAbove.length > 0 || nonShiftsAbove.length > 0) {
        return {
          date: checkDateStr,
          shifts: shiftsAbove,
          nonShifts: nonShiftsAbove
        };
      }
    }
    
    return null;
  };



  // Handle cell click
  const handleCellClick = (employeeId, dateStr, dayInfo) => {
    if (!canModifyPlanning) {
      toast.error('Lecture seule — vous n\'avez pas la permission de modifier le planning', {
        duration: 3000,
        icon: '🔒'
      });
      return;
    }
    
    const employee = employees.find(e => e.id === employeeId);
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

  // Handle shift deletion
  const handleDeleteShift = (shift) => {
    if (window.confirm(`Supprimer ce shift de ${shift.start_time} à ${shift.end_time} ?`)) {
      deleteShiftMutation.mutate({ shiftId: shift.id, captureForUndo: true });
    }
  };

  // Handle week deletion
  const handleDeleteWeek = async (employeeId, weekStart) => {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    
    const weekStartStr = formatLocalDate(weekStart);
    const weekEndStr = formatLocalDate(weekEnd);

    const weekShifts = shifts.filter(s => 
      s.employee_id === employeeId && 
      s.date >= weekStartStr && 
      s.date <= weekEndStr
    );

    if (weekShifts.length === 0) return;

    try {
      await Promise.all(weekShifts.map(s => base44.entities.Shift.delete(s.id)));
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      toast.success(`${weekShifts.length} shift(s) supprimé(s)`);
    } catch (error) {
      toast.error('Erreur lors de la suppression : ' + error.message);
    }
  };

  // Get week start date
  const getWeekStart = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    return new Date(d.setDate(diff));
  };

  // Get week above
  const getWeekAbove = (weekStart) => {
    const weekAbove = new Date(weekStart);
    weekAbove.setDate(weekAbove.getDate() - 7);
    return weekAbove;
  };

  // Get all events in a week
  const getWeekEvents = (weekStart) => {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    
    const weekStartStr = formatLocalDate(weekStart);
    const weekEndStr = formatLocalDate(weekEnd);

    const weekShifts = shifts.filter(s => 
      s.date >= weekStartStr && s.date <= weekEndStr
    );

    const weekNonShifts = nonShiftEvents.filter(e =>
      e.date >= weekStartStr && e.date <= weekEndStr
    );

    return { shifts: weekShifts, nonShifts: weekNonShifts };
  };

  // Check if week has any events
  const hasWeekEvents = (weekStart) => {
    const events = getWeekEvents(weekStart);
    return events.shifts.length > 0 || events.nonShifts.length > 0;
  };

  // Copy week from above
  const handleCopyWeekFromAbove = async (targetWeekStart) => {
    const weekAbove = getWeekAbove(targetWeekStart);
    const hasEvents = hasWeekEvents(targetWeekStart);

    // Check if week above has data
    const eventsAbove = getWeekEvents(weekAbove);
    if (eventsAbove.shifts.length === 0 && eventsAbove.nonShifts.length === 0) {
      toast.error('Aucune donnée dans la semaine du dessus');
      return;
    }

    if (hasEvents) {
      setCopyWeekModal({
        open: true,
        weekStart: targetWeekStart,
        weekAbove: weekAbove
      });
    } else {
      await executeCopyWeek(targetWeekStart, weekAbove, 'replace');
    }
  };

  // Execute copy week
  const executeCopyWeek = async (targetWeekStart, sourceWeekStart, mode, employeeId = null) => {
    try {
      const sourceEvents = getWeekEvents(sourceWeekStart);
      const targetEvents = getWeekEvents(targetWeekStart);

      // Filter by employee if specified
      const sourceShifts = employeeId 
        ? sourceEvents.shifts.filter(s => s.employee_id === employeeId)
        : sourceEvents.shifts;
      const sourceNonShifts = employeeId
        ? sourceEvents.nonShifts.filter(ns => ns.employee_id === employeeId)
        : sourceEvents.nonShifts;

      const targetShifts = employeeId
        ? targetEvents.shifts.filter(s => s.employee_id === employeeId)
        : targetEvents.shifts;
      const targetNonShifts = employeeId
        ? targetEvents.nonShifts.filter(ns => ns.employee_id === employeeId)
        : targetEvents.nonShifts;

      // Delete existing events if replace mode
      if (mode === 'replace') {
        const deletePromises = [
          ...targetShifts.map(s => base44.entities.Shift.delete(s.id)),
          ...targetNonShifts.map(ns => base44.entities.NonShiftEvent.delete(ns.id))
        ];
        await Promise.all(deletePromises);
      }

      // Calculate day offset
      const dayOffset = Math.floor((targetWeekStart - sourceWeekStart) / (1000 * 60 * 60 * 24));

      // Copy shifts
      const shiftPromises = sourceShifts.map(shift => {
        const sourceDate = parseLocalDate(shift.date);
        const targetDate = new Date(sourceDate);
        targetDate.setDate(targetDate.getDate() + dayOffset);
        const targetDateStr = formatLocalDate(targetDate);

        // Skip if merge mode and event exists on that day
        if (mode === 'merge') {
          const existsOnDay = targetShifts.some(
            s => s.employee_id === shift.employee_id && s.date === targetDateStr
          );
          if (existsOnDay) return null;
        }

        return base44.entities.Shift.create(withPlanningVersion({
          employee_id: shift.employee_id,
          employee_name: shift.employee_name,
          date: targetDateStr,
          start_time: shift.start_time,
          end_time: shift.end_time,
          break_minutes: shift.break_minutes,
          position: shift.position,
          status: 'planned',
          notes: shift.notes
        }, resetVersion, monthKey));
      }).filter(Boolean);

      // Copy non-shifts
      const nonShiftPromises = sourceNonShifts.map(ns => {
        const sourceDate = parseLocalDate(ns.date);
        const targetDate = new Date(sourceDate);
        targetDate.setDate(targetDate.getDate() + dayOffset);
        const targetDateStr = formatLocalDate(targetDate);

        // Skip if merge mode and event exists on that day
        if (mode === 'merge') {
          const existsOnDay = targetNonShifts.some(
            e => e.employee_id === ns.employee_id && e.date === targetDateStr
          );
          if (existsOnDay) return null;
        }

        return base44.entities.NonShiftEvent.create(withPlanningVersion({
          employee_id: ns.employee_id,
          employee_name: ns.employee_name,
          date: targetDateStr,
          non_shift_type_id: ns.non_shift_type_id,
          non_shift_type_label: ns.non_shift_type_label,
          notes: ns.notes
        }, resetVersion, monthKey));
      }).filter(Boolean);

      await Promise.all([...shiftPromises, ...nonShiftPromises]);

      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.invalidateQueries({ queryKey: ['nonShiftEvents'] });
      
      const total = shiftPromises.length + nonShiftPromises.length;
      toast.success(`${total} événement(s) copié(s)`);
      
      setCopyWeekModal({ open: false, weekStart: null, weekAbove: null });
    } catch (error) {
      toast.error('Erreur lors de la copie : ' + error.message);
    }
  };

  // Copy employee week from above
  const handleCopyEmployeeWeekFromAbove = async (employeeId, targetWeekStart) => {
    const weekAbove = getWeekAbove(targetWeekStart);
    
    // Check if employee has data in week above
    const eventsAbove = getWeekEvents(weekAbove);
    const employeeShiftsAbove = eventsAbove.shifts.filter(s => s.employee_id === employeeId);
    const employeeNonShiftsAbove = eventsAbove.nonShifts.filter(ns => ns.employee_id === employeeId);
    
    if (employeeShiftsAbove.length === 0 && employeeNonShiftsAbove.length === 0) {
      toast.error('Aucune donnée dans la semaine du dessus pour cet employé');
      return;
    }

    // Check if employee has data in target week
    const targetEvents = getWeekEvents(targetWeekStart);
    const hasEmployeeEvents = targetEvents.shifts.some(s => s.employee_id === employeeId) ||
                               targetEvents.nonShifts.some(ns => ns.employee_id === employeeId);

    if (hasEmployeeEvents) {
      if (window.confirm('Cet employé a déjà des événements cette semaine. Remplacer ?')) {
        await executeCopyWeek(targetWeekStart, weekAbove, 'replace', employeeId);
      }
    } else {
      await executeCopyWeek(targetWeekStart, weekAbove, 'replace', employeeId);
    }
  };

  // Check for legal warnings
  const getShiftWarnings = (shift, employeeShifts) => {
    const restCheck = checkMinimumRest(employeeShifts, shift);
    return {
      hasRestWarning: !restCheck.valid,
      hasOvertimeWarning: false // calculated in summary
    };
  };

  // Check if date is a holiday
  const isHolidayDate = (dateStr) => {
    return holidayDates.some(h => h.date === dateStr);
  };

  // Toggle holiday status
  const handleToggleHoliday = (dateStr) => {
    const isCurrentlyHoliday = isHolidayDate(dateStr);
    toggleHolidayMutation.mutate({ date: dateStr, isHoliday: isCurrentlyHoliday });
  };

  // Undo/Redo handlers
  const handleUndo = async () => {
    if (!undoStack.canUndo || isUndoing) return;

    setIsUndoing(true);
    undoStack.isUndoingRef.current = true;

    try {
      const action = undoStack.popUndo();
      if (!action) return;

      console.log('🔄 Undo:', action.actionType, action);

      switch (action.actionType) {
        case 'createShift':
          // Undo create = delete
          await base44.entities.Shift.delete(action.after.shift.id);
          break;

        case 'updateShift':
          // Undo update = restore before
          await base44.entities.Shift.update(action.before.shift.id, action.before.shift);
          break;

        case 'deleteShift':
          // Undo delete = recreate
          await base44.entities.Shift.create(withPlanningVersion(action.before.shift, resetVersion, monthKey));
          break;

        default:
          console.warn('Action type non supporté:', action.actionType);
      }

      // Invalidate queries
      await queryClient.invalidateQueries({ queryKey: ['shifts'] });
      await queryClient.invalidateQueries({ queryKey: ['allWeeklyRecaps'] });
      await queryClient.invalidateQueries({ queryKey: ['allMonthlyRecaps'] });

      toast.success(`↩︎ ${action.label} annulé`);
    } catch (error) {
      console.error('❌ Erreur undo:', error);
      toast.error('Impossible d\'annuler : ' + error.message);
    } finally {
      setIsUndoing(false);
      undoStack.isUndoingRef.current = false;
    }
  };

  const handleRedo = async () => {
    if (!undoStack.canRedo || isRedoing) return;

    setIsRedoing(true);
    undoStack.isRedoingRef.current = true;

    try {
      const action = undoStack.popRedo();
      if (!action) return;

      console.log('🔁 Redo:', action.actionType, action);

      switch (action.actionType) {
        case 'createShift':
          // Redo create
          await base44.entities.Shift.create(withPlanningVersion(action.after.shift, resetVersion, monthKey));
          break;

        case 'updateShift':
          // Redo update
          await base44.entities.Shift.update(action.after.shift.id, action.after.shift);
          break;

        case 'deleteShift':
          // Redo delete
          await base44.entities.Shift.delete(action.before.shift.id);
          break;

        default:
          console.warn('Action type non supporté:', action.actionType);
      }

      // Invalidate queries
      await queryClient.invalidateQueries({ queryKey: ['shifts'] });
      await queryClient.invalidateQueries({ queryKey: ['allWeeklyRecaps'] });
      await queryClient.invalidateQueries({ queryKey: ['allMonthlyRecaps'] });

      toast.success(`↪︎ ${action.label} rétabli`);
    } catch (error) {
      console.error('❌ Erreur redo:', error);
      toast.error('Impossible de rétablir : ' + error.message);
    } finally {
      setIsRedoing(false);
      undoStack.isRedoingRef.current = false;
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignorer si l'utilisateur tape dans un input
      const target = e.target;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

      // Undo: Ctrl+Z / Cmd+Z
      if (ctrlOrCmd && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }

      // Redo: Ctrl+Y / Ctrl+Shift+Z / Cmd+Shift+Z
      if (ctrlOrCmd && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoStack.canUndo, undoStack.canRedo, isUndoing, isRedoing]);

  return (
    <div className="space-y-2">
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

      {/* Today Summary */}
      <TodaySummary
        shifts={shifts}
        nonShiftEvents={nonShiftEvents}
        nonShiftTypes={nonShiftTypes}
        employees={employees}
        positions={positions}
        onEmployeeClick={(employeeId, dateStr) => {
          // Scroll to employee's today cell
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
        <div style={{ height: '1px', width: `${(employees.length * 180) + 120}px` }} />
      </div>

      {/* Calendar Grid - Direct scrolling, no zoom wrapper */}
      <div
        className="planning-scroll-container bg-white border-2 border-gray-200 rounded-b-xl shadow-xl overflow-auto"
        style={{ height: 'calc(100vh - 240px)' }}
        ref={(el) => {
          tableContainerRef.current = el;
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
        <div className="min-w-full" data-planning-calendar>
          <div className="inline-block min-w-full">
            {/* Header - Sticky */}
              <div className="bg-gradient-to-r from-gray-100 to-gray-50 flex border-b-2 border-gray-300 sticky top-0 z-40 shadow-md">
                <div className="sticky left-0 z-50 bg-gradient-to-r from-gray-100 to-gray-50 border-r-2 border-gray-300 px-2 lg:px-4 py-2 lg:py-3 text-left text-xs lg:text-sm font-bold text-gray-900 w-[80px] lg:w-[120px] shadow-md flex items-center gap-1 lg:gap-2">
                  <Calendar className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-orange-600" />
                  <span className="hidden sm:inline">Jour</span>
                </div>
                <div className="flex overflow-x-auto">
                  {employees.map((employee) => {
                    const team = allTeams.find(t => t.id === employee.team_id);
                    return (
                      <EmployeeHeaderCell
                        key={employee.id}
                        employee={employee}
                        team={team}
                        isDragging={draggingId === employee.id}
                        isDragOver={dragOverId === employee.id}
                        onDragStart={handleColumnDragStart}
                        onDragOver={handleColumnDragOver}
                        onDrop={handleColumnDrop}
                        onDragEnd={handleColumnDragEnd}
                        displayMode={displayMode}
                      />
                    );
                  })}
                </div>
              </div>

            {/* Body */}
            <div>
              {daysArray.length === 0 ? (
                <div className="px-4 py-16 text-center text-gray-500">
                  <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg">Aucun jour à afficher</p>
                </div>
              ) : (
                <>
                  {daysArray.map((dayInfo, index) => {
                    // Calculate max events for this row across all employees
                    const dateStr = formatLocalDate(dayInfo.date);
                    const maxEventsInRow = Math.max(
                      1,
                      ...employees.map(emp => {
                        const shifts = getShiftsForEmployeeAndDate(emp.id, dateStr);
                        const nonShifts = getNonShiftsForEmployeeAndDate(emp.id, dateStr);
                        return shifts.length + nonShifts.length;
                      })
                    );

                    return (
                      <React.Fragment key={dayInfo.day}>
                      <div className={cn(
                        "flex border-b border-gray-200 hover:bg-gray-50/50 transition-colors",
                        dayInfo.isWeekend && "bg-orange-50/30",
                        dayInfo.isToday && "bg-blue-50/80"
                      )}>
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
                          {employees.map(employee => {
                            const employeeShifts = getShiftsForEmployeeAndDate(employee.id, dateStr);
                            const employeeNonShifts = getNonShiftsForEmployeeAndDate(employee.id, dateStr);
                            const totalEvents = employeeShifts.length + employeeNonShifts.length;
                            
                            // Check if date is in CP period AND if it's the display date for the badge
                            const employeeCPPeriods = paidLeavePeriods.filter(p => p.employee_id === employee.id);
                            const cpPeriod = isDateInCPPeriod(dateStr, employeeCPPeriods);
                            const isCPDay = !!cpPeriod;
                            
                            // Badge display logic: show on last day of period intersection with current month
                            let isDisplayDateForCPBadge = false;
                            if (cpPeriod) {
                              const monthStart = formatLocalDate(new Date(currentYear, currentMonth, 1));
                              const monthEnd = formatLocalDate(new Date(currentYear, currentMonth + 1, 0));
                              const periodEnd = cpPeriod.end_cp;
                              
                              // Last day of intersection = min(periodEnd, monthEnd)
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
                                  {/* CP Badge - displayed on last day of intersection with current month */}
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
                                    const warnings = getShiftWarnings(shift, employeeShifts);
                                    return (
                                      <div key={shift.id} className={totalEvents === 1 ? "flex-1" : ""}>
                                        <ShiftCard
                                          shift={shift}
                                          positions={positions}
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
                                          hasRestWarning={warnings.hasRestWarning}
                                          hasOvertimeWarning={warnings.hasOvertimeWarning}
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
                      
                      {/* Week summary row - Mobile collapsed */}
                      {(dayInfo.isLastDayOfWeek || index === daysArray.length - 1) && (
                        <div className="bg-gradient-to-r from-gray-200 to-gray-100 border-b-2 border-gray-400 flex">
                          <div className="sticky left-0 z-20 bg-gradient-to-r from-gray-200 to-gray-100 border-r-2 border-gray-400 px-1 lg:px-2 py-2 lg:py-3 shadow-sm w-[80px] lg:w-[120px]">
                            <div className="text-[9px] lg:text-[10px] font-bold text-gray-700 uppercase tracking-wide mb-1">
                              <span className="hidden lg:inline">📊 Récap. semaine</span>
                              <span className="lg:hidden">📊</span>
                            </div>
                            {(() => {
                              const weekStart = getWeekStart(dayInfo.date);
                              const weekAbove = getWeekAbove(weekStart);
                              const hasEventsAbove = hasWeekEvents(weekAbove);
                              
                              if (hasEventsAbove && weekAbove.getMonth() >= new Date(currentYear, currentMonth, 1).getMonth()) {
                              return (
                              <button
                              onClick={() => {
                              if (!canModifyPlanning) {
                              toast.error('Lecture seule — vous n\'avez pas la permission de modifier le planning', {
                              duration: 3000,
                              icon: '🔒'
                              });
                              return;
                              }
                              handleCopyWeekFromAbove(weekStart);
                              }}
                              disabled={!canModifyPlanning}
                              className={cn(
                              "text-[8px] lg:text-[9px] px-1 lg:px-1.5 py-0.5 lg:py-1 text-white rounded flex items-center gap-0.5 lg:gap-1 w-full justify-center font-semibold shadow-sm transition-colors",
                              canModifyPlanning
                              ? "bg-blue-600 hover:bg-blue-700 cursor-pointer"
                              : "bg-gray-400 cursor-not-allowed opacity-60"
                              )}
                              title={canModifyPlanning ? "Copier la semaine du dessus" : "Lecture seule"}
                              >
                                    <ArrowDown className="w-2.5 h-2.5 lg:w-3 lg:h-3" />
                                    <span className="hidden lg:inline">Copier ↑</span>
                                  </button>
                                );
                              }
                              return null;
                            })()}
                          </div>
                          <div className="flex flex-1">
                            {employees.map(employee => {
                              const weekStart = getWeekStart(dayInfo.date);
                              const weekAbove = getWeekAbove(weekStart);
                              const eventsAbove = getWeekEvents(weekAbove);
                              const hasEmployeeEventsAbove = eventsAbove.shifts.some(s => s.employee_id === employee.id) ||
                                                              eventsAbove.nonShifts.some(ns => ns.employee_id === employee.id);
                              
                              // Get weeklyRecap from lookup (O(1) instead of individual query)
                              const weekStartStr = formatLocalDate(weekStart);
                              const weeklyRecapKey = `${employee.id}_${weekStartStr}`;
                              const weeklyRecap = weeklyRecapsLookup.get(weeklyRecapKey) || null;
                              
                              // 🔍 E) LOOKUP UI - CE QUE LE COMPOSANT VA AFFICHER
                              if (weeklyRecap && weeklyRecap.base_override_hours !== null) {
                                console.log('═══════════════════════════════════════════════════');
                                console.log('E) LOOKUP UI - VALEUR AFFICHÉE');
                                console.log('═══════════════════════════════════════════════════');
                                console.log('employeeId:', employee.id);
                                console.log('employeeName:', employee.first_name + ' ' + employee.last_name);
                                console.log('weekStartStr:', weekStartStr);
                                console.log('clé de matching:', weeklyRecapKey);
                                console.log('recap trouvé?:', !!weeklyRecap);
                                console.log('recap.id:', weeklyRecap?.id);
                                console.log('recap.base_override_hours:', weeklyRecap?.base_override_hours);
                                console.log('DÉCISION: override présent → afficher', weeklyRecap.base_override_hours);
                                console.log('═══════════════════════════════════════════════════\n');
                              }

                              return (
                                <div key={employee.id} className="border-r border-gray-200 min-w-[150px] w-[150px] lg:min-w-[180px] lg:w-[180px]">
                                  <WeeklySummary
                                    employee={employee}
                                    shifts={shifts}
                                    weekStart={weekStart}
                                    weeklyRecap={weeklyRecap}
                                    currentMonth={currentMonth}
                                    currentYear={currentYear}
                                    onDeleteWeek={handleDeleteWeek}
                                    onCopyFromAbove={hasEmployeeEventsAbove && weekAbove.getMonth() >= new Date(currentYear, currentMonth, 1).getMonth()
                                      ? () => handleCopyEmployeeWeekFromAbove(employee.id, weekStart)
                                      : null
                                    }
                                    onRecapUpdate={async () => {
                                      console.log('[Planning] 🔄 onRecapUpdate called - invalidating and refetching');
                                      await queryClient.invalidateQueries({ queryKey: ['allWeeklyRecaps'] });
                                      await queryClient.refetchQueries({ 
                                        queryKey: ['allWeeklyRecaps', currentYear, currentMonth],
                                        exact: true 
                                      });
                                      console.log('[Planning] ✅ Refetch complete');
                                    }}
                                    nonShiftEvents={nonShiftEvents}
                                    nonShiftTypes={nonShiftTypes}
                                    disabled={!canModifyPlanning}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      </React.Fragment>
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
                      {employees.map(employee => {
                        // Get data from lookups (O(1) instead of individual queries)
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
                    onOpenChange={(open) => { setShowShiftModal(open); if (!open) setSelectedCell(null); }}
                    selectedCell={selectedCell}
                    existingShifts={selectedCell ? getShiftsForEmployeeAndDate(selectedCell.employeeId, selectedCell.date) : []}
                    existingNonShifts={selectedCell ? getNonShiftsForEmployeeAndDate(selectedCell.employeeId, selectedCell.date) : []}
                    allShifts={shifts}
                    onSave={(id, data) => saveShiftMutation.mutate({ id, data, captureForUndo: true })}
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
      />



      {/* Clear Month Modal */}
      <ClearMonthModal
        isOpen={showClearMonthModal}
        onClose={() => setShowClearMonthModal(false)}
        year={currentYear}
        month={currentMonth}
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

            {copyWeekModal.weekAbove && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs">
                {(() => {
                  const events = getWeekEvents(copyWeekModal.weekAbove);
                  return (
                    <p className="text-blue-900">
                      <strong>{events.shifts.length} shift(s)</strong> et <strong>{events.nonShifts.length} événement(s)</strong> seront copiés
                    </p>
                  );
                })()}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                onClick={() => setCopyWeekModal({ open: false, weekStart: null, weekAbove: null })}
                variant="outline"
                className="flex-1"
              >
                Annuler
              </Button>
              <Button
                onClick={() => executeCopyWeek(copyWeekModal.weekStart, copyWeekModal.weekAbove, weekConflictMode)}
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