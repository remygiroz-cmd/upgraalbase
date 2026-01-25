import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Calendar, Package } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import OrderDetailModal from './OrderDetailModal';

export default function CommandesTab() {
  const [selectedOrder, setSelectedOrder] = useState(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => base44.entities.Order.list('-date')
  });

  if (isLoading) return <LoadingSpinner />;

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="Aucune commande"
        description="Les commandes validées apparaîtront ici"
      />
    );
  }

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">📦 Bons de Commande</h2>
      </div>

      <div className="space-y-3">
        {orders.map((order) => {
          const badge = getStatusBadge(order.status);
          const totalItems = order.items?.length || 0;
          const totalAmount = order.items?.reduce((sum, item) => {
            return sum + (item.quantity * (item.unit_price || 0));
          }, 0) || 0;

          return (
            <div
              key={order.id}
              onClick={() => setSelectedOrder(order)}
              className="bg-white rounded-lg border-2 border-gray-300 p-4 hover:border-orange-500 hover:shadow-md transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
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
                <div className="flex flex-col items-end gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${badge.style}`}>
                    {badge.label}
                  </span>
                  <div className="text-xl font-bold text-gray-900">
                    {totalAmount.toFixed(2)} €
                  </div>
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