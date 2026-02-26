import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Car } from 'lucide-react';

const CARD_COLORS = [
  { label: 'Aucune', value: '' },
  { label: 'Rouge', value: '#ef4444' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Jaune', value: '#eab308' },
  { label: 'Vert', value: '#22c55e' },
  { label: 'Bleu', value: '#3b82f6' },
  { label: 'Violet', value: '#a855f7' },
  { label: 'Rose', value: '#ec4899' },
  { label: 'Gris', value: '#6b7280' },
  { label: 'Marron', value: '#92400e' },
  { label: 'Cyan', value: '#06b6d4' },
];

const defaultForm = {
  type_usage: 'LIVRAISON', energie: 'THERMIQUE', propriete: 'SOCIETE',
  statut: 'ACTIF', marque: '', modele: '', immatriculation: '', couleur: '', card_color: '',
  numero: '', annee: new Date().getFullYear(), km_initial: 0, km_actuel: 0,
  loa_date_debut: '', loa_date_fin: '', loa_km_total_autorises: '',
  loa_cout_km_supp: '', batterie_capacite_kwh: '', type_prise: '',
  carburant_type: 'DIESEL', photo_url: '', notes: '',
  date_montage_pneus: '', km_montage_pneus: '', seuil_alerte_km_pneus: ''
};

export default function VehicleFormModal({ open, onOpenChange, vehicle = null }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(defaultForm);

  useEffect(() => {
    if (open) {
      setForm(vehicle ? { ...defaultForm, ...vehicle } : defaultForm);
    }
  }, [open, vehicle]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const mutation = useMutation({
    mutationFn: async () => {
      const data = { ...form };
      if (!data.marque || !data.modele || !data.immatriculation) {
        throw new Error('Marque, modèle et immatriculation sont obligatoires.');
      }
      // Convert numeric fields: empty string → remove key, otherwise parse as number
      ['numero', 'km_initial', 'km_actuel', 'loa_km_total_autorises', 'loa_cout_km_supp',
        'batterie_capacite_kwh', 'km_montage_pneus', 'seuil_alerte_km_pneus', 'annee']
        .forEach(k => {
          if (data[k] === '' || data[k] === null || data[k] === undefined) {
            delete data[k];
          } else {
            data[k] = Number(data[k]);
          }
        });
      // Remove empty string date/string fields
      ['loa_date_debut', 'loa_date_fin', 'date_mise_en_service', 'date_montage_pneus',
      'couleur', 'card_color', 'photo_url', 'notes', 'type_prise', 'carburant_type']
      .forEach(k => { if (data[k] === '') delete data[k]; });

      if (vehicle?.id) {
        return base44.entities.Vehicle.update(vehicle.id, data);
      }
      return base44.entities.Vehicle.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      toast.success(vehicle ? 'Véhicule mis à jour' : 'Véhicule créé');
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message)
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="w-5 h-5 text-blue-600" />
            {vehicle ? 'Modifier le véhicule' : 'Ajouter un véhicule'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Identité */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Identité</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Numéro du véhicule</Label>
                <Input type="number" value={form.numero} onChange={e => set('numero', e.target.value)} placeholder="Ex: 1, 2, 3..." className="mt-1 w-32" />
              </div>
              <div>
                <Label>Marque *</Label>
                <Input value={form.marque} onChange={e => set('marque', e.target.value)} placeholder="Ex: Renault" className="mt-1" />
              </div>
              <div>
                <Label>Modèle *</Label>
                <Input value={form.modele} onChange={e => set('modele', e.target.value)} placeholder="Ex: Kangoo" className="mt-1" />
              </div>
              <div>
                <Label>Immatriculation *</Label>
                <Input value={form.immatriculation} onChange={e => set('immatriculation', e.target.value.toUpperCase())} placeholder="AB-123-CD" className="mt-1 font-mono" />
              </div>
              <div>
                <Label>Couleur</Label>
                <Input value={form.couleur} onChange={e => set('couleur', e.target.value)} placeholder="Blanc" className="mt-1" />
              </div>
              <div className="col-span-2">
                <Label>Couleur de la clé (fond de carte)</Label>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {CARD_COLORS.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => set('card_color', c.value)}
                      className={`w-8 h-8 rounded-full border-2 transition-all flex items-center justify-center ${form.card_color === c.value ? 'border-gray-900 scale-110' : 'border-gray-300'}`}
                      style={c.value ? { backgroundColor: c.value } : { backgroundColor: '#f3f4f6' }}
                      title={c.label}
                    >
                      {!c.value && <span className="text-gray-400 text-xs">✕</span>}
                    </button>
                  ))}
                  {form.card_color && (
                    <span className="text-xs text-gray-500 ml-1">
                      Aperçu : <span className="inline-block px-2 py-0.5 rounded font-medium" style={{ backgroundColor: form.card_color + '33', border: `1px solid ${form.card_color}` }}>Carte</span>
                    </span>
                  )}
                </div>
              </div>
              <div>
                <Label>Année</Label>
                <Input type="number" value={form.annee} onChange={e => set('annee', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Date mise en service</Label>
                <Input type="date" value={form.date_mise_en_service || ''} onChange={e => set('date_mise_en_service', e.target.value)} className="mt-1" />
              </div>
            </div>
          </section>

          {/* Classification */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Classification</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Usage</Label>
                <Select value={form.type_usage} onValueChange={v => set('type_usage', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LIVRAISON">🚚 Livraison</SelectItem>
                    <SelectItem value="DIRECTION">🚘 Direction</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Énergie</Label>
                <Select value={form.energie} onValueChange={v => set('energie', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ELECTRIQUE">⚡ Électrique</SelectItem>
                    <SelectItem value="THERMIQUE">⛽ Thermique</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Propriété</Label>
                <Select value={form.propriete} onValueChange={v => set('propriete', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SOCIETE">🏢 Société</SelectItem>
                    <SelectItem value="LOA">📋 LOA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-3">
              <Label>Statut</Label>
              <Select value={form.statut} onValueChange={v => set('statut', v)}>
                <SelectTrigger className="mt-1 w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIF">✅ Actif</SelectItem>
                  <SelectItem value="INDISPONIBLE">🔴 Indisponible</SelectItem>
                  <SelectItem value="ATELIER">🔧 Atelier</SelectItem>
                  <SelectItem value="RESERVE">🔵 Réserve</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>

          {/* Kilométrage */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Kilométrage</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Km initial (à l'entrée)</Label>
                <Input type="number" value={form.km_initial} onChange={e => set('km_initial', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Km actuel</Label>
                <Input type="number" value={form.km_actuel} onChange={e => set('km_actuel', e.target.value)} className="mt-1" />
              </div>
            </div>
          </section>

          {/* LOA */}
          {form.propriete === 'LOA' && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Contrat LOA</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Date début LOA</Label>
                  <Input type="date" value={form.loa_date_debut} onChange={e => set('loa_date_debut', e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Date fin LOA</Label>
                  <Input type="date" value={form.loa_date_fin} onChange={e => set('loa_date_fin', e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Km total autorisés</Label>
                  <Input type="number" value={form.loa_km_total_autorises} onChange={e => set('loa_km_total_autorises', e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Coût km supplémentaire (€)</Label>
                  <Input type="number" step="0.01" value={form.loa_cout_km_supp} onChange={e => set('loa_cout_km_supp', e.target.value)} className="mt-1" />
                </div>
              </div>
            </section>
          )}

          {/* Électrique */}
          {form.energie === 'ELECTRIQUE' && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Batterie</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Capacité (kWh)</Label>
                  <Input type="number" value={form.batterie_capacite_kwh} onChange={e => set('batterie_capacite_kwh', e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Type de prise</Label>
                  <Select value={form.type_prise} onValueChange={v => set('type_prise', v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TYPE2">Type 2</SelectItem>
                      <SelectItem value="CCS">CCS</SelectItem>
                      <SelectItem value="CHADEMO">CHAdeMO</SelectItem>
                      <SelectItem value="AUTRE">Autre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>
          )}

          {/* Thermique */}
          {form.energie === 'THERMIQUE' && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Carburant</h3>
              <div>
                <Label>Type carburant</Label>
                <Select value={form.carburant_type} onValueChange={v => set('carburant_type', v)}>
                  <SelectTrigger className="mt-1 w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DIESEL">Diesel</SelectItem>
                    <SelectItem value="ESSENCE">Essence</SelectItem>
                    <SelectItem value="GPL">GPL</SelectItem>
                    <SelectItem value="AUTRE">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </section>
          )}

          {/* Pneus */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Pneus</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Date montage</Label>
                <Input type="date" value={form.date_montage_pneus} onChange={e => set('date_montage_pneus', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Km au montage</Label>
                <Input type="number" value={form.km_montage_pneus} onChange={e => set('km_montage_pneus', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Seuil alerte (km)</Label>
                <Input type="number" value={form.seuil_alerte_km_pneus} onChange={e => set('seuil_alerte_km_pneus', e.target.value)} placeholder="Ex: 40000" className="mt-1" />
              </div>
            </div>
          </section>

          {/* Photo & notes */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Photo & Notes</h3>
            <div className="space-y-3">
              <div>
                <Label>URL photo</Label>
                <Input value={form.photo_url} onChange={e => set('photo_url', e.target.value)} placeholder="https://..." className="mt-1" />
              </div>
              <div>
                <Label>Notes internes</Label>
                <textarea
                  value={form.notes}
                  onChange={e => set('notes', e.target.value)}
                  rows={3}
                  className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Remarques, historique particulier..."
                />
              </div>
            </div>
          </section>
        </div>

        <div className="flex gap-3 pt-4 border-t mt-4">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="flex-1 bg-blue-600 hover:bg-blue-700">
            {mutation.isPending ? 'Enregistrement...' : vehicle ? 'Mettre à jour' : 'Créer le véhicule'}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}