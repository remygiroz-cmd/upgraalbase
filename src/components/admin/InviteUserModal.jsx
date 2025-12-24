import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Mail } from 'lucide-react';

export default function InviteUserModal({ open, onClose, roles }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    email: '',
    first_name: '',
    last_name: '',
    role_id: '',
    team: '',
    notes: ''
  });

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const inviteMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.functions.invoke('inviteUser', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
      setForm({
        email: '',
        first_name: '',
        last_name: '',
        role_id: '',
        team: '',
        notes: ''
      });
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    inviteMutation.mutate({
      ...form,
      invited_by: currentUser?.email,
      invited_by_name: currentUser?.full_name || currentUser?.email
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-orange-500" />
            Inviter un utilisateur
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="first_name">Prénom *</Label>
              <Input
                id="first_name"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                className="bg-slate-700 border-slate-600 mt-1"
                required
              />
            </div>
            <div>
              <Label htmlFor="last_name">Nom *</Label>
              <Input
                id="last_name"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                className="bg-slate-700 border-slate-600 mt-1"
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="bg-slate-700 border-slate-600 mt-1"
              placeholder="email@example.com"
              required
            />
          </div>

          <div>
            <Label htmlFor="role">Rôle *</Label>
            <Select
              value={form.role_id}
              onValueChange={(value) => setForm({ ...form, role_id: value })}
              required
            >
              <SelectTrigger className="bg-slate-700 border-slate-600 mt-1">
                <SelectValue placeholder="Sélectionner un rôle..." />
              </SelectTrigger>
              <SelectContent className="bg-slate-700 border-slate-600">
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="team">Équipe</Label>
            <Input
              id="team"
              value={form.team}
              onChange={(e) => setForm({ ...form, team: e.target.value })}
              className="bg-slate-700 border-slate-600 mt-1"
              placeholder="Ex: Cuisine, Service, Plonge..."
            />
          </div>

          <div>
            <Label htmlFor="notes">Notes (optionnel)</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="bg-slate-700 border-slate-600 mt-1"
              placeholder="Notes internes..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={inviteMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {inviteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Envoyer l'invitation
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}