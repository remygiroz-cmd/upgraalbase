import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ShoppingCart } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import CoursesTabs from './CoursesTabs';

export default function CoursesMode() {
  const [selectedOrderId, setSelectedOrderId] = useState(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders', 'en_cours'],
    queryFn: async () => {
      const allOrders = await base44.entities.Order.filter({ status: 'en_cours' });
      return allOrders.sort((a, b) => new Date(b.date) - new Date(a.date));
    }
  });

  const selectedOrder = orders.find(o => o.id === selectedOrderId);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-6">
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900">🛒 Mode Courses</h2>

      {orders.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Aucune commande en cours"
          description="Créez une commande pour commencer"
        />
      ) : (
        <div className="space-y-4 sm:space-y-6">
          {/* Order Selector */}
          <div className="flex flex-wrap gap-2 sm:gap-3">
            {orders.map(order => (
              <button
                key={order.id}
                onClick={() => setSelectedOrderId(order.id)}
                className={`px-3 sm:px-4 py-2 sm:py-3 rounded-lg font-semibold text-sm sm:text-base transition-all touch-manipulation min-h-[44px] ${
                  selectedOrderId === order.id
                    ? 'bg-orange-600 text-white shadow-lg'
                    : 'bg-orange-100 text-orange-600 hover:bg-orange-200'
                }`}
              >
                {order.supplier_name}
              </button>
            ))}
          </div>

          {/* Course Tabs */}
          {selectedOrder && (
            <CoursesTabs order={selectedOrder} />
          )}
        </div>
      )}
    </div>
  );
}