import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Car, AlertTriangle, TrendingUp, Users, Shield, Zap, Fuel, FileText } from 'lucide-react';
import { calcLoaStats, getRisqueBadge, isDocumentExpired, isDocumentExpiringSoon } from './vehiculeUtils';
import moment from 'moment';
import EnergyWidget from './EnergyWidget';
import VehicleAlertsPanel from './VehicleAlertsPanel';

export default function VehiclesDashboard() {
  const { data: vehicles = [] } = useQuery({ queryKey: ['vehicles'], queryFn: () => base44.entities.Vehicle.list() });
  const { data: assignments = [] } = useQuery({
    queryKey: ['allAssignments'],
    queryFn: () => base44.entities.VehicleAssignment.list('-date', 500)
  });
  const { data: documents = [] } = useQuery({ queryKey: ['allDocuments'], queryFn: () => base44.entities.VehicleDocument.list() });
  const { data: maintenances = [] } = useQuery({ queryKey: ['allMaintenances'], queryFn: () => base44.entities.MaintenanceLog.list() });
  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.filter({ is_active: true })
  });

  const today = moment().format('YYYY-MM-DD');
  const employeeMap = useMemo(() => Object.fromEntries(employees.map(e => [e.id, e])), [employees]);

  // LOA vehicles at risk
  const loaAtRisk = vehicles.filter(v => {
    if (v.propriete !== 'LOA') return false;
    const stats = calcLoaStats(v);
    return stats && (stats.risque === 'ROUGE' || stats.risque === 'ORANGE');
  });

  // Documents expiring soon or expired
  const docsExpired = documents.filter(d => isDocumentExpired(d));
  const docsExpiringSoon = documents.filter(d => !isDocumentExpired(d) && isDocumentExpiringSoon(d, 30));

  // Today's compliance
  const todayAssignments = assignments.filter(a => a.date === today);
  const missingDebutShift = todayAssignments.filter(a => !a.debut_shift_fait).length;
  const missingFinService = assignments
    .filter(a => a.date === moment().subtract(1, 'day').format('YYYY-MM-DD') && !a.fin_service_fait).length;

  // 30-day km by vehicle
  const last30 = moment().subtract(30, 'days').format('YYYY-MM-DD');
  const recentAssignments = assignments.filter(a => a.date >= last30 && a.statut === 'TERMINE');

  const kmByVehicle = useMemo(() => {
    const map = {};
    recentAssignments.forEach(a => {
      if (!map[a.vehicule_id]) map[a.vehicule_id] = 0;
      map[a.vehicule_id] += (a.distance_calculee || 0);
    });
    return map;
  }, [recentAssignments]);

  // Compliance by employee
  const complianceByEmployee = useMemo(() => {
    const map = {};
    assignments.filter(a => a.statut === 'TERMINE').forEach(a => {
      if (!map[a.employe_id]) map[a.employe_id] = { total: 0, compliant: 0, name: a.employe_name };
      map[a.employe_id].total++;
      if (a.debut_shift_fait && a.fin_service_fait && a.cle_remise) map[a.employe_id].compliant++;
    });
    return Object.entries(map).map(([id, v]) => ({
      id,
      name: v.name || (employeeMap[id] ? `${employeeMap[id].first_name} ${employeeMap[id].last_name}` : id),
      score: v.total > 0 ? Math.round((v.compliant / v.total) * 100) : 100,
      total: v.total
    })).sort((a, b) => a.score - b.score);
  }, [assignments, employeeMap]);

  // Incidents last 30d
  const incidentsLast30 = assignments.filter(a => a.date >= last30 && a.non_conformite).length;

  // Upcoming maintenance
  const upcomingMaintenance = maintenances
    .filter(m => m.prochaine_echeance_date && moment(m.prochaine_echeance_date).diff(moment(), 'days') <= 30)
    .sort((a, b) => a.prochaine_echeance_date > b.prochaine_echeance_date ? 1 : -1);

  // Electric vs Thermal avg km/month
  const elecVehicles = vehicles.filter(v => v.energie === 'ELECTRIQUE');
  const thermVehicles = vehicles.filter(v => v.energie === 'THERMIQUE');

  return (
    <div className="space-y-6 mt-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={<Car className="w-5 h-5 text-blue-600" />} value={vehicles.filter(v => v.statut === 'ACTIF').length} label="Véhicules actifs" sub={`${vehicles.length} total`} color="blue" />
        <KpiCard icon={<AlertTriangle className="w-5 h-5 text-orange-600" />} value={loaAtRisk.length} label="LOA à risque" sub="Orange + Rouge" color="orange" />
        <KpiCard icon={<FileText className="w-5 h-5 text-red-600" />} value={docsExpired.length + docsExpiringSoon.length} label="Documents alertes" sub={`${docsExpired.length} expirés`} color="red" />
        <KpiCard icon={<Shield className="w-5 h-5 text-purple-600" />} value={`${incidentsLast30}`} label="Incidents 30j" sub="Non-conformités" color="purple" />
      </div>

      {/* Today alerts */}
      {(missingDebutShift > 0 || missingFinService > 0) && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h3 className="font-bold text-red-900 mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Alertes temps réel
          </h3>
          <div className="space-y-1 text-sm">
            {missingDebutShift > 0 && (
              <p className="text-red-800">⛔ {missingDebutShift} conducteur(s) n'ont pas fait le check début de shift aujourd'hui</p>
            )}
            {missingFinService > 0 && (
              <p className="text-red-800">⛔ {missingFinService} conducteur(s) n'ont pas validé la fin de service hier</p>
            )}
          </div>
        </div>
      )}

      {/* Alerts panel - top priority */}
      <VehicleAlertsPanel vehicles={vehicles} />

      {/* Energy widget - full width */}
      <EnergyWidget vehicles={vehicles} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LOA gauge overview */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-600" /> Suivi LOA
          </h3>
          {vehicles.filter(v => v.propriete === 'LOA').length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Aucun véhicule en LOA</p>
          ) : (
            <div className="space-y-3">
              {vehicles.filter(v => v.propriete === 'LOA').map(v => {
                const stats = calcLoaStats(v);
                if (!stats) return null;
                const badge = getRisqueBadge(stats.risque);
                return (
                  <div key={v.id}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{v.marque} {v.modele} <span className="text-gray-400 text-xs">{v.immatriculation}</span></span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${badge.className}`}>{badge.label}</span>
                    </div>
                    <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-2.5 rounded-full ${stats.risque === 'ROUGE' ? 'bg-red-500' : stats.risque === 'ORANGE' ? 'bg-orange-400' : 'bg-green-500'}`}
                        style={{ width: `${Math.min(stats.pctConsumed, 100)}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                      <span>{stats.pctConsumed}% consommé</span>
                      <span>~{stats.budgetKmJour} km/j · {stats.joursRestants}j restants</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Compliance scores */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-purple-600" /> Conformité conducteurs
          </h3>
          {complianceByEmployee.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Aucune donnée</p>
          ) : (
            <div className="space-y-2">
              {complianceByEmployee.slice(0, 8).map(emp => {
                const emoji = emp.score === 100 ? '🟢' : emp.score >= 90 ? '🟠' : '🔴';
                return (
                  <div key={emp.id} className="flex items-center gap-3">
                    <span className="text-base">{emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between">
                        <span className="text-sm truncate">{emp.name}</span>
                        <span className="text-sm font-bold text-gray-700">{emp.score}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full mt-0.5">
                        <div className={`h-1.5 rounded-full ${emp.score === 100 ? 'bg-green-500' : emp.score >= 90 ? 'bg-orange-400' : 'bg-red-500'}`}
                          style={{ width: `${emp.score}%` }} />
                      </div>
                    </div>
                    <span className="text-xs text-gray-400">{emp.total} shifts</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Km last 30d by vehicle */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Car className="w-4 h-4 text-gray-600" /> Km parcourus (30j)
          </h3>
          <div className="space-y-2">
            {vehicles.map(v => {
              const km = kmByVehicle[v.id] || 0;
              const maxKm = Math.max(...Object.values(kmByVehicle), 1);
              return (
                <div key={v.id} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-28 truncate">{v.marque} {v.immatriculation}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-2 bg-blue-500 rounded-full" style={{ width: `${(km / maxKm) * 100}%` }} />
                  </div>
                  <span className="text-xs font-medium text-gray-700 w-16 text-right">{km.toLocaleString('fr-FR')} km</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Documents alerts */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4 text-red-600" /> Documents à surveiller
          </h3>
          {docsExpired.length === 0 && docsExpiringSoon.length === 0 ? (
            <p className="text-sm text-green-600 text-center py-4">✅ Tous les documents sont à jour</p>
          ) : (
            <div className="space-y-2">
              {[...docsExpired.map(d => ({ ...d, _status: 'expired' })), ...docsExpiringSoon.map(d => ({ ...d, _status: 'soon' }))].map(d => {
                const v = vehicles.find(v => v.id === d.vehicule_id);
                const diff = moment(d.date_expiration).diff(moment(), 'days');
                return (
                  <div key={d.id} className={`flex items-center justify-between p-2 rounded-lg text-sm ${d._status === 'expired' ? 'bg-red-50' : 'bg-orange-50'}`}>
                    <div>
                      <span className="font-medium">{d.type_doc.replace('_', ' ')}</span>
                      <span className="text-gray-500 ml-1 text-xs">{v ? v.immatriculation : ''}</span>
                    </div>
                    <span className={`text-xs font-medium ${d._status === 'expired' ? 'text-red-700' : 'text-orange-700'}`}>
                      {d._status === 'expired' ? `Expiré il y a ${Math.abs(diff)}j` : `Dans ${diff}j`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Upcoming maintenance */}
      {upcomingMaintenance.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-500" /> Maintenances à venir (30j)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {upcomingMaintenance.map(m => {
              const v = vehicles.find(v => v.id === m.vehicule_id);
              const diff = moment(m.prochaine_echeance_date).diff(moment(), 'days');
              return (
                <div key={m.id} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg text-sm">
                  <div>
                    <span className="font-medium">{m.type}</span>
                    <span className="text-gray-500 ml-1 text-xs">{v ? v.immatriculation : m.vehicule_id}</span>
                  </div>
                  <span className={`text-xs font-medium ${diff <= 7 ? 'text-red-700' : 'text-orange-700'}`}>
                    Dans {diff}j
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Electric vs Thermal */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-blue-600" />
            <span className="font-semibold text-blue-900">Électrique</span>
          </div>
          <p className="text-2xl font-bold text-blue-800">{elecVehicles.length}</p>
          <p className="text-xs text-blue-600">véhicule(s)</p>
          <p className="text-xs text-blue-600 mt-1">
            Km/30j : {elecVehicles.reduce((s, v) => s + (kmByVehicle[v.id] || 0), 0).toLocaleString('fr-FR')} km
          </p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Fuel className="w-4 h-4 text-orange-600" />
            <span className="font-semibold text-orange-900">Thermique</span>
          </div>
          <p className="text-2xl font-bold text-orange-800">{thermVehicles.length}</p>
          <p className="text-xs text-orange-600">véhicule(s)</p>
          <p className="text-xs text-orange-600 mt-1">
            Km/30j : {thermVehicles.reduce((s, v) => s + (kmByVehicle[v.id] || 0), 0).toLocaleString('fr-FR')} km
          </p>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon, value, label, sub, color }) {
  const colors = {
    blue: 'bg-blue-50 border-blue-200',
    orange: 'bg-orange-50 border-orange-200',
    red: 'bg-red-50 border-red-200',
    purple: 'bg-purple-50 border-purple-200',
    green: 'bg-green-50 border-green-200'
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color] || colors.blue}`}>
      <div className="flex items-center gap-2 mb-2">{icon}</div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm font-medium text-gray-700">{label}</p>
      <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
    </div>
  );
}