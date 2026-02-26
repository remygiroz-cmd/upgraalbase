import React, { useState, useMemo } from 'react';
import { Zap, Fuel, BatteryWarning } from 'lucide-react';
import moment from 'moment';

function getEnergyColor(pct, isElectrique) {
  const lowThreshold = isElectrique ? 30 : 25;
  const midThreshold = 50;
  if (pct == null) return { bar: 'bg-gray-200', text: 'text-gray-400', label: 'text-gray-500' };
  if (pct <= lowThreshold) return { bar: 'bg-red-500', text: 'text-red-600', label: 'text-red-600' };
  if (pct <= midThreshold) return { bar: 'bg-orange-400', text: 'text-orange-600', label: 'text-orange-600' };
  return { bar: 'bg-green-500', text: 'text-green-600', label: 'text-green-600' };
}

function isLow(pct, isElectrique) {
  if (pct == null) return false;
  return isElectrique ? pct <= 30 : pct <= 25;
}

export default function EnergyWidget({ vehicles }) {
  const [filter, setFilter] = useState('all'); // 'all' | 'low'
  const today = moment().format('YYYY-MM-DD');
  const yesterday = moment().subtract(1, 'day').format('YYYY-MM-DD');

  // Compute effective energy level (apply AUTO_CHARGED rule for electric plugged-in yesterday)
  const vehiclesWithEnergy = useMemo(() => {
    return vehicles
      .filter(v => v.statut === 'ACTIF' && v.type_usage === 'LIVRAISON')
      .map(v => {
        const isElectrique = v.energie === 'ELECTRIQUE';
        let pct = v.last_energy_level_pct;
        let source = v.last_energy_source;
        let autoCharged = false;

        // Rule: electric + plugged last night → 100%
        if (
          isElectrique &&
          v.last_plugged_in_charge &&
          v.last_energy_updated_at &&
          v.last_energy_updated_at.startsWith(yesterday)
        ) {
          pct = 100;
          source = 'AUTO_CHARGED';
          autoCharged = true;
        }

        return { ...v, _pct: pct, _source: source, _autoCharged: autoCharged };
      });
  }, [vehicles, yesterday]);

  // Sort: low first, then by pct ASC (unknowns at bottom)
  const sorted = useMemo(() => {
    return [...vehiclesWithEnergy].sort((a, b) => {
      if (a._pct == null && b._pct == null) return 0;
      if (a._pct == null) return 1;
      if (b._pct == null) return -1;
      return a._pct - b._pct;
    });
  }, [vehiclesWithEnergy]);

  const filtered = filter === 'low'
    ? sorted.filter(v => v._pct == null || isLow(v._pct, v.energie === 'ELECTRIQUE'))
    : sorted;

  const lowCount = sorted.filter(v => isLow(v._pct, v.energie === 'ELECTRIQUE')).length;
  const unknownCount = sorted.filter(v => v._pct == null).length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-900 flex items-center gap-2">
          <BatteryWarning className="w-4 h-4 text-yellow-500" />
          Énergie véhicules
          {lowCount > 0 && (
            <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-semibold ml-1">
              {lowCount} à traiter
            </span>
          )}
        </h3>
        {/* Filter toggle */}
        <div className="flex text-xs rounded-lg overflow-hidden border border-gray-200">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 transition-colors ${filter === 'all' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >Tous</button>
          <button
            onClick={() => setFilter('low')}
            className={`px-3 py-1.5 transition-colors ${filter === 'low' ? 'bg-red-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >À traiter</button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">
          {filter === 'low' ? '✅ Aucun véhicule critique' : 'Aucun véhicule actif LIVRAISON'}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map(v => {
            const isElectrique = v.energie === 'ELECTRIQUE';
            const pct = v._pct;
            const colors = getEnergyColor(pct, isElectrique);
            const updatedAt = v.last_energy_updated_at
              ? moment(v.last_energy_updated_at).format('HH:mm')
              : null;
            const updatedDate = v.last_energy_updated_at
              ? moment(v.last_energy_updated_at).format('DD/MM')
              : null;

            return (
              <div key={v.id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isElectrique
                      ? <Zap className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
                      : <Fuel className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                    }
                    <span className="text-sm font-medium text-gray-800 truncate">
                      {v.marque} {v.modele}
                    </span>
                    <span className="text-xs text-gray-400 font-mono flex-shrink-0">{v.immatriculation}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    {v._autoCharged && (
                      <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-medium">Chargé cette nuit</span>
                    )}
                    {pct != null ? (
                      <span className={`text-sm font-bold ${colors.text}`}>{pct}%</span>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Inconnu</span>
                    )}
                  </div>
                </div>

                <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-2.5 rounded-full transition-all duration-500 ${pct != null ? colors.bar : 'bg-gray-200'}`}
                    style={{ width: pct != null ? `${pct}%` : '0%' }}
                  />
                </div>

                <div className="flex justify-between text-xs text-gray-400">
                  {pct == null ? (
                    <span className="text-orange-500 font-medium">À renseigner</span>
                  ) : (
                    <span className={colors.label}>
                      {isLow(pct, isElectrique)
                        ? isElectrique ? '⚠️ Recharge nécessaire' : '⚠️ Plein nécessaire'
                        : '✓ Niveau OK'
                      }
                    </span>
                  )}
                  {updatedAt && (
                    <span>Maj : {updatedDate !== moment().format('DD/MM') ? updatedDate + ' ' : ''}{updatedAt}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {unknownCount > 0 && filter === 'all' && (
        <p className="text-xs text-gray-400 mt-3 pt-3 border-t">
          {unknownCount} véhicule(s) sans données de check récentes
        </p>
      )}
    </div>
  );
}