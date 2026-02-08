import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Plus, Trash2, Clock, Coffee } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const DAYS = [
  { value: 1, label: 'Lundi' },
  { value: 2, label: 'Mardi' },
  { value: 3, label: 'Mercredi' },
  { value: 4, label: 'Jeudi' },
  { value: 5, label: 'Vendredi' },
  { value: 6, label: 'Samedi' },
  { value: 7, label: 'Dimanche' }
];

export default function TemplateWeekEditor({ week, onClose }) {
  const [selectedDay, setSelectedDay] = useState(1);
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [shiftForm, setShiftForm] = useState({
    start_time: '09:00',
    end_time: '17:00',
    break_minutes: 0,
    position: '',
    notes: ''
  });
  const queryClient = useQueryClient();

  const { data: positions = [] } = useQuery({
    queryKey: ['positions'],
    queryFn: async () => {
      const all = await base44.entities.Position.filter({ is_active: true });
      return all.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
  });

  const { data: shifts = [] } = useQuery({
    queryKey: ['templateShifts', week.id],
    queryFn: () => base44.entities.TemplateShift.filter({ template_week_id: week.id })
  });

  const saveShiftMutation = useMutation({
    mutationFn: ({ id, data }) => {
      if (id) {
        return base44.entities.TemplateShift.update(id, data);
      }
      return base44.entities.TemplateShift.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templateShifts', week.id] });
      toast.success('Shift enregistré');
      resetShiftForm();
    }
  });

  const deleteShiftMutation = useMutation({
    mutationFn: (id) => base44.entities.TemplateShift.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templateShifts', week.id] });
      toast.success('Shift supprimé');
    }
  });

  const updateWeekMutation = useMutation({
    mutationFn: (data) => base44.entities.TemplateWeek.update(week.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templateWeeks'] });
      toast.success('Semaine mise à jour');
    }
  });

  const [weekName, setWeekName] = useState(week.name);
  const [weekDescription, setWeekDescription] = useState(week.description || '');

  const resetShiftForm = () => {
    setShiftForm({
      start_time: '09:00',
      end_time: '17:00',
      break_minutes: 0,
      position: '',
      notes: ''
    });
    setEditingShift(null);
    setShowShiftForm(false);
  };

  const handleSaveShift = () => {
    if (!shiftForm.position) {
      toast.error('Le poste est requis');
      return;
    }

    const dayLabel = DAYS.find(d => d.value === selectedDay)?.label;
    console.log('🔍 TEMPLATE EDITOR - Enregistrement shift:', {
      dayLabel,
      day_of_week: selectedDay,
      template_week_id: week.id,
      position: shiftForm.position,
      start_time: shiftForm.start_time,
      end_time: shiftForm.end_time
    });

    saveShiftMutation.mutate({
      id: editingShift?.id,
      data: {
        template_week_id: week.id,
        day_of_week: selectedDay,
        ...shiftForm
      }
    });
  };

  const handleEditShift = (shift) => {
    setEditingShift(shift);
    setShiftForm({
      start_time: shift.start_time,
      end_time: shift.end_time,
      break_minutes: shift.break_minutes || 0,
      position: shift.position,
      notes: shift.notes || ''
    });
    setShowShiftForm(true);
  };

  const calculateDuration = (startTime, endTime, breakMinutes) => {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    let totalMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    if (totalMinutes < 0) totalMinutes += 24 * 60;
    totalMinutes -= (breakMinutes || 0);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h${minutes.toString().padStart(2, '0')}`;
  };

  const dayShifts = shifts
    .filter(s => s.day_of_week === selectedDay)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 pb-4 border-b">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour
        </Button>
        <div className="flex-1">
          <Input
            value={weekName}
            onChange={(e) => setWeekName(e.target.value)}
            onBlur={() => updateWeekMutation.mutate({ name: weekName })}
            className="font-semibold text-lg"
          />
          <Input
            value={weekDescription}
            onChange={(e) => setWeekDescription(e.target.value)}
            onBlur={() => updateWeekMutation.mutate({ description: weekDescription })}
            placeholder="Description (optionnel)"
            className="text-sm text-gray-600 mt-1"
          />
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {DAYS.map(day => (
          <Button
            type="button"
            key={day.value}
            variant={selectedDay === day.value ? "default" : "outline"}
            onClick={() => setSelectedDay(day.value)}
            className={cn(
              "text-xs font-semibold",
              selectedDay === day.value && "bg-orange-600 hover:bg-orange-700"
            )}
          >
            {day.label}
          </Button>
        ))}
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-semibold">
            {DAYS.find(d => d.value === selectedDay)?.label}
          </h4>
          <Button
            type="button"
            onClick={() => setShowShiftForm(true)}
            size="sm"
            className="bg-orange-600 hover:bg-orange-700"
          >
            <Plus className="w-4 h-4 mr-1" />
            Ajouter un shift
          </Button>
        </div>

        {showShiftForm && (
          <Card className="p-4 mb-4 border-2 border-orange-200 bg-orange-50">
            <div className="space-y-3">
              <div>
                <Label>Poste *</Label>
                <Select
                  value={shiftForm.position}
                  onValueChange={(value) => setShiftForm({ ...shiftForm, position: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner..." />
                  </SelectTrigger>
                  <SelectContent>
                    {positions.map(pos => (
                      <SelectItem key={pos.id} value={pos.label}>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: pos.color }} />
                          {pos.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Début *</Label>
                  <Input
                    type="time"
                    value={shiftForm.start_time}
                    onChange={(e) => setShiftForm({ ...shiftForm, start_time: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Fin *</Label>
                  <Input
                    type="time"
                    value={shiftForm.end_time}
                    onChange={(e) => setShiftForm({ ...shiftForm, end_time: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Pause (min)</Label>
                  <Input
                    type="number"
                    value={shiftForm.break_minutes}
                    onChange={(e) => setShiftForm({ ...shiftForm, break_minutes: parseInt(e.target.value) || 0 })}
                    min="0"
                  />
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-blue-900">
                  Durée : {calculateDuration(shiftForm.start_time, shiftForm.end_time, shiftForm.break_minutes)}
                </span>
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea
                  value={shiftForm.notes}
                  onChange={(e) => setShiftForm({ ...shiftForm, notes: e.target.value })}
                  rows={2}
                  placeholder="Notes optionnelles..."
                />
              </div>

              <div className="flex gap-2">
                <Button type="button" onClick={handleSaveShift} className="flex-1">
                  {editingShift ? 'Modifier' : 'Ajouter'}
                </Button>
                <Button type="button" variant="outline" onClick={resetShiftForm}>
                  Annuler
                </Button>
              </div>
            </div>
          </Card>
        )}

        {dayShifts.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>Aucun shift pour ce jour</p>
          </div>
        ) : (
          <div className="space-y-2">
            {dayShifts.map(shift => {
              const position = positions.find(p => p.label === shift.position);
              const rgb = position?.color ? {
                r: parseInt(position.color.slice(1, 3), 16),
                g: parseInt(position.color.slice(3, 5), 16),
                b: parseInt(position.color.slice(5, 7), 16)
              } : { r: 59, g: 130, b: 246 };

              return (
                <div
                  key={shift.id}
                  onClick={() => handleEditShift(shift)}
                  className="p-3 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md"
                  style={{
                    backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`,
                    borderColor: position?.color || '#3b82f6'
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="w-4 h-4" style={{ color: position?.color }} />
                        <span className="font-bold text-sm" style={{ color: position?.color }}>
                          {shift.start_time} - {shift.end_time}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold uppercase tracking-wide" style={{ color: position?.color }}>
                          {shift.position}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold" style={{ color: position?.color }}>
                            {calculateDuration(shift.start_time, shift.end_time, shift.break_minutes)}
                          </span>
                          {shift.break_minutes > 0 && (
                            <span className="flex items-center gap-1" style={{ color: position?.color }}>
                              <Coffee className="w-3 h-3" />
                              {shift.break_minutes}min
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm('Supprimer ce shift ?')) {
                          deleteShiftMutation.mutate(shift.id);
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}