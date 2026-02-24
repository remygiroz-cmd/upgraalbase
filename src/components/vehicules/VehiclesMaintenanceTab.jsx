import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Wrench, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';

const defaultForm = {
  vehicule_id: '', date: moment().format('YYYY-MM-DD'), type: 'REVISION',
  description: '', garage: '', cout: '', km_au_moment: '',
  prochaine_echeance_km: '', prochaine_echeance_date: '', effectue_par: ''
};

export default function VehiclesMaintenanceTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(defaultForm);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: vehicles = [] } = useQuery({ queryKey: ['vehicles'], queryFn: () => base44.entities.Vehicle.list() });
  const { data: maintenances = [], isLoading } = useQuery({
    queryKey: ['allMaintenances'],
    queryFn: () => base44.entities.MaintenanceLog.list('-date', 200)
  });

  const vehicleMap = Object.fromEntries(vehicles.map(v => [v.id, v]));

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.vehicule_id) throw new Error('Sélectionnez un véhicule');
      const data = { ...form };
      ['cout', 'km_au_moment', 'prochaine_echeance_km'].forEach(k => {
        if (data[k]) data[k] = Number(data[k]);
        else delete data[k];
      });
      return base44.entities.MaintenanceLog.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allMaintenances'] });
      toast.success('Maintenance enregistrée');
      setShowForm(false);
      setForm(defaultForm);
    },
    onError: (e) => toast.error(e.message)
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.MaintenanceLog.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allMaintenances'] });
      toast.success('Supprimé');
    }
  });

  // Upcoming maintenances
  const upcoming = maintenances.filter(m =>
    m.prochaine_echeance_date && moment(m.prochaine_echeance_date).diff(moment(), 'days') <= 30
  );

  return (
    <div className="space-y-5 mt-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="font-bold text-gray-900">Registre de maintenance</h2>
          <p className="text-sm text-gray-500">{maintenances.length} enregistrement(s)</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-1" /> Ajouter
        </Button>
      </div>

      {/* Upcoming alerts */}
      {upcoming.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <h3 className="font-semibold text-orange-900 mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Échéances dans les 30 prochains jours
          </h3>
          <div className="space-y-1">
            {upcoming.map(m => {
              const v = vehicleMap[m.vehicule_id];
              const diff = moment(m.prochaine_echeance_date).diff(moment(), 'days');
              return (
                <div key={m.id} className="flex justify-between text-sm">
                  <span>{m.type} — {v ? `${v.marque} ${v.immatriculation}` : m.vehicule_id}</span>
                  <span className={diff <= 7 ? 'text-red-700 font-bold' : 'text-orange-700'}>Dans {diff}j</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-400">Chargement...</div>
      ) : maintenances.length === 0 ? (
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
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeColor(m.type)}`}>{m.type}</span>
                      <span className="font-medium text-gray-900">
                        {v ? `${v.marque} ${v.modele} (${v.immatriculation})` : m.vehicule_id}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{moment(m.date).format('DD/MM/YYYY')}{m.garage ? ` · ${m.garage}` : ''}</p>
                    {m.description && <p className="text-sm text-gray-700 mt-1">{m.description}</p>}
                    <div className="flex gap-4 mt-2 text-xs text-gray-500 flex-wrap">
                      {m.km_au_moment && <span>{m.km_au_moment.toLocaleString('fr-FR')} km au moment</span>}
                      {m.cout && <span className="font-medium text-gray-700">{m.cout}€</span>}
                      {m.prochaine_echeance_date && (
                        <span className={moment(m.prochaine_echeance_date).diff(moment(), 'days') <= 30 ? 'text-orange-600 font-medium' : ''}>
                          Prochaine : {moment(m.prochaine_echeance_date).format('DD/MM/YYYY')}
                        </span>
                      )}
                      {m.prochaine_echeance_km && <span>Prochain : {m.prochaine_echeance_km.toLocaleString('fr-FR')} km</span>}
                    </div>
                  </div>
                  <button onClick={() => { if (confirm('Supprimer ?')) deleteMutation.mutate(m.id); }}
                    className="text-gray-300 hover:text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Form modal */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-blue-600" /> Enregistrer une maintenance
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Véhicule *</Label>
              <Select value={form.vehicule_id} onValueChange={v => set('vehicule_id', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                <SelectContent>
                  {vehicles.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.marque} {v.modele} — {v.immatriculation}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date *</Label>
                <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Type *</Label>
                <Select value={form.type} onValueChange={v => set('type', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['REVISION', 'PNEUS', 'FREINS', 'VIDANGE', 'BATTERIE', 'CONTROLE_TECHNIQUE', 'AUTRE'].map(t => (
                      <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <textarea value={form.description} onChange={e => set('description', e.target.value)}
                rows={2} className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none" />
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
              <div>
                <Label>Km au moment</Label>
                <Input type="number" value={form.km_au_moment} onChange={e => set('km_au_moment', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Effectué par</Label>
                <Input value={form.effectue_par} onChange={e => set('effectue_par', e.target.value)} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Prochain entretien (date)</Label>
                <Input type="date" value={form.prochaine_echeance_date} onChange={e => set('prochaine_echeance_date', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Prochain entretien (km)</Label>
                <Input type="number" value={form.prochaine_echeance_km} onChange={e => set('prochaine_echeance_km', e.target.value)} className="mt-1" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="flex-1 bg-blue-600 hover:bg-blue-700">
                {createMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function typeColor(type) {
  const map = {
    REVISION: 'bg-blue-100 text-blue-800', PNEUS: 'bg-gray-100 text-gray-700',
    FREINS: 'bg-orange-100 text-orange-800', VIDANGE: 'bg-yellow-100 text-yellow-800',
    BATTERIE: 'bg-purple-100 text-purple-800', CONTROLE_TECHNIQUE: 'bg-green-100 text-green-800',
    AUTRE: 'bg-gray-100 text-gray-700'
  };
  return map[type] || 'bg-gray-100 text-gray-700';
}