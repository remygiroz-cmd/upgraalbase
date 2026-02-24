import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Trash2, Edit } from 'lucide-react';
import VehicleCard from './VehicleCard';
import VehicleFormModal from './VehicleFormModal';
import VehicleDetailModal from './VehicleDetailModal';
import { toast } from 'sonner';

export default function VehiclesFleetTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterUsage, setFilterUsage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editVehicle, setEditVehicle] = useState(null);
  const [detailVehicle, setDetailVehicle] = useState(null);

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => base44.entities.Vehicle.list('-created_date')
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Vehicle.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      toast.success('Véhicule supprimé');
    }
  });

  const filtered = vehicles.filter(v => {
    const q = search.toLowerCase();
    const matchSearch = !q || v.marque?.toLowerCase().includes(q) || v.modele?.toLowerCase().includes(q) || v.immatriculation?.toLowerCase().includes(q);
    const matchStatut = !filterStatut || v.statut === filterStatut;
    const matchUsage = !filterUsage || v.type_usage === filterUsage;
    return matchSearch && matchStatut && matchUsage;
  });

  return (
    <div className="space-y-4 mt-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." className="pl-9" />
        </div>
        <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm">
          <option value="">Tous statuts</option>
          <option value="ACTIF">Actif</option>
          <option value="INDISPONIBLE">Indisponible</option>
          <option value="ATELIER">Atelier</option>
          <option value="RESERVE">Réserve</option>
        </select>
        <select value={filterUsage} onChange={e => setFilterUsage(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm">
          <option value="">Tous usages</option>
          <option value="LIVRAISON">Livraison</option>
          <option value="DIRECTION">Direction</option>
        </select>
        <Button onClick={() => { setEditVehicle(null); setShowForm(true); }} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-1" /> Ajouter
        </Button>
      </div>

      {/* Summary */}
      <div className="flex gap-4 text-sm text-gray-600 flex-wrap">
        <span className="font-medium">{vehicles.length} véhicule(s)</span>
        <span className="text-green-600">{vehicles.filter(v => v.statut === 'ACTIF').length} actifs</span>
        <span className="text-red-600">{vehicles.filter(v => v.statut === 'INDISPONIBLE').length} indisponibles</span>
        <span className="text-orange-600">{vehicles.filter(v => v.statut === 'ATELIER').length} en atelier</span>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Chargement...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg font-medium">Aucun véhicule</p>
          <p className="text-sm mt-1">Ajoutez votre premier véhicule avec le bouton ci-dessus.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(v => (
            <div key={v.id} className="relative group">
              <VehicleCard vehicle={v} onClick={() => setDetailVehicle(v)} />
              <div className="absolute top-2 right-8 hidden group-hover:flex gap-1">
                <button onClick={e => { e.stopPropagation(); setEditVehicle(v); setShowForm(true); }}
                  className="p-1.5 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-blue-50">
                  <Edit className="w-3.5 h-3.5 text-blue-600" />
                </button>
                <button onClick={e => { e.stopPropagation(); if (confirm(`Supprimer ${v.immatriculation} ?`)) deleteMutation.mutate(v.id); }}
                  className="p-1.5 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-red-50">
                  <Trash2 className="w-3.5 h-3.5 text-red-600" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <VehicleFormModal open={showForm} onOpenChange={setShowForm} vehicle={editVehicle} />
      {detailVehicle && (
        <VehicleDetailModal
          open={!!detailVehicle}
          onOpenChange={v => !v && setDetailVehicle(null)}
          vehicle={detailVehicle}
          onEdit={() => { setEditVehicle(detailVehicle); setDetailVehicle(null); setShowForm(true); }}
        />
      )}
    </div>
  );
}