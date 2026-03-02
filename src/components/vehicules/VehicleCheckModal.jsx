import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { CheckCircle2 } from 'lucide-react';

export default function VehicleCheckModal({ open, onOpenChange, type, assignment, vehicle, currentEmployee, onComplete }) {
  const queryClient = useQueryClient();
  const isElectrique = vehicle?.energie === 'ELECTRIQUE';

  // Km minimum de référence (fallback sur km_initial si km_current absent)
  const minKmDepart = vehicle?.km_current ?? vehicle?.km_initial ?? 0;
  if (type === 'DEBUT_SHIFT' && vehicle && vehicle.km_current == null) {
    console.warn(`[VehicleCheckModal] km_current absent pour véhicule ${vehicle.id}, fallback km_initial=${vehicle.km_initial}`);
  }

  const [form, setForm] = useState({
    km_debut: assignment?.km_debut || '',
    km_fin: '',
    // Début shift
    check_visuel_pneus: 'OK',
    check_voyants: 'OK',
    check_carrosserie: 'OK',
    confirmation_vehicule_ok: false,
    start_energy_level_pct: '',
    start_anomaly_detail: '',
    // Fin run
    etat_pneus: 'BON',
    etat_freins: 'BON',
    etat_carrosserie: 'BON',
    tags_incidents: [],
    incidents: '',
    // Fin service
    branche_en_charge: false,
    end_energy_level_pct: '',
    cle_remise_en_place: false,
    validation_finale: false,
    end_service_note: '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const INCIDENT_TAGS = ['RAYURE', 'CHOC', 'PNEU_PLAT', 'VOYANT_ALLUME', 'VITRE_CASSEE', 'AUTRE'];

  const toggleTag = (tag) => {
    set('tags_incidents', form.tags_incidents.includes(tag)
      ? form.tags_incidents.filter(t => t !== tag)
      : [...form.tags_incidents, tag]);
  };

  // Validation km départ
  const kmDepartValue = form.km_debut !== '' ? parseInt(String(form.km_debut).replace(/\s/g, ''), 10) : NaN;
  const kmDepartError = type === 'DEBUT_SHIFT' && form.km_debut !== ''
    ? (isNaN(kmDepartValue) || kmDepartValue < 0)
      ? 'Kilométrage invalide.'
      : kmDepartValue < minKmDepart
        ? `Le kilométrage de départ ne peut pas être inférieur au kilométrage actuel du véhicule (${minKmDepart} km).`
        : null
    : null;

  const canSubmit = () => {
    if (type === 'DEBUT_SHIFT') {
      if (!form.km_debut || !form.confirmation_vehicule_ok) return false;
      if (kmDepartError) return false;
      if (form.start_energy_level_pct === '' || Number(form.start_energy_level_pct) < 0 || Number(form.start_energy_level_pct) > 100) return false;
      return true;
    }
    if (type === 'FIN_SERVICE') {
      if (!form.cle_remise_en_place || !form.validation_finale) return false;
      if (form.end_energy_level_pct === '' || Number(form.end_energy_level_pct) < 0 || Number(form.end_energy_level_pct) > 100) return false;
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

      // Validation serveur côté client (re-vérification avant envoi)
      if (type === 'DEBUT_SHIFT') {
        const kmVal = parseInt(String(form.km_debut).replace(/\s/g, ''), 10);
        const freshVehicle = await base44.entities.Vehicle.filter({ id: assignment.vehicule_id });
        const ref = freshVehicle[0]?.km_current ?? freshVehicle[0]?.km_initial ?? 0;
        if (isNaN(kmVal) || kmVal < 0 || kmVal < ref) {
          throw new Error(`Le kilométrage de départ ne peut pas être inférieur au kilométrage actuel du véhicule (${ref} km).`);
        }
      }

      const checkData = {
        type,
        assignment_id: assignment.id,
        vehicule_id: assignment.vehicule_id,
        employe_id: currentEmployee.id,
        employe_name: `${currentEmployee.first_name} ${currentEmployee.last_name}`,
        date_heure: new Date().toISOString(),
        km_debut: form.km_debut ? Number(form.km_debut) : undefined,
        km_fin: form.km_fin ? Number(form.km_fin) : undefined,
        // Début shift fields
        check_visuel_pneus: form.check_visuel_pneus,
        check_voyants: form.check_voyants,
        check_carrosserie: form.check_carrosserie,
        confirmation_vehicule_ok: form.confirmation_vehicule_ok,
        start_energy_level_pct: form.start_energy_level_pct !== '' ? Number(form.start_energy_level_pct) : undefined,
        start_energy_type: isElectrique ? 'ELECTRIC' : 'THERMIQUE',
        start_tires_status: form.check_visuel_pneus,
        start_warning_lights_status: form.check_voyants,
        start_body_status: form.check_carrosserie,
        start_anomaly_detail: form.start_anomaly_detail || undefined,
        // Fin run fields
        etat_pneus: form.etat_pneus,
        etat_freins: form.etat_freins,
        etat_carrosserie: form.etat_carrosserie,
        tags_incidents: form.tags_incidents,
        incidents: form.incidents || undefined,
        // Fin service fields
        branche_en_charge: form.branche_en_charge,
        end_energy_level_pct: form.end_energy_level_pct !== '' ? Number(form.end_energy_level_pct) : undefined,
        end_energy_type: isElectrique ? 'ELECTRIC' : 'THERMIQUE',
        end_vehicle_plugged: form.branche_en_charge,
        cle_remise_en_place: form.cle_remise_en_place,
        end_key_returned: form.cle_remise_en_place,
        validation_finale: form.validation_finale,
        end_final_validation: form.validation_finale,
        end_service_note: form.end_service_note || undefined,
        // Legacy
        charge_restante_pct: form.end_energy_level_pct !== '' ? Number(form.end_energy_level_pct) : undefined,
      };

      await base44.entities.VehicleCheck.create(checkData);

      const updates = {};
      if (type === 'DEBUT_SHIFT') {
        updates.debut_shift_fait = true;
        updates.km_debut = Number(form.km_debut);
        updates.statut = 'EN_COURS';
        const vehicleUpdates = { km_actuel: Number(form.km_debut) };
        if (form.start_energy_level_pct !== '') {
          vehicleUpdates.last_energy_level_pct = Number(form.start_energy_level_pct);
          vehicleUpdates.last_energy_updated_at = new Date().toISOString();
          vehicleUpdates.last_energy_source = 'START_SHIFT';
        }
        await base44.entities.Vehicle.update(assignment.vehicule_id, vehicleUpdates);
      }
      if (type === 'FIN_SERVICE') {
        updates.fin_service_fait = true;
        updates.cle_remise = form.cle_remise_en_place;
        updates.statut = 'TERMINE';
        const vehicleUpdates = {};
        if (form.km_fin) {
          updates.km_fin = Number(form.km_fin);
          updates.distance_calculee = Number(form.km_fin) - Number(assignment.km_debut || 0);
          vehicleUpdates.km_actuel = Number(form.km_fin);
        }
        if (form.end_energy_level_pct !== '') {
          vehicleUpdates.last_energy_level_pct = Number(form.end_energy_level_pct);
          vehicleUpdates.last_energy_updated_at = new Date().toISOString();
          vehicleUpdates.last_energy_source = 'END_SHIFT';
          vehicleUpdates.last_plugged_in_charge = form.branche_en_charge;
          if (form.branche_en_charge) {
            vehicleUpdates.last_plugged_at = new Date().toISOString();
          }
        }
        if (Object.keys(vehicleUpdates).length > 0) {
          await base44.entities.Vehicle.update(assignment.vehicule_id, vehicleUpdates);
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

  const energyLabel = isElectrique ? '🔋 Charge' : '⛽ Carburant';

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

              <Field label={`${energyLabel} au départ (%) *`}>
                <Input
                  type="number" min="0" max="100"
                  value={form.start_energy_level_pct}
                  onChange={e => set('start_energy_level_pct', e.target.value)}
                  placeholder="Ex: 82"
                />
              </Field>

              <div className="grid grid-cols-3 gap-3">
                <RadioField label="Pneus" options={['OK', 'DEFAUT']} value={form.check_visuel_pneus} onChange={v => set('check_visuel_pneus', v)} />
                <RadioField label="Voyants" options={['OK', 'ANOMALIE']} value={form.check_voyants} onChange={v => set('check_voyants', v)} />
                <RadioField label="Carrosserie" options={['OK', 'DOMMAGE']} value={form.check_carrosserie} onChange={v => set('check_carrosserie', v)} />
              </div>

              {(form.check_visuel_pneus !== 'OK' || form.check_voyants !== 'OK' || form.check_carrosserie !== 'OK') && (
                <div>
                  <Label>Détail anomalie</Label>
                  <textarea value={form.start_anomaly_detail} onChange={e => set('start_anomaly_detail', e.target.value)}
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

              {isElectrique && (
                <CheckboxField
                  checked={form.branche_en_charge}
                  onChange={v => set('branche_en_charge', v)}
                  label="🔌 Véhicule branché en charge"
                />
              )}

              <Field label={`${energyLabel} restant(e) (%) *`}>
                <Input
                  type="number" min="0" max="100"
                  value={form.end_energy_level_pct}
                  onChange={e => set('end_energy_level_pct', e.target.value)}
                  placeholder="Ex: 43"
                />
              </Field>

              <CheckboxField
                checked={form.cle_remise_en_place}
                onChange={v => set('cle_remise_en_place', v)}
                label="🔑 Clé remise en place (coffre / bureau) *"
              />

              <div>
                <Label className="mb-1 block">📝 Détail incident de service (facultatif)</Label>
                <textarea
                  value={form.end_service_note}
                  onChange={e => set('end_service_note', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none"
                  rows={2}
                  placeholder="Ex: recharge lente, borne capricieuse..."
                />
              </div>

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