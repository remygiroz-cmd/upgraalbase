import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { format } from 'date-fns';

const TYPE_LABELS = {
  INDISPO: '🚫 Indisponibilité',
  RDV: '📅 Rendez-vous',
  FORMATION: '📚 Formation',
  CONGE: '🏖️ Congé',
  RAPPEL: '🔔 Rappel',
  PERSO: '👤 Personnel',
  AUTRE: '📌 Autre',
};

function toLocalDatetimeValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${da}T${h}:${mi}`;
}

function toDateValue(iso) {
  if (!iso) return '';
  return iso.substring(0, 10);
}

export default function EventFormModal({ open, onClose, onSave, event, draft, employees, currentEmployee, isPrivileged }) {
  // draft = { start_at, end_at, owner_employee_id } pre-filled from cell click
  const initStart = event?.start_at
    ? (event.all_day ? toDateValue(event.start_at) : toLocalDatetimeValue(event.start_at))
    : draft?.start_at
      ? toLocalDatetimeValue(draft.start_at)
      : toLocalDatetimeValue(new Date().toISOString());
  const initEnd = event?.end_at
    ? (event.all_day ? toDateValue(event.end_at) : toLocalDatetimeValue(event.end_at))
    : draft?.end_at
      ? toLocalDatetimeValue(draft.end_at)
      : toLocalDatetimeValue(new Date(Date.now() + 3600000).toISOString());

  const [form, setForm] = useState({
    owner_employee_id: event?.owner_employee_id || draft?.owner_employee_id || currentEmployee?.id || '',
    title: event?.title || '',
    type: event?.type || 'RDV',
    start_at: initStart,
    end_at: initEnd,
    all_day: event?.all_day || false,
    importance: event?.importance || 'NORMAL',
    status: event?.status || 'CONFIRMED',
    location: event?.location || '',
    notes: event?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      const s = event?.start_at
        ? (event.all_day ? toDateValue(event.start_at) : toLocalDatetimeValue(event.start_at))
        : draft?.start_at
          ? toLocalDatetimeValue(draft.start_at)
          : toLocalDatetimeValue(new Date().toISOString());
      const e = event?.end_at
        ? (event.all_day ? toDateValue(event.end_at) : toLocalDatetimeValue(event.end_at))
        : draft?.end_at
          ? toLocalDatetimeValue(draft.end_at)
          : toLocalDatetimeValue(new Date(Date.now() + 3600000).toISOString());
      setForm({
        owner_employee_id: event?.owner_employee_id || draft?.owner_employee_id || currentEmployee?.id || '',
        title: event?.title || '',
        type: event?.type || 'RDV',
        start_at: s,
        end_at: e,
        all_day: event?.all_day || false,
        importance: event?.importance || 'NORMAL',
        status: event?.status || 'CONFIRMED',
        location: event?.location || '',
        notes: event?.notes || '',
      });
      setError('');
    }
  }, [open, event, currentEmployee]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim()) { setError('Le titre est requis.'); return; }
    if (!form.start_at || !form.end_at) { setError('Les dates sont requises.'); return; }

    let startISO, endISO;
    if (form.all_day) {
      startISO = new Date(form.start_at + 'T00:00:00').toISOString();
      const endDate = new Date(form.end_at + 'T00:00:00');
      endDate.setDate(endDate.getDate() + 1);
      endISO = endDate.toISOString();
    } else {
      startISO = new Date(form.start_at).toISOString();
      endISO = new Date(form.end_at).toISOString();
    }

    if (new Date(endISO) <= new Date(startISO)) {
      setError('La date de fin doit être après la date de début.');
      return;
    }

    setSaving(true);
    await onSave({
      ...form,
      visibility: 'INTERNAL',
      start_at: startISO,
      end_at: endISO,
      title: form.title.trim().substring(0, 80),
      location: form.location.trim().substring(0, 120),
      notes: form.notes.trim().substring(0, 2000),
    });
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{event ? 'Modifier l\'événement' : 'Nouvel événement'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {isPrivileged && employees.length > 0 && (
            <div>
              <Label>Pour l'employé</Label>
              <Select value={form.owner_employee_id} onValueChange={v => set('owner_employee_id', v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Choisir un employé" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Titre *</Label>
            <Input
              className="mt-1"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="Titre de l'événement"
              maxLength={80}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={form.type} onValueChange={v => set('type', v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Importance</Label>
              <Select value={form.importance} onValueChange={v => set('importance', v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NORMAL">Normal</SelectItem>
                  <SelectItem value="URGENT">🔴 Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={form.all_day} onCheckedChange={v => set('all_day', v)} />
            <Label>Toute la journée</Label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Début *</Label>
              <Input
                className="mt-1"
                type={form.all_day ? 'date' : 'datetime-local'}
                value={form.start_at}
                onChange={e => set('start_at', e.target.value)}
              />
            </div>
            <div>
              <Label>Fin *</Label>
              <Input
                className="mt-1"
                type={form.all_day ? 'date' : 'datetime-local'}
                value={form.end_at}
                onChange={e => set('end_at', e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Lieu</Label>
            <Input
              className="mt-1"
              value={form.location}
              onChange={e => set('location', e.target.value)}
              placeholder="Lieu (optionnel)"
              maxLength={120}
            />
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea
              className="mt-1"
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Notes additionnelles..."
              rows={3}
              maxLength={2000}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Enregistrement...' : (event ? 'Modifier' : 'Créer')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}