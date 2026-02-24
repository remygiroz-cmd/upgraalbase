import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

export default function VehicleCheckModal({ open, onOpenChange, type, assignment, vehicle, employee }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({});
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const isElectrique = vehicle?.energie === 'ELECTRIQUE';
  const isThermique = vehicle?.energie === 'THERMIQUE';

  const isDebutShift = type === 'DEBUT_SHIFT';
  const isFinRun = type === 'FIN_RUN';
  const isFinService = type === 'FIN_SERVICE';

  const mutation = useMutation({
    mutationFn: async () => {
      // Validations
      if (isDebutShift) {
        if (!form.km_debut) throw new Error('Kilométrage de début obligatoire.');
        if (!form.check_visuel_pneus) throw new Error('Vérification pneus obligatoire.');
        if (!form.check_voyants) throw new Error('Vérification voyants obligatoire.');
        if (!form.check_carrosserie) throw new Error('Vérification carrosserie obligatoire.');
        if (!form.confirmation_vehicule_ok) throw new Error('Confirmation que le véhicule est en état de marche obligatoire.');
      }
      if (isFinRun) {
        if (!form.km_fin) throw new Error('Kilométrage fin de run obligatoire.');
        if (Number(form.km_fin) < Number(assignment.km_debut || 0)) throw new Error('Km fin doit être ≥ km début.');
      }
      if (isFinService) {
        if (isElectrique && form.branche_en_charge === undefined) throw new Error('Indiquer si le véhicule est branché en charge.');
        if (isThermique && !form.niveau_carburant) throw new Error('Niveau de carburant obligatoire.');
        if (!form.cle_remise_en_place) throw new Error('Confirmation de remise de clé obligatoire.');
        if (!form.validation_finale) throw new Error('Validation finale obligatoire.');
      }

      const checkData = {
        type,
        assignment_id: assignment.id,
        vehicule_id: assignment.vehicule_id,
        employe_id: employee?.id || assignment.employe_id,
        employe_name: employee ? `${employee.first_name} ${employee.last_name}` : assignment.employe_name,
        date_heure: new Date().toISOString(),
        ...form,
        km_debut: form.km_debut ? Number(form.km_debut) : undefined,
        km_fin: form.km_fin ? Number(form.km_fin) : undefined,
        charge_restante_pct: form.charge_restante_pct ? Number(form.charge_restante_pct) : undefined,
      };

      await base44.entities.VehicleCheck.create(checkData);

      // Update assignment
      const updates = {};
      if (isDebutShift) {
        updates.debut_shift_fait = true;
        updates.km_debut = Number(form.km_debut);
        updates.statut = 'EN_COURS';
      }
      if (isFinRun && form.km_fin) {
        updates.km_fin = Number(form.km_fin);
        const dist = Number(form.km_fin) - (assignment.km_debut || 0);
        updates.distance_calculee = dist > 0 ? dist : 0;
      }
      if (isFinService) {
        updates.fin_service_fait = true;
        updates.cle_remise = !!form.cle_remise_en_place;
        updates.statut = 'TERMINE';
        // Update vehicle km
        if (form.km_fin) {
          await base44.entities.Vehicle.update(assignment.vehicule_id, { km_actuel: Number(form.km_fin) });
        }
      }
      if (Object.keys(updates).length > 0) {
        await base44.entities.VehicleAssignment.update(assignment.id, updates);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['myAssignment'] });
      const labels = { DEBUT_SHIFT: 'Check début de shift', FIN_RUN: 'Check fin de run', FIN_SERVICE: 'Check fin de service' };
      toast.success(`✅ ${labels[type]} validé`);
      setForm({});
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message)
  });

  const typeLabels = { DEBUT_SHIFT: '🚀 Début de shift', FIN_RUN: '🔄 Fin de run', FIN_SERVICE: '🏁 Fin de service' };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">{typeLabels[type]}</DialogTitle>
          {vehicle && <p className="text-sm text-gray-500">{vehicle.marque} {vehicle.modele} — {vehicle.immatriculation}</p>}
        </DialogHeader>

        <div className="space-y-4">

          {/* DÉBUT DE SHIFT */}
          {isDebutShift && (
            <>
              <div>
                <Label>Kilométrage de début *</Label>
                <Input type="number" value={form.km_debut || ''} onChange={e => set('km_debut', e.target.value)}
                  placeholder="Ex: 45230" className="mt-1" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { key: 'check_visuel_pneus', label: '🔘 Pneus', opts: ['OK', 'DEFAUT'] },
                  { key: 'check_voyants', label: '💡 Voyants', opts: ['OK', 'ANOMALIE'] },
                  { key: 'check_carrosserie', label: '🚗 Carrosserie', opts: ['OK', 'DOMMAGE'] }
                ].map(({ key, label, opts }) => (
                  <div key={key}>
                    <Label className="text-xs">{label} *</Label>
                    <Select value={form[key] || ''} onValueChange={v => set(key, v)}>
                      <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {opts.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer bg-green-50">
                <input type="checkbox" checked={!!form.confirmation_vehicule_ok} onChange={e => set('confirmation_vehicule_ok', e.target.checked)} className="mt-0.5 w-4 h-4" />
                <div>
                  <span className="text-sm font-medium">Véhicule en état de marche *</span>
                  <p className="text-xs text-gray-500">Je confirme que le véhicule est en état pour prendre la route.</p>
                </div>
              </label>
            </>
          )}

          {/* FIN DE RUN */}
          {isFinRun && (
            <>
              <div>
                <Label>Kilométrage fin de run *</Label>
                <Input type="number" value={form.km_fin || ''} onChange={e => set('km_fin', e.target.value)}
                  placeholder="Ex: 45380" className="mt-1" />
                {assignment?.km_debut && <p className="text-xs text-gray-400 mt-1">Km de début : {assignment.km_debut}</p>}
              </div>
              {[
                { key: 'etat_pneus', label: 'État pneus', opts: ['BON', 'USAGE', 'CRITIQUE'] },
                { key: 'etat_freins', label: 'État freins', opts: ['BON', 'USAGE', 'CRITIQUE'] },
                { key: 'etat_carrosserie', label: 'État carrosserie', opts: ['BON', 'RAYE', 'ENDOMMAGE'] },
              ].map(({ key, label, opts }) => (
                <div key={key}>
                  <Label className="text-sm">{label}</Label>
                  <Select value={form[key] || ''} onValueChange={v => set(key, v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                    <SelectContent>{opts.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ))}
              <div>
                <Label>Incident éventuel</Label>
                <textarea value={form.incidents || ''} onChange={e => set('incidents', e.target.value)}
                  rows={2} placeholder="Décrire si incident..."
                  className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none" />
              </div>
            </>
          )}

          {/* FIN DE SERVICE */}
          {isFinService && (
            <>
              <div>
                <Label>Kilométrage fin de service</Label>
                <Input type="number" value={form.km_fin || ''} onChange={e => set('km_fin', e.target.value)}
                  placeholder="Ex: 45600" className="mt-1" />
              </div>
              {isElectrique && (
                <>
                  <div>
                    <Label>Charge restante (%)</Label>
                    <Input type="number" min="0" max="100" value={form.charge_restante_pct || ''} onChange={e => set('charge_restante_pct', e.target.value)} className="mt-1" />
                  </div>
                  <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer bg-blue-50">
                    <input type="checkbox" checked={!!form.branche_en_charge} onChange={e => set('branche_en_charge', e.target.checked)} className="w-4 h-4" />
                    <span className="text-sm font-medium">⚡ Branché en charge *</span>
                  </label>
                </>
              )}
              {isThermique && (
                <div>
                  <Label>Niveau carburant *</Label>
                  <Select value={form.niveau_carburant || ''} onValueChange={v => set('niveau_carburant', v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                    <SelectContent>
                      {['PLEIN', '3/4', '1/2', '1/4', 'RESERVE'].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer bg-yellow-50">
                <input type="checkbox" checked={!!form.cle_remise_en_place} onChange={e => set('cle_remise_en_place', e.target.checked)} className="mt-0.5 w-4 h-4" />
                <div>
                  <span className="text-sm font-medium">🔑 Clé remise en place *</span>
                  <p className="text-xs text-gray-500">J'ai remis les clés à l'endroit prévu.</p>
                </div>
              </label>
              <div>
                <Label>Incident éventuel</Label>
                <textarea value={form.incidents || ''} onChange={e => set('incidents', e.target.value)} rows={2}
                  placeholder="Décrire si incident..."
                  className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none" />
              </div>
              <label className="flex items-start gap-3 p-4 border-2 border-green-400 rounded-lg cursor-pointer bg-green-50">
                <input type="checkbox" checked={!!form.validation_finale} onChange={e => set('validation_finale', e.target.checked)} className="mt-0.5 w-4 h-4" />
                <div>
                  <span className="text-sm font-bold text-green-900">✅ Validation finale *</span>
                  <p className="text-xs text-gray-600 mt-0.5">Je confirme avoir effectué toutes les vérifications de fin de service.</p>
                </div>
              </label>
            </>
          )}

          <div className="flex gap-3 pt-2">
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="flex-1 bg-green-600 hover:bg-green-700">
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {mutation.isPending ? 'Validation...' : 'Valider le check'}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}