import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Bell } from 'lucide-react';

const DURATIONS = [
  { value: 1, label: '1 heure' },
  { value: 2, label: '2 heures' },
  { value: 4, label: '4 heures' },
  { value: 8, label: '8 heures' },
  { value: 12, label: '12 heures' },
  { value: 24, label: '24 heures (1 jour)' },
  { value: 48, label: '48 heures (2 jours)' },
  { value: 72, label: '72 heures (3 jours)' },
];

export default function DailyNoteModal({ open, onClose }) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [duration, setDuration] = useState('8');

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const createNoteMutation = useMutation({
    mutationFn: async (data) => {
      return base44.entities.DailyNote.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dailyNotes'] });
      setContent('');
      setDuration('8');
      onClose();
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!content.trim()) return;

    const hoursToAdd = parseInt(duration);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + hoursToAdd);

    createNoteMutation.mutate({
      content: content.trim(),
      author: currentUser?.email,
      author_name: currentUser?.full_name || currentUser?.email,
      expires_at: expiresAt.toISOString(),
      read_by: [],
      is_active: true
    });
  };

  const handleClose = () => {
    setContent('');
    setDuration('8');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-slate-800 border-slate-700 max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-orange-400" />
            Nouvelle note d'équipe
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="note-content">Message *</Label>
            <Textarea
              id="note-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Ex: Attention, nouvelle recette à tester ce soir pour le service de demain..."
              className="bg-slate-700 border-slate-600 mt-1 min-h-[120px]"
              required
              autoFocus
            />
          </div>

          <div>
            <Label>Durée d'affichage</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger className="bg-slate-700 border-slate-600 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-700 border-slate-600">
                {DURATIONS.map(d => (
                  <SelectItem key={d.value} value={d.value.toString()}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-400 mt-1">
              La note sera visible dans "Travail du Jour" pendant cette durée
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleClose}
              className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700"
            >
              Annuler
            </Button>
            <Button 
              type="submit" 
              className="bg-orange-600 hover:bg-orange-700"
              disabled={createNoteMutation.isPending}
            >
              {createNoteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Publier
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}