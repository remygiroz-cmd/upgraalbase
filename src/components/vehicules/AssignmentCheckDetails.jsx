import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { CheckCircle2, XCircle, AlertTriangle, Zap, Fuel } from 'lucide-react';

function StatusBadge({ value, okValues = ['OK', 'BON'], label }) {
  const isOk = okValues.includes(value);
  const isDanger = ['DOMMAGE', 'CRITIQUE', 'ENDOMMAGE'].includes(value);
  const isWarn = ['DEFAUT', 'ANOMALIE', 'USAGE', 'RAYE'].includes(value);

  const color = isDanger ? 'text-red-600 font-semibold'
    : isWarn ? 'text-orange-500 font-semibold'
    : 'text-green-600';

  return (
    <span>
      <span className="text-gray-500">{label} : </span>
      <span className={color}>{value}</span>
    </span>
  );
}

export default function AssignmentCheckDetails({ assignmentId, vehicle }) {
  const isElectrique = vehicle?.energie === 'ELECTRIQUE';
  const energyLabel = isElectrique ? 'Charge' : 'Carburant';

  const { data: checks = [] } = useQuery({
    queryKey: ['vehicleChecks', assignmentId],
    queryFn: () => base44.entities.VehicleCheck.filter({ assignment_id: assignmentId }),
    enabled: !!assignmentId
  });

  const debutCheck = checks.find(c => c.type === 'DEBUT_SHIFT');
  const finCheck = checks.find(c => c.type === 'FIN_SERVICE');

  if (!debutCheck && !finCheck) return null;

  const hasStartAnomaly = debutCheck && (
    debutCheck.check_visuel_pneus !== 'OK' ||
    debutCheck.check_voyants !== 'OK' ||
    debutCheck.check_carrosserie !== 'OK'
  );

  return (
    <div className="mt-3 space-y-3 border-t pt-3">
      {/* Energy summary */}
      {(debutCheck?.start_energy_level_pct != null || finCheck?.end_energy_level_pct != null) && (
        <div className="flex gap-4 text-xs text-gray-600">
          {isElectrique ? <Zap className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0 mt-0.5" /> : <Fuel className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />}
          {debutCheck?.start_energy_level_pct != null && (
            <span>% départ : <strong>{debutCheck.start_energy_level_pct}%</strong></span>
          )}
          {finCheck?.end_energy_level_pct != null && (
            <span>% fin : <strong>{finCheck.end_energy_level_pct}%</strong></span>
          )}
        </div>
      )}

      {/* Début shift detail */}
      {debutCheck && (
        <div className={`rounded-lg p-2.5 text-xs space-y-1.5 ${hasStartAnomaly ? 'bg-orange-50 border border-orange-200' : 'bg-green-50 border border-green-200'}`}>
          <p className="font-semibold text-gray-700 flex items-center gap-1 mb-1">
            {hasStartAnomaly
              ? <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
              : <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
            }
            Début de shift
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {debutCheck.check_visuel_pneus && <StatusBadge value={debutCheck.check_visuel_pneus} label="Pneus" />}
            {debutCheck.check_voyants && <StatusBadge value={debutCheck.check_voyants} label="Voyants" />}
            {debutCheck.check_carrosserie && <StatusBadge value={debutCheck.check_carrosserie} label="Carrosserie" />}
          </div>
          {(debutCheck.start_anomaly_detail || debutCheck.incidents) && (
            <p className="text-gray-600 italic">
              "{debutCheck.start_anomaly_detail || debutCheck.incidents}"
            </p>
          )}
        </div>
      )}

      {/* Fin service detail */}
      {finCheck && (
        <div className="rounded-lg p-2.5 text-xs space-y-1.5 bg-blue-50 border border-blue-200">
          <p className="font-semibold text-gray-700 flex items-center gap-1 mb-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
            Fin de service
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-gray-600">
            {isElectrique && (
              <span>
                <span className="text-gray-500">Branché : </span>
                <span className={finCheck.branche_en_charge ? 'text-green-600 font-semibold' : 'text-gray-500'}>
                  {finCheck.branche_en_charge ? 'Oui' : 'Non'}
                </span>
              </span>
            )}
            {finCheck.end_energy_level_pct != null && (
              <span>
                <span className="text-gray-500">{energyLabel} restant : </span>
                <strong>{finCheck.end_energy_level_pct}%</strong>
              </span>
            )}
            <span>
              <span className="text-gray-500">Clé remise : </span>
              <span className={finCheck.cle_remise_en_place ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}>
                {finCheck.cle_remise_en_place ? 'Oui' : 'Non'}
              </span>
            </span>
          </div>
          {finCheck.end_service_note && (
            <p className="text-gray-600 italic">"{finCheck.end_service_note}"</p>
          )}
        </div>
      )}
    </div>
  );
}