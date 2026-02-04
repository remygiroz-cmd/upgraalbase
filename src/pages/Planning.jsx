import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Calendar, ChevronLeft, ChevronRight, Plus, Filter, GripVertical, Settings, MoreVertical, Copy, ArrowDown, FileText } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import ShiftCard from '@/components/planning/ShiftCard';
import ShiftFormModal from '@/components/planning/ShiftFormModal';
import WeeklySummary from '@/components/planning/WeeklySummary';
import MonthlySummary from '@/components/planning/MonthlySummary';
import ApplyTemplateModal from '@/components/planning/ApplyTemplateModal';
import ApplyAllTemplatesModal from '@/components/planning/ApplyAllTemplatesModal';
import NonShiftCard from '@/components/planning/NonShiftCard';
import PlanningSettingsModal from '@/components/planning/PlanningSettingsModal';
import AddPaidLeaveModal from '@/components/planning/AddPaidLeaveModal';
import EmployeeHeaderCell from '@/components/planning/EmployeeHeaderCell';
import ExportComptaModal from '@/components/planning/ExportComptaModal';
import EmployeeActionsModal from '@/components/planning/EmployeeActionsModal';
import { calculateShiftDuration, checkMinimumRest } from '@/components/planning/LegalChecks';
import { parseLocalDate, formatLocalDate } from '@/components/planning/dateUtils';
import { isDateInCPPeriod } from '@/components/planning/paidLeaveCalculations';

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export default function Planning() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showPlanningSettings, setShowPlanningSettings] = useState(false);
  const [showApplyTemplateModal, setShowApplyTemplateModal] = useState(false);
  const [showApplyAllTemplatesModal, setShowApplyAllTemplatesModal] = useState(false);
  const [showAddPaidLeaveModal, setShowAddPaidLeaveModal] = useState(false);
  const [showExportComptaModal, setShowExportComptaModal] = useState(false);
  const [showEmployeeActionsModal, setShowEmployeeActionsModal] = useState(false);
  const [selectedEmployeeForActions, setSelectedEmployeeForActions] = useState(null);
  const [selectedEmployeeForTemplate, setSelectedEmployeeForTemplate] = useState(null);
  const [selectedEmployeeForCP, setSelectedEmployeeForCP] = useState(null);
  const [selectedCPPeriod, setSelectedCPPeriod] = useState(null);
  const [selectedCell, setSelectedCell] = useState(null);
  const [filterType, setFilterType] = useState('global');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [copyWeekModal, setCopyWeekModal] = useState({ open: false, weekStart: null, weekAbove: null });
  const [weekConflictMode, setWeekConflictMode] = useState('replace');
  const [displayMode, setDisplayMode] = useState('normal'); // 'compact' | 'normal'
  const queryClient = useQueryClient();

  // Fetch current user
  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  // Fetch employees
  const { data: allEmployees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.filter({ is_active: true })
  });

  // Fetch teams
  const { data: allTeams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.filter({ is_active: true })
  });

  const updateTeamMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Team.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    }
  });

  // Sort employees by team order
  const sortedEmployees = React.useMemo(() => {
    return [...allEmployees].sort((a, b) => {
      const teamA = allTeams.find(t => t.id === a.team_id);
      const teamB = allTeams.find(t => t.id === b.team_id);
      
      const orderA = teamA?.order ?? 999;
      const orderB = teamB?.order ?? 999;
      
      if (orderA !== orderB) return orderA - orderB;
      
      // Same team, sort by name
      return (a.first_name || '').localeCompare(b.first_name || '');
    });
  }, [allEmployees, allTeams]);

  // Get teams sorted by order
  const teams = React.useMemo(() => {
    return [...allTeams].sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [allTeams]);

  // Filter employees based on selection
  const employees = React.useMemo(() => {
    if (filterType === 'employee' && selectedEmployee) {
      return sortedEmployees.filter(e => e.id === selectedEmployee);
    }
    if (filterType === 'team' && selectedTeam) {
      return sortedEmployees.filter(e => e.team_id === selectedTeam);
    }
    return sortedEmployees;
  }, [sortedEmployees, filterType, selectedEmployee, selectedTeam]);

  // Fetch shifts for current month
  const { data: shifts = [] } = useQuery({
    queryKey: ['shifts', currentYear, currentMonth],
    queryFn: async () => {
      const firstDay = formatLocalDate(new Date(currentYear, currentMonth, 1));
      const lastDay = formatLocalDate(new Date(currentYear, currentMonth + 1, 0));
      
      const allShifts = await base44.entities.Shift.list();
      return allShifts.filter(s => s.date >= firstDay && s.date <= lastDay);
    }
  });

  // Fetch non-shift events for current month
  const { data: nonShiftEvents = [] } = useQuery({
    queryKey: ['nonShiftEvents', currentYear, currentMonth],
    queryFn: async () => {
      const firstDay = formatLocalDate(new Date(currentYear, currentMonth, 1));
      const lastDay = formatLocalDate(new Date(currentYear, currentMonth + 1, 0));
      
      const allEvents = await base44.entities.NonShiftEvent.list();
      return allEvents.filter(e => e.date >= firstDay && e.date <= lastDay);
    }
  });

  // Fetch non-shift types
  const { data: nonShiftTypes = [] } = useQuery({
    queryKey: ['nonShiftTypes'],
    queryFn: async () => {
      const types = await base44.entities.NonShiftType.filter({ is_active: true });
      return types.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
  });

  // Fetch CP periods for current month
  const { data: paidLeavePeriods = [] } = useQuery({
    queryKey: ['paidLeavePeriods', currentYear, currentMonth],
    queryFn: async () => {
      const firstDay = formatLocalDate(new Date(currentYear, currentMonth, 1));
      const lastDay = formatLocalDate(new Date(currentYear, currentMonth + 1, 0));
      
      const allPeriods = await base44.entities.PaidLeavePeriod.list();
      // Filter periods that intersect with current month
      return allPeriods.filter(p => p.end_cp >= firstDay && p.start_cp <= lastDay);
    }
  });

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

  const saveShiftMutation = useMutation({
    mutationFn: ({ id, data }) => {
      if (id) {
        return base44.entities.Shift.update(id, data);
      } else {
        return base44.entities.Shift.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      toast.success('Shift enregistré');
    },
    onError: (error) => {
      toast.error('Erreur lors de l\'enregistrement : ' + error.message);
    }
  });

  const deleteShiftMutation = useMutation({
    mutationFn: (shiftId) => base44.entities.Shift.delete(shiftId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      toast.success('Shift supprimé');
    },
    onError: (error) => {
      toast.error('Erreur lors de la suppression : ' + error.message);
    }
  });

  const saveNonShiftMutation = useMutation({
    mutationFn: (data) => base44.entities.NonShiftEvent.create(data),
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

  // Get days in month with week info
  const getDaysInMonth = () => {
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const days = [];
    
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
        isToday: day === new Date().getDate() && 
                 currentMonth === new Date().getMonth() && 
                 currentYear === new Date().getFullYear()
      });
    }
    
    return days;
  };

  const daysArray = getDaysInMonth();

  // Navigate months
  const previousMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  // Handle team reordering
  const handleTeamDragEnd = async (result) => {
    if (!result.destination) return;

    const items = Array.from(employees);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Group by teams to update their order
    const teamOrderMap = new Map();
    items.forEach((emp, index) => {
      if (emp.team_id) {
        if (!teamOrderMap.has(emp.team_id)) {
          teamOrderMap.set(emp.team_id, index);
        }
      }
    });

    // Update team orders
    const updatePromises = [];
    teamOrderMap.forEach((order, teamId) => {
      const team = allTeams.find(t => t.id === teamId);
      if (team && team.order !== order) {
        updatePromises.push(
          updateTeamMutation.mutateAsync({ id: teamId, data: { order } })
        );
      }
    });

    await Promise.all(updatePromises);
    toast.success('Ordre des équipes mis à jour');
  };

  // Sticky scrollbar
  const tableContainerRef = useRef(null);
  const scrollbarRef = useRef(null);

  useEffect(() => {
    const container = tableContainerRef.current;
    const scrollbar = scrollbarRef.current;
    if (!container || !scrollbar) return;

    const handleScroll = () => {
      scrollbar.scrollLeft = container.scrollLeft;
    };

    const handleScrollbarScroll = () => {
      container.scrollLeft = scrollbar.scrollLeft;
    };

    container.addEventListener('scroll', handleScroll);
    scrollbar.addEventListener('scroll', handleScrollbarScroll);

    // Set scrollbar width
    const updateScrollbarWidth = () => {
      scrollbar.querySelector('div').style.width = container.scrollWidth + 'px';
    };
    updateScrollbarWidth();
    window.addEventListener('resize', updateScrollbarWidth);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      scrollbar.removeEventListener('scroll', handleScrollbarScroll);
      window.removeEventListener('resize', updateScrollbarWidth);
    };
  }, [employees.length]);

  // Get shifts for employee and date (sorted chronologically)
  const getShiftsForEmployeeAndDate = (employeeId, dateStr) => {
    return shifts
      .filter(s => s.employee_id === employeeId && s.date === dateStr)
      .sort((a, b) => {
        // Sort by start_time
        return a.start_time.localeCompare(b.start_time);
      });
  };

  // Get non-shift events for employee and date
  const getNonShiftsForEmployeeAndDate = (employeeId, dateStr) => {
    return nonShiftEvents.filter(e => e.employee_id === employeeId && e.date === dateStr);
  };

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
      deleteShiftMutation.mutate(shift.id);
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

        return base44.entities.Shift.create({
          employee_id: shift.employee_id,
          employee_name: shift.employee_name,
          date: targetDateStr,
          start_time: shift.start_time,
          end_time: shift.end_time,
          break_minutes: shift.break_minutes,
          position: shift.position,
          status: 'planned',
          notes: shift.notes
        });
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

        return base44.entities.NonShiftEvent.create({
          employee_id: ns.employee_id,
          employee_name: ns.employee_name,
          date: targetDateStr,
          non_shift_type_id: ns.non_shift_type_id,
          non_shift_type_label: ns.non_shift_type_label,
          notes: ns.notes
        });
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

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-orange-600" />
          <h1 className="text-lg font-bold text-gray-900">Planning mensuel</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowApplyAllTemplatesModal(true)}
            variant="outline"
            size="sm"
            className="border border-gray-300 hover:border-orange-500 hover:bg-orange-50 text-xs"
            title="Appliquer les plannings types de tous les employés"
          >
            <span>⚡ Tous les templates</span>
          </Button>
          <Button
            onClick={() => setShowExportComptaModal(true)}
            variant="outline"
            size="sm"
            className="border border-gray-300 hover:border-blue-500 hover:bg-blue-50"
            title="Export comptabilité"
          >
            <FileText className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline text-xs">Export compta</span>
          </Button>
          <Button
            onClick={() => setShowPlanningSettings(true)}
            variant="outline"
            size="icon"
            className="h-8 w-8 border border-gray-300 hover:border-orange-500 hover:bg-orange-50"
            title="Paramètres du planning"
          >
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Month Navigation & Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <div className="flex items-center justify-between gap-3 mb-3">
          <Button 
            onClick={previousMonth} 
            variant="outline" 
            size="sm"
            className="border border-gray-300 hover:border-orange-500 hover:bg-orange-50"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="ml-1 hidden sm:inline text-xs">Précédent</span>
          </Button>
          <h2 className="text-lg font-bold text-orange-600">
            {MONTHS[currentMonth]} {currentYear}
          </h2>
          <Button 
            onClick={nextMonth} 
            variant="outline"
            size="sm"
            className="border border-gray-300 hover:border-orange-500 hover:bg-orange-50"
          >
            <span className="mr-1 hidden sm:inline text-xs">Suivant</span>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1">
            <Label className="text-[10px] font-semibold text-gray-600 mb-1 flex items-center gap-1">
              <Filter className="w-3 h-3" />
              Type de vue
            </Label>
            <Select value={filterType} onValueChange={(value) => {
              setFilterType(value);
              setSelectedTeam('');
              setSelectedEmployee('');
            }}>
              <SelectTrigger className="h-8 text-xs border border-gray-300 hover:border-orange-400">
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
              <Label className="text-[10px] font-semibold text-gray-600 mb-1">Équipe</Label>
              <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                <SelectTrigger className="h-8 text-xs border border-gray-300 hover:border-orange-400">
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
              <Label className="text-[10px] font-semibold text-gray-600 mb-1">Employé</Label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger className="h-8 text-xs border border-gray-300 hover:border-orange-400">
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

      {/* Sticky Scrollbar */}
      <div 
        ref={scrollbarRef}
        className="bg-gray-100 border-2 border-gray-200 rounded-t-xl overflow-x-auto sticky top-[72px] lg:top-0 z-30 mb-2"
        style={{ height: '16px' }}
      >
        <div style={{ height: '1px' }}></div>
      </div>

      {/* Calendar Grid with dedicated scroll container */}
      <div className="bg-white border-2 border-gray-200 rounded-xl shadow-xl overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 240px)' }}>
        <div ref={tableContainerRef} className="overflow-x-auto overflow-y-auto flex-1">
          <div className="inline-block min-w-full">
            {/* Header - Sticky */}
            <DragDropContext onDragEnd={handleTeamDragEnd}>
              <div className="bg-gradient-to-r from-gray-100 to-gray-50 flex border-b-2 border-gray-300 sticky top-0 z-40 shadow-md">
                <div className="sticky left-0 z-50 bg-gradient-to-r from-gray-100 to-gray-50 border-r-2 border-gray-300 px-4 py-3 text-left text-sm font-bold text-gray-900 w-[120px] shadow-md flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-orange-600" />
                  <span className="hidden sm:inline">Jour</span>
                </div>
                <Droppable droppableId="employees" direction="horizontal">
                  {(provided) => (
                    <div 
                      ref={provided.innerRef} 
                      {...provided.droppableProps}
                      className="flex overflow-x-auto"
                    >
                      {employees.map((employee, index) => {
                        const team = allTeams.find(t => t.id === employee.team_id);
                        return (
                          <Draggable key={employee.id} draggableId={employee.id} index={index}>
                            {(provided, snapshot) => (
                              <EmployeeHeaderCell
                                ref={provided.innerRef}
                                employee={employee}
                                team={team}
                                isDragging={snapshot.isDragging}
                                dragHandleProps={provided.dragHandleProps}
                                displayMode={displayMode}
                                onOpenActions={() => {
                                  setSelectedEmployeeForActions(employee);
                                  setShowEmployeeActionsModal(true);
                                }}
                                style={provided.draggableProps.style}
                                {...provided.draggableProps}
                              />
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            </DragDropContext>

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
                          "sticky left-0 z-20 border-r-2 border-gray-300 px-4 py-3 shadow-sm w-[120px] flex flex-col justify-center bg-white",
                          dayInfo.isWeekend && "bg-orange-50/30",
                          dayInfo.isToday && "bg-gradient-to-r from-blue-100 to-blue-50 border-l-4 border-l-blue-500"
                        )}>
                          <div className={cn(
                            "font-bold text-xs uppercase tracking-wide",
                            dayInfo.isToday ? "text-blue-900" : "text-gray-600"
                          )}>
                            {dayInfo.dayName}
                          </div>
                          <div className={cn(
                            "text-2xl font-bold",
                            dayInfo.isToday ? "text-blue-700" : "text-gray-900"
                          )}>
                            {dayInfo.day}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleHoliday(dateStr);
                            }}
                            className={cn(
                              "mt-1 text-[9px] px-1.5 py-0.5 rounded-full font-semibold transition-all",
                              isHolidayDate(dateStr)
                                ? "bg-purple-600 text-white hover:bg-purple-700"
                                : "bg-gray-200 text-gray-600 hover:bg-purple-100 hover:text-purple-700"
                            )}
                            title={isHolidayDate(dateStr) ? "Retirer jour férié" : "Marquer jour férié"}
                          >
                            {isHolidayDate(dateStr) ? "🎉 Férié" : "+ Férié"}
                          </button>
                        </div>
                        <div className="flex flex-1">
                          {employees.map(employee => {
                            const employeeShifts = getShiftsForEmployeeAndDate(employee.id, dateStr);
                            const employeeNonShifts = getNonShiftsForEmployeeAndDate(employee.id, dateStr);
                            const totalEvents = employeeShifts.length + employeeNonShifts.length;
                            
                            // Check if date is in CP period
                            const employeeCPPeriods = paidLeavePeriods.filter(p => p.employee_id === employee.id);
                            const cpPeriod = isDateInCPPeriod(dateStr, employeeCPPeriods);
                            const isCPDay = !!cpPeriod;
                            const isLastCPDay = cpPeriod && dateStr === cpPeriod.end_cp;

                            return (
                              <div
                                key={employee.id}
                                onClick={() => handleCellClick(employee.id, dateStr, dayInfo)}
                                className={cn(
                                  "border-r border-gray-200 px-2 py-2 cursor-pointer hover:bg-orange-50 transition-all group relative min-w-[140px] w-[140px] sm:w-[180px] flex",
                                  dayInfo.isWeekend && "bg-orange-50/20",
                                  isCPDay && "bg-green-100/40"
                                )}
                              >
                                <div className="space-y-1.5 w-full flex flex-col relative" style={{ minHeight: `${Math.max(60, maxEventsInRow * 52)}px` }}>
                                  {/* CP Badge */}
                                  {isLastCPDay && cpPeriod && (
                                    <div 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedEmployeeForCP(employee);
                                        setSelectedCPPeriod(cpPeriod);
                                        setShowAddPaidLeaveModal(true);
                                      }}
                                      className="absolute -top-1 -right-1 z-10 bg-green-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-md cursor-pointer hover:bg-green-700 transition-colors"
                                      title="Cliquer pour modifier"
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
                                            handleCellClick(employee.id, dateStr, dayInfo);
                                          }}
                                          onDelete={(ns) => {
                                            if (window.confirm('Supprimer cet événement ?')) {
                                              base44.entities.NonShiftEvent.delete(ns.id).then(() => {
                                                queryClient.invalidateQueries({ queryKey: ['nonShiftEvents'] });
                                                toast.success('Événement supprimé');
                                              });
                                            }
                                          }}
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
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleCellClick(employee.id, dateStr, dayInfo);
                                          }}
                                          onDelete={handleDeleteShift}
                                          hasRestWarning={warnings.hasRestWarning}
                                          hasOvertimeWarning={warnings.hasOvertimeWarning}
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
                      
                      {/* Week summary row */}
                      {(dayInfo.isLastDayOfWeek || index === daysArray.length - 1) && (
                        <div className="bg-gradient-to-r from-gray-200 to-gray-100 border-b-2 border-gray-400 flex">
                          <div className="sticky left-0 z-20 bg-gradient-to-r from-gray-200 to-gray-100 border-r-2 border-gray-400 px-2 py-3 shadow-sm w-[120px]">
                            <div className="text-[10px] font-bold text-gray-700 uppercase tracking-wide mb-1">
                              📊 Récap. semaine
                            </div>
                            {(() => {
                              const weekStart = getWeekStart(dayInfo.date);
                              const weekAbove = getWeekAbove(weekStart);
                              const hasEventsAbove = hasWeekEvents(weekAbove);
                              
                              if (hasEventsAbove && weekAbove.getMonth() >= new Date(currentYear, currentMonth, 1).getMonth()) {
                                return (
                                  <button
                                    onClick={() => handleCopyWeekFromAbove(weekStart)}
                                    className="text-[9px] px-1.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center gap-1 w-full justify-center font-semibold shadow-sm transition-colors"
                                    title="Copier la semaine du dessus"
                                  >
                                    <ArrowDown className="w-3 h-3" />
                                    Copier ↑
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
                              
                              return (
                                <div key={employee.id} className="border-r border-gray-200 min-w-[140px] w-[140px] sm:w-[180px]">
                                  <WeeklySummary
                                    employee={employee}
                                    shifts={shifts}
                                    weekStart={weekStart}
                                    onDeleteWeek={handleDeleteWeek}
                                    onCopyFromAbove={hasEmployeeEventsAbove && weekAbove.getMonth() >= new Date(currentYear, currentMonth, 1).getMonth() 
                                      ? () => handleCopyEmployeeWeekFromAbove(employee.id, weekStart)
                                      : null
                                    }
                                    nonShiftEvents={nonShiftEvents}
                                    nonShiftTypes={nonShiftTypes}
                                    monthStart={new Date(currentYear, currentMonth, 1)}
                                    monthEnd={new Date(currentYear, currentMonth + 1, 0)}
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
                    <div className="sticky left-0 z-20 bg-gradient-to-r from-blue-100 to-blue-50 border-r-2 border-blue-300 px-2 py-3 shadow-sm w-[120px]">
                      <div className="text-[11px] font-bold text-blue-900 uppercase tracking-wide text-center">
                        📊 Récap mensuel
                      </div>
                    </div>
                    <div className="flex flex-1">
                      {employees.map(employee => (
                        <div key={employee.id} className="border-r border-blue-200 min-w-[140px] w-[140px] sm:w-[180px]">
                          <MonthlySummary
                            employee={employee}
                            shifts={shifts}
                            nonShiftEvents={nonShiftEvents}
                            nonShiftTypes={nonShiftTypes}
                            monthStart={new Date(currentYear, currentMonth, 1)}
                            monthEnd={new Date(currentYear, currentMonth + 1, 0)}
                            holidayDates={holidayDates}
                            />
                            </div>
                            ))}
                            </div>
                            </div>
                            </>
                            )}
                            </div>
                            </div>
                            </div>
      </div>

      {/* Shift Modal */}
      <ShiftFormModal
        open={showShiftModal}
        onOpenChange={(open) => {
          setShowShiftModal(open);
          if (!open) {
            setSelectedCell(null);
          }
        }}
        selectedCell={selectedCell}
        existingShifts={selectedCell ? getShiftsForEmployeeAndDate(selectedCell.employeeId, selectedCell.date) : []}
        existingNonShifts={selectedCell ? getNonShiftsForEmployeeAndDate(selectedCell.employeeId, selectedCell.date) : []}
        allShifts={shifts}
        onSave={(id, data) => saveShiftMutation.mutate({ id, data })}
        currentUser={currentUser}
      />

      {/* Planning Settings Modal */}
      <PlanningSettingsModal
        open={showPlanningSettings}
        onOpenChange={setShowPlanningSettings}
        displayMode={displayMode}
        setDisplayMode={setDisplayMode}
      />

      {/* Apply Template Modal */}
      <ApplyTemplateModal
        open={showApplyTemplateModal}
        onOpenChange={setShowApplyTemplateModal}
        employeeId={selectedEmployeeForTemplate?.id}
        employeeName={selectedEmployeeForTemplate ? `${selectedEmployeeForTemplate.first_name} ${selectedEmployeeForTemplate.last_name}` : ''}
      />

      {/* Apply All Templates Modal */}
      <ApplyAllTemplatesModal
        open={showApplyAllTemplatesModal}
        onOpenChange={setShowApplyAllTemplatesModal}
        monthStart={new Date(currentYear, currentMonth, 1)}
        monthEnd={new Date(currentYear, currentMonth + 1, 0)}
      />

      {/* Add Paid Leave Modal */}
      <AddPaidLeaveModal
        open={showAddPaidLeaveModal}
        onOpenChange={setShowAddPaidLeaveModal}
        employee={selectedEmployeeForCP}
        existingPeriod={selectedCPPeriod}
      />

      {/* Export Compta Modal */}
      <ExportComptaModal
        open={showExportComptaModal}
        onOpenChange={setShowExportComptaModal}
        monthStart={new Date(currentYear, currentMonth, 1)}
        monthEnd={new Date(currentYear, currentMonth + 1, 0)}
        holidayDates={holidayDates}
      />

      {/* Employee Actions Modal */}
      <EmployeeActionsModal
        open={showEmployeeActionsModal}
        onOpenChange={setShowEmployeeActionsModal}
        employee={selectedEmployeeForActions}
        currentMonth={currentMonth}
        currentYear={currentYear}
        onAddCP={() => {
          setSelectedEmployeeForCP(selectedEmployeeForActions);
          setSelectedCPPeriod(null);
          setShowEmployeeActionsModal(false);
          setShowAddPaidLeaveModal(true);
        }}
        onApplyTemplate={() => {
          setSelectedEmployeeForTemplate(selectedEmployeeForActions);
          setShowEmployeeActionsModal(false);
          setShowApplyTemplateModal(true);
        }}
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
    </div>
  );
}