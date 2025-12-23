import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus } from 'lucide-react';

export default function AdHocTaskModal({ open, onClose, onAdd }) {
  const [form, setForm] = useState({
    name: '',
    comment: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    
    onAdd({
      name: form.name.trim(),
      comment: form.comment.trim()
    });
    
    setForm({ name: '', comment: '' });
    onClose();
  };

  const handleClose = () => {
    setForm({ name: '', comment: '' });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-slate-800 border-slate-700 max-w-md">
        <DialogHeader>
          <DialogTitle>Tâche ponctuelle</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="ad-hoc-name">Nom de la tâche *</Label>
            <Input
              id="ad-hoc-name"
              value={form.name}
              onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Ex: Préparer les amuse-bouches"
              className="bg-slate-700 border-slate-600 mt-1"
              required
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="ad-hoc-comment">Commentaire</Label>
            <Textarea
              id="ad-hoc-comment"
              value={form.comment}
              onChange={(e) => setForm(prev => ({ ...prev, comment: e.target.value }))}
              placeholder="Instructions, quantités, détails..."
              className="bg-slate-700 border-slate-600 mt-1 min-h-[100px]"
            />
            <p className="text-xs text-slate-400 mt-1">
              Ce commentaire apparaîtra dans la fiche de la tâche
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            <Button type="button" variant="outline" onClick={handleClose} className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700">
              Annuler
            </Button>
            <Button type="submit" className="bg-orange-600 hover:bg-orange-700">
              <Plus className="w-4 h-4 mr-2" />
              Ajouter à la sélection
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}