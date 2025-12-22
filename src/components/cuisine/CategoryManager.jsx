import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

const COLORS = [
  '#10b981', '#f59e0b', '#6366f1', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6'
];

export default function CategoryManager({ onClose }) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(COLORS[0]);

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

  return (
    <div className="space-y-4">
      {/* Existing categories */}
      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {categories.map((cat) => (
          <div
            key={cat.id}
            className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg"
          >
            <GripVertical className="w-4 h-4 text-slate-500 cursor-grab" />
            <div
              className="w-4 h-4 rounded-full flex-shrink-0"
              style={{ backgroundColor: cat.color || '#10b981' }}
            />
            <span className="flex-1 truncate">{cat.name}</span>
            <button
              onClick={() => deleteMutation.mutate(cat.id)}
              className="p-1.5 rounded hover:bg-red-600/20 text-slate-400 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        
        {categories.length === 0 && (
          <p className="text-center text-slate-500 py-4">
            Aucune catégorie créée
          </p>
        )}
      </div>

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
            className="bg-emerald-600 hover:bg-emerald-700"
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
        <Button variant="outline" onClick={onClose} className="border-slate-600">
          Fermer
        </Button>
      </div>
    </div>
  );
}