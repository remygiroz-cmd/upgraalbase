import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Plus, Edit, Trash2, Copy, Calendar, Star } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import TemplateWeekEditor from './TemplateWeekEditor';

export default function TemplateWeeksManager({ employeeId }) {
  const [showEditor, setShowEditor] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newWeekName, setNewWeekName] = useState('');
  const queryClient = useQueryClient();

  const { data: templateWeeks = [] } = useQuery({
    queryKey: ['templateWeeks', employeeId],
    queryFn: async () => {
      const weeks = await base44.entities.TemplateWeek.filter({ employee_id: employeeId });
      return weeks.sort((a, b) => (a.order || 0) - (b.order || 0));
    },
    enabled: !!employeeId
  });

  const createWeekMutation = useMutation({
    mutationFn: (data) => base44.entities.TemplateWeek.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templateWeeks', employeeId] });
      toast.success('Semaine type créée');
      setShowCreateForm(false);
      setNewWeekName('');
    }
  });

  const deleteWeekMutation = useMutation({
    mutationFn: async (weekId) => {
      // Delete all shifts first
      const shifts = await base44.entities.TemplateShift.filter({ template_week_id: weekId });
      await Promise.all(shifts.map(s => base44.entities.TemplateShift.delete(s.id)));
      // Then delete the week
      await base44.entities.TemplateWeek.delete(weekId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templateWeeks', employeeId] });
      toast.success('Semaine type supprimée');
    }
  });

  const duplicateWeekMutation = useMutation({
    mutationFn: async (week) => {
      // Create new week
      const newWeek = await base44.entities.TemplateWeek.create({
        employee_id: week.employee_id,
        name: `${week.name} (copie)`,
        description: week.description,
        is_default: false,
        order: templateWeeks.length
      });

      // Copy all shifts
      const shifts = await base44.entities.TemplateShift.filter({ template_week_id: week.id });
      await Promise.all(
        shifts.map(s => base44.entities.TemplateShift.create({
          template_week_id: newWeek.id,
          day_of_week: s.day_of_week,
          start_time: s.start_time,
          end_time: s.end_time,
          break_minutes: s.break_minutes,
          position: s.position,
          notes: s.notes
        }))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templateWeeks', employeeId] });
      toast.success('Semaine type dupliquée');
    }
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (weekId) => {
      // Unset all defaults
      await Promise.all(
        templateWeeks.map(w => 
          base44.entities.TemplateWeek.update(w.id, { is_default: w.id === weekId })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templateWeeks', employeeId] });
      toast.success('Semaine type par défaut définie');
    }
  });

  const handleCreateWeek = () => {
    if (!newWeekName.trim()) {
      toast.error('Le nom est requis');
      return;
    }
    createWeekMutation.mutate({
      employee_id: employeeId,
      name: newWeekName,
      order: templateWeeks.length,
      is_default: templateWeeks.length === 0
    });
  };

  if (showEditor) {
    return (
      <TemplateWeekEditor
        week={selectedWeek}
        onClose={() => {
          setShowEditor(false);
          setSelectedWeek(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Plannings types</h3>
          <p className="text-sm text-gray-500">
            Créez des semaines types pour pré-remplir rapidement le planning
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setShowCreateForm(true)}
          className="bg-orange-600 hover:bg-orange-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nouvelle semaine type
        </Button>
      </div>

      {showCreateForm && (
        <Card className="p-4 border-2 border-orange-200 bg-orange-50">
          <div className="space-y-3">
            <Label>Nom de la semaine type</Label>
            <Input
              value={newWeekName}
              onChange={(e) => setNewWeekName(e.target.value)}
              placeholder="Ex: Semaine type 1, Semaine vacances..."
              onKeyDown={(e) => e.key === 'Enter' && handleCreateWeek()}
            />
            <div className="flex gap-2">
              <Button type="button" onClick={handleCreateWeek} className="flex-1">
                Créer
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowCreateForm(false);
                  setNewWeekName('');
                }}
              >
                Annuler
              </Button>
            </div>
          </div>
        </Card>
      )}

      {templateWeeks.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
          <Calendar className="w-12 h-12 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-600 font-medium mb-1">Aucune semaine type</p>
          <p className="text-sm text-gray-500">
            Créez votre première semaine type pour cet employé
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {templateWeeks.map((week) => (
            <Card
              key={week.id}
              className={cn(
                "p-4 border-2 transition-all hover:shadow-md",
                week.is_default ? "border-orange-300 bg-orange-50" : "border-gray-200"
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-gray-900">{week.name}</h4>
                    {week.is_default && (
                      <span className="px-2 py-0.5 bg-orange-200 text-orange-800 text-xs font-semibold rounded-full flex items-center gap-1">
                        <Star className="w-3 h-3" />
                        Par défaut
                      </span>
                    )}
                  </div>
                  {week.description && (
                    <p className="text-sm text-gray-600">{week.description}</p>
                  )}
                </div>

                <div className="flex gap-1">
                  {!week.is_default && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDefaultMutation.mutate(week.id)}
                      title="Définir par défaut"
                    >
                      <Star className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedWeek(week);
                      setShowEditor(true);
                    }}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => duplicateWeekMutation.mutate(week)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (window.confirm(`Supprimer la semaine type "${week.name}" ?`)) {
                        deleteWeekMutation.mutate(week.id);
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}