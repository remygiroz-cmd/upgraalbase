import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { AlertTriangle, Lock, CheckCircle2 } from 'lucide-react';

export default function BlockingFinServiceModal({ assignment, vehicle, onComplete }) {
  const queryClient = useQueryClient();
  const isElectrique = vehicle?.energie === 'ELECTRIQUE';

  const [form, setForm] = useState({
    branche_en_charge: false,
    charge_restante_pct: '',
    niveau_carburant: 'PLEIN',
    cle_remise_en_place: false,
    validation_finale: false,
    km_fin: ''
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const canSubmit = form.cle_remise_en_place && form.validation_finale
    && (isElectrique ? (form.branche_en_charge && form.charge_restante_pct !== '') : !!form.niveau_carburant);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!canSubmit) throw new Error('Tous les champs obligatoires doivent être remplis.');

      await base44.entities.VehicleCheck.create({
        type: 'FIN_SERVICE',
        assignment_id: assignment.id,
        vehicule_id: assignment.vehicule_id,
        employe_id: assignment.employe_id,
        employe_name: assignment.employe_name,
        date_heure: new Date().toISOString(),
        branche_en_charge: form.branche_en_charge,
        charge_restante_pct: form.charge_restante_pct ? Number(form.charge_restante_pct) : undefined,
        niveau_carburant: form.niveau_carburant,
        cle_remise_en_place: form.cle_remise_en_place,
        validation_finale: form.validation_finale,
        km_fin: form.km_fin ? Number(form.km_fin) : undefined
      });

      const updates = {
        fin_service_fait: true,
        cle_remise: form.cle_remise_en_place,
        statut: 'TERMINE'
      };
      if (form.km_fin) {
        updates.km_fin = Number(form.km_fin);
        updates.distance_calculee = Number(form.km_fin) - (assignment.km_debut || 0);
        await base44.entities.Vehicle.update(assignment.vehicule_id, { km_actuel: Number(form.km_fin) });
      }
      await base44.entities.VehicleAssignment.update(assignment.id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicleChecks'] });
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      toast.success('Fin de service validée ✅');
      onComplete();
    },
    onError: (e) => toast.error(e.message)
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full overflow-y-auto max-h-[90vh] shadow-2xl">
        <div className="bg-red-600 p-6 rounded-t-2xl text-white text-center">
          <Lock className="w-12 h-12 mx-auto mb-3" />
          <h2 className="text-xl font-bold">Interface bloquée</h2>
          <p className="text-red-200 text-sm mt-1">
            Vous n'avez pas validé la fin de service d'hier.<br />
            Complétez-la pour accéder à l'application.
          </p>
        </div>

        <div className="p-6 space-y-5">
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-900 flex gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              Véhicule : <strong>{vehicle ? `${vehicle.marque} ${vehicle.modele}` : assignment.vehicule_id}</strong>
              {vehicle?.immatriculation && ` (${vehicle.immatriculation})`}
            </span>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Km compteur (optionnel)</label>
            <input type="number" value={form.km_fin} onChange={e => set('km_fin', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" placeholder="Km fin de journée" />
          </div>

          {isElectrique ? (
            <>
              <CheckBtn checked={form.branche_en_charge} onChange={v => set('branche_en_charge', v)}
                label="🔌 Véhicule branché en charge *" />
              <div>
                <label className="text-sm font-medium block mb-1">🔋 Charge restante (%) *</label>
                <input type="number" min="0" max="100" value={form.charge_restante_pct}
                  onChange={e => set('charge_restante_pct', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" placeholder="Ex: 45" />
              </div>
            </>
          ) : (
            <div>
              <label className="text-sm font-medium block mb-2">⛽ Niveau carburant *</label>
              <div className="grid grid-cols-5 gap-2">
                {['PLEIN', '3/4', '1/2', '1/4', 'RESERVE'].map(lvl => (
                  <button key={lvl} onClick={() => set('niveau_carburant', lvl)}
                    className={`text-xs py-2 rounded-lg border transition-all ${
                      form.niveau_carburant === lvl
                        ? lvl === 'RESERVE' ? 'bg-red-500 text-white border-red-500' : 'bg-blue-500 text-white border-blue-500'
                        : 'border-gray-300 text-gray-600'
                    }`}>{lvl}</button>
                ))}
              </div>
            </div>
          )}

          <CheckBtn checked={form.cle_remise_en_place} onChange={v => set('cle_remise_en_place', v)}
            label="🔑 Clé remise en place (coffre / bureau) *" />

          <CheckBtn checked={form.validation_finale} onChange={v => set('validation_finale', v)}
            label="✅ Je valide la fin de service *" />

          <Button onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}
            className="w-full bg-red-600 hover:bg-red-700 text-white">
            {mutation.isPending ? 'Enregistrement...' : 'Valider et débloquer'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CheckBtn({ checked, onChange, label }) {
  return (
    <div onClick={() => onChange(!checked)}
      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
        checked ? 'border-green-300 bg-green-50' : 'border-orange-300 bg-orange-50'
      }`}>
      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
        checked ? 'bg-green-500 border-green-500' : 'border-orange-400'
      }`}>
        {checked && <CheckCircle2 className="w-3 h-3 text-white" />}
      </div>
      <span className="text-sm">{label}</span>
    </div>
  );
}