import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import moment from 'moment';

const CAT_LABELS = {
  PNEUS: '🔧 Pneus', FREINS: '🛑 Freins', VOYANTS: '⚠️ Voyants', CARROSSERIE: '🚗 Carrosserie',
  MOTEUR: '⚙️ Moteur', BATTERIE_CHARGE: '🔋 Batterie', CARBURANT: '⛽ Carburant',
  SECURITE: '🔐 Sécurité', DOCUMENTS: '📄 Documents', AUTRE: '❓ Autre',
};

export default function HomeVehicleAlertsWidget() {
  const navigate = useNavigate();

  const { data: alerts = [] } = useQuery({
    queryKey: ['vehicleAlerts'],
    queryFn: () => base44.entities.VehicleAlert.list('-reported_at', 50),
    refetchInterval: 60000,
  });

  const activeAlerts = alerts.filter(a =>
    (a.status === 'OPEN' || a.status === 'IN_PROGRESS') &&
    (a.severity === 'IMPORTANT' || a.severity === 'URGENT')
  );

  if (activeAlerts.length === 0) return null;

  const urgentCount = activeAlerts.filter(a => a.severity === 'URGENT').length;
  const top3 = [...activeAlerts]
    .sort((a, b) => {
      const so = { URGENT: 2, IMPORTANT: 1 };
      return (so[b.severity] || 0) - (so[a.severity] || 0) ||
        new Date(b.reported_at || b.created_date) - new Date(a.reported_at || a.created_date);
    })
    .slice(0, 3);

  return (
    <div className={`rounded-xl border-2 p-4 ${urgentCount > 0 ? 'bg-red-50 border-red-400' : 'bg-orange-50 border-orange-300'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className={`w-5 h-5 ${urgentCount > 0 ? 'text-red-600 animate-pulse' : 'text-orange-600'}`} />
          <h3 className={`font-bold text-sm ${urgentCount > 0 ? 'text-red-900' : 'text-orange-900'}`}>
            🚨 {activeAlerts.length} alerte(s) véhicule(s) à traiter
          </h3>
          {urgentCount > 0 && (
            <span className="px-2 py-0.5 bg-red-600 text-white text-xs font-bold rounded-full animate-pulse">
              {urgentCount} URGENT
            </span>
          )}
        </div>
        <button
          onClick={() => navigate(createPageUrl('Vehicules') + '?tab=dashboard')}
          className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
        >
          Dashboard Parc <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-2">
        {top3.map(alert => (
          <div key={alert.id} className={`bg-white rounded-lg px-3 py-2 border text-xs flex items-center justify-between ${alert.severity === 'URGENT' ? 'border-red-300' : 'border-orange-200'}`}>
            <div className="flex-1 min-w-0">
              <span className={`inline-block px-1.5 py-0.5 rounded text-white font-bold mr-2 text-[10px] ${alert.severity === 'URGENT' ? 'bg-red-600' : 'bg-orange-500'}`}>
                {alert.severity}
              </span>
              <span className="font-semibold text-gray-800">{alert.title}</span>
              <span className="text-gray-400 ml-1">· {CAT_LABELS[alert.category] || alert.category}</span>
            </div>
            <span className="text-gray-400 ml-2 flex-shrink-0">{moment(alert.reported_at || alert.created_date).format('HH:mm')}</span>
          </div>
        ))}
      </div>

      <button
        onClick={() => navigate(createPageUrl('Vehicules') + '?tab=dashboard')}
        className={`mt-3 w-full py-2 rounded-lg text-sm font-semibold text-white transition-colors ${urgentCount > 0 ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-500 hover:bg-orange-600'}`}
      >
        Voir toutes les alertes → Dashboard Parc Véhicules
      </button>
    </div>
  );
}