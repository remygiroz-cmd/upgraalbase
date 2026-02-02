import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Calendar, ChevronLeft, ChevronRight, Plus, X, Edit2, Trash2 } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export default function Planning() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [selectedCell, setSelectedCell] = useState(null);
  const queryClient = useQueryClient();

  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  // Fetch employees
  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.filter({ is_active: true })
  });

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
    <div>
      <PageHeader
        icon={Calendar}
        title="Planning mensuel"
        subtitle="Gestion des horaires de travail"
      />

      {/* Month Navigation */}
      <div className="bg-white border border-gray-300 rounded-lg p-4 mb-6 flex items-center justify-between">
        <Button onClick={previousMonth} variant="outline" size="sm">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <h2 className="text-xl font-bold text-gray-900">
          {MONTHS[currentMonth]} {currentYear}
        </h2>
        <Button onClick={nextMonth} variant="outline" size="sm">
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white border border-gray-300 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b-2 border-gray-300">
                <th className="sticky left-0 z-10 bg-gray-100 border-r border-gray-300 px-3 py-3 text-left text-sm font-semibold text-gray-900 min-w-[120px]">
                  Jour
                </th>
                {employees.map(employee => (
                  <th
                    key={employee.id}
                    className="border-r border-gray-200 px-2 py-2 text-center text-sm font-semibold text-gray-900 min-w-[160px]"
                  >
                    <div>{employee.first_name} {employee.last_name}</div>
                    {employee.position && (
                      <div className="text-xs font-normal text-gray-500">{employee.position}</div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {daysArray.length === 0 ? (
                <tr>
                  <td colSpan={employees.length + 1} className="px-4 py-12 text-center text-gray-500">
                    Aucun jour à afficher
                  </td>
                </tr>
              ) : (
                <>
                  {daysArray.map((dayInfo, index) => (
                    <React.Fragment key={dayInfo.day}>
                      <tr className={cn(
                        "border-b border-gray-200",
                        dayInfo.isWeekend && "bg-gray-50",
                        dayInfo.isToday && "bg-blue-50"
                      )}>
                        <td className={cn(
                          "sticky left-0 z-10 border-r border-gray-300 px-3 py-2 text-sm font-medium",
                          dayInfo.isWeekend && "bg-gray-50",
                          dayInfo.isToday && "bg-blue-100 text-blue-900"
                        )}>
                          <div className="font-bold">{dayInfo.dayName}</div>
                          <div className="text-lg">{dayInfo.day}</div>
                        </td>
                        {employees.map(employee => {
                          const dateStr = dayInfo.date.toISOString().split('T')[0];
                          const employeeShifts = getShiftsForEmployeeAndDate(employee.id, dateStr);
                          
                          return (
                            <td
                              key={employee.id}
                              onClick={() => handleCellClick(employee.id, dateStr, dayInfo)}
                              className={cn(
                                "border-r border-gray-200 px-2 py-2 cursor-pointer hover:bg-blue-50 transition-colors align-top",
                                dayInfo.isWeekend && "bg-gray-50"
                              )}
                            >
                              <div className="space-y-1">
                                {employeeShifts.slice(0, 3).map((shift, idx) => (
                                  <div
                                    key={shift.id}
                                    className={cn(
                                      "text-xs px-2 py-1.5 rounded border",
                                      shift.status === 'confirmed' && "bg-green-50 border-green-300 text-green-900",
                                      shift.status === 'planned' && "bg-blue-50 border-blue-300 text-blue-900",
                                      shift.status === 'absent' && "bg-red-50 border-red-300 text-red-900",
                                      shift.status === 'leave' && "bg-orange-50 border-orange-300 text-orange-900"
                                    )}
                                  >
                                    <div className="font-semibold text-[10px] uppercase tracking-wide mb-0.5">
                                      {shift.position || 'Poste'}
                                    </div>
                                    <div className="font-medium">
                                      {shift.start_time} - {shift.end_time}
                                    </div>
                                  </div>
                                ))}
                                {employeeShifts.length === 0 && (
                                  <div className="text-xs text-gray-400 text-center py-3">
                                    <Plus className="w-4 h-4 mx-auto opacity-50" />
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                      
                      {/* Week summary row - shown after last day of week */}
                      {dayInfo.isLastDayOfWeek && index < daysArray.length - 1 && (
                        <tr className="bg-gray-100 border-b-2 border-gray-300">
                          <td className="sticky left-0 z-10 bg-gray-100 border-r border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600 italic">
                            Récap. semaine
                          </td>
                          {employees.map(employee => (
                            <td key={employee.id} className="border-r border-gray-200 px-2 py-2 text-xs text-gray-500 text-center">
                              À venir
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
        employees={employees}
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Gestion des shifts
          </DialogTitle>
          {selectedCell && (
            <p className="text-sm text-gray-500">
              {selectedCell.employeeName} - {selectedCell.dayInfo?.dayName} {selectedCell.dayInfo?.day} {MONTHS[new Date(selectedCell.date).getMonth()]}
            </p>
          )}
        </DialogHeader>

        {/* Existing Shifts */}
        {existingShifts.length > 0 && (
          <div className="space-y-2 mb-4">
            <h3 className="text-sm font-semibold text-gray-700">Shifts existants ({existingShifts.length}/3)</h3>
            {existingShifts.map((shift) => (
              <div
                key={shift.id}
                onClick={() => setSelectedShiftId(shift.id)}
                className={cn(
                  "p-3 rounded-lg border-2 cursor-pointer transition-all",
                  selectedShiftId === shift.id 
                    ? "border-blue-500 bg-blue-50" 
                    : "border-gray-200 hover:border-gray-300"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{shift.position || 'Sans poste'}</div>
                    <div className="text-sm text-gray-600">{shift.start_time} - {shift.end_time}</div>
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
                    className="p-2 text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {existingShifts.length < 3 && !selectedShiftId && (
          <Button
            type="button"
            onClick={handleNewShift}
            className="w-full bg-green-600 hover:bg-green-700 mb-4"
          >
            <Plus className="w-4 h-4 mr-2" />
            Ajouter un nouveau shift
          </Button>
        )}

        {(selectedShiftId || existingShifts.length === 0) && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Poste</Label>
              <Input
                value={formData.position}
                onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                placeholder="Ex: Service, Plonge, Cuisine..."
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Heure début</Label>
                <Input
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Heure fin</Label>
                <Input
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  required
                />
              </div>
            </div>

            <div>
              <Label>Pause (minutes)</Label>
              <Input
                type="number"
                value={formData.break_minutes}
                onChange={(e) => setFormData({ ...formData, break_minutes: parseInt(e.target.value) || 0 })}
                min="0"
              />
            </div>

            <div>
              <Label>Statut</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planned">Planifié</SelectItem>
                  <SelectItem value="confirmed">Confirmé</SelectItem>
                  <SelectItem value="absent">Absent</SelectItem>
                  <SelectItem value="leave">Congé</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Notes</Label>
              <Input
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Notes optionnelles..."
              />
            </div>

            <div className="flex gap-2 pt-4">
              {selectedShiftId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleNewShift}
                  className="flex-1"
                >
                  Annuler
                </Button>
              )}
              <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700">
                {selectedShiftId ? 'Modifier' : 'Ajouter'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}