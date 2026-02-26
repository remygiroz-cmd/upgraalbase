import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Car, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import moment from 'moment';
import VehicleCheckModal from './VehicleCheckModal';
import BlockingFinServiceModal from './BlockingFinServiceModal';
import ReportAlertModal from './ReportAlertModal';

export default function DriverView({ currentUser, currentEmployee }) {
  const [checkType, setCheckType] = useState(null);
  const [showReportAlert, setShowReportAlert] = useState(false);

  const today = moment().format('YYYY-MM-DD');

  const { data: todayAssignments = [], isLoading } = useQuery({
    queryKey: ['driverAssignment', currentEmployee?.id, today],
    queryFn: () => base44.entities.VehicleAssignment.filter({ employe_id: currentEmployee?.id, date: today }),
    enabled: !!currentEmployee?.id,
    refetchInterval: 30000
  });

  const assignment = todayAssignments[0] || null;

  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => base44.entities.Vehicle.list()
  });

  const { data: checks = [], refetch: refetchChecks } = useQuery({
    queryKey: ['vehicleChecks', assignment?.id],
    queryFn: () => base44.entities.VehicleCheck.filter({ assignment_id: assignment?.id }),
    enabled: !!assignment?.id,
    refetchInterval: 15000
  });

  const vehicle = vehicles.find(v => v.id === assignment?.vehicule_id);

  const hasDebutShift = checks.some(c => c.type === 'DEBUT_SHIFT');
  const hasFinService = checks.some(c => c.type === 'FIN_SERVICE');

  // Check if yesterday assignment has missing fin_service (blocking)
  const { data: yesterdayAssignments = [] } = useQuery({
    queryKey: ['driverYesterdayAssignment', currentEmployee?.id],
    queryFn: async () => {
      const yesterday = moment().subtract(1, 'day').format('YYYY-MM-DD');
      return base44.entities.VehicleAssignment.filter({ employe_id: currentEmployee?.id, date: yesterday });
    },
    enabled: !!currentEmployee?.id
  });
  const yesterdayAssignment = yesterdayAssignments[0];

  const { data: yesterdayChecks = [] } = useQuery({
    queryKey: ['vehicleChecksYesterday', yesterdayAssignment?.id],
    queryFn: () => base44.entities.VehicleCheck.filter({ assignment_id: yesterdayAssignment?.id }),
    enabled: !!yesterdayAssignment?.id
  });

  const yesterdayMissingFinService = yesterdayAssignment && !yesterdayAssignment.fin_service_fait
    && !yesterdayChecks.some(c => c.type === 'FIN_SERVICE');

  if (!currentEmployee) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center text-gray-400">
          <Car className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Aucun profil employé lié à votre compte</p>
          <p className="text-sm mt-1">Contactez un manager.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Blocking modal if yesterday fin_service missing */}
      {yesterdayMissingFinService && (
        <BlockingFinServiceModal
          assignment={yesterdayAssignment}
          vehicle={vehicles.find(v => v.id === yesterdayAssignment.vehicule_id)}
          onComplete={() => refetchChecks()}
        />
      )}

      <div className="max-w-lg mx-auto space-y-5 pb-10">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-5 text-white">
          <p className="text-blue-200 text-sm">Bonjour {currentEmployee.first_name} 👋</p>
          <h1 className="text-xl font-bold mt-1">{moment().format('dddd DD MMMM')}</h1>
        </div>

        {isLoading ? (
          <div className="bg-white rounded-2xl p-8 text-center text-gray-400">Chargement...</div>
        ) : !assignment ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-gray-100 shadow-sm">
            <Car className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-semibold text-gray-700">Aucun véhicule assigné aujourd'hui</p>
            <p className="text-sm text-gray-400 mt-1">Contactez votre manager si cela vous semble incorrect.</p>
          </div>
        ) : (
          <>
            {/* Vehicle card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {vehicle?.photo_url && (
                <img src={vehicle.photo_url} alt={vehicle.immatriculation}
                  className="w-full h-40 object-cover" />
              )}
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      {vehicle ? `${vehicle.marque} ${vehicle.modele}` : 'Véhicule'}
                    </h2>
                    <p className="text-gray-500 font-mono text-sm">{vehicle?.immatriculation}</p>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                        {vehicle?.energie === 'ELECTRIQUE' ? '⚡ Électrique' : '⛽ Thermique'}
                      </span>
                      <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                        {vehicle?.propriete === 'LOA' ? '📋 LOA' : '🏢 Société'}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-gray-900">
                      {(assignment.km_debut || vehicle?.km_actuel || 0).toLocaleString('fr-FR')}
                    </p>
                    <p className="text-xs text-gray-400">km compteur</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Checklist obligatoire */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-500" />
                Actions obligatoires
              </h3>
              <div className="space-y-3">
                <CheckItem
                  done={hasDebutShift}
                  label="Check début de shift"
                  sub="Vérification visuelle + km départ"
                  onAction={() => !hasDebutShift && setCheckType('DEBUT_SHIFT')}
                  urgent={!hasDebutShift}
                />
                <CheckItem
                  done={hasFinService}
                  label="Check fin de service"
                  sub={vehicle?.energie === 'ELECTRIQUE' ? 'Brancher + clé remise' : 'Carburant + clé remise'}
                  onAction={() => !hasFinService && setCheckType('FIN_SERVICE')}
                  urgent={false}
                />
              </div>
            </div>

            {/* Signaler un problème */}
            <button
              onClick={() => setShowReportAlert(true)}
              className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-2xl transition-colors"
            >
              <AlertTriangle className="w-5 h-5" />
              🚨 Signaler un problème
            </button>

            {/* Score conformité */}
            <ComplianceScore employeeId={currentEmployee.id} />
          </>
        )}
      </div>

      <ReportAlertModal
        open={showReportAlert}
        onOpenChange={setShowReportAlert}
        vehicle={vehicle}
        assignment={assignment}
        currentUser={currentUser}
        currentEmployee={currentEmployee}
        vehicles={vehicles}
      />

      {checkType && assignment && (
        <VehicleCheckModal
          open={!!checkType}
          onOpenChange={v => !v && setCheckType(null)}
          type={checkType}
          assignment={assignment}
          vehicle={vehicle}
          currentEmployee={currentEmployee}
          onComplete={() => { setCheckType(null); refetchChecks(); }}
        />
      )}
    </>
  );
}

function CheckItem({ done, label, sub, onAction, urgent }) {
  return (
    <div
      onClick={onAction}
      className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
        done
          ? 'border-green-200 bg-green-50 cursor-default'
          : urgent
            ? 'border-orange-300 bg-orange-50 cursor-pointer hover:bg-orange-100'
            : 'border-gray-200 bg-gray-50 cursor-pointer hover:bg-gray-100'
      }`}
    >
      {done
        ? <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0" />
        : <Clock className="w-6 h-6 text-orange-400 flex-shrink-0" />
      }
      <div className="flex-1">
        <p className={`text-sm font-semibold ${done ? 'text-green-800 line-through' : 'text-gray-900'}`}>{label}</p>
        <p className="text-xs text-gray-500">{sub}</p>
      </div>
      {!done && (
        <span className="text-xs bg-orange-500 text-white px-2 py-0.5 rounded-full">À faire</span>
      )}
    </div>
  );
}

function ComplianceScore({ employeeId }) {
  const { data: allAssignments = [] } = useQuery({
    queryKey: ['complianceAssignments', employeeId],
    queryFn: async () => {
      const all = await base44.entities.VehicleAssignment.list('-date', 100);
      return all.filter(a => a.employe_id === employeeId);
    },
    enabled: !!employeeId
  });

  const total = allAssignments.filter(a => a.statut === 'TERMINE').length;
  if (total === 0) return null;

  const compliant = allAssignments.filter(a => a.statut === 'TERMINE' && a.debut_shift_fait && a.fin_service_fait && a.cle_remise).length;
  const score = Math.round((compliant / total) * 100);

  const badge = score === 100 ? { color: 'green', emoji: '🟢' }
    : score >= 90 ? { color: 'orange', emoji: '🟠' }
    : { color: 'red', emoji: '🔴' };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h3 className="font-bold text-gray-900 mb-3">Mon score conformité</h3>
      <div className="flex items-center gap-4">
        <div className="text-4xl">{badge.emoji}</div>
        <div>
          <p className="text-3xl font-bold text-gray-900">{score}%</p>
          <p className="text-xs text-gray-500">{compliant}/{total} shifts complets</p>
        </div>
      </div>
    </div>
  );
}