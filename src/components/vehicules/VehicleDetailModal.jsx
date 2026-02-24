import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Car, Edit, FileText, Wrench, History, AlertTriangle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { calcLoaStats, getStatutBadge, vehicleDisplayName, getRisqueBadge } from './vehiculeUtils';
import moment from 'moment';

export default function VehicleDetailModal({ open, onOpenChange, vehicle, onEdit }) {
  if (!vehicle) return null;

  const loaStats = calcLoaStats(vehicle);
  const statutBadge = getStatutBadge(vehicle.statut);

  const { data: assignments = [] } = useQuery({
    queryKey: ['vehicleAssignments', vehicle.id],
    queryFn: () => base44.entities.VehicleAssignment.filter({ vehicule_id: vehicle.id }),
    enabled: open
  });

  const { data: maintenances = [] } = useQuery({
    queryKey: ['vehicleMaintenance', vehicle.id],
    queryFn: () => base44.entities.MaintenanceLog.filter({ vehicule_id: vehicle.id }),
    enabled: open
  });

  const { data: documents = [] } = useQuery({
    queryKey: ['vehicleDocuments', vehicle.id],
    queryFn: () => base44.entities.VehicleDocument.filter({ vehicule_id: vehicle.id }),
    enabled: open
  });

  const pneuKmDepuisMontage = vehicle.km_montage_pneus
    ? (vehicle.km_actuel || 0) - (vehicle.km_montage_pneus || 0)
    : null;
  const pneuAlerteActive = vehicle.seuil_alerte_km_pneus && pneuKmDepuisMontage !== null
    && pneuKmDepuisMontage >= vehicle.seuil_alerte_km_pneus;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Car className="w-5 h-5 text-blue-600" />
              {vehicle.marque} {vehicle.modele}
              <span className={`text-xs px-2 py-0.5 rounded-full ml-1 ${statutBadge.className}`}>{statutBadge.label}</span>
            </DialogTitle>
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Edit className="w-3.5 h-3.5 mr-1" /> Modifier
            </Button>
          </div>
          <p className="text-sm text-gray-500 font-mono">{vehicle.immatriculation}</p>
        </DialogHeader>

        {/* Header stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-gray-900">{(vehicle.km_actuel || 0).toLocaleString('fr-FR')}</p>
            <p className="text-xs text-gray-500">km actuel</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-gray-900">{assignments.length}</p>
            <p className="text-xs text-gray-500">assignations</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-gray-900">{maintenances.length}</p>
            <p className="text-xs text-gray-500">maintenances</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-gray-900">{documents.length}</p>
            <p className="text-xs text-gray-500">documents</p>
          </div>
        </div>

        {/* Alerts */}
        {pneuAlerteActive && (
          <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-900">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>⚠️ Pneus : {pneuKmDepuisMontage.toLocaleString('fr-FR')} km depuis le dernier montage — seuil atteint ({vehicle.seuil_alerte_km_pneus.toLocaleString('fr-FR')} km)</span>
          </div>
        )}

        {/* LOA gauge */}
        {loaStats && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-blue-900 text-sm">📋 Contrat LOA</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${getRisqueBadge(loaStats.risque).className}`}>
                {getRisqueBadge(loaStats.risque).label}
              </span>
            </div>
            <div className="w-full h-3 bg-blue-100 rounded-full overflow-hidden mb-2">
              <div className={`h-3 rounded-full ${loaStats.risque === 'ROUGE' ? 'bg-red-500' : loaStats.risque === 'ORANGE' ? 'bg-orange-400' : 'bg-green-500'}`}
                style={{ width: `${Math.min(loaStats.pctConsumed, 100)}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs text-blue-800">
              <div><span className="font-medium">{loaStats.kmConsumed.toLocaleString('fr-FR')} km</span><br />consommés</div>
              <div><span className="font-medium">{loaStats.kmRestants.toLocaleString('fr-FR')} km</span><br />restants</div>
              <div><span className="font-medium">~{loaStats.budgetKmJour} km/j</span><br />budget ({loaStats.joursRestants}j restants)</div>
            </div>
            {vehicle.loa_cout_km_supp && loaStats.kmRestants < 0 && (
              <p className="mt-2 text-xs text-red-800 font-medium">
                ⚠️ Dépassement estimé : {Math.abs(loaStats.kmRestants).toLocaleString('fr-FR')} km × {vehicle.loa_cout_km_supp}€ = <strong>{(Math.abs(loaStats.kmRestants) * vehicle.loa_cout_km_supp).toFixed(0)}€</strong>
              </p>
            )}
          </div>
        )}

        <Tabs defaultValue="historique">
          <TabsList>
            <TabsTrigger value="historique"><History className="w-3.5 h-3.5 mr-1" /> Historique</TabsTrigger>
            <TabsTrigger value="maintenance"><Wrench className="w-3.5 h-3.5 mr-1" /> Maintenance</TabsTrigger>
            <TabsTrigger value="documents"><FileText className="w-3.5 h-3.5 mr-1" /> Documents</TabsTrigger>
          </TabsList>

          <TabsContent value="historique">
            <div className="space-y-2 mt-3">
              {assignments.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Aucune assignation pour ce véhicule</p>
              ) : (
                [...assignments].sort((a, b) => b.date > a.date ? 1 : -1).slice(0, 30).map(a => (
                  <div key={a.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                    <div>
                      <span className="font-medium">{moment(a.date).format('DD/MM/YYYY')}</span>
                      <span className="text-gray-500 ml-2">{a.employe_name || a.employe_id}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      {a.distance_calculee != null && <span>{a.distance_calculee} km</span>}
                      {a.non_conformite && <span className="text-red-600 font-medium">⚠️ Non-conformité</span>}
                      <span className={a.statut === 'TERMINE' ? 'text-green-600' : 'text-orange-600'}>{a.statut}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="maintenance">
            <div className="space-y-2 mt-3">
              {maintenances.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Aucune maintenance enregistrée</p>
              ) : (
                [...maintenances].sort((a, b) => b.date > a.date ? 1 : -1).map(m => (
                  <div key={m.id} className="p-3 bg-gray-50 rounded-lg text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">{m.type} — {moment(m.date).format('DD/MM/YYYY')}</span>
                      {m.cout && <span className="text-gray-600">{m.cout}€</span>}
                    </div>
                    {m.description && <p className="text-gray-500 text-xs mt-1">{m.description}</p>}
                    {m.prochaine_echeance_date && (
                      <p className="text-xs text-blue-600 mt-1">Prochaine échéance : {moment(m.prochaine_echeance_date).format('DD/MM/YYYY')}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="documents">
            <div className="space-y-2 mt-3">
              {documents.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Aucun document</p>
              ) : (
                documents.map(d => (
                  <div key={d.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                    <div>
                      <span className="font-medium">{d.type_doc.replace('_', ' ')}</span>
                      {d.nom && <span className="text-gray-500 ml-2">{d.nom}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {d.date_expiration && (
                        <span className={`text-xs ${moment(d.date_expiration).isBefore(moment()) ? 'text-red-600 font-medium' : moment(d.date_expiration).diff(moment(), 'days') <= 30 ? 'text-orange-600' : 'text-gray-500'}`}>
                          exp. {moment(d.date_expiration).format('DD/MM/YYYY')}
                        </span>
                      )}
                      {d.fichier_url && (
                        <a href={d.fichier_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-xs hover:underline">Voir</a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}