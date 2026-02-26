import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, CheckCircle2, Clock, ChevronDown, ChevronUp, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import moment from 'moment';

const SEVERITY_CONFIG = {
  URGENT: { label: 'URGENT', cls: 'bg-red-600 text-white', order: 3 },
  IMPORTANT: { label: 'Important', cls: 'bg-orange-500 text-white', order: 2 },
  INFO: { label: 'Info', cls: 'bg-blue-500 text-white', order: 1 },
};

const STATUS_CONFIG = {
  OPEN: { label: 'Ouvert', cls: 'bg-red-100 text-red-800' },
  IN_PROGRESS: { label: 'En cours', cls: 'bg-orange-100 text-orange-800' },
  RESOLVED: { label: 'Résolu', cls: 'bg-green-100 text-green-800' },
  DISMISSED: { label: 'Fermé', cls: 'bg-gray-100 text-gray-600' },
};

const CAT_LABELS = {
  PNEUS: '🔧 Pneus', FREINS: '🛑 Freins', VOYANTS: '⚠️ Voyants', CARROSSERIE: '🚗 Carrosserie',
  MOTEUR: '⚙️ Moteur', BATTERIE_CHARGE: '🔋 Batterie', CARBURANT: '⛽ Carburant',
  SECURITE: '🔐 Sécurité', DOCUMENTS: '📄 Documents', AUTRE: '❓ Autre',
};

export default function VehicleAlertsPanel({ vehicles }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(true);
  const [filter, setFilter] = useState('active'); // 'active' | 'all'
  const [resolutionNote, setResolutionNote] = useState({});

  const { data: alerts = [] } = useQuery({
    queryKey: ['vehicleAlerts'],
    queryFn: () => base44.entities.VehicleAlert.list('-reported_at', 100),
    refetchInterval: 30000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.VehicleAlert.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicleAlerts'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
    onError: () => toast.error('Erreur'),
  });

  const activeAlerts = alerts.filter(a => a.status === 'OPEN' || a.status === 'IN_PROGRESS');
  const displayed = filter === 'active' ? activeAlerts : alerts;

  // Sort: URGENT first, then by date
  const sorted = [...displayed].sort((a, b) => {
    const so = (SEVERITY_CONFIG[b.severity]?.order || 0) - (SEVERITY_CONFIG[a.severity]?.order || 0);
    if (so !== 0) return so;
    return new Date(b.reported_at || b.created_date) - new Date(a.reported_at || a.created_date);
  });

  const urgentCount = activeAlerts.filter(a => a.severity === 'URGENT').length;

  if (activeAlerts.length === 0 && filter === 'active') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
        <div>
          <p className="font-semibold text-green-800">Aucune alerte active</p>
          {alerts.length > 0 && (
            <button onClick={() => setFilter('all')} className="text-xs text-green-600 underline">
              Voir l'historique ({alerts.length} alertes)
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border-2 ${urgentCount > 0 ? 'border-red-400 bg-red-50' : 'border-orange-300 bg-orange-50'}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-center gap-3">
          <AlertTriangle className={`w-5 h-5 ${urgentCount > 0 ? 'text-red-600 animate-pulse' : 'text-orange-600'}`} />
          <div>
            <h3 className={`font-bold ${urgentCount > 0 ? 'text-red-900' : 'text-orange-900'}`}>
              🚨 Alertes véhicules en cours
            </h3>
            <p className="text-sm text-gray-600">
              {activeAlerts.length} alerte(s) — {urgentCount} urgente(s)
            </p>
          </div>
          {urgentCount > 0 && (
            <span className="px-2 py-1 bg-red-600 text-white text-xs font-bold rounded-full animate-pulse">
              {urgentCount} URGENT
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex text-xs rounded-lg overflow-hidden border border-gray-300">
            <button onClick={e => { e.stopPropagation(); setFilter('active'); }}
              className={`px-3 py-1.5 ${filter === 'active' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600'}`}>
              Actives
            </button>
            <button onClick={e => { e.stopPropagation(); setFilter('all'); }}
              className={`px-3 py-1.5 ${filter === 'all' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600'}`}>
              Toutes
            </button>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {sorted.map(alert => {
            const v = vehicles.find(v => v.id === alert.vehicle_id);
            const sev = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.INFO;
            const sta = STATUS_CONFIG[alert.status] || STATUS_CONFIG.OPEN;
            const isUrgent = alert.severity === 'URGENT';

            return (
              <div key={alert.id} className={`bg-white rounded-xl border p-4 ${isUrgent ? 'border-red-400 shadow-sm' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${sev.cls}`}>{sev.label}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${sta.cls}`}>{sta.label}</span>
                      <span className="text-xs text-gray-500">{CAT_LABELS[alert.category] || alert.category}</span>
                      {!alert.vehicle_drivable && (
                        <span className="text-xs px-2 py-0.5 bg-red-100 text-red-800 rounded-full font-semibold flex items-center gap-1">
                          <Ban className="w-3 h-3" /> Immobilisé
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-gray-900 text-sm">{alert.title}</p>
                    <p className="text-xs text-gray-500">
                      {v ? `${v.marque} ${v.modele} — ${v.immatriculation}` : alert.vehicle_id}
                      {' · '}{alert.reported_by_name || 'Inconnu'}
                      {' · '}{moment(alert.reported_at || alert.created_date).format('DD/MM HH:mm')}
                    </p>
                    <p className="text-sm text-gray-700 mt-1 line-clamp-2">{alert.description}</p>
                    {alert.location_context && (
                      <p className="text-xs text-gray-400 mt-0.5">📍 {alert.location_context}</p>
                    )}
                  </div>
                  {alert.photos?.length > 0 && (
                    <img src={alert.photos[0]} alt="" className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {alert.status === 'OPEN' && (
                    <Button size="sm" variant="outline" className="text-xs h-7"
                      onClick={() => updateMutation.mutate({ id: alert.id, data: { status: 'IN_PROGRESS' } })}>
                      <Clock className="w-3 h-3 mr-1" /> En cours
                    </Button>
                  )}
                  {(alert.status === 'OPEN' || alert.status === 'IN_PROGRESS') && (
                    <>
                      <Button size="sm" className="text-xs h-7 bg-green-600 hover:bg-green-700"
                        onClick={() => updateMutation.mutate({
                          id: alert.id,
                          data: {
                            status: 'RESOLVED',
                            resolution_note: resolutionNote[alert.id] || '',
                            handled_at: new Date().toISOString(),
                          }
                        })}>
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Résolu
                      </Button>
                      {v && v.statut !== 'INDISPONIBLE' && (
                        <Button size="sm" variant="outline" className="text-xs h-7 border-red-300 text-red-700 hover:bg-red-50"
                          onClick={async () => {
                            await base44.entities.Vehicle.update(v.id, { statut: 'INDISPONIBLE' });
                            queryClient.invalidateQueries({ queryKey: ['vehicles'] });
                            toast.success('Véhicule mis indisponible');
                          }}>
                          <Ban className="w-3 h-3 mr-1" /> Mettre indisponible
                        </Button>
                      )}
                      {v && v.statut === 'INDISPONIBLE' && (
                        <Button size="sm" variant="outline" className="text-xs h-7 border-green-300 text-green-700 hover:bg-green-50"
                          onClick={async () => {
                            await base44.entities.Vehicle.update(v.id, { statut: 'ACTIF' });
                            queryClient.invalidateQueries({ queryKey: ['vehicles'] });
                            toast.success('Véhicule remis actif');
                          }}>
                          ✅ Remettre actif
                        </Button>
                      )}
                    </>
                  )}
                </div>

                {/* Note résolution inline */}
                {(alert.status === 'OPEN' || alert.status === 'IN_PROGRESS') && (
                  <input
                    type="text"
                    placeholder="Note de résolution (optionnel)..."
                    value={resolutionNote[alert.id] || ''}
                    onChange={e => setResolutionNote(n => ({ ...n, [alert.id]: e.target.value }))}
                    className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700"
                  />
                )}
                {alert.resolution_note && alert.status === 'RESOLVED' && (
                  <p className="text-xs text-green-700 mt-2 bg-green-50 rounded px-2 py-1">✅ {alert.resolution_note}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}