import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, GripVertical, Pencil, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const COLORS = [
  '#f97316', '#f59e0b', '#6366f1', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#fb923c', '#14b8a6'
];

export default function CategoryManager({ onClose }) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('order')
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Category.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setNewName('');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Category.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setEditingId(null);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Category.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] })
  });

  const handleCreate = (e) => {
    e?.preventDefault();
    if (!newName.trim()) return;
    createMutation.mutate({
      name: newName.trim(),
      color: newColor,
      order: categories.length
    });
  };

  const handleStartEdit = (cat, e) => {
    e.stopPropagation();
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditColor(cat.color || COLORS[0]);
  };

  const handleSaveEdit = (e) => {
    e?.stopPropagation();
    if (!editName.trim()) return;
    updateMutation.mutate({
      id: editingId,
      data: { name: editName.trim(), color: editColor }
    });
  };

  const handleCancelEdit = (e) => {
    e?.stopPropagation();
    setEditingId(null);
    setEditName('');
    setEditColor('');
  };

  const handleDelete = (id, e) => {
    e.stopPropagation();
    if (window.confirm('Supprimer cette catégorie ?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    
    const items = Array.from(categories);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Update order for all categories
    try {
      const updates = items.map((item, index) => 
        base44.entities.Category.update(item.id, { order: index })
      );
      await Promise.all(updates);
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    } catch (error) {
      console.error('Error reordering:', error);
    }
  };

  return (
    <div className="space-y-4">
      {/* Existing categories */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="categories">
          {(provided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="space-y-2 max-h-[400px] overflow-y-auto pr-2"
            >
              {categories.map((cat, index) => (
                <Draggable key={cat.id} draggableId={cat.id} index={index}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className={cn(
                        "flex items-center gap-2 p-3 bg-slate-700/50 rounded-lg transition-all",
                        snapshot.isDragging && "bg-slate-600 shadow-xl ring-2 ring-orange-500/50 scale-105"
                      )}
                    >
                      <div 
                        {...provided.dragHandleProps}
                        className="cursor-grab active:cursor-grabbing touch-none p-2 hover:bg-slate-600/50 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                      >
                        <GripVertical className="w-6 h-6 text-orange-500" />
                      </div>
                      
                      {editingId === cat.id ? (
                        <>
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="flex-1 bg-slate-600 border-slate-500 h-9 text-sm"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit(e);
                              if (e.key === 'Escape') handleCancelEdit(e);
                            }}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="flex gap-1 flex-shrink-0">
                            {COLORS.slice(0, 5).map((color) => (
                              <button
                                key={color}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditColor(color);
                                }}
                                className={cn(
                                  "w-6 h-6 rounded-full transition-all flex-shrink-0",
                                  editColor === color && "ring-2 ring-white scale-110"
                                )}
                                style={{ backgroundColor: color }}
                                type="button"
                              />
                            ))}
                          </div>
                          <button
                            onClick={handleSaveEdit}
                            className="p-2 rounded-lg hover:bg-green-600/20 text-green-400 hover:text-green-300 transition-colors flex-shrink-0"
                            type="button"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="p-2 rounded-lg hover:bg-slate-600 text-slate-400 hover:text-slate-300 transition-colors flex-shrink-0"
                            type="button"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <div
                            className="w-5 h-5 rounded-full flex-shrink-0 border-2 border-slate-600"
                            style={{ backgroundColor: cat.color || '#10b981' }}
                          />
                          <span className="flex-1 truncate font-medium">{cat.name}</span>
                          <button
                            onClick={(e) => handleStartEdit(cat, e)}
                            className="p-2.5 rounded-lg bg-slate-600/50 hover:bg-orange-600/30 text-slate-300 hover:text-orange-400 transition-colors flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
                            type="button"
                            title="Modifier"
                          >
                            <Pencil className="w-5 h-5" />
                          </button>
                          <button
                            onClick={(e) => handleDelete(cat.id, e)}
                            className="p-2.5 rounded-lg bg-slate-600/50 hover:bg-red-600/30 text-slate-300 hover:text-red-400 transition-colors flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
                            type="button"
                            title="Supprimer"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
              
              {categories.length === 0 && (
                <p className="text-center text-slate-500 py-8 text-sm">
                  Aucune catégorie créée
                </p>
              )}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* New category form */}
      <div className="pt-4 border-t border-slate-700 space-y-3">
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nom de la catégorie"
            className="bg-slate-700 border-slate-600 text-sm"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate(e)}
          />
          <Button
            onClick={handleCreate}
            disabled={!newName.trim() || createMutation.isPending}
            className="bg-orange-600 hover:bg-orange-700 flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {COLORS.map((color) => (
            <button
              key={color}
              onClick={() => setNewColor(color)}
              className={cn(
                "w-8 h-8 rounded-lg transition-all",
                newColor === color && "ring-2 ring-white ring-offset-2 ring-offset-slate-800 scale-110"
              )}
              style={{ backgroundColor: color }}
              type="button"
            />
          ))}
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button 
          variant="outline" 
          onClick={onClose} 
          className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700"
        >
          Fermer
        </Button>
      </div>
    </div>
  );
}