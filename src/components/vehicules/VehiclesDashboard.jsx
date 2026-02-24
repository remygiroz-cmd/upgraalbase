import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Car, AlertTriangle, TrendingUp, Users, CheckCircle2, XCircle } from 'lucide-react';
import { calcLoaStats, isDocumentExpired, isDocumentExpiringSoon } from './vehiculeUtils';
import moment from 'moment';

function StatCard({ icon: Icon, label, value, color = 'blue', sub }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
  };
  return (
    <div className={`border rounded-xl p-4 ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</span>
      </div>
      <p className="text-3xl font-bold">{value}</p>
      {sub && <p className="text-xs mt-1 opacity-60">{sub}</p>}
    </div>
  );
}

export default function VehiclesDashboard() {
  const today = moment().format('YYYY-MM-DD');
  const monthStart = moment().startOf('month').format('YYYY-MM-DD');

  const { data: vehicles = [] } = useQuery({ queryKey: ['vehicles'], queryFn: () => base44.entities.Vehicle.list() });
  const { data: assignments = [] } = useQuery({ queryKey: ['assignmentsAll'], queryFn: () => base44.entities.VehicleAssignment.list('-date', 500) });
  const { data: documents = [] } = useQuery({ queryKey: ['vehicleDocumentsAll'], queryFn: () => base44.entities.VehicleDocument.list() });
  const { data: employees = [] } = useQuery({ queryKey: ['employees'], queryFn: () => base44.entities.Employee.filter({ is_active: true }) });

  const todayAssignments = assignments.filter(a => a.date === today);
  const monthAssignments = assignments.filter(a => a.date >= monthStart);

  const loaRiskVehicles = useMemo(() =>
    vehicles.filter(v => {
      if (v.propriete !== 'LOA') return false;
      const s = calcLoaStats(v);
      return s && (s.risque === 'ROUGE' || s.risque === 'ORANGE');
    }), [vehicles]);

  const expiredDocs = useMemo(() => documents.filter(isDocumentExpired), [documents]);
  const expiringSoonDocs = useMemo(() => documents.filter(d => !isDocumentExpired(d) && isDocumentExpiringSoon(d)), [documents]);

  const nonConformToday = todayAssignments.filter(a => a.non_conformite);
  const missingFinService = todayAssignments.filter(a => a.debut_shift_fait && !a.fin_service_fait);
  const missingCle = todayAssignments.filter(a => a.fin_service_fait && !a.cle_remise);

  // Compliance per employee (last 30 days)
  const last30 = assignments.filter(a => a.date >= moment().subtract(30, 'days').format('YYYY-MM-DD'));
  const empStats = useMemo(() => {
    const map = {};
    last30.forEach(a => {
      if (!map[a.employe_id]) map[a.employe_id] = { total: 0, ok: 0, name: a.employe_name };
      map[a.employe_id].total += 1;
      if (!a.non_conformite) map[a.employe_id].ok += 1;
    });
    return Object.entries(map).map(([id, s]) => ({
      id, name: s.name, pct: s.total > 0 ? Math.round((s.ok / s.total) * 100) : 100, total: s.total
    })).sort((a, b) => a.pct - b.pct);
  }, [last30]);

  // km per vehicle this month
  const kmPerVehicle = useMemo(() => {
    const map = {};
    monthAssignments.forEach(a => {
      if (!map[a.vehicule_id]) map[a.vehicule_id] = 0;
      map[a.vehicule_id] += a.distance_calculee || 0;
    });
    return map;
  }, [monthAssignments]);

  return (
    <div className="space-y-6 mt-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Car} label="Total flotte" value={vehicles.length} color="blue" sub={`${vehicles.filter(v => v.statut === 'ACTIF').length} actifs`} />
        <StatCard icon={CheckCircle2} label="Assignés aujourd'hui" value={todayAssignments.length} color="green" />
        <StatCard icon={AlertTriangle} label="Risque LOA" value={loaRiskVehicles.length} color={loaRiskVehicles.length > 0 ? 'orange' : 'green'} />
        <StatCard icon={XCircle} label="Docs expirés" value={expiredDocs.length} color={expiredDocs.length > 0 ? 'red' : 'green'} sub={expiringSoonDocs.length > 0 ? `${expiringSoonDocs.length} expirent bientôt` : ''} />
      </div>

      {/* Alerts */}
      {(missingFinService.length > 0 || missingCle.length > 0 || expiredDocs.length > 0) && (
        <div className="space-y-2">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" /> Alertes
          </h3>
          {missingFinService.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-900">
              ⛔ <strong>{missingFinService.length}</strong> check(s) fin de service manquant(s) aujourd'hui
            </div>
          )}
          {missingCle.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-900">
              🔑 <strong>{missingCle.length}</strong> véhicule(s) sans clé validée aujourd'hui
            </div>
          )}
          {expiredDocs.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-900">
              📄 <strong>{expiredDocs.length}</strong> document(s) expiré(s)
            </div>
          )}
          {expiringSoonDocs.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-900">
              ⚠️ <strong>{expiringSoonDocs.length}</strong> document(s) expirant dans 30 jours
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LOA at risk */}
        <div>
          <h3 className="font-semibold text-gray-900 mb-3">📋 Véhicules LOA à risque</h3>
          {loaRiskVehicles.length === 0 ? (
            <div className="text-center py-6 text-gray-400 bg-gray-50 rounded-xl">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400" />
              <p className="text-sm">Tous les contrats LOA sont dans les normes</p>
            </div>
          ) : (
            <div className="space-y-2">
              {loaRiskVehicles.map(v => {
                const s = calcLoaStats(v);
                return (
                  <div key={v.id} className={`p-3 rounded-lg border text-sm ${s.risque === 'ROUGE' ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200'}`}>
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{v.marque} {v.modele} <span className="font-mono text-xs">{v.immatriculation}</span></span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${s.risque === 'ROUGE' ? 'bg-red-200 text-red-900' : 'bg-orange-200 text-orange-900'}`}>
                        {s.pctConsumed}% consommé
                      </span>
                    </div>
                    <p className="text-xs mt-1 opacity-70">Budget restant : ~{s.budgetKmJour} km/j · {s.joursRestants}j restants</p>
                    {v.loa_cout_km_supp && s.kmRestants < 0 && (
                      <p className="text-xs font-bold text-red-800 mt-1">
                        Dépassement : {Math.abs(s.kmRestants)} km → ~{(Math.abs(s.kmRestants) * v.loa_cout_km_supp).toFixed(0)}€
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Km ce mois */}
        <div>
          <h3 className="font-semibold text-gray-900 mb-3">📊 Km parcourus ce mois</h3>
          <div className="space-y-2">
            {vehicles.map(v => {
              const km = kmPerVehicle[v.id] || 0;
              return (
                <div key={v.id} className="flex items-center gap-3 p-2">
                  <span className="text-sm text-gray-700 flex-1 truncate">{v.marque} {v.modele} <span className="font-mono text-xs text-gray-400">{v.immatriculation}</span></span>
                  <span className="text-sm font-medium text-gray-900">{km.toLocaleString('fr-FR')} km</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Compliance */}
        <div>
          <h3 className="font-semibold text-gray-900 mb-3">
            <Users className="w-4 h-4 inline mr-1" /> Conformité conducteurs (30j)
          </h3>
          {empStats.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Aucune donnée</p>
          ) : (
            <div className="space-y-2">
              {empStats.map(e => (
                <div key={e.id} className="flex items-center gap-3">
                  <span className="text-xl">{e.pct >= 100 ? '🟢' : e.pct >= 90 ? '🟠' : '🔴'}</span>
                  <div className="flex-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{e.name}</span>
                      <span className={e.pct >= 100 ? 'text-green-600' : e.pct >= 90 ? 'text-orange-600' : 'text-red-600'}>
                        {e.pct}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full mt-1">
                      <div className={`h-1.5 rounded-full ${e.pct >= 100 ? 'bg-green-500' : e.pct >= 90 ? 'bg-orange-400' : 'bg-red-500'}`}
                        style={{ width: `${e.pct}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Today summary */}
        <div>
          <h3 className="font-semibold text-gray-900 mb-3">📅 Aujourd'hui</h3>
          <div className="space-y-2">
            {todayAssignments.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Aucune assignation aujourd'hui</p>
            ) : (
              todayAssignments.map(a => {
                const v = vehicles.find(x => x.id === a.vehicule_id);
                return (
                  <div key={a.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                    <div>
                      <span className="font-medium">{v ? `${v.marque} ${v.modele}` : '?'}</span>
                      <span className="text-gray-500 ml-2">{a.employe_name}</span>
                    </div>
                    <div className="flex gap-2">
                      {a.debut_shift_fait ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-gray-300" />}
                      {a.fin_service_fait ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-gray-300" />}
                      {a.non_conformite && <AlertTriangle className="w-4 h-4 text-red-500" />}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}