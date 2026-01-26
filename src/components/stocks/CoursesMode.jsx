import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Ban, CheckCircle, ShoppingCart, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import CelebrationOverlay from './CelebrationOverlay';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';

export default function CoursesMode() {
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [statusFilter, setStatusFilter] = useState('todo');
  const [showCelebration, setShowCelebration] = useState(false);
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => base44.entities.Order.filter({ status: 'en_cours' }, '-date')
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list('store_order')
  });

  const updateOrderMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Order.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    }
  });

  const createRuptureMutation = useMutation({
    mutationFn: (data) => base44.entities.RuptureHistory.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ruptures'] });
    }
  });

  // Group orders by supplier
  const ordersBySupplier = orders.reduce((acc, order) => {
    if (!acc[order.supplier_id]) {
      acc[order.supplier_id] = {
        supplier_id: order.supplier_id,
        supplier_name: order.supplier_name,
        orders: []
      };
    }
    acc[order.supplier_id].orders.push(order);
    return acc;
  }, {});

  const suppliers = Object.values(ordersBySupplier);

  // Auto-select first supplier
  useEffect(() => {
    if (!selectedSupplier && suppliers.length > 0) {
      setSelectedSupplier(suppliers[0].supplier_id);
    }
  }, [suppliers.length]);

  if (isLoading) return <LoadingSpinner />;

  const currentSupplierData = ordersBySupplier[selectedSupplier];
  
  if (suppliers.length === 0) {
    return (
      <EmptyState
        icon={ShoppingCart}
        title="Aucune course en attente"
        description="Créez d'abord des commandes en cours pour utiliser le mode courses"
      />
    );
  }

  // Combine all items from all orders for this supplier
  const allItems = currentSupplierData?.orders.flatMap(order => 
    (order.items || []).map(item => ({
      ...item,
      orderId: order.id,
      isChecked: item.isChecked || false,
      isRupture: item.isRupture || false
    }))
  ) || [];

  // Sort by store_order from Product entity
  const sortedItems = allItems.sort((a, b) => {
    const prodA = products.find(p => p.id === a.product_id);
    const prodB = products.find(p => p.id === b.product_id);
    const orderA = prodA?.store_order ?? 9999;
    const orderB = prodB?.store_order ?? 9999;
    return orderA - orderB;
  });

  const todoItems = sortedItems.filter(item => !item.isChecked && !item.isRupture);
  const checkedItems = sortedItems.filter(item => item.isChecked);
  const ruptureItems = sortedItems.filter(item => item.isRupture);

  const filteredItems = 
    statusFilter === 'todo' ? todoItems :
    statusFilter === 'checked' ? checkedItems :
    ruptureItems;

  const handleToggleItem = async (item, newStatus) => {
    const order = currentSupplierData.orders.find(o => o.id === item.orderId);
    if (!order) return;

    const updatedItems = order.items.map(i => {
      if (i.product_id === item.product_id) {
        return {
          ...i,
          isChecked: newStatus === 'checked',
          isRupture: newStatus === 'rupture'
        };
      }
      return i;
    });

    await updateOrderMutation.mutateAsync({
      id: order.id,
      data: { items: updatedItems }
    });

    // Log rupture in history
    if (newStatus === 'rupture') {
      await createRuptureMutation.mutateAsync({
        date: new Date().toISOString().split('T')[0],
        supplier_name: order.supplier_name,
        supplier_id: order.supplier_id,
        item_name: item.product_name,
        quantity: item.quantity,
        unit: item.unit,
        order_id: order.id
      });
      toast.error(`${item.product_name} marqué en rupture`);
    }

    // Check if all items are done
    const allDone = updatedItems.every(i => i.isChecked || i.isRupture);
    if (allDone && todoItems.length === 1) {
      setShowCelebration(true);
      // Mark order as completed
      setTimeout(async () => {
        await updateOrderMutation.mutateAsync({
          id: order.id,
          data: { status: 'terminee' }
        });
      }, 1000);
    }
  };

  const handleCelebrationComplete = () => {
    setShowCelebration(false);
    // Move to next supplier or reset
    const currentIndex = suppliers.findIndex(s => s.supplier_id === selectedSupplier);
    if (currentIndex < suppliers.length - 1) {
      setSelectedSupplier(suppliers[currentIndex + 1].supplier_id);
      setStatusFilter('todo');
    }
  };

  return (
    <div className="space-y-4 pb-6">
      <h2 className="text-xl font-bold text-gray-900">🛒 Mode Courses</h2>

      {/* Supplier Pills */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-2 px-2">
        {suppliers.map(supplier => (
          <button
            key={supplier.supplier_id}
            onClick={() => {
              setSelectedSupplier(supplier.supplier_id);
              setStatusFilter('todo');
            }}
            className={cn(
              "px-4 py-2 rounded-full font-semibold text-sm whitespace-nowrap transition-all",
              selectedSupplier === supplier.supplier_id
                ? "bg-orange-600 text-white shadow-lg"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            )}
          >
            {supplier.supplier_name}
          </button>
        ))}
      </div>

      {/* Status Tabs */}
      <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="todo" className="gap-2">
            <Package className="w-4 h-4" />
            À PRENDRE
            {todoItems.length > 0 && (
              <Badge className="bg-red-600 text-white ml-1">{todoItems.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="checked" className="gap-2">
            <CheckCircle className="w-4 h-4" />
            CHECK
            {checkedItems.length > 0 && (
              <Badge className="bg-green-600 text-white ml-1">{checkedItems.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="rupture" className="gap-2">
            <Ban className="w-4 h-4" />
            RUPTURE
            {ruptureItems.length > 0 && (
              <Badge className="bg-red-600 text-white ml-1">{ruptureItems.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Items List */}
      <div className="space-y-3">
        <AnimatePresence>
          {filteredItems.map((item, index) => {
            const product = products.find(p => p.id === item.product_id);
            const rank = statusFilter === 'todo' ? index + 1 : null;

            return (
              <motion.div
                key={`${item.orderId}-${item.product_id}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -100 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  "bg-white rounded-xl border-2 p-4 transition-all",
                  statusFilter === 'todo' && "border-slate-700 hover:border-orange-500 hover:shadow-lg cursor-pointer",
                  statusFilter === 'checked' && "border-green-300 bg-green-50",
                  statusFilter === 'rupture' && "border-red-300 bg-red-50"
                )}
                onClick={() => {
                  if (statusFilter === 'todo') {
                    handleToggleItem(item, 'checked');
                  } else if (statusFilter === 'checked') {
                    handleToggleItem(item, 'todo');
                  } else if (statusFilter === 'rupture') {
                    handleToggleItem(item, 'todo');
                  }
                }}
              >
                <div className="flex items-center gap-4">
                  {/* Product Image */}
                  <div className="w-16 h-16 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden">
                    {product?.image_url ? (
                      <img 
                        src={product.image_url} 
                        alt={item.product_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <Package className="w-8 h-8" />
                      </div>
                    )}
                  </div>

                  {/* Product Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className={cn(
                      "font-bold text-gray-900 text-base mb-1",
                      statusFilter === 'checked' && "line-through text-gray-500"
                    )}>
                      {item.product_name}
                    </h3>
                    <Badge className="bg-slate-100 text-slate-700 font-semibold">
                      {item.quantity} {item.unit}
                    </Badge>
                  </div>

                  {/* Rank Number */}
                  {statusFilter === 'todo' && rank && (
                    <div className="text-5xl font-black text-orange-500/20">
                      #{rank}
                    </div>
                  )}

                  {/* Rupture Button (only in TODO mode) */}
                  {statusFilter === 'todo' && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleItem(item, 'rupture');
                      }}
                      className="border-red-500 text-red-500 hover:bg-red-50 h-12 w-12 flex-shrink-0"
                    >
                      <Ban className="w-6 h-6" />
                    </Button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {filteredItems.length === 0 && (
          <EmptyState
            icon={Package}
            title={
              statusFilter === 'todo' ? "Tout est pointé !" :
              statusFilter === 'checked' ? "Aucun article vérifié" :
              "Aucune rupture"
            }
            description={
              statusFilter === 'todo' ? "Tous les articles sont dans le caddie" :
              statusFilter === 'checked' ? "Les articles vérifiés apparaîtront ici" :
              "Les articles en rupture apparaîtront ici"
            }
          />
        )}
      </div>

      {/* Celebration Overlay */}
      <AnimatePresence>
        {showCelebration && (
          <CelebrationOverlay onComplete={handleCelebrationComplete} />
        )}
      </AnimatePresence>
    </div>
  );
}