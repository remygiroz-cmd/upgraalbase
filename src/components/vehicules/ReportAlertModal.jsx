import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Upload, X } from 'lucide-react';

const CATEGORIES = [
  { value: 'PNEUS', label: '🔧 Pneus' },
  { value: 'FREINS', label: '🛑 Freins' },
  { value: 'VOYANTS', label: '⚠️ Voyants' },
  { value: 'CARROSSERIE', label: '🚗 Carrosserie' },
  { value: 'MOTEUR', label: '⚙️ Moteur / Mécanique' },
  { value: 'BATTERIE_CHARGE', label: '🔋 Batterie / Charge' },
  { value: 'CARBURANT', label: '⛽ Carburant' },
  { value: 'SECURITE', label: '🔐 Sécurité' },
  { value: 'DOCUMENTS', label: '📄 Documents' },
  { value: 'AUTRE', label: '❓ Autre' },
];

const WHEN_OPTIONS = [
  { value: 'DEBUT_SHIFT', label: 'Début de shift' },
  { value: 'PENDANT_SHIFT', label: 'Pendant le shift' },
  { value: 'FIN_SHIFT', label: 'Fin de shift' },
  { value: 'HORS_SHIFT', label: 'Hors shift' },
];

export default function ReportAlertModal({ open, onOpenChange, vehicle, assignment, currentUser, currentEmployee, vehicles = [] }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    vehicle_id: vehicle?.id || '',
    category: '',
    severity: 'IMPORTANT',
    title: '',
    description: '',
    when_context: 'PENDANT_SHIFT',
    location_context: '',
    vehicle_drivable: true,
    impact: 'NON_BLOQUANT',
    photos: [],
  });
  const [uploading, setUploading] = useState(false);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const mutation = useMutation({
    mutationFn: async (data) => {
      const alert = await base44.entities.VehicleAlert.create({
        ...data,
        reported_by_user_id: currentUser?.id || currentUser?.email || '',
        reported_by_employee_id: currentEmployee?.id || '',
        reported_by_name: currentEmployee ? `${currentEmployee.first_name} ${currentEmployee.last_name}` : currentUser?.email,
        reported_at: new Date().toISOString(),
        status: 'OPEN',
        assignment_id: assignment?.id || '',
      });

      // Auto-set vehicle unavailable if URGENT + non-drivable
      if (data.severity === 'URGENT' && data.vehicle_drivable === false) {
        await base44.entities.Vehicle.update(data.vehicle_id, { statut: 'INDISPONIBLE' });
      }

      return alert;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicleAlerts'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      toast.success('Alerte envoyée au manager ✅');
      onOpenChange(false);
      setForm({
        vehicle_id: vehicle?.id || '',
        category: '', severity: 'IMPORTANT', title: '', description: '',
        when_context: 'PENDANT_SHIFT', location_context: '',
        vehicle_drivable: true, impact: 'NON_BLOQUANT', photos: [],
      });
    },
    onError: () => toast.error('Erreur lors de l\'envoi'),
  });

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      set('photos', [...form.photos, file_url]);
    } catch {
      toast.error('Erreur upload photo');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.vehicle_id || !form.category || !form.title || !form.description) {
      toast.error('Veuillez remplir tous les champs obligatoires');
      return;
    }
    mutation.mutate(form);
  };

  const selectedVehicle = vehicles.find(v => v.id === form.vehicle_id) || vehicle;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-5 h-5" />
            Signaler un problème
          </DialogTitle>
          {selectedVehicle && (
            <p className="text-sm text-gray-500 font-mono mt-1">
              {selectedVehicle.marque} {selectedVehicle.modele} — {selectedVehicle.immatriculation}
            </p>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Véhicule si pas pré-rempli */}
          {!vehicle && (
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1">Véhicule *</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.vehicle_id}
                onChange={e => set('vehicle_id', e.target.value)}
                required
              >
                <option value="">— Sélectionner —</option>
                {vehicles.filter(v => v.type_usage === 'LIVRAISON').map(v => (
                  <option key={v.id} value={v.id}>{v.marque} {v.modele} — {v.immatriculation}</option>
                ))}
              </select>
            </div>
          )}

          {/* Catégorie */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1">Catégorie *</label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map(c => (
                <button key={c.value} type="button"
                  onClick={() => set('category', c.value)}
                  className={`text-left text-xs px-3 py-2 rounded-lg border transition-all ${form.category === c.value ? 'border-blue-500 bg-blue-50 text-blue-800 font-semibold' : 'border-gray-200 hover:bg-gray-50'}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Gravité */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1">Gravité *</label>
            <div className="flex gap-2">
              {[{ v: 'INFO', label: 'ℹ️ Info', cls: 'border-blue-300 bg-blue-50 text-blue-800' },
                { v: 'IMPORTANT', label: '🟠 Important', cls: 'border-orange-300 bg-orange-50 text-orange-800' },
                { v: 'URGENT', label: '🔴 URGENT', cls: 'border-red-400 bg-red-50 text-red-800' }
              ].map(({ v, label, cls }) => (
                <button key={v} type="button"
                  onClick={() => set('severity', v)}
                  className={`flex-1 text-xs px-3 py-2 rounded-lg border font-semibold transition-all ${form.severity === v ? cls : 'border-gray-200 hover:bg-gray-50'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Peut rouler + Impact */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1">Le véhicule peut rouler ?</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => set('vehicle_drivable', true)}
                  className={`flex-1 text-xs px-3 py-2 rounded-lg border ${form.vehicle_drivable ? 'bg-green-100 border-green-400 text-green-800 font-semibold' : 'border-gray-200'}`}>
                  ✅ Oui
                </button>
                <button type="button" onClick={() => set('vehicle_drivable', false)}
                  className={`flex-1 text-xs px-3 py-2 rounded-lg border ${!form.vehicle_drivable ? 'bg-red-100 border-red-400 text-red-800 font-semibold' : 'border-gray-200'}`}>
                  ❌ Non
                </button>
              </div>
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1">Impact</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => set('impact', 'NON_BLOQUANT')}
                  className={`flex-1 text-xs px-3 py-2 rounded-lg border ${form.impact === 'NON_BLOQUANT' ? 'bg-orange-100 border-orange-400 text-orange-800 font-semibold' : 'border-gray-200'}`}>
                  Mineur
                </button>
                <button type="button" onClick={() => set('impact', 'BLOQUANT')}
                  className={`flex-1 text-xs px-3 py-2 rounded-lg border ${form.impact === 'BLOQUANT' ? 'bg-red-100 border-red-400 text-red-800 font-semibold' : 'border-gray-200'}`}>
                  Bloquant
                </button>
              </div>
            </div>
          </div>

          {/* Quand */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1">Quand ?</label>
            <div className="flex gap-2 flex-wrap">
              {WHEN_OPTIONS.map(w => (
                <button key={w.value} type="button" onClick={() => set('when_context', w.value)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${form.when_context === w.value ? 'bg-blue-100 border-blue-400 text-blue-800 font-semibold' : 'border-gray-200 hover:bg-gray-50'}`}>
                  {w.label}
                </button>
              ))}
            </div>
          </div>

          {/* Où */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1">Où ? (parking, adresse...)</label>
            <input type="text" value={form.location_context} onChange={e => set('location_context', e.target.value)}
              placeholder="Ex: Parking entrepôt, Rue de Paris..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>

          {/* Titre */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1">Titre court *</label>
            <input type="text" value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="Ex: Pneu avant gauche à plat"
              required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1">Description détaillée *</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="Décrivez précisément le problème observé..."
              rows={3} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none" />
          </div>

          {/* Photos */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1">Photos</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {form.photos.map((url, i) => (
                <div key={i} className="relative">
                  <img src={url} alt="" className="w-16 h-16 object-cover rounded-lg border" />
                  <button type="button" onClick={() => set('photos', form.photos.filter((_, j) => j !== i))}
                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
              <label className="w-16 h-16 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer hover:bg-gray-50">
                {uploading ? <span className="text-xs text-gray-400">...</span> : <Upload className="w-5 h-5 text-gray-400" />}
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploading} />
              </label>
            </div>
          </div>

          {form.severity === 'URGENT' && !form.vehicle_drivable && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
              ⚠️ Le véhicule sera automatiquement mis en statut <strong>INDISPONIBLE</strong> après envoi.
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Annuler
            </Button>
            <Button type="submit" disabled={mutation.isPending} className="flex-1 bg-red-600 hover:bg-red-700 text-white">
              {mutation.isPending ? 'Envoi...' : '🚨 Envoyer le signalement'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}