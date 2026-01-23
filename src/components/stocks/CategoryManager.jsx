import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, Edit2, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const DEFAULT_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'
];

export default function CategoryManager({ categories }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [form, setForm] = useState({ name: '', color: '#3b82f6' });

  const saveCategoryMutation = useMutation({
    mutationFn: ({ id, data }) => {
      if (id) {
        return base44.entities.Category.update(id, data);
      }
      return base44.entities.Category.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setShowForm(false);
      setEditingCategory(null);
      setForm({ name: '', color: '#3b82f6' });
    }
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id) => base44.entities.Category.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    }
  });

  const handleEdit = (category) => {
    setEditingCategory(category);
    setForm({ name: category.name, color: category.color || '#3b82f6' });
    setShowForm(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    saveCategoryMutation.mutate({
      id: editingCategory?.id,
      data: form
    });
  };

  return (
    <>
      <button
        onClick={() => {
          setEditingCategory(null);
          setForm({ name: '', color: '#3b82f6' });
          setShowForm(true);
        }}
        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-900 hover:bg-gray-200 transition-all flex items-center gap-1"
        title="Gérer les catégories"
      >
        <Plus className="w-4 h-4" />
      </button>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingCategory ? 'Modifier la catégorie' : 'Nouvelle catégorie'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-2">Nom *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ex: Fruits, Viandes..."
                className="bg-slate-700 border-slate-600"
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-3">Couleur</label>
              <div className="flex gap-2 flex-wrap">
                {DEFAULT_COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, color }))}
                    className={`w-8 h-8 rounded transition-all ${
                      form.color === color ? 'ring-2 ring-offset-2 ring-white' : ''
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="border-slate-600">
                Annuler
              </Button>
              <Button type="submit" disabled={saveCategoryMutation.isPending} className="bg-orange-600 hover:bg-orange-700">
                {editingCategory ? 'Modifier' : 'Créer'}
              </Button>
            </div>
          </form>

          {/* Catégories existantes */}
          {categories.length > 0 && (
            <div className="pt-6 border-t border-slate-700">
              <h3 className="text-sm font-semibold mb-3">Catégories existantes</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {categories.map(cat => (
                  <div key={cat.id} className="flex items-center justify-between bg-slate-700 p-2 rounded">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: cat.color || '#2563eb' }}
                      />
                      <span className="text-sm">{cat.name}</span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleEdit(cat)}
                        className="p-1 text-slate-400 hover:text-blue-400 transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Supprimer cette catégorie?')) {
                            deleteCategoryMutation.mutate(cat.id);
                          }
                        }}
                        className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}