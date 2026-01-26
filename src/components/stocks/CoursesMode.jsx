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

  const { data: articles = [] } = useQuery({
    queryKey: ['articles'],
    queryFn: () => base44.entities.Article.list('order')
  });

  const [imageModalUrl, setImageModalUrl] = useState(null);

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
    (order.items || []).map((item, idx) => ({
      ...item,
      orderId: order.id,
      itemIndex: idx,
      uniqueKey: `${order.id}-${idx}`,
      isChecked: item.isChecked || false,
      isRupture: item.isRupture || false
    }))
  ) || [];

  // Sort by order from Article entity
  const sortedItems = allItems.sort((a, b) => {
    const artA = articles.find(p => p.id === a.product_id);
    const artB = articles.find(p => p.id === b.product_id);
    const orderA = artA?.order ?? 9999;
    const orderB = artB?.order ?? 9999;
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
    console.log('🔄 handleToggleItem called', { item, newStatus });
    const order = currentSupplierData.orders.find(o => o.id === item.orderId);
    if (!order) {
      console.error('❌ Order not found');
      return;
    }

    console.log('📦 Order found', order);
    console.log('📋 Current items', order.items);

    const updatedItems = order.items.map((i, idx) => {
      if (idx === item.itemIndex) {
        console.log('✅ Updating item at index', idx);
        return {
          ...i,
          isChecked: newStatus === 'checked',
          isRupture: newStatus === 'rupture'
        };
      }
      return i;
    });

    console.log('📝 Updated items', updatedItems);

    try {
      const result = await updateOrderMutation.mutateAsync({
        id: order.id,
        data: { items: updatedItems }
      });
      console.log('✅ Update successful', result);
      
      if (newStatus === 'checked') {
        toast.success(`${item.product_name} → Check`);
      } else if (newStatus === 'rupture') {
        await createRuptureMutation.mutateAsync({
          date: new Date().toISOString().split('T')[0],
          supplier_name: order.supplier_name,
          supplier_id: order.supplier_id,
          item_name: item.product_name,
          quantity: item.quantity,
          unit: item.unit,
          order_id: order.id
        });
        toast.error(`${item.product_name} → Rupture`);
      }

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
    } catch (error) {
      console.error('❌ Error updating order', error);
      toast.error('Erreur lors de la mise à jour');
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
    const updatedItems = order.items.flatMap((i, idx) => {
      if (idx === item.itemIndex) {
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
    <div className="space-y-3 sm:space-y-4 lg:space-y-6 pb-6 max-w-4xl mx-auto">
      <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">🛒 Mode Courses</h2>

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
              "px-3 sm:px-5 lg:px-6 py-2 sm:py-2.5 lg:py-3 rounded-full font-bold text-xs sm:text-sm lg:text-base whitespace-nowrap transition-all shadow-md active:scale-95",
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
        <TabsList className="grid w-full grid-cols-3 h-auto bg-gray-100 p-0.5 sm:p-1 gap-0.5 sm:gap-1">
          <TabsTrigger 
            value="todo" 
            className="flex-col gap-0.5 sm:gap-1 py-2 sm:py-3 data-[state=active]:bg-white data-[state=active]:shadow-md px-1"
          >
            <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-5 lg:h-5" />
            <span className="text-[10px] sm:text-xs lg:text-sm font-semibold leading-tight">À PRENDRE</span>
            {todoItems.length > 0 && (
              <Badge className="bg-red-600 text-white text-[10px] px-1.5 py-0.5">{todoItems.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger 
            value="checked" 
            className="flex-col gap-0.5 sm:gap-1 py-2 sm:py-3 data-[state=active]:bg-white data-[state=active]:shadow-md px-1"
          >
            <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-5 lg:h-5" />
            <span className="text-[10px] sm:text-xs lg:text-sm font-semibold leading-tight">CHECK</span>
            {checkedItems.length > 0 && (
              <Badge className="bg-green-600 text-white text-[10px] px-1.5 py-0.5">{checkedItems.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger 
            value="rupture" 
            className="flex-col gap-0.5 sm:gap-1 py-2 sm:py-3 data-[state=active]:bg-white data-[state=active]:shadow-md px-1"
          >
            <Ban className="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-5 lg:h-5" />
            <span className="text-[10px] sm:text-xs lg:text-sm font-semibold leading-tight">RUPTURE</span>
            {ruptureItems.length > 0 && (
              <Badge className="bg-red-600 text-white text-[10px] px-1.5 py-0.5">{ruptureItems.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Items List */}
      <div className="space-y-3">
        <AnimatePresence>
          {filteredItems.map((item, index) => {
            const article = articles.find(p => p.id === item.product_id);
            const rank = statusFilter === 'todo' ? index + 1 : null;

            return (
              <motion.div
                key={`${item.uniqueKey}-${item.isChecked}-${item.isRupture}`}
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
                <div className="p-3 sm:p-4 lg:p-6">
                  {/* Mobile Layout */}
                  <div className="flex flex-col sm:hidden gap-3">
                    {/* Header avec rank et image */}
                    <div className="flex items-center gap-3">
                      {statusFilter === 'todo' && rank && (
                        <div className="text-3xl font-black text-orange-500/30 flex-shrink-0">
                          #{rank}
                        </div>
                      )}
                      <button
                        onClick={() => article?.image_url && setImageModalUrl(article.image_url)}
                        className="w-16 h-16 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden hover:ring-4 hover:ring-orange-300 transition-all active:scale-95 cursor-pointer"
                      >
                        {article?.image_url ? (
                          <img 
                            src={article.image_url} 
                            alt={item.product_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            <Package className="w-6 h-6" />
                          </div>
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <h3 className={cn(
                          "font-bold text-gray-900 text-base mb-1",
                          statusFilter === 'checked' && "line-through text-gray-500"
                        )}>
                          {item.product_name}
                        </h3>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge className="bg-slate-700 text-white font-semibold text-xs">
                            {item.quantity} {item.unit}
                          </Badge>
                          {article?.brand && (
                            <Badge variant="outline" className="border-orange-500 text-orange-600 font-semibold text-xs">
                              {article.brand}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    {statusFilter === 'todo' && (
                      <div className="space-y-2">
                        <Button
                          onClick={() => handleToggleItem(item, 'checked')}
                          className="bg-green-600 hover:bg-green-700 text-white w-full h-11 text-sm font-semibold rounded-lg shadow-md active:scale-95 transition-transform"
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Trouvé
                        </Button>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant="outline"
                            onClick={() => setPartialRuptureItem(item)}
                            className="border-2 border-orange-500 text-orange-600 hover:bg-orange-50 h-10 text-xs font-semibold rounded-lg active:scale-95 transition-transform flex items-center justify-center gap-1"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            <Ban className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => handleToggleItem(item, 'rupture')}
                            className="border-2 border-red-500 text-red-600 hover:bg-red-50 h-10 text-xs font-semibold rounded-lg active:scale-95 transition-transform flex items-center justify-center gap-1"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Desktop/Tablet Layout */}
                  <div className="hidden sm:flex items-start gap-4 lg:gap-5">
                    {statusFilter === 'todo' && rank && (
                      <div className="text-5xl lg:text-7xl font-black text-orange-500/30 flex-shrink-0 leading-none">
                        #{rank}
                      </div>
                    )}

                    <button
                      onClick={() => article?.image_url && setImageModalUrl(article.image_url)}
                      className="w-20 h-20 lg:w-28 lg:h-28 rounded-xl bg-gray-100 flex-shrink-0 overflow-hidden hover:ring-4 hover:ring-orange-300 transition-all active:scale-95 cursor-pointer"
                    >
                      {article?.image_url ? (
                        <img 
                          src={article.image_url} 
                          alt={item.product_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          <Package className="w-8 h-8 lg:w-10 lg:h-10" />
                        </div>
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <h3 className={cn(
                        "font-bold text-gray-900 text-lg lg:text-2xl mb-2",
                        statusFilter === 'checked' && "line-through text-gray-500"
                      )}>
                        {item.product_name}
                      </h3>
                      <div className="flex flex-wrap gap-2 mb-3">
                        <Badge className="bg-slate-700 text-white font-semibold text-sm lg:text-base">
                          {item.quantity} {item.unit}
                        </Badge>
                        {article?.brand && (
                          <Badge variant="outline" className="border-orange-500 text-orange-600 font-semibold text-sm lg:text-base">
                            {article.brand}
                          </Badge>
                        )}
                      </div>
                      
                      {statusFilter === 'todo' && (
                        <div className="space-y-2">
                          <Button
                            onClick={() => handleToggleItem(item, 'checked')}
                            className="bg-green-600 hover:bg-green-700 text-white w-full h-12 lg:h-14 text-sm lg:text-base font-semibold rounded-lg shadow-md active:scale-95 transition-transform"
                          >
                            <CheckCircle className="w-4 h-4 lg:w-5 lg:h-5 mr-2" />
                            Trouvé
                          </Button>
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              variant="outline"
                              onClick={() => setPartialRuptureItem(item)}
                              className="border-2 border-orange-500 text-orange-600 hover:bg-orange-50 h-11 lg:h-12 text-sm font-semibold rounded-lg active:scale-95 transition-transform"
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              <Ban className="w-4 h-4" />
                              <span className="ml-1">Partielle</span>
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => handleToggleItem(item, 'rupture')}
                              className="border-2 border-red-500 text-red-600 hover:bg-red-50 h-11 lg:h-12 text-sm font-semibold rounded-lg active:scale-95 transition-transform"
                            >
                              <Ban className="w-4 h-4 lg:w-5 lg:h-5 mr-1" />
                              Totale
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
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

      {/* Image Zoom Modal */}
      {imageModalUrl && (
        <div 
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 sm:p-6"
          onClick={() => setImageModalUrl(null)}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className="max-w-4xl max-h-[90vh] w-full"
          >
            <img 
              src={imageModalUrl} 
              alt="Article"
              className="w-full h-full object-contain rounded-lg"
            />
          </motion.div>
        </div>
      )}
    </div>
  );
}