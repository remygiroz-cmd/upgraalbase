import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, addDays, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const STATUS_COLORS = {
  planned: 'bg-slate-600',
  confirmed: 'bg-orange-600',
  absent: 'bg-red-600',
  leave: 'bg-amber-600'
};

const STATUS_LABELS = {
  planned: 'Prévu',
  confirmed: 'Confirmé',
  absent: 'Absent',
  leave: 'Congé'
};

export default function ShiftManager({ employees, weekStart }) {
  const queryClient = useQueryClient();
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [selectedCell, setSelectedCell] = useState(null);
  const [editingShift, setEditingShift] = useState(null);

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const { data: shifts = [] } = useQuery({
    queryKey: ['shifts', format(weekStart, 'yyyy-MM-dd')],
    queryFn: async () => {
      const allShifts = await base44.entities.Shift.list();
      return allShifts.filter(s => {
        const shiftDate = parseISO(s.date);
        return shiftDate >= weekStart && shiftDate < addDays(weekStart, 7);
      });
    }
  });

  const createShiftMutation = useMutation({
    mutationFn: (data) => base44.entities.Shift.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      setShowShiftModal(false);
    }
  });

  const updateShiftMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Shift.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      setShowShiftModal(false);
    }
  });

  const deleteShiftMutation = useMutation({
    mutationFn: (id) => base44.entities.Shift.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shifts'] })
  });

  const getShiftsForCell = (employeeId, date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return shifts.filter(s => s.employee_id === employeeId && s.date === dateStr);
  };

  const handleCellClick = (employee, date) => {
    const cellShifts = getShiftsForCell(employee.id, date);
    if (cellShifts.length > 0) {
      setEditingShift(cellShifts[0]);
    } else {
      setEditingShift(null);
    }
    setSelectedCell({ employee, date: format(date, 'yyyy-MM-dd') });
    setShowShiftModal(true);
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[800px]">
        {/* Header */}
        <div className="grid grid-cols-8 gap-1 mb-2">
          <div className="p-2 text-sm font-medium text-slate-400">Employé</div>
          {weekDates.map((date, i) => (
            <div key={i} className="p-2 text-center">
              <p className="text-xs text-slate-400">{DAYS[i]}</p>
              <p className="font-medium">{format(date, 'd')}</p>
            </div>
          ))}
        </div>

        {/* Rows */}
        {employees.map(employee => (
          <div key={employee.id} className="grid grid-cols-8 gap-1 mb-1">
            <div className="p-3 bg-slate-800/50 rounded-lg flex items-center gap-2">
              {employee.photo_url ? (
                <img
                  src={employee.photo_url}
                  alt={employee.first_name}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                  <User className="w-4 h-4 text-slate-400" />
                </div>
              )}
              <span className="text-sm truncate">{employee.first_name}</span>
            </div>

            {weekDates.map((date, i) => {
              const cellShifts = getShiftsForCell(employee.id, date);
              const shift = cellShifts[0];

              return (
                <button
                  key={i}
                  onClick={() => handleCellClick(employee, date)}
                  className={cn(
                    "p-2 rounded-lg text-xs text-center transition-all min-h-[60px]",
                    "hover:ring-2 hover:ring-emerald-500/50",
                    shift ? STATUS_COLORS[shift.status] + '/30' : "bg-slate-800/30 hover:bg-slate-700/50"
                  )}
                >
                  {shift && (
                    <>
                      <p className="font-medium">
                        {shift.start_time} - {shift.end_time}
                      </p>
                      {shift.position && (
                        <p className="text-slate-400 truncate">{shift.position}</p>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Shift Modal */}
      {showShiftModal && selectedCell && (
        <ShiftFormModal
          employee={selectedCell.employee}
          date={selectedCell.date}
          shift={editingShift}
          onClose={() => {
            setShowShiftModal(false);
            setSelectedCell(null);
            setEditingShift(null);
          }}
          onSave={(data) => {
            if (editingShift) {
              updateShiftMutation.mutate({ id: editingShift.id, data });
            } else {
              createShiftMutation.mutate(data);
            }
          }}
          onDelete={editingShift ? () => {
            deleteShiftMutation.mutate(editingShift.id);
            setShowShiftModal(false);
          } : null}
        />
      )}
    </div>
  );
}

function ShiftFormModal({ employee, date, shift, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({
    start_time: shift?.start_time || '09:00',
    end_time: shift?.end_time || '17:00',
    break_minutes: shift?.break_minutes || 30,
    position: shift?.position || employee.position || '',
    status: shift?.status || 'planned',
    notes: shift?.notes || ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...form,
      employee_id: employee.id,
      employee_name: `${employee.first_name} ${employee.last_name}`,
      date
    });
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700">
        <DialogHeader>
          <DialogTitle>
            {shift ? 'Modifier' : 'Nouveau'} shift - {employee.first_name}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="start_time">Début</Label>
              <Input
                id="start_time"
                type="time"
                value={form.start_time}
                onChange={(e) => setForm(prev => ({ ...prev, start_time: e.target.value }))}
                className="bg-slate-700 border-slate-600 mt-1"
              />
            </div>
            <div>
              <Label htmlFor="end_time">Fin</Label>
              <Input
                id="end_time"
                type="time"
                value={form.end_time}
                onChange={(e) => setForm(prev => ({ ...prev, end_time: e.target.value }))}
                className="bg-slate-700 border-slate-600 mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="break_minutes">Pause (min)</Label>
              <Input
                id="break_minutes"
                type="number"
                value={form.break_minutes}
                onChange={(e) => setForm(prev => ({ ...prev, break_minutes: parseInt(e.target.value) || 0 }))}
                className="bg-slate-700 border-slate-600 mt-1"
              />
            </div>
            <div>
              <Label>Statut</Label>
              <Select
                value={form.status}
                onValueChange={(value) => setForm(prev => ({ ...prev, status: value }))}
              >
                <SelectTrigger className="bg-slate-700 border-slate-600 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-700 border-slate-600">
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="position">Poste</Label>
            <Input
              id="position"
              value={form.position}
              onChange={(e) => setForm(prev => ({ ...prev, position: e.target.value }))}
              className="bg-slate-700 border-slate-600 mt-1"
            />
          </div>

          <div className="flex justify-between gap-3 pt-4">
            {onDelete && (
              <Button
                type="button"
                variant="destructive"
                onClick={onDelete}
                className="mr-auto"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Supprimer
              </Button>
            )}
            <div className="flex gap-3 ml-auto">
              <Button type="button" variant="outline" onClick={onClose} className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700">
                Annuler
              </Button>
              <Button type="submit" className="bg-orange-600 hover:bg-orange-700">
                {shift ? 'Modifier' : 'Créer'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}