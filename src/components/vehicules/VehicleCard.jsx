import React from 'react';
import { Car, Zap, Fuel, AlertTriangle, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { calcLoaStats, getStatutBadge, getRisqueBadge } from './vehiculeUtils';

export default function VehicleCard({ vehicle, onClick, compact = false }) {
  const statutBadge = getStatutBadge(vehicle.statut);
  const loaStats = calcLoaStats(vehicle);
  const risqueBadge = loaStats ? getRisqueBadge(loaStats.risque) : null;

  return (
    <div
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-all cursor-pointer"
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
              <span className="font-bold text-gray-900">{vehicle.marque} {vehicle.modele}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statutBadge.className}`}>
                {statutBadge.label}
              </span>
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