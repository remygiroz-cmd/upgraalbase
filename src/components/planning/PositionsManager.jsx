import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { cn } from '@/lib/utils';

export default function PositionsManager({ open, onOpenChange, embeddedMode = false }) {
  const [editingPosition, setEditingPosition] = useState(null);
  const [formData, setFormData] = useState({ label: '', color: '#3b82f6' });
  const queryClient = useQueryClient();

  const { data: positions = [] } = useQuery({
    queryKey: ['positions'],
    queryFn: async () => {
      const all = await base44.entities.Position.filter({ is_active: true });
      return all.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Position.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      toast.success('Poste créé');
      resetForm();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Position.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      toast.success('Poste mis à jour');
      resetForm();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Position.update(id, { is_active: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      toast.success('Poste supprimé');
    }
  });

  const resetForm = () => {
    setFormData({ label: '', color: '#3b82f6' });
    setEditingPosition(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.label.trim()) {
      toast.error('Le nom du poste est requis');
      return;
    }

    if (editingPosition) {
      updateMutation.mutate({ id: editingPosition.id, data: formData });
    } else {
      createMutation.mutate({ ...formData, order: positions.length });
    }
  };

  const handleEdit = (position) => {
    setEditingPosition(position);
    setFormData({ label: position.label, color: position.color || '#3b82f6' });
  };

  const handleDragEnd = async (result) => {
    if (!result.destination) return;

    const items = Array.from(positions);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Update order for all items
    const updatePromises = items.map((item, index) => 
      updateMutation.mutateAsync({ id: item.id, data: { order: index } })
    );

    await Promise.all(updatePromises);
  };

  const PRESET_COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#84cc16', 
    '#10b981', '#14b8a6', '#06b6d4', '#3b82f6',
    '#6366f1', '#8b5cf6', '#a855f7', '#ec4899'
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gestion des postes</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mb-6 p-4 bg-gray-50 rounded-lg border-2 border-gray-200">
          <div>
            <Label>Nom du poste</Label>
            <Input
              value={formData.label}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              placeholder="Ex: Cuisine, Caisse, Service..."
            />
          </div>

          <div>
            <Label>Couleur</Label>
            <div className="flex gap-2 flex-wrap mt-2">
              {PRESET_COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setFormData({ ...formData, color })}
                  className={cn(
                    "w-10 h-10 rounded-lg border-2 transition-all",
                    formData.color === color ? "border-gray-900 scale-110" : "border-gray-300"
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="submit" className="flex-1">
              {editingPosition ? 'Mettre à jour' : 'Ajouter'}
            </Button>
            {editingPosition && (
              <Button type="button" variant="outline" onClick={resetForm}>
                Annuler
              </Button>
            )}
          </div>
        </form>

        <div className="space-y-2">
          <h3 className="font-semibold text-sm text-gray-700 mb-3">Postes existants</h3>
          
          {positions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>Aucun poste créé</p>
              <p className="text-xs mt-1">Ajoutez votre premier poste ci-dessus</p>
            </div>
          ) : (
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="positions">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                    {positions.map((position, index) => (
                      <Draggable key={position.id} draggableId={position.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={cn(
                              "flex items-center gap-3 p-3 bg-white border-2 border-gray-200 rounded-lg",
                              snapshot.isDragging && "shadow-lg opacity-90"
                            )}
                          >
                            <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing">
                              <GripVertical className="w-5 h-5 text-gray-400" />
                            </div>
                            
                            <div 
                              className="w-6 h-6 rounded-full border-2 border-gray-300" 
                              style={{ backgroundColor: position.color }}
                            />
                            
                            <span className="flex-1 font-medium">{position.label}</span>
                            
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(position)}
                            >
                              Modifier
                            </Button>
                            
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (window.confirm(`Supprimer le poste "${position.label}" ?`)) {
                                  deleteMutation.mutate(position.id);
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}