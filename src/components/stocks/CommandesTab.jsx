import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Calendar, Package, Filter, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import OrderDetailModal from './OrderDetailModal';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function CommandesTab() {
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [statusFilter, setStatusFilter] = useState('en_cours');
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => base44.entities.Order.list('-date')
  });

  const deleteOrderMutation = useMutation({
    mutationFn: (id) => base44.entities.Order.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Commande supprimée');
    }
  });

  const deleteAllByStatusMutation = useMutation({
    mutationFn: async (status) => {
      const ordersToDelete = orders.filter(o => o.status === status);
      await Promise.all(ordersToDelete.map(o => base44.entities.Order.delete(o.id)));
      return ordersToDelete.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success(`${count} commande(s) supprimée(s)`);
    }
  });

  const handleDeleteOrder = (e, orderId) => {
    e.stopPropagation();
    if (confirm('Voulez-vous vraiment supprimer cette commande ?')) {
      deleteOrderMutation.mutate(orderId);
    }
  };

  const handleDeleteAllByStatus = () => {
    const count = orders.filter(o => o.status === statusFilter).length;
    if (count === 0) return;
    
    const statusLabel = getStatusBadge(statusFilter).label.toLowerCase();
    if (confirm(`Voulez-vous vraiment supprimer toutes les ${count} commande(s) ${statusLabel} ?`)) {
      deleteAllByStatusMutation.mutate(statusFilter);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      en_cours: 'bg-orange-100 text-orange-800',
      envoyee: 'bg-blue-100 text-blue-800',
      terminee: 'bg-green-100 text-green-800',
      annulee: 'bg-red-100 text-red-800'
    };
    const labels = {
      en_cours: 'EN COURS',
      envoyee: 'ENVOYÉE',
      terminee: 'TERMINÉE',
      annulee: 'ANNULÉE'
    };
    return { style: styles[status] || styles.en_cours, label: labels[status] || 'EN COURS' };
  };

  if (isLoading) return <LoadingSpinner />;

  // Filtrer les commandes par statut
  const filteredOrders = orders.filter(order => 
    statusFilter === 'all' ? true : order.status === statusFilter
  );

  const statusCounts = {
    all: orders.length,
    en_cours: orders.filter(o => o.status === 'en_cours').length,
    envoyee: orders.filter(o => o.status === 'envoyee').length,
    terminee: orders.filter(o => o.status === 'terminee').length,
    annulee: orders.filter(o => o.status === 'annulee').length
  };

  if (filteredOrders.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">📦 Bons de Commande</h2>
        </div>
        
        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full">
          <TabsList className="grid w-full grid-cols-5 mb-4">
            <TabsTrigger value="en_cours" className="text-xs">
              En cours {statusCounts.en_cours > 0 && `(${statusCounts.en_cours})`}
            </TabsTrigger>
            <TabsTrigger value="envoyee" className="text-xs">
              Envoyées {statusCounts.envoyee > 0 && `(${statusCounts.envoyee})`}
            </TabsTrigger>
            <TabsTrigger value="terminee" className="text-xs">
              Terminées {statusCounts.terminee > 0 && `(${statusCounts.terminee})`}
            </TabsTrigger>
            <TabsTrigger value="annulee" className="text-xs">
              Annulées {statusCounts.annulee > 0 && `(${statusCounts.annulee})`}
            </TabsTrigger>
            <TabsTrigger value="all" className="text-xs">
              Toutes {statusCounts.all > 0 && `(${statusCounts.all})`}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <EmptyState
          icon={Package}
          title="Aucune commande"
          description={`Aucune commande ${statusFilter === 'all' ? '' : getStatusBadge(statusFilter).label.toLowerCase()}`}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">📦 Bons de Commande</h2>
        {statusFilter !== 'all' && filteredOrders.length > 0 && (
          <Button
            variant="outline"
            onClick={handleDeleteAllByStatus}
            className="border-red-600 text-red-600 hover:bg-red-50 gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Supprimer toutes ({filteredOrders.length})
          </Button>
        )}
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full">
        <TabsList className="grid w-full grid-cols-5 mb-4">
          <TabsTrigger value="en_cours" className="text-xs">
            En cours {statusCounts.en_cours > 0 && `(${statusCounts.en_cours})`}
          </TabsTrigger>
          <TabsTrigger value="envoyee" className="text-xs">
            Envoyées {statusCounts.envoyee > 0 && `(${statusCounts.envoyee})`}
          </TabsTrigger>
          <TabsTrigger value="terminee" className="text-xs">
            Terminées {statusCounts.terminee > 0 && `(${statusCounts.terminee})`}
          </TabsTrigger>
          <TabsTrigger value="annulee" className="text-xs">
            Annulées {statusCounts.annulee > 0 && `(${statusCounts.annulee})`}
          </TabsTrigger>
          <TabsTrigger value="all" className="text-xs">
            Toutes {statusCounts.all > 0 && `(${statusCounts.all})`}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-3">
        {filteredOrders.map((order) => {
          const badge = getStatusBadge(order.status);
          const totalItems = order.items?.length || 0;
          const totalAmount = order.items?.reduce((sum, item) => {
            return sum + (item.quantity * (item.unit_price || 0));
          }, 0) || 0;

          return (
            <div
              key={order.id}
              className="bg-white rounded-lg border-2 border-gray-300 p-4 hover:border-orange-500 hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between gap-4">
                <div 
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => setSelectedOrder(order)}
                >
                  <h3 className="font-bold text-gray-900 text-lg truncate">
                    {order.supplier_name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      <span>{format(new Date(order.date), 'dd/MM/yyyy', { locale: fr })}</span>
                    </div>
                    <span>•</span>
                    <span>{totalItems} article{totalItems > 1 ? 's' : ''}</span>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-end gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${badge.style}`}>
                      {badge.label}
                    </span>
                    <div className="text-xl font-bold text-gray-900">
                      {totalAmount.toFixed(2)} €
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => handleDeleteOrder(e, order.id)}
                    className="text-gray-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          isOpen={!!selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      )}
    </div>
  );
}