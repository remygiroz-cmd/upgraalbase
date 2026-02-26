import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { CheckCircle2, Camera, AlertTriangle } from 'lucide-react';

export default function VehicleCheckModal({ open, onOpenChange, type, assignment, vehicle, currentEmployee, onComplete }) {
  const queryClient = useQueryClient();
  const isElectrique = vehicle?.energie === 'ELECTRIQUE';

  const [form, setForm] = useState({
    km_debut: assignment?.km_debut || '',
    km_fin: '',
    check_visuel_pneus: 'OK',
    check_voyants: 'OK',
    check_carrosserie: 'OK',
    confirmation_vehicule_ok: false,
    etat_pneus: 'BON',
    etat_freins: 'BON',
    etat_carrosserie: 'BON',
    branche_en_charge: false,
    charge_restante_pct: '',
    niveau_carburant: 'PLEIN',
    cle_remise_en_place: false,
    validation_finale: false,
    incidents: '',
    tags_incidents: []
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const INCIDENT_TAGS = ['RAYURE', 'CHOC', 'PNEU_PLAT', 'VOYANT_ALLUME', 'VITRE_CASSEE', 'AUTRE'];

  const toggleTag = (tag) => {
    set('tags_incidents', form.tags_incidents.includes(tag)
      ? form.tags_incidents.filter(t => t !== tag)
      : [...form.tags_incidents, tag]);
  };

  const canSubmit = () => {
    if (type === 'DEBUT_SHIFT') {
      return form.km_debut !== '' && form.confirmation_vehicule_ok;
    }
    if (type === 'FIN_SERVICE') {
      if (!form.cle_remise_en_place || !form.validation_finale) return false;
      if (isElectrique && form.charge_restante_pct === '') return false;
      if (!isElectrique && !form.niveau_carburant) return false;
      return true;
    }
    if (type === 'FIN_RUN') {
      return form.km_fin !== '' && Number(form.km_fin) >= Number(form.km_debut || 0);
    }
    return true;
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!canSubmit()) throw new Error('Remplissez tous les champs obligatoires.');

      const checkData = {
        type,
        assignment_id: assignment.id,
        vehicule_id: assignment.vehicule_id,
        employe_id: currentEmployee.id,
        employe_name: `${currentEmployee.first_name} ${currentEmployee.last_name}`,
        date_heure: new Date().toISOString(),
        ...form,
        km_debut: form.km_debut ? Number(form.km_debut) : undefined,
        km_fin: form.km_fin ? Number(form.km_fin) : undefined,
        charge_restante_pct: form.charge_restante_pct ? Number(form.charge_restante_pct) : undefined,
      };

      await base44.entities.VehicleCheck.create(checkData);

      // Update assignment flags + vehicle km
      const updates = {};
      if (type === 'DEBUT_SHIFT') {
        updates.debut_shift_fait = true;
        updates.km_debut = Number(form.km_debut);
        updates.statut = 'EN_COURS';
        await base44.entities.Vehicle.update(assignment.vehicule_id, { km_actuel: Number(form.km_debut) });
      }
      if (type === 'FIN_SERVICE') {
        updates.fin_service_fait = true;
        updates.cle_remise = form.cle_remise_en_place;
        updates.statut = 'TERMINE';
        if (form.km_fin) {
          updates.km_fin = Number(form.km_fin);
          updates.distance_calculee = Number(form.km_fin) - Number(assignment.km_debut || 0);
          await base44.entities.Vehicle.update(assignment.vehicule_id, { km_actuel: Number(form.km_fin) });
        }
      }
      if (type === 'FIN_RUN') {
        updates.km_fin = Number(form.km_fin);
        updates.distance_calculee = Number(form.km_fin) - Number(assignment.km_debut || 0);
        if (form.tags_incidents?.length > 0 || form.incidents) {
          updates.non_conformite = true;
        }
      }

      await base44.entities.VehicleAssignment.update(assignment.id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicleChecks', assignment.id] });
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['driverAssignment'] });
      toast.success('Check enregistré ✅');
      onComplete();
    },
    onError: (e) => toast.error(e.message)
  });

  const typeLabel = {
    DEBUT_SHIFT: '🚗 Check Début de Shift',
    FIN_RUN: '🔄 Check Fin de Run',
    FIN_SERVICE: '🔑 Check Fin de Service'
  }[type];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{typeLabel}</DialogTitle>
          <p className="text-sm text-gray-500">
            {vehicle?.marque} {vehicle?.modele} — {vehicle?.immatriculation}
          </p>
        </DialogHeader>

        <div className="space-y-5">
          {/* DEBUT SHIFT */}
          {type === 'DEBUT_SHIFT' && (
            <>
              <Field label="Km au départ *">
                <Input type="number" value={form.km_debut} onChange={e => set('km_debut', e.target.value)} placeholder="Ex: 45230" />
              </Field>

              <div className="grid grid-cols-3 gap-3">
                <RadioField label="Pneus" options={['OK', 'DEFAUT']} value={form.check_visuel_pneus} onChange={v => set('check_visuel_pneus', v)} />
                <RadioField label="Voyants" options={['OK', 'ANOMALIE']} value={form.check_voyants} onChange={v => set('check_voyants', v)} />
                <RadioField label="Carrosserie" options={['OK', 'DOMMAGE']} value={form.check_carrosserie} onChange={v => set('check_carrosserie', v)} />
              </div>

              {(form.check_visuel_pneus !== 'OK' || form.check_voyants !== 'OK' || form.check_carrosserie !== 'OK') && (
                <div>
                  <Label>Détail anomalie</Label>
                  <textarea value={form.incidents} onChange={e => set('incidents', e.target.value)}
                    className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none"
                    rows={2} placeholder="Décrire l'anomalie constatée..." />
                </div>
              )}

              <CheckboxField
                checked={form.confirmation_vehicule_ok}
                onChange={v => set('confirmation_vehicule_ok', v)}
                label="Je confirme avoir inspecté le véhicule et qu'il est en état de marche *"
              />
            </>
          )}

          {/* FIN RUN */}
          {type === 'FIN_RUN' && (
            <>
              <Field label="Km compteur *">
                <Input type="number" value={form.km_fin} onChange={e => set('km_fin', e.target.value)} />
              </Field>

              <div className="grid grid-cols-3 gap-3">
                <SelectField label="Pneus" options={['BON', 'USAGE', 'CRITIQUE']} value={form.etat_pneus} onChange={v => set('etat_pneus', v)} />
                <SelectField label="Freins" options={['BON', 'USAGE', 'CRITIQUE']} value={form.etat_freins} onChange={v => set('etat_freins', v)} />
                <SelectField label="Carrosserie" options={['BON', 'RAYE', 'ENDOMMAGE']} value={form.etat_carrosserie} onChange={v => set('etat_carrosserie', v)} />
              </div>

              <div>
                <Label className="mb-2 block">Tags incidents</Label>
                <div className="flex flex-wrap gap-2">
                  {INCIDENT_TAGS.map(tag => (
                    <button key={tag} onClick={() => toggleTag(tag)}
                      className={`text-xs px-2 py-1 rounded-full border transition-all ${
                        form.tags_incidents.includes(tag)
                          ? 'bg-red-500 text-white border-red-500'
                          : 'border-gray-300 text-gray-600 hover:border-red-400'
                      }`}>{tag.replace('_', ' ')}</button>
                  ))}
                </div>
              </div>

              {form.tags_incidents.length > 0 && (
                <Field label="Description incident">
                  <textarea value={form.incidents} onChange={e => set('incidents', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none"
                    rows={2} />
                </Field>
              )}
            </>
          )}

          {/* FIN SERVICE */}
          {type === 'FIN_SERVICE' && (
            <>
              <Field label="Km compteur final">
                <Input type="number" value={form.km_fin} onChange={e => set('km_fin', e.target.value)} />
              </Field>

              {isElectrique ? (
                <>
                  <CheckboxField
                    checked={form.branche_en_charge}
                    onChange={v => set('branche_en_charge', v)}
                    label="🔌 Véhicule branché en charge *"
                  />
                  <Field label="🔋 Charge restante (%) *">
                    <Input type="number" min="0" max="100" value={form.charge_restante_pct}
                      onChange={e => set('charge_restante_pct', e.target.value)} placeholder="Ex: 45" />
                  </Field>
                </>
              ) : (
                <div>
                  <Label>⛽ Niveau carburant *</Label>
                  <div className="grid grid-cols-5 gap-2 mt-2">
                    {['PLEIN', '3/4', '1/2', '1/4', 'RESERVE'].map(lvl => (
                      <button key={lvl} onClick={() => set('niveau_carburant', lvl)}
                        className={`text-xs py-2 rounded-lg border transition-all ${
                          form.niveau_carburant === lvl
                            ? lvl === 'RESERVE' ? 'bg-red-500 text-white border-red-500' : 'bg-blue-500 text-white border-blue-500'
                            : 'border-gray-300 text-gray-600 hover:border-blue-400'
                        }`}>{lvl}</button>
                    ))}
                  </div>
                </div>
              )}

              <CheckboxField
                checked={form.cle_remise_en_place}
                onChange={v => set('cle_remise_en_place', v)}
                label="🔑 Clé remise en place (coffre / bureau) *"
              />

              <CheckboxField
                checked={form.validation_finale}
                onChange={v => set('validation_finale', v)}
                label="✅ Je valide avoir effectué toutes les actions de fin de service *"
              />
            </>
          )}

          {/* Submit */}
          <div className="flex gap-3 pt-2 border-t">
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !canSubmit()}
              className="flex-1 bg-blue-600 hover:bg-blue-700">
              {mutation.isPending ? 'Enregistrement...' : 'Valider le check'}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Label className="mb-1 block">{label}</Label>
      {children}
    </div>
  );
}

function RadioField({ label, options, value, onChange }) {
  return (
    <div>
      <Label className="text-xs mb-1 block">{label}</Label>
      <div className="space-y-1">
        {options.map(o => (
          <button key={o} onClick={() => onChange(o)}
            className={`w-full text-xs py-1.5 px-2 rounded border transition-all ${
              value === o
                ? o === 'OK' || o === 'BON' ? 'bg-green-500 text-white border-green-500' : 'bg-red-500 text-white border-red-500'
                : 'border-gray-300 text-gray-600 hover:border-gray-400'
            }`}>{o}</button>
        ))}
      </div>
    </div>
  );
}

function SelectField({ label, options, value, onChange }) {
  const colorMap = { BON: 'green', USAGE: 'orange', CRITIQUE: 'red', RAYE: 'orange', ENDOMMAGE: 'red' };
  return (
    <div>
      <Label className="text-xs mb-1 block">{label}</Label>
      <div className="space-y-1">
        {options.map(o => (
          <button key={o} onClick={() => onChange(o)}
            className={`w-full text-xs py-1.5 px-2 rounded border transition-all ${
              value === o
                ? colorMap[o] === 'green' ? 'bg-green-500 text-white border-green-500'
                : colorMap[o] === 'orange' ? 'bg-orange-400 text-white border-orange-400'
                : 'bg-red-500 text-white border-red-500'
                : 'border-gray-300 text-gray-600 hover:border-gray-400'
            }`}>{o}</button>
        ))}
      </div>
    </div>
  );
}

function CheckboxField({ checked, onChange, label }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
        checked ? 'border-green-300 bg-green-50' : 'border-orange-300 bg-orange-50 hover:bg-orange-100'
      }`}
    >
      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
        checked ? 'bg-green-500 border-green-500' : 'border-orange-400'
      }`}>
        {checked && <CheckCircle2 className="w-3 h-3 text-white" />}
      </div>
      <span className="text-sm text-gray-800">{label}</span>
    </div>
  );
}