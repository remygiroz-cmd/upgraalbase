import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Calendar, ChevronLeft, ChevronRight, Plus, X, Edit2, Trash2, Filter, GripVertical } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export default function Planning() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [selectedCell, setSelectedCell] = useState(null);
  const [filterType, setFilterType] = useState('global'); // global, team, employee
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const queryClient = useQueryClient();

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

  const createShiftMutation = useMutation({
    mutationFn: (shiftData) => base44.entities.Shift.create(shiftData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      toast.success('Shift créé');
      setShowShiftModal(false);
      setSelectedCell(null);
    }
  });

  const updateShiftMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Shift.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      toast.success('Shift modifié');
      setShowShiftModal(false);
      setSelectedCell(null);
    }
  });

  const deleteShiftMutation = useMutation({
    mutationFn: (id) => base44.entities.Shift.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      toast.success('Shift supprimé');
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

  // Get shifts for employee and date
  const getShiftsForEmployeeAndDate = (employeeId, dateStr) => {
    return shifts.filter(s => s.employee_id === employeeId && s.date === dateStr);
  };

  // Handle cell click
  const handleCellClick = (employeeId, dateStr, dayInfo) => {
    const employee = employees.find(e => e.id === employeeId);
    setSelectedCell({ 
      employeeId, 
      employeeName: employee ? `${employee.first_name} ${employee.last_name}` : '',
      date: dateStr,
      dayInfo 
    });
    setShowShiftModal(true);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        icon={Calendar}
        title="Planning mensuel"
        subtitle="Gestion des horaires de travail"
      />

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
        className="bg-gray-100 border-2 border-gray-200 border-t-0 rounded-b-xl overflow-x-auto sticky top-0 z-30 mb-4"
        style={{ height: '20px' }}
      >
        <div style={{ height: '1px' }}></div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white border-2 border-gray-200 rounded-xl shadow-xl overflow-hidden">
        <div ref={tableContainerRef} className="overflow-x-auto">
          <DragDropContext onDragEnd={handleTeamDragEnd}>
            <table className="w-full border-collapse">
              <Droppable droppableId="employees" direction="horizontal">
                {(provided) => (
                  <thead ref={provided.innerRef} {...provided.droppableProps}>
                    <tr className="bg-gradient-to-r from-gray-100 to-gray-50">
                      <th className="sticky left-0 z-20 bg-gradient-to-r from-gray-100 to-gray-50 border-r-2 border-gray-300 px-4 py-4 text-left text-sm font-bold text-gray-900 min-w-[100px] shadow-md">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-orange-600" />
                          Jour
                        </div>
                      </th>
                      {employees.map((employee, index) => {
                        const team = allTeams.find(t => t.id === employee.team_id);
                        return (
                          <Draggable key={employee.id} draggableId={employee.id} index={index}>
                            {(provided, snapshot) => (
                              <th
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={cn(
                                  "border-r border-gray-200 px-3 py-3 text-center min-w-[140px] sm:min-w-[180px] relative",
                                  snapshot.isDragging && "bg-orange-100 shadow-2xl z-50"
                                )}
                              >
                                <div 
                                  {...provided.dragHandleProps}
                                  className="absolute left-1 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing text-gray-400 hover:text-orange-600"
                                >
                                  <GripVertical className="w-4 h-4" />
                                </div>
                                <div className="font-bold text-sm text-gray-900 truncate">
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
                              </th>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </tr>
                  </thead>
                )}
              </Droppable>
            <tbody>
              {daysArray.length === 0 ? (
                <tr>
                  <td colSpan={employees.length + 1} className="px-4 py-16 text-center text-gray-500">
                    <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p className="text-lg">Aucun jour à afficher</p>
                  </td>
                </tr>
              ) : (
                <>
                  {daysArray.map((dayInfo, index) => (
                    <React.Fragment key={dayInfo.day}>
                      <tr className={cn(
                        "border-b border-gray-200 hover:bg-gray-50/50 transition-colors",
                        dayInfo.isWeekend && "bg-orange-50/30",
                        dayInfo.isToday && "bg-blue-50/80"
                      )}>
                        <td className={cn(
                          "sticky left-0 z-10 border-r-2 border-gray-300 px-4 py-3 shadow-sm",
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
                        </td>
                        {employees.map(employee => {
                          const dateStr = dayInfo.date.toISOString().split('T')[0];
                          const employeeShifts = getShiftsForEmployeeAndDate(employee.id, dateStr);
                          
                          return (
                            <td
                              key={employee.id}
                              onClick={() => handleCellClick(employee.id, dateStr, dayInfo)}
                              className={cn(
                                "border-r border-gray-200 px-2 py-2 cursor-pointer hover:bg-orange-50 transition-all align-top group relative",
                                dayInfo.isWeekend && "bg-orange-50/20"
                              )}
                            >
                              <div className="space-y-1.5 min-h-[60px]">
                                {employeeShifts.slice(0, 3).map((shift) => (
                                  <div
                                    key={shift.id}
                                    className={cn(
                                      "text-xs px-3 py-2 rounded-lg border-2 shadow-sm hover:shadow-md transition-all",
                                      shift.status === 'confirmed' && "bg-gradient-to-r from-green-50 to-green-100 border-green-400 text-green-900",
                                      shift.status === 'planned' && "bg-gradient-to-r from-blue-50 to-blue-100 border-blue-400 text-blue-900",
                                      shift.status === 'absent' && "bg-gradient-to-r from-red-50 to-red-100 border-red-400 text-red-900",
                                      shift.status === 'leave' && "bg-gradient-to-r from-orange-50 to-orange-100 border-orange-400 text-orange-900"
                                    )}
                                  >
                                    <div className="font-bold text-[10px] uppercase tracking-wider mb-1 opacity-80">
                                      {shift.position || 'Poste'}
                                    </div>
                                    <div className="font-bold text-xs">
                                      {shift.start_time} - {shift.end_time}
                                    </div>
                                  </div>
                                ))}
                                {employeeShifts.length === 0 && (
                                  <div className="flex items-center justify-center h-full min-h-[60px] text-gray-300 group-hover:text-orange-400 transition-colors">
                                    <Plus className="w-6 h-6" />
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                      
                      {/* Week summary row */}
                      {dayInfo.isLastDayOfWeek && index < daysArray.length - 1 && (
                        <tr className="bg-gradient-to-r from-gray-200 to-gray-100 border-b-2 border-gray-400">
                          <td className="sticky left-0 z-10 bg-gradient-to-r from-gray-200 to-gray-100 border-r-2 border-gray-400 px-4 py-2 shadow-sm">
                            <div className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                              📊 Récap. semaine
                            </div>
                          </td>
                          {employees.map(employee => (
                            <td key={employee.id} className="border-r border-gray-300 px-2 py-2 text-xs text-gray-600 text-center italic">
                              À calculer
                            </td>
                          ))}
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </>
              )}
            </tbody>
          </table>
          </DragDropContext>
        </div>
      </div>

      {/* Shift Modal */}
      <ShiftModal
        open={showShiftModal}
        onOpenChange={(open) => {
          setShowShiftModal(open);
          if (!open) {
            setSelectedCell(null);
          }
        }}
        selectedCell={selectedCell}
        employees={sortedEmployees}
        shifts={shifts}
        onSave={(data) => createShiftMutation.mutate(data)}
        onUpdate={(id, data) => updateShiftMutation.mutate({ id, data })}
        onDelete={(id) => deleteShiftMutation.mutate(id)}
      />
    </div>
  );
}

// Shift Modal Component
function ShiftModal({ open, onOpenChange, selectedCell, employees, shifts, onSave, onUpdate, onDelete }) {
  const [selectedShiftId, setSelectedShiftId] = useState(null);
  const [formData, setFormData] = useState({
    start_time: '09:00',
    end_time: '17:00',
    break_minutes: 0,
    position: '',
    status: 'planned',
    notes: ''
  });

  const existingShifts = selectedCell 
    ? shifts.filter(s => s.employee_id === selectedCell.employeeId && s.date === selectedCell.date)
    : [];

  React.useEffect(() => {
    if (selectedShiftId) {
      const shift = existingShifts.find(s => s.id === selectedShiftId);
      if (shift) {
        setFormData({
          start_time: shift.start_time,
          end_time: shift.end_time,
          break_minutes: shift.break_minutes || 0,
          position: shift.position || '',
          status: shift.status,
          notes: shift.notes || ''
        });
      }
    } else {
      setFormData({
        start_time: '09:00',
        end_time: '17:00',
        break_minutes: 0,
        position: '',
        status: 'planned',
        notes: ''
      });
    }
  }, [selectedShiftId, existingShifts]);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!selectedCell) return;

    const employee = employees.find(e => e.id === selectedCell.employeeId);
    
    const shiftData = {
      ...formData,
      date: selectedCell.date,
      employee_id: selectedCell.employeeId,
      employee_name: employee ? `${employee.first_name} ${employee.last_name}` : '',
      team: employee?.team || ''
    };

    if (selectedShiftId) {
      onUpdate(selectedShiftId, shiftData);
    } else {
      onSave(shiftData);
    }

    setSelectedShiftId(null);
  };

  const handleNewShift = () => {
    setSelectedShiftId(null);
    setFormData({
      start_time: '09:00',
      end_time: '17:00',
      break_minutes: 0,
      position: '',
      status: 'planned',
      notes: ''
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold bg-gradient-to-r from-orange-600 to-orange-500 bg-clip-text text-transparent">
            Gestion des shifts
          </DialogTitle>
          {selectedCell && (
            <div className="bg-gradient-to-r from-orange-50 to-orange-100 rounded-lg px-4 py-2 mt-2">
              <p className="text-sm font-semibold text-gray-900">
                {selectedCell.employeeName}
              </p>
              <p className="text-xs text-gray-600">
                {selectedCell.dayInfo?.dayName} {selectedCell.dayInfo?.day} {MONTHS[new Date(selectedCell.date).getMonth()]} {new Date(selectedCell.date).getFullYear()}
              </p>
            </div>
          )}
        </DialogHeader>

        {/* Existing Shifts */}
        {existingShifts.length > 0 && (
          <div className="space-y-3 my-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">Shifts existants</h3>
              <span className="text-xs font-semibold px-2 py-1 bg-orange-100 text-orange-700 rounded-full">
                {existingShifts.length}/3
              </span>
            </div>
            <div className="space-y-2">
              {existingShifts.map((shift) => (
                <div
                  key={shift.id}
                  onClick={() => setSelectedShiftId(shift.id)}
                  className={cn(
                    "p-4 rounded-xl border-2 cursor-pointer transition-all hover:shadow-lg",
                    selectedShiftId === shift.id 
                      ? "border-orange-500 bg-orange-50 shadow-md" 
                      : "border-gray-200 hover:border-orange-300 bg-white"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-bold text-gray-900 mb-1">{shift.position || 'Sans poste'}</div>
                      <div className="flex items-center gap-3 text-sm text-gray-600">
                        <span className="font-semibold">{shift.start_time} - {shift.end_time}</span>
                        {shift.break_minutes > 0 && (
                          <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                            Pause: {shift.break_minutes}min
                          </span>
                        )}
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded font-semibold",
                          shift.status === 'confirmed' && "bg-green-100 text-green-700",
                          shift.status === 'planned' && "bg-blue-100 text-blue-700",
                          shift.status === 'absent' && "bg-red-100 text-red-700",
                          shift.status === 'leave' && "bg-orange-100 text-orange-700"
                        )}>
                          {shift.status === 'planned' && 'Planifié'}
                          {shift.status === 'confirmed' && 'Confirmé'}
                          {shift.status === 'absent' && 'Absent'}
                          {shift.status === 'leave' && 'Congé'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Supprimer ce shift ?')) {
                          onDelete(shift.id);
                          setSelectedShiftId(null);
                        }
                      }}
                      className="p-2.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {existingShifts.length < 3 && !selectedShiftId && (
          <Button
            type="button"
            onClick={handleNewShift}
            className="w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white font-semibold py-6 shadow-lg"
          >
            <Plus className="w-5 h-5 mr-2" />
            Ajouter un nouveau shift
          </Button>
        )}

        {(selectedShiftId || existingShifts.length === 0) && (
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-5 space-y-4 border-2 border-gray-200">
              <div>
                <Label className="text-sm font-semibold text-gray-700 mb-2">Poste</Label>
                <Input
                  value={formData.position}
                  onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                  placeholder="Ex: Service, Plonge, Cuisine..."
                  className="h-11 border-2 border-gray-300 focus:border-orange-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-semibold text-gray-700 mb-2">Heure début</Label>
                  <Input
                    type="time"
                    value={formData.start_time}
                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                    className="h-11 border-2 border-gray-300 focus:border-orange-500"
                    required
                  />
                </div>
                <div>
                  <Label className="text-sm font-semibold text-gray-700 mb-2">Heure fin</Label>
                  <Input
                    type="time"
                    value={formData.end_time}
                    onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                    className="h-11 border-2 border-gray-300 focus:border-orange-500"
                    required
                  />
                </div>
              </div>

              <div>
                <Label className="text-sm font-semibold text-gray-700 mb-2">Pause (minutes)</Label>
                <Input
                  type="number"
                  value={formData.break_minutes}
                  onChange={(e) => setFormData({ ...formData, break_minutes: parseInt(e.target.value) || 0 })}
                  className="h-11 border-2 border-gray-300 focus:border-orange-500"
                  min="0"
                  placeholder="0"
                />
              </div>

              <div>
                <Label className="text-sm font-semibold text-gray-700 mb-2">Statut</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger className="h-11 border-2 border-gray-300 focus:border-orange-500">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planned">📋 Planifié</SelectItem>
                    <SelectItem value="confirmed">✅ Confirmé</SelectItem>
                    <SelectItem value="absent">❌ Absent</SelectItem>
                    <SelectItem value="leave">🏖️ Congé</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-semibold text-gray-700 mb-2">Notes</Label>
                <Input
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Notes optionnelles..."
                  className="h-11 border-2 border-gray-300 focus:border-orange-500"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              {selectedShiftId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleNewShift}
                  className="flex-1 h-12 border-2 font-semibold"
                >
                  Annuler
                </Button>
              )}
              <Button 
                type="submit" 
                className="flex-1 h-12 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 text-white font-bold shadow-lg"
              >
                {selectedShiftId ? '✏️ Modifier' : '➕ Ajouter'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}