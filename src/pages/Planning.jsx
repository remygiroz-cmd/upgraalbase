import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Calendar, ChevronLeft, ChevronRight, Plus, X, Clock, Edit2, Trash2 } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export default function Planning() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [selectedCell, setSelectedCell] = useState(null);
  const [editingShift, setEditingShift] = useState(null);
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
      setEditingShift(null);
    }
  });

  const updateShiftMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Shift.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      toast.success('Shift modifié');
      setShowShiftModal(false);
      setSelectedCell(null);
      setEditingShift(null);
    }
  });

  const deleteShiftMutation = useMutation({
    mutationFn: (id) => base44.entities.Shift.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      toast.success('Shift supprimé');
      setShowShiftModal(false);
      setEditingShift(null);
    }
  });

  // Get days in month
  const getDaysInMonth = () => {
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
    const adjustedFirstDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1; // Adjust so Monday = 0
    
    return { daysInMonth, adjustedFirstDay };
  };

  const { daysInMonth, adjustedFirstDay } = getDaysInMonth();

  // Navigate months
  const previousMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  // Get shifts for employee and date
  const getShiftsForEmployeeAndDate = (employeeId, day) => {
    const date = new Date(currentYear, currentMonth, day).toISOString().split('T')[0];
    return shifts.filter(s => s.employee_id === employeeId && s.date === date);
  };

  // Handle cell click
  const handleCellClick = (employeeId, day) => {
    const employee = employees.find(e => e.id === employeeId);
    const date = new Date(currentYear, currentMonth, day).toISOString().split('T')[0];
    setSelectedCell({ employeeId, employeeName: employee?.first_name + ' ' + employee?.last_name, date, day });
    setShowShiftModal(true);
  };

  // Handle shift edit
  const handleShiftEdit = (shift, e) => {
    e.stopPropagation();
    const employee = employees.find(emp => emp.id === shift.employee_id);
    const day = new Date(shift.date).getDate();
    setSelectedCell({ 
      employeeId: shift.employee_id, 
      employeeName: employee?.first_name + ' ' + employee?.last_name, 
      date: shift.date,
      day 
    });
    setEditingShift(shift);
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
                <th className="sticky left-0 z-10 bg-gray-100 border-r border-gray-300 px-3 py-3 text-left text-sm font-semibold text-gray-900 min-w-[150px]">
                  Employé
                </th>
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                  const date = new Date(currentYear, currentMonth, day);
                  const dayOfWeek = date.getDay();
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                  const isToday = 
                    day === new Date().getDate() && 
                    currentMonth === new Date().getMonth() && 
                    currentYear === new Date().getFullYear();
                  
                  return (
                    <th
                      key={day}
                      className={cn(
                        "border-r border-gray-200 px-2 py-2 text-center text-xs font-medium min-w-[80px]",
                        isWeekend && "bg-gray-50",
                        isToday && "bg-blue-100 text-blue-900"
                      )}
                    >
                      <div>{DAYS[(dayOfWeek + 6) % 7]}</div>
                      <div className="text-lg font-bold">{day}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={daysInMonth + 1} className="px-4 py-12 text-center text-gray-500">
                    Aucun employé actif
                  </td>
                </tr>
              ) : (
                employees.map((employee) => (
                  <tr key={employee.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="sticky left-0 z-10 bg-white border-r border-gray-300 px-3 py-2 text-sm font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        <div>
                          <div>{employee.first_name} {employee.last_name}</div>
                          {employee.position && (
                            <div className="text-xs text-gray-500">{employee.position}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                      const date = new Date(currentYear, currentMonth, day);
                      const dayOfWeek = date.getDay();
                      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                      const dayShifts = getShiftsForEmployeeAndDate(employee.id, day);
                      
                      return (
                        <td
                          key={day}
                          onClick={() => handleCellClick(employee.id, day)}
                          className={cn(
                            "border-r border-gray-200 px-1 py-1 cursor-pointer hover:bg-blue-50 transition-colors",
                            isWeekend && "bg-gray-50"
                          )}
                        >
                          <div className="space-y-1">
                            {dayShifts.map(shift => (
                              <div
                                key={shift.id}
                                onClick={(e) => handleShiftEdit(shift, e)}
                                className={cn(
                                  "text-xs px-2 py-1 rounded text-white font-medium cursor-pointer hover:opacity-80",
                                  shift.status === 'confirmed' && "bg-green-600",
                                  shift.status === 'planned' && "bg-blue-600",
                                  shift.status === 'absent' && "bg-red-600",
                                  shift.status === 'leave' && "bg-orange-500"
                                )}
                              >
                                <div className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  <span>{shift.start_time} - {shift.end_time}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))
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
            setEditingShift(null);
          }
        }}
        selectedCell={selectedCell}
        editingShift={editingShift}
        employees={employees}
        onSave={(data) => {
          if (editingShift) {
            updateShiftMutation.mutate({ id: editingShift.id, data });
          } else {
            createShiftMutation.mutate(data);
          }
        }}
        onDelete={(id) => deleteShiftMutation.mutate(id)}
      />
    </div>
  );
}

// Shift Modal Component
function ShiftModal({ open, onOpenChange, selectedCell, editingShift, employees, onSave, onDelete }) {
  const [formData, setFormData] = useState({
    employee_id: '',
    start_time: '09:00',
    end_time: '17:00',
    break_minutes: 0,
    status: 'planned',
    notes: ''
  });

  React.useEffect(() => {
    if (editingShift) {
      setFormData({
        employee_id: editingShift.employee_id,
        start_time: editingShift.start_time,
        end_time: editingShift.end_time,
        break_minutes: editingShift.break_minutes || 0,
        status: editingShift.status,
        notes: editingShift.notes || ''
      });
    } else if (selectedCell) {
      setFormData({
        employee_id: selectedCell.employeeId,
        start_time: '09:00',
        end_time: '17:00',
        break_minutes: 0,
        status: 'planned',
        notes: ''
      });
    }
  }, [editingShift, selectedCell]);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const employee = employees.find(e => e.id === formData.employee_id);
    
    onSave({
      ...formData,
      date: selectedCell?.date,
      employee_name: employee ? `${employee.first_name} ${employee.last_name}` : '',
      position: employee?.position || '',
      team: employee?.team || ''
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editingShift ? 'Modifier le shift' : 'Ajouter un shift'}
          </DialogTitle>
          {selectedCell && (
            <p className="text-sm text-gray-500">
              {selectedCell.employeeName} - {new Date(selectedCell.date).toLocaleDateString('fr-FR')}
            </p>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Employé</Label>
            <Select
              value={formData.employee_id}
              onValueChange={(value) => setFormData({ ...formData, employee_id: value })}
              disabled={!!editingShift}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un employé" />
              </SelectTrigger>
              <SelectContent>
                {employees.map(emp => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

          <div className="flex justify-between gap-2 pt-4">
            {editingShift && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  if (confirm('Supprimer ce shift ?')) {
                    onDelete(editingShift.id);
                  }
                }}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Supprimer
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                {editingShift ? 'Modifier' : 'Ajouter'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}