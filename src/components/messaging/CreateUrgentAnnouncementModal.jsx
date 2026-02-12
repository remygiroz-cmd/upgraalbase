import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const QUICK_DURATIONS = [
  { label: '1 heure', hours: 1 },
  { label: '4 heures', hours: 4 },
  { label: '8 heures', hours: 8 },
  { label: '24 heures', hours: 24 },
  { label: '48 heures', hours: 48 },
  { label: '1 semaine', hours: 168 }
];

export default function CreateUrgentAnnouncementModal({ 
  open, 
  onOpenChange, 
  currentEmployee 
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    title: '',
    content: '',
    severity: 'important',
    audienceMode: 'tous',
    audienceTeamNames: [],
    audienceEmployeeIds: [],
    requireAck: true,
    quickDuration: 24,
    customEndsAt: ''
  });

  // Get all employees and teams
  const { data: employees = [] } = useQuery({
    queryKey: ['allEmployees'],
    queryFn: () => base44.entities.Employee.list(),
    enabled: open
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list(),
    enabled: open
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const now = new Date();
      let endsAt;

      if (form.customEndsAt) {
        // User provided custom end date
        endsAt = new Date(form.customEndsAt);
      } else {
        // Calculate based on quick duration (in hours)
        endsAt = new Date(now.getTime() + form.quickDuration * 60 * 60 * 1000);
      }

      // Security: ensure endsAt is at least 1 hour after startsAt
      const minEndsAt = new Date(now.getTime() + 60 * 60 * 1000); // now + 1 hour
      if (endsAt <= now) {
        endsAt = minEndsAt;
        toast.warning('Date de fin ajustée à minimum 1 heure');
      }

      const announcementData = {
        title: data.title,
        content: data.content,
        severity: data.severity,
        starts_at: now.toISOString(),
        ends_at: endsAt.toISOString(),
        audience_mode: data.audienceMode,
        created_by_employee_id: currentEmployee.id,
        require_ack: data.requireAck
      };

      // Only add audience arrays if needed
      if (data.audienceMode === 'equipes' && data.audienceTeamNames.length > 0) {
        announcementData.audience_team_names = data.audienceTeamNames;
      }
      
      if (data.audienceMode === 'personnes' && data.audienceEmployeeIds.length > 0) {
        announcementData.audience_employee_ids = data.audienceEmployeeIds;
      }

      if (process.env.NODE_ENV === 'development') {
        console.log('[UrgentAnnouncements] Creating announcement:', {
          ...announcementData,
          duration_hours: form.quickDuration,
          starts_at_readable: now.toLocaleString('fr-FR'),
          ends_at_readable: endsAt.toLocaleString('fr-FR')
        });
      }

      const created = await base44.entities.UrgentAnnouncement.create(announcementData);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[UrgentAnnouncements] Announcement created:', created);
      }
      
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['urgentAnnouncements'] });
      queryClient.invalidateQueries({ queryKey: ['debugAllUrgentAnnouncements'] });
      toast.success('Annonce créée avec succès');
      resetForm();
      onOpenChange(false);
    },
    onError: (error) => {
      console.error('[UrgentAnnouncements] Error creating announcement:', error);
      toast.error('Erreur lors de la création');
    }
  });

  const resetForm = () => {
    setForm({
      title: '',
      content: '',
      severity: 'important',
      audienceMode: 'tous',
      audienceTeamNames: [],
      audienceEmployeeIds: [],
      requireAck: true,
      quickDuration: 24,
      customEndsAt: ''
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) {
      toast.error('Titre et contenu obligatoires');
      return;
    }
    createMutation.mutate(form);
  };

  const toggleTeam = (teamName) => {
    setForm(prev => ({
      ...prev,
      audienceTeamNames: prev.audienceTeamNames.includes(teamName)
        ? prev.audienceTeamNames.filter(t => t !== teamName)
        : [...prev.audienceTeamNames, teamName]
    }));
  };

  const toggleEmployee = (empId) => {
    setForm(prev => ({
      ...prev,
      audienceEmployeeIds: prev.audienceEmployeeIds.includes(empId)
        ? prev.audienceEmployeeIds.filter(id => id !== empId)
        : [...prev.audienceEmployeeIds, empId]
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>📣 Créer une annonce urgente</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <Label>Titre *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Ex: Réunion obligatoire demain"
              className="mt-1"
              required
            />
          </div>

          {/* Content */}
          <div>
            <Label>Contenu *</Label>
            <Textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="Détails de l'annonce..."
              className="mt-1 min-h-[120px]"
              required
            />
          </div>

          {/* Severity */}
          <div>
            <Label>Niveau de gravité</Label>
            <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="info">ℹ️ Information</SelectItem>
                <SelectItem value="important">⚠️ Important</SelectItem>
                <SelectItem value="critique">🚨 Critique</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Audience Mode */}
          <div>
            <Label>Ciblage</Label>
            <Select value={form.audienceMode} onValueChange={(v) => setForm({ ...form, audienceMode: v })}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Tous les employés</SelectItem>
                <SelectItem value="equipes">Équipes spécifiques</SelectItem>
                <SelectItem value="personnes">Personnes spécifiques</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Teams selection */}
          {form.audienceMode === 'equipes' && (
            <div>
              <Label>Sélectionner les équipes</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {teams.map(team => (
                  <button
                    key={team.id}
                    type="button"
                    onClick={() => toggleTeam(team.name)}
                    className={cn(
                      "px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors",
                      form.audienceTeamNames.includes(team.name)
                        ? "bg-blue-100 border-blue-500 text-blue-700"
                        : "bg-gray-50 border-gray-300 text-gray-700 hover:border-gray-400"
                    )}
                  >
                    {team.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Employees selection */}
          {form.audienceMode === 'personnes' && (
            <div>
              <Label>Sélectionner les personnes ({form.audienceEmployeeIds.length})</Label>
              <div className="mt-2 border rounded-lg max-h-64 overflow-y-auto">
                {employees.filter(e => e.is_active !== false).map(emp => (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => toggleEmployee(emp.id)}
                    className={cn(
                      "w-full px-3 py-2 text-left hover:bg-gray-50 transition-colors flex items-center gap-2 border-b",
                      form.audienceEmployeeIds.includes(emp.id) && "bg-blue-50"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={form.audienceEmployeeIds.includes(emp.id)}
                      readOnly
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-medium">{emp.first_name} {emp.last_name}</span>
                    <span className="text-xs text-gray-500">{emp.position || emp.team}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Duration */}
          <div>
            <Label>Durée d'affichage</Label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {QUICK_DURATIONS.map(dur => (
                <button
                  key={dur.hours}
                  type="button"
                  onClick={() => setForm({ ...form, quickDuration: dur.hours, customEndsAt: '' })}
                  className={cn(
                    "px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                    form.quickDuration === dur.hours && !form.customEndsAt
                      ? "bg-blue-100 border-blue-500 text-blue-700"
                      : "bg-gray-50 border-gray-300 text-gray-700 hover:border-gray-400"
                  )}
                >
                  {dur.label}
                </button>
              ))}
            </div>
            <div className="mt-2">
              <Input
                type="datetime-local"
                value={form.customEndsAt}
                onChange={(e) => setForm({ ...form, customEndsAt: e.target.value })}
                className="text-sm"
                placeholder="Ou date/heure précise"
              />
            </div>
          </div>

          {/* Require Ack */}
          <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <input
              type="checkbox"
              checked={form.requireAck}
              onChange={(e) => setForm({ ...form, requireAck: e.target.checked })}
              className="w-4 h-4"
            />
            <Label className="cursor-pointer">
              🔒 Obliger la validation "Lu" (bloquant)
            </Label>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetForm();
                onOpenChange(false);
              }}
              className="flex-1"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending}
              className="flex-1 bg-orange-600 hover:bg-orange-700"
            >
              Créer l'annonce
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}