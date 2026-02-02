import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Calendar, ChevronLeft, ChevronRight, Plus, Filter, GripVertical, Settings, MoreVertical, Copy } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import ShiftCard from '@/components/planning/ShiftCard';
import ShiftFormModal from '@/components/planning/ShiftFormModal';
import WeeklySummary from '@/components/planning/WeeklySummary';
import PositionsManager from '@/components/planning/PositionsManager';
import ApplyTemplateModal from '@/components/planning/ApplyTemplateModal';
import NonShiftTypesManager from '@/components/planning/NonShiftTypesManager';
import NonShiftCard from '@/components/planning/NonShiftCard';
import { calculateShiftDuration, checkMinimumRest } from '@/components/planning/LegalChecks';

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export default function Planning() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showPositionsManager, setShowPositionsManager] = useState(false);
  const [showNonShiftTypesManager, setShowNonShiftTypesManager] = useState(false);
  const [showApplyTemplateModal, setShowApplyTemplateModal] = useState(false);
  const [selectedEmployeeForTemplate, setSelectedEmployeeForTemplate] = useState(null);
  const [selectedCell, setSelectedCell] = useState(null);
  const [filterType, setFilterType] = useState('global');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');
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
      const firstDay = new Date(currentYear, currentMonth, 1).toISOString().split('T')[0];
      const lastDay = new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0];
      
      const allShifts = await base44.entities.Shift.list();
      return allShifts.filter(s => s.date >= firstDay && s.date <= lastDay);
    }
  });

  // Fetch non-shift events for current month
  const { data: nonShiftEvents = [] } = useQuery({
    queryKey: ['nonShiftEvents', currentYear, currentMonth],
    queryFn: async () => {
      const firstDay = new Date(currentYear, currentMonth, 1).toISOString().split('T')[0];
      const lastDay = new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0];
      
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

  // Handle cell click
  const handleCellClick = (employeeId, dateStr, dayInfo) => {
    const employee = employees.find(e => e.id === employeeId);
    const date = new Date(dateStr);
    setSelectedCell({ 
      employeeId, 
      employeeName: employee ? `${employee.first_name} ${employee.last_name}` : '',
      date: dateStr,
      dayInfo,
      monthName: MONTHS[date.getMonth()],
      year: date.getFullYear()
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
    
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const weekEndStr = weekEnd.toISOString().split('T')[0];

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

  // Check for legal warnings
  const getShiftWarnings = (shift, employeeShifts) => {
    const restCheck = checkMinimumRest(employeeShifts, shift);
    return {
      hasRestWarning: !restCheck.valid,
      hasOvertimeWarning: false // calculated in summary
    };
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          icon={Calendar}
          title="Planning mensuel"
          subtitle="Gestion des horaires de travail"
        />
        <div className="flex gap-2">
          <Button
            onClick={() => setShowNonShiftTypesManager(true)}
            variant="outline"
            className="border-2 border-gray-300 hover:border-blue-500 hover:bg-blue-50"
          >
            <Calendar className="w-4 h-4 mr-2" />
            Statuts
          </Button>
          <Button
            onClick={() => setShowPositionsManager(true)}
            variant="outline"
            size="icon"
            className="border-2 border-gray-300 hover:border-orange-500 hover:bg-orange-50"
          >
            <Settings className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Month Navigation & Filters */}
      <div className="bg-gradient-to-br from-white to-gray-50 border-2 border-gray-200 rounded-xl shadow-lg p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
          <Button 
            onClick={previousMonth} 
            variant="outline" 
            className="w-full sm:w-auto border-2 border-gray-300 hover:border-orange-500 hover:bg-orange-50 transition-all"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="ml-2 hidden sm:inline">Précédent</span>
          </Button>
          <div className="text-center">
            <h2 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-orange-600 to-orange-500 bg-clip-text text-transparent">
              {MONTHS[currentMonth]} {currentYear}
            </h2>
          </div>
          <Button 
            onClick={nextMonth} 
            variant="outline"
            className="w-full sm:w-auto border-2 border-gray-300 hover:border-orange-500 hover:bg-orange-50 transition-all"
          >
            <span className="mr-2 hidden sm:inline">Suivant</span>
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Label className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <Filter className="w-3 h-3" />
              Type de vue
            </Label>
            <Select value={filterType} onValueChange={(value) => {
              setFilterType(value);
              setSelectedTeam('');
              setSelectedEmployee('');
            }}>
              <SelectTrigger className="h-11 border-2 border-gray-300 hover:border-orange-400 transition-colors">
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
              <Label className="text-xs font-semibold text-gray-700 mb-2">Sélectionner l'équipe</Label>
              <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                <SelectTrigger className="h-11 border-2 border-gray-300 hover:border-orange-400 transition-colors">
                  <SelectValue placeholder="Choisir une équipe..." />
                </SelectTrigger>
                <SelectContent>
                  {teams.map(team => (
                    <SelectItem key={team.id} value={team.id}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
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
              <Label className="text-xs font-semibold text-gray-700 mb-2">Sélectionner l'employé</Label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger className="h-11 border-2 border-gray-300 hover:border-orange-400 transition-colors">
                  <SelectValue placeholder="Choisir un employé..." />
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
                          {team && <span className="text-xs text-gray-500">({team.name})</span>}
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
        className="bg-gray-100 border-2 border-gray-200 rounded-t-xl overflow-x-auto sticky top-0 z-30 mb-2"
        style={{ height: '16px' }}
      >
        <div style={{ height: '1px' }}></div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white border-2 border-gray-200 rounded-xl shadow-xl overflow-hidden">
        <div ref={tableContainerRef} className="overflow-x-auto">
          <div className="inline-block min-w-full">
            {/* Header */}
            <DragDropContext onDragEnd={handleTeamDragEnd}>
              <div className="bg-gradient-to-r from-gray-100 to-gray-50 flex border-b-2 border-gray-300">
                <div className="sticky left-0 z-20 bg-gradient-to-r from-gray-100 to-gray-50 border-r-2 border-gray-300 px-4 py-4 text-left text-sm font-bold text-gray-900 w-[120px] shadow-md flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-orange-600" />
                  Jour
                </div>
                <Droppable droppableId="employees" direction="horizontal">
                  {(provided) => (
                    <div 
                      ref={provided.innerRef} 
                      {...provided.droppableProps}
                      className="flex"
                    >
                      {employees.map((employee, index) => {
                        const team = allTeams.find(t => t.id === employee.team_id);
                        return (
                          <Draggable key={employee.id} draggableId={employee.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={cn(
                                  "border-r border-gray-200 px-3 py-3 text-center w-[140px] sm:w-[180px] relative",
                                  snapshot.isDragging && "bg-orange-100 shadow-2xl opacity-90"
                                )}
                                style={provided.draggableProps.style}
                                >
                                <div 
                                 {...provided.dragHandleProps}
                                 className="absolute left-1 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing text-gray-400 hover:text-orange-600 transition-colors"
                                >
                                 <GripVertical className="w-5 h-5" />
                                </div>
                                <button
                                 onClick={(e) => {
                                   e.stopPropagation();
                                   setSelectedEmployeeForTemplate(employee);
                                   setShowApplyTemplateModal(true);
                                 }}
                                 className="absolute right-1 top-1 p-1 rounded hover:bg-gray-200 transition-colors text-gray-500 hover:text-orange-600"
                                 title="Appliquer planning type"
                                >
                                 <Copy className="w-4 h-4" />
                                </button>
                                <div className="font-bold text-sm text-gray-900 truncate px-6">
                                 {employee.first_name} {employee.last_name}
                                </div>
                                {team && (
                                 <div 
                                   className="text-[10px] font-semibold text-white inline-block px-3 py-1 rounded-full mt-2 shadow-sm"
                                   style={{ backgroundColor: team.color || '#3b82f6' }}
                                 >
                                   {team.name}
                                 </div>
                                )}
                                </div>
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
                  {daysArray.map((dayInfo, index) => (
                    <React.Fragment key={dayInfo.day}>
                      <div className={cn(
                        "flex border-b border-gray-200 hover:bg-gray-50/50 transition-colors",
                        dayInfo.isWeekend && "bg-orange-50/30",
                        dayInfo.isToday && "bg-blue-50/80"
                      )}>
                        <div className={cn(
                          "sticky left-0 z-10 border-r-2 border-gray-300 px-4 py-3 shadow-sm w-[120px]",
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
                        </div>
                        <div className="flex flex-1">
                          {employees.map(employee => {
                            const dateStr = dayInfo.date.toISOString().split('T')[0];
                            const employeeShifts = getShiftsForEmployeeAndDate(employee.id, dateStr);
                            const employeeNonShifts = getNonShiftsForEmployeeAndDate(employee.id, dateStr);

                            return (
                              <div
                                key={employee.id}
                                onClick={() => handleCellClick(employee.id, dateStr, dayInfo)}
                                className={cn(
                                  "border-r border-gray-200 px-2 py-2 cursor-pointer hover:bg-orange-50 transition-all group relative w-[140px] sm:w-[180px]",
                                  dayInfo.isWeekend && "bg-orange-50/20"
                                )}
                              >
                                <div className="space-y-1.5 min-h-[60px]">
                                  {employeeNonShifts.map((nonShift) => {
                                    const type = nonShiftTypes.find(t => t.id === nonShift.non_shift_type_id);
                                    return (
                                      <NonShiftCard
                                        key={nonShift.id}
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
                                    );
                                  })}
                                  {employeeShifts.map((shift) => {
                                    const warnings = getShiftWarnings(shift, employeeShifts);
                                    return (
                                      <ShiftCard
                                        key={shift.id}
                                        shift={shift}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleCellClick(employee.id, dateStr, dayInfo);
                                        }}
                                        onDelete={handleDeleteShift}
                                        hasRestWarning={warnings.hasRestWarning}
                                        hasOvertimeWarning={warnings.hasOvertimeWarning}
                                      />
                                    );
                                  })}
                                  {employeeShifts.length === 0 && employeeNonShifts.length === 0 && (
                                    <div className="flex items-center justify-center h-full min-h-[60px] text-gray-300 group-hover:text-orange-400 transition-colors">
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
                          <div className="sticky left-0 z-10 bg-gradient-to-r from-gray-200 to-gray-100 border-r-2 border-gray-400 px-4 py-3 shadow-sm w-[120px]">
                            <div className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                              📊 Récap. semaine
                            </div>
                          </div>
                          <div className="flex flex-1">
                            {employees.map(employee => {
                              const weekStart = getWeekStart(dayInfo.date);
                              return (
                                <div key={employee.id} className="border-r border-gray-200 w-[140px] sm:w-[180px]">
                                  <WeeklySummary
                                    employee={employee}
                                    shifts={shifts}
                                    weekStart={weekStart}
                                    onDeleteWeek={handleDeleteWeek}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </React.Fragment>
                  ))}
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

      {/* Positions Manager */}
      <PositionsManager
        open={showPositionsManager}
        onOpenChange={setShowPositionsManager}
      />

      {/* Non-Shift Types Manager */}
      <NonShiftTypesManager
        open={showNonShiftTypesManager}
        onOpenChange={setShowNonShiftTypesManager}
      />

      {/* Apply Template Modal */}
      <ApplyTemplateModal
        open={showApplyTemplateModal}
        onOpenChange={setShowApplyTemplateModal}
        employeeId={selectedEmployeeForTemplate?.id}
        employeeName={selectedEmployeeForTemplate ? `${selectedEmployeeForTemplate.first_name} ${selectedEmployeeForTemplate.last_name}` : ''}
      />
    </div>
  );
}