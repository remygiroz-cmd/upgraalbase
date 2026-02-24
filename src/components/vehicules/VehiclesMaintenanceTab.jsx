import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Wrench, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';

const defaultForm = {
  vehicule_id: '', date: moment().format('YYYY-MM-DD'), type: 'REVISION',
  description: '', garage: '', cout: '', km_au_moment: '',
  prochaine_echeance_km: '', prochaine_echeance_date: ''
};

export default function VehiclesMaintenanceTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: maintenances = [] } = useQuery({
    queryKey: ['maintenanceLogs'],
    queryFn: () => base44.entities.MaintenanceLog.list('-date', 200)
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => base44.entities.Vehicle.list()
  });

  const vehicleMap = Object.fromEntries(vehicles.map(v => [v.id, v]));

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.vehicule_id || !form.type) throw new Error('Véhicule et type requis');
      const data = { ...form };
      ['cout', 'km_au_moment', 'prochaine_echeance_km'].forEach(k => {
        if (data[k]) data[k] = Number(data[k]);
      });
      return base44.entities.MaintenanceLog.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenanceLogs'] });
      toast.success('Maintenance enregistrée');
      setShowForm(false);
      setForm(defaultForm);
    },
    onError: e => toast.error(e.message)
  });

  const deleteMutation = useMutation({
    mutationFn: id => base44.entities.MaintenanceLog.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenanceLogs'] });
      toast.success('Supprimé');
    }
  });

  const typeIcons = {
    REVISION: '🔧', PNEUS: '🔘', FREINS: '⭕', VIDANGE: '🛢', BATTERIE: '🔋',
    CONTROLE_TECHNIQUE: '📋', AUTRE: '⚙️'
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-900">Journal de maintenance</h3>
        <Button onClick={() => setShowForm(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-1" /> Ajouter
        </Button>
      </div>

      {maintenances.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Wrench className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Aucune maintenance enregistrée</p>
        </div>
      ) : (
        <div className="space-y-2">
          {maintenances.map(m => {
            const v = vehicleMap[m.vehicule_id];
            return (
              <div key={m.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg">{typeIcons[m.type] || '⚙️'}</span>
                      <span className="font-semibold text-gray-900">{m.type}</span>
                      <span className="text-sm text-gray-500">{moment(m.date).format('DD/MM/YYYY')}</span>
                      {v && <span className="text-xs text-blue-600 font-mono">{v.immatriculation}</span>}
                    </div>
                    {m.description && <p className="text-sm text-gray-600 mt-1">{m.description}</p>}
                    <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-500">
                      {m.garage && <span>🏪 {m.garage}</span>}
                      {m.cout && <span>💰 {m.cout}€</span>}
                      {m.km_au_moment && <span>📍 {m.km_au_moment.toLocaleString('fr-FR')} km</span>}
                      {m.prochaine_echeance_date && (
                        <span className={moment(m.prochaine_echeance_date).isBefore(moment()) ? 'text-red-600 font-medium' : ''}>
                          🔔 Prochaine : {moment(m.prochaine_echeance_date).format('DD/MM/YYYY')}
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => { if (confirm('Supprimer ?')) deleteMutation.mutate(m.id); }}
                    className="p-1.5 hover:bg-red-50 rounded-lg">
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Form modal */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ajouter une maintenance</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Véhicule *</Label>
              <Select value={form.vehicule_id} onValueChange={v => set('vehicule_id', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                <SelectContent>
                  {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.marque} {v.modele} — {v.immatriculation}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type *</Label>
                <Select value={form.type} onValueChange={v => set('type', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['REVISION', 'PNEUS', 'FREINS', 'VIDANGE', 'BATTERIE', 'CONTROLE_TECHNIQUE', 'AUTRE'].map(t => (
                      <SelectItem key={t} value={t}>{typeIcons[t]} {t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date *</Label>
                <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Input value={form.description} onChange={e => set('description', e.target.value)} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Garage</Label>
                <Input value={form.garage} onChange={e => set('garage', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Coût (€)</Label>
                <Input type="number" value={form.cout} onChange={e => set('cout', e.target.value)} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Km au moment</Label>
                <Input type="number" value={form.km_au_moment} onChange={e => set('km_au_moment', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Prochaine échéance (date)</Label>
                <Input type="date" value={form.prochaine_echeance_date} onChange={e => set('prochaine_echeance_date', e.target.value)} className="mt-1" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="flex-1">
                Enregistrer
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}