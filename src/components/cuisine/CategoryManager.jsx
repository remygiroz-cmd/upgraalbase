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

  const handleCreate = () => {
    if (!newName.trim()) return;
    createMutation.mutate({
      name: newName.trim(),
      color: newColor,
      order: categories.length
    });
  };

  const handleStartEdit = (cat) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditColor(cat.color || COLORS[0]);
  };

  const handleSaveEdit = () => {
    if (!editName.trim()) return;
    updateMutation.mutate({
      id: editingId,
      data: { name: editName.trim(), color: editColor }
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditColor('');
  };

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    
    const items = Array.from(categories);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Update order for all categories
    const updates = items.map((item, index) => 
      base44.entities.Category.update(item.id, { order: index })
    );
    
    await Promise.all(updates);
    queryClient.invalidateQueries({ queryKey: ['categories'] });
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
              className="space-y-2 max-h-[300px] overflow-y-auto"
            >
              {categories.map((cat, index) => (
                <Draggable key={cat.id} draggableId={cat.id} index={index}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className={cn(
                        "flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg transition-colors",
                        snapshot.isDragging && "bg-slate-600/70 shadow-lg"
                      )}
                    >
                      <div {...provided.dragHandleProps}>
                        <GripVertical className="w-4 h-4 text-slate-500 cursor-grab active:cursor-grabbing" />
                      </div>
                      
                      {editingId === cat.id ? (
                        <>
                          <div className="flex gap-2 flex-wrap items-center">
                            {COLORS.map((color) => (
                              <button
                                key={color}
                                onClick={() => setEditColor(color)}
                                className={cn(
                                  "w-6 h-6 rounded-full transition-all",
                                  editColor === color && "ring-2 ring-white"
                                )}
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="flex-1 bg-slate-600 border-slate-500 h-8"
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                          />
                          <button
                            onClick={handleSaveEdit}
                            className="p-1.5 rounded hover:bg-green-600/20 text-slate-400 hover:text-green-400 transition-colors"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="p-1.5 rounded hover:bg-slate-600 text-slate-400 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <div
                            className="w-4 h-4 rounded-full flex-shrink-0"
                            style={{ backgroundColor: cat.color || '#10b981' }}
                          />
                          <span className="flex-1 truncate">{cat.name}</span>
                          <button
                            onClick={() => handleStartEdit(cat)}
                            className="p-1.5 rounded hover:bg-slate-600 text-slate-400 hover:text-slate-200 transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteMutation.mutate(cat.id)}
                            className="p-1.5 rounded hover:bg-red-600/20 text-slate-400 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
              
              {categories.length === 0 && (
                <p className="text-center text-slate-500 py-4">
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
            className="bg-slate-700 border-slate-600"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <Button
            onClick={handleCreate}
            disabled={!newName.trim() || createMutation.isPending}
            className="bg-orange-600 hover:bg-orange-700"
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
                newColor === color && "ring-2 ring-white ring-offset-2 ring-offset-slate-800"
              )}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button variant="outline" onClick={onClose} className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700">
          Fermer
        </Button>
      </div>
    </div>
  );
}