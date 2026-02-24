import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Car, CheckCircle2, XCircle, AlertTriangle, Zap, Fuel } from 'lucide-react';
import { Button } from '@/components/ui/button';
import VehicleCheckModal from './VehicleCheckModal';
import { calcLoaStats, vehicleDisplayName } from './vehiculeUtils';
import moment from 'moment';

export default function DriverView({ currentUser, currentEmployee }) {
  const today = moment().format('YYYY-MM-DD');
  const [checkModal, setCheckModal] = useState(null); // { type }

  const { data: myAssignment } = useQuery({
    queryKey: ['myAssignment', currentEmployee?.id, today],
    queryFn: async () => {
      if (!currentEmployee?.id) return null;
      const results = await base44.entities.VehicleAssignment.filter({
        employe_id: currentEmployee.id,
        date: today
      });
      return results[0] || null;
    },
    enabled: !!currentEmployee?.id,
    refetchInterval: 30000
  });

  const { data: vehicle } = useQuery({
    queryKey: ['vehicle', myAssignment?.vehicule_id],
    queryFn: () => base44.entities.Vehicle.filter({ id: myAssignment.vehicule_id }).then(r => r[0]),
    enabled: !!myAssignment?.vehicule_id
  });

  const loaStats = vehicle ? calcLoaStats(vehicle) : null;

  const finServiceIncomplete = myAssignment?.statut === 'EN_COURS' &&
    myAssignment?.debut_shift_fait && !myAssignment?.fin_service_fait;

  // Blocking overlay for fin service
  if (finServiceIncomplete) {
    return (
      <div className="fixed inset-0 bg-red-900/95 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-red-900 mb-2">Action requise</h2>
          <p className="text-gray-700 mb-6">
            Vous devez compléter le <strong>check fin de service</strong> pour votre véhicule d'hier avant de continuer.
          </p>
          {vehicle && (
            <p className="text-sm text-gray-500 mb-6">{vehicle.marque} {vehicle.modele} — {vehicle.immatriculation}</p>
          )}
          <Button
            onClick={() => setCheckModal({ type: 'FIN_SERVICE' })}
            className="w-full bg-red-600 hover:bg-red-700 text-lg py-6"
          >
            🏁 Compléter maintenant
          </Button>
        </div>
        {checkModal && vehicle && myAssignment && (
          <VehicleCheckModal
            open={!!checkModal}
            onOpenChange={v => !v && setCheckModal(null)}
            type={checkModal.type}
            assignment={myAssignment}
            vehicle={vehicle}
            employee={currentEmployee}
          />
        )}
      </div>
    );
  }

  if (!myAssignment) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <Car className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Mon véhicule</h1>
        </div>
        <div className="bg-gray-50 rounded-xl p-12 text-center">
          <Car className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Aucun véhicule assigné aujourd'hui</p>
          <p className="text-sm text-gray-400 mt-1">{moment().format('dddd DD MMMM YYYY')}</p>
        </div>
      </div>
    );
  }

  const checks = [
    {
      label: 'Début de shift',
      done: myAssignment.debut_shift_fait,
      type: 'DEBUT_SHIFT',
      required: !myAssignment.debut_shift_fait,
      icon: '🚀'
    },
    {
      label: 'Fin de service',
      done: myAssignment.fin_service_fait,
      type: 'FIN_SERVICE',
      required: myAssignment.debut_shift_fait && !myAssignment.fin_service_fait,
      icon: '🏁'
    },
    {
      label: 'Clé remise',
      done: myAssignment.cle_remise,
      type: null,
      required: myAssignment.fin_service_fait && !myAssignment.cle_remise,
      icon: '🔑'
    }
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
          <Car className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mon véhicule</h1>
          <p className="text-sm text-gray-500">{moment().format('dddd DD MMMM YYYY')}</p>
        </div>
      </div>

      {/* Vehicle card */}
      {vehicle ? (
        <div className="bg-white border-2 border-blue-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start gap-4">
            {vehicle.photo_url ? (
              <img src={vehicle.photo_url} alt={vehicle.immatriculation} className="w-20 h-20 rounded-xl object-cover" />
            ) : (
              <div className="w-20 h-20 bg-blue-50 rounded-xl flex items-center justify-center">
                <Car className="w-10 h-10 text-blue-400" />
              </div>
            )}
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-900">{vehicle.marque} {vehicle.modele}</h2>
              <p className="text-blue-600 font-mono text-lg font-bold">{vehicle.immatriculation}</p>
              <div className="flex items-center gap-3 mt-2 text-sm text-gray-600">
                <span>{vehicle.energie === 'ELECTRIQUE' ? <><Zap className="w-4 h-4 inline text-blue-500" /> Électrique</> : <><Fuel className="w-4 h-4 inline text-orange-500" /> Thermique</>}</span>
                <span>{(vehicle.km_actuel || 0).toLocaleString('fr-FR')} km</span>
              </div>
            </div>
          </div>

          {/* LOA gauge */}
          {loaStats && (
            <div className="mt-4 p-3 bg-blue-50 rounded-xl">
              <div className="flex justify-between text-xs text-blue-800 mb-1">
                <span>LOA — {loaStats.pctConsumed}% consommé</span>
                <span>{loaStats.kmRestants.toLocaleString('fr-FR')} km restants</span>
              </div>
              <div className="w-full h-2.5 bg-blue-100 rounded-full overflow-hidden">
                <div className={`h-2.5 rounded-full ${loaStats.risque === 'ROUGE' ? 'bg-red-500' : loaStats.risque === 'ORANGE' ? 'bg-orange-400' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(loaStats.pctConsumed, 100)}%` }} />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-400">Chargement véhicule...</div>
      )}

      {/* Checklist */}
      <div>
        <h3 className="font-semibold text-gray-900 mb-3">⚠️ Actions obligatoires</h3>
        <div className="space-y-2">
          {checks.map(c => (
            <div key={c.label} className={`flex items-center justify-between p-4 rounded-xl border-2 ${
              c.done ? 'border-green-200 bg-green-50' : c.required ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'
            }`}>
              <div className="flex items-center gap-3">
                <span className="text-xl">{c.icon}</span>
                <div>
                  <p className={`font-medium ${c.done ? 'text-green-800' : c.required ? 'text-red-900' : 'text-gray-500'}`}>
                    {c.label}
                  </p>
                  {c.done && <p className="text-xs text-green-600">✓ Complété</p>}
                  {!c.done && c.required && <p className="text-xs text-red-600">⛔ À compléter</p>}
                  {!c.done && !c.required && <p className="text-xs text-gray-400">En attente</p>}
                </div>
              </div>
              {!c.done && c.required && c.type && (
                <Button size="sm" onClick={() => setCheckModal({ type: c.type })} className="bg-red-600 hover:bg-red-700">
                  Faire maintenant
                </Button>
              )}
              {c.done && <CheckCircle2 className="w-6 h-6 text-green-500" />}
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      {myAssignment.debut_shift_fait && !myAssignment.fin_service_fait && (
        <Button
          onClick={() => setCheckModal({ type: 'FIN_RUN' })}
          variant="outline"
          className="w-full border-blue-300 text-blue-700"
        >
          🔄 Déclarer fin de run
        </Button>
      )}

      {checkModal && vehicle && myAssignment && (
        <VehicleCheckModal
          open={!!checkModal}
          onOpenChange={v => !v && setCheckModal(null)}
          type={checkModal.type}
          assignment={myAssignment}
          vehicle={vehicle}
          employee={currentEmployee}
        />
      )}
    </div>
  );
}