import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trash2, AlertCircle, Package } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { toast } from 'sonner';

export default function RupturesTab() {
  const queryClient = useQueryClient();

  const { data: ruptures = [], isLoading } = useQuery({
    queryKey: ['ruptures'],
    queryFn: () => base44.entities.RuptureHistory.list('-date')
  });

  const deleteRuptureMutation = useMutation({
    mutationFn: (id) => base44.entities.RuptureHistory.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ruptures'] });
      toast.success('Rupture supprimée');
    }
  });

  const deleteAllRupturesMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(ruptures.map(rupture => base44.entities.RuptureHistory.delete(rupture.id)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ruptures'] });
      toast.success('Toutes les ruptures ont été supprimées');
    }
  });

  if (isLoading) return <LoadingSpinner />;

  if (ruptures.length === 0) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Aucune rupture enregistrée"
        description="Les produits en rupture chez vos fournisseurs apparaîtront ici"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-900">⚠️ Historique des Ruptures</h2>
          <Badge variant="outline" className="text-gray-600">
            {ruptures.length} rupture{ruptures.length > 1 ? 's' : ''}
          </Badge>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            if (confirm(`Supprimer toutes les ${ruptures.length} ruptures ?`)) {
              deleteAllRupturesMutation.mutate();
            }
          }}
          className="border-red-500 text-red-500 hover:bg-red-50"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Tout supprimer
        </Button>
      </div>

      <div className="space-y-2">
        {ruptures.map((rupture) => (
          <div
            key={rupture.id}
            className="bg-white border-2 border-red-200 rounded-lg p-4 hover:border-red-400 transition-all"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                  <h3 className="font-bold text-gray-900">{rupture.item_name}</h3>
                </div>
                
                <div className="space-y-1 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Fournisseur:</span>
                    <span>{rupture.supplier_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Quantité:</span>
                    <Badge className="bg-red-100 text-red-800">
                      {rupture.quantity} {rupture.unit}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Date:</span>
                    <span>{format(new Date(rupture.date), 'dd MMMM yyyy', { locale: fr })}</span>
                  </div>
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (confirm('Supprimer cette rupture ?')) {
                    deleteRuptureMutation.mutate(rupture.id);
                  }
                }}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}