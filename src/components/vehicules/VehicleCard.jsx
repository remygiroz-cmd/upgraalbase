import React, { useState, useRef, useEffect } from 'react';
import { Car, Zap, Fuel, AlertTriangle, ChevronRight, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { calcLoaStats, getStatutBadge, getRisqueBadge } from './vehiculeUtils';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const STATUTS = [
  { value: 'ACTIF', label: 'Actif', className: 'bg-green-100 text-green-700' },
  { value: 'INDISPONIBLE', label: 'Indisponible', className: 'bg-red-100 text-red-700' },
  { value: 'ATELIER', label: 'Atelier', className: 'bg-orange-100 text-orange-700' },
  { value: 'RESERVE', label: 'Réservé', className: 'bg-purple-100 text-purple-700' },
];

function StatutDropdown({ vehicle }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const mutation = useMutation({
    mutationFn: (statut) => base44.entities.Vehicle.update(vehicle.id, { statut }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      toast.success('Statut mis à jour');
      setOpen(false);
    },
    onError: () => toast.error('Erreur lors de la mise à jour')
  });

  const statutBadge = getStatutBadge(vehicle.statut);

  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 hover:opacity-80 transition-opacity ${statutBadge.className}`}
      >
        {statutBadge.label}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[130px] py-1">
          {STATUTS.map(s => (
            <button
              key={s.value}
              onClick={() => mutation.mutate(s.value)}
              disabled={mutation.isPending}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2 ${vehicle.statut === s.value ? 'font-bold' : ''}`}
            >
              <span className={`inline-block w-2 h-2 rounded-full ${s.className.replace('text-', 'bg-').split(' ')[0]}`} />
              {s.label}
              {vehicle.statut === s.value && <span className="ml-auto text-gray-400">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function VehicleCard({ vehicle, onClick, compact = false }) {
  const loaStats = calcLoaStats(vehicle);
  const risqueBadge = loaStats ? getRisqueBadge(loaStats.risque) : null;

  return (
    <div
      onClick={onClick}
      className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-all cursor-pointer"
      style={vehicle.card_color ? { backgroundColor: vehicle.card_color + '22', borderColor: vehicle.card_color + '66' } : { backgroundColor: 'white' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {vehicle.photo_url ? (
            <img src={vehicle.photo_url} alt={vehicle.immatriculation}
              className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
          ) : (
            <div className="w-14 h-14 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Car className="w-7 h-7 text-gray-400" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {vehicle.numero && (
                <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-gray-800 text-white min-w-[1.5rem] text-center">
                  #{vehicle.numero}
                </span>
              )}
              <span className="font-bold text-gray-900">{vehicle.marque} {vehicle.modele}</span>
              <StatutDropdown vehicle={vehicle} />
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{vehicle.immatriculation}</p>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-xs text-gray-500 flex items-center gap-1">
                {vehicle.energie === 'ELECTRIQUE'
                  ? <><Zap className="w-3 h-3 text-blue-500" /> Électrique</>
                  : <><Fuel className="w-3 h-3 text-orange-500" /> Thermique</>}
              </span>
              <span className="text-xs text-gray-500">
                {vehicle.type_usage === 'LIVRAISON' ? '🚚 Livraison' : '🚘 Direction'}
              </span>
              <span className="text-xs text-gray-500">
                {vehicle.propriete === 'LOA' ? '📋 LOA' : '🏢 Société'}
              </span>
            </div>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm text-gray-600">
          <span className="font-medium">{(vehicle.km_actuel || 0).toLocaleString('fr-FR')}</span> km
        </span>
        {risqueBadge && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${risqueBadge.className}`}>
            {risqueBadge.label}
          </span>
        )}
      </div>

      {loaStats && !compact && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{loaStats.pctConsumed}% consommé</span>
            <span>{loaStats.kmRestants.toLocaleString('fr-FR')} km restants</span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all ${
                loaStats.risque === 'ROUGE' ? 'bg-red-500'
                : loaStats.risque === 'ORANGE' ? 'bg-orange-400'
                : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(loaStats.pctConsumed, 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Budget: ~{loaStats.budgetKmJour} km/jour · {loaStats.joursRestants}j restants
          </p>
        </div>
      )}
    </div>
  );
}