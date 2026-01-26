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
import PartialRuptureModal from './PartialRuptureModal';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';

export default function CoursesMode() {
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [statusFilter, setStatusFilter] = useState('todo');
  const [showCelebration, setShowCelebration] = useState(false);
  const [partialRuptureItem, setPartialRuptureItem] = useState(null);
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

  const handlePartialRupture = async ({ checkedQuantity, ruptureQuantity }) => {
    const item = partialRuptureItem;
    const order = currentSupplierData.orders.find(o => o.id === item.orderId);
    if (!order) return;

    // Si tout est pris (pas de rupture), juste marquer comme checked
    if (ruptureQuantity === 0) {
      await handleToggleItem(item, 'checked');
      return;
    }

    // Si tout est en rupture, marquer comme rupture
    if (checkedQuantity === 0) {
      await handleToggleItem(item, 'rupture');
      return;
    }

    // Cas de rupture partielle : créer deux items
    const updatedItems = order.items.flatMap(i => {
      if (i.product_id === item.product_id) {
        return [
          {
            ...i,
            quantity: checkedQuantity,
            isChecked: true,
            isRupture: false
          },
          {
            ...i,
            quantity: ruptureQuantity,
            isChecked: false,
            isRupture: true
          }
        ];
      }
      return i;
    });

    await updateOrderMutation.mutateAsync({
      id: order.id,
      data: { items: updatedItems }
    });

    // Log rupture partielle
    await createRuptureMutation.mutateAsync({
      date: new Date().toISOString().split('T')[0],
      supplier_name: order.supplier_name,
      supplier_id: order.supplier_id,
      item_name: item.product_name,
      quantity: ruptureQuantity,
      unit: item.unit,
      order_id: order.id
    });

    toast.success(`${checkedQuantity} ${item.unit} → Check, ${ruptureQuantity} ${item.unit} → Rupture`);

    // Check if all items are done
    const allDone = updatedItems.every(i => i.isChecked || i.isRupture);
    if (allDone && todoItems.length === 1) {
      setShowCelebration(true);
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
    <div className="space-y-4 sm:space-y-6 pb-6 max-w-4xl mx-auto">
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900">🛒 Mode Courses</h2>

      {/* Supplier Pills */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
        {suppliers.map(supplier => (
          <button
            key={supplier.supplier_id}
            onClick={() => {
              setSelectedSupplier(supplier.supplier_id);
              setStatusFilter('todo');
            }}
            className={cn(
              "px-4 sm:px-6 py-2.5 sm:py-3 rounded-full font-bold text-sm sm:text-base whitespace-nowrap transition-all shadow-md active:scale-95",
              selectedSupplier === supplier.supplier_id
                ? "bg-orange-600 text-white shadow-orange-300"
                : "bg-white text-gray-700 hover:bg-gray-50 border-2 border-gray-300"
            )}
          >
            {supplier.supplier_name}
          </button>
        ))}
      </div>

      {/* Status Tabs */}
      <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-auto bg-gray-100 p-1 gap-1">
          <TabsTrigger 
            value="todo" 
            className="flex-col sm:flex-row gap-1 sm:gap-2 py-3 data-[state=active]:bg-white data-[state=active]:shadow-md"
          >
            <Package className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="text-xs sm:text-sm font-semibold">À PRENDRE</span>
            {todoItems.length > 0 && (
              <Badge className="bg-red-600 text-white text-xs">{todoItems.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger 
            value="checked" 
            className="flex-col sm:flex-row gap-1 sm:gap-2 py-3 data-[state=active]:bg-white data-[state=active]:shadow-md"
          >
            <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="text-xs sm:text-sm font-semibold">CHECK</span>
            {checkedItems.length > 0 && (
              <Badge className="bg-green-600 text-white text-xs">{checkedItems.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger 
            value="rupture" 
            className="flex-col sm:flex-row gap-1 sm:gap-2 py-3 data-[state=active]:bg-white data-[state=active]:shadow-md"
          >
            <Ban className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="text-xs sm:text-sm font-semibold">RUPTURE</span>
            {ruptureItems.length > 0 && (
              <Badge className="bg-red-600 text-white text-xs">{ruptureItems.length}</Badge>
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
                  "bg-white rounded-xl shadow-md transition-all overflow-hidden",
                  statusFilter === 'todo' && "border-2 border-gray-300 hover:shadow-lg",
                  statusFilter === 'checked' && "border-2 border-green-300 bg-green-50",
                  statusFilter === 'rupture' && "border-2 border-red-300 bg-red-50"
                )}
              >
                <div className="p-4 sm:p-6">
                  <div className="flex items-center gap-3 sm:gap-4 mb-4">
                    {/* Rank Number */}
                    {statusFilter === 'todo' && rank && (
                      <div className="text-4xl sm:text-6xl font-black text-orange-500/30 flex-shrink-0">
                        #{rank}
                      </div>
                    )}

                    {/* Product Image */}
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden">
                      {product?.image_url ? (
                        <img 
                          src={product.image_url} 
                          alt={item.product_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          <Package className="w-6 h-6 sm:w-8 sm:h-8" />
                        </div>
                      )}
                    </div>

                    {/* Product Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className={cn(
                        "font-bold text-gray-900 text-base sm:text-lg mb-1 truncate",
                        statusFilter === 'checked' && "line-through text-gray-500"
                      )}>
                        {item.product_name}
                      </h3>
                      <Badge className="bg-slate-700 text-white font-semibold text-sm">
                        {item.quantity} {item.unit}
                      </Badge>
                    </div>
                  </div>

                  {/* Action Buttons (only in TODO mode) */}
                  {statusFilter === 'todo' && (
                    <div className="space-y-2">
                      <Button
                        onClick={() => handleToggleItem(item, 'checked')}
                        className="bg-green-600 hover:bg-green-700 text-white w-full h-12 sm:h-14 text-sm sm:text-base font-semibold rounded-lg shadow-md active:scale-95 transition-transform"
                      >
                        <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                        Trouvé
                      </Button>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setPartialRuptureItem(item)}
                          className="border-2 border-orange-500 text-orange-600 hover:bg-orange-50 h-12 sm:h-14 text-xs sm:text-sm font-semibold rounded-lg active:scale-95 transition-transform"
                        >
                          <div className="flex items-center gap-1">
                            <CheckCircle className="w-4 h-4" />
                            <Ban className="w-4 h-4" />
                          </div>
                          <span className="hidden sm:inline ml-1">Partielle</span>
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => handleToggleItem(item, 'rupture')}
                          className="border-2 border-red-500 text-red-600 hover:bg-red-50 h-12 sm:h-14 text-xs sm:text-sm font-semibold rounded-lg active:scale-95 transition-transform"
                        >
                          <Ban className="w-4 h-4 sm:w-5 sm:h-5" />
                          <span className="hidden sm:inline ml-1">Totale</span>
                        </Button>
                      </div>
                    </div>
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

      {/* Partial Rupture Modal */}
      {partialRuptureItem && (
        <PartialRuptureModal
          isOpen={!!partialRuptureItem}
          onClose={() => setPartialRuptureItem(null)}
          item={partialRuptureItem}
          onConfirm={handlePartialRupture}
        />
      )}
    </div>
  );
}