import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Package, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import confetti from 'canvas-confetti';
import CourseItemCard from './CourseItemCard';
import ImageZoomModal from './ImageZoomModal';
import RuptureOrderModal from './RuptureOrderModal.jsx';

export default function CoursesTabs({ order }) {
  const [activeTab, setActiveTab] = useState('a_prendre');
  const [zoomImage, setZoomImage] = useState(null);
  const [showRuptureModal, setShowRuptureModal] = useState(false);
  const queryClient = useQueryClient();

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: articles = [] } = useQuery({
    queryKey: ['articles'],
    queryFn: () => base44.entities.Article.filter({ is_active: true })
  });

  const buildInstances = (orderItems, savedStates = {}) => {
    const sortedItems = [...(orderItems || [])].sort((a, b) => {
      const articleA = articles.find(art => art.id === a.product_id);
      const articleB = articles.find(art => art.id === b.product_id);
      return (articleA?.order || 0) - (articleB?.order || 0);
    });
    return sortedItems.map((item, index) => ({
      instanceId: `${item.product_id}-${index}`,
      ...item,
      state: savedStates[`${item.product_id}-${index}`] || savedStates[item.product_id] || 'a_prendre'
    }));
  };

  const [itemInstances, setItemInstances] = useState(() => {
    const savedStates = order.courses_state || {};
    return buildInstances(order.items, savedStates);
  });

  useEffect(() => {
    setItemInstances(() => {
      const savedStates = order.courses_state || {};
      return buildInstances(order.items, savedStates);
    });
  }, [JSON.stringify(order.courses_state), JSON.stringify((order.items || []).map(i => i.product_id).sort())]);

  const persistStateMutation = useMutation({
    mutationFn: (instances) => {
      const statesToSave = {};
      instances.forEach((item, index) => {
        statesToSave[`${item.product_id}-${index}`] = item.state;
      });
      return base44.entities.Order.update(order.id, { courses_state: statesToSave });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    }
  });

  const completeOrderMutation = useMutation({
    mutationFn: async ({ createNewOrder }) => {
      const checkDetails = checkItems.map(item => `${item.product_name} (${item.quantity} ${item.unit})`).join(' | ');
      const ruptureDetails = ruptureItems.map(item => `${item.product_name} (${item.quantity} ${item.unit})`).join(' | ');

      const historyEntry = {
        timestamp: new Date().toISOString(),
        action: 'Courses terminées',
        details: `Check: ${checkDetails || 'Aucun'} | Rupture: ${ruptureDetails || 'Aucune'}`,
        user_email: currentUser?.email,
        user_name: currentUser?.full_name
      };

      await base44.entities.Order.update(order.id, {
        ...order,
        status: 'terminee',
        courses_state: null,
        history: [...(order.history || []), historyEntry]
      });

      if (createNewOrder && ruptureItems.length > 0) {
        const newItems = ruptureItems.map(item => ({
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unit_price,
          supplier_reference: item.supplier_reference
        }));

        await base44.entities.Order.create({
          supplier_id: order.supplier_id,
          supplier_name: order.supplier_name,
          date: new Date().toISOString().split('T')[0],
          items: newItems,
          status: 'en_cours',
          history: [{
            timestamp: new Date().toISOString(),
            action: 'Commande créée (articles en rupture)',
            details: `Créée automatiquement depuis la commande #${order.id.slice(-6)} suite aux ruptures`,
            user_email: currentUser?.email,
            user_name: currentUser?.full_name
          }]
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    }
  });

  const getItemsByState = (state) => {
    return itemInstances.filter(item => item.state === state).sort((a, b) => {
      const articleA = articles.find(art => art.id === a.product_id);
      const articleB = articles.find(art => art.id === b.product_id);
      return (articleA?.order || 0) - (articleB?.order || 0);
    });
  };

  const updateItemState = (instanceId, newState, partialQuantity = null) => {
    setItemInstances(prev => {
      const itemIndex = prev.findIndex(item => item.instanceId === instanceId);
      if (itemIndex === -1) return prev;

      const item = prev[itemIndex];
      const result = [...prev];

      if (partialQuantity !== null && partialQuantity > 0 && partialQuantity < item.quantity) {
        result[itemIndex] = {
          ...item,
          instanceId: `${item.product_id}-check-${Date.now()}`,
          quantity: partialQuantity,
          state: 'check'
        };
        result.push({
          ...item,
          instanceId: `${item.product_id}-rupture-${Date.now()}`,
          quantity: item.quantity - partialQuantity,
          state: 'rupture'
        });
      } else {
        result[itemIndex] = { ...item, state: newState };
      }

      persistStateMutation.mutate(result);
      return result;
    });
  };

  const aPrendreItems = getItemsByState('a_prendre');
  const checkItems = getItemsByState('check');
  const ruptureItems = getItemsByState('rupture');

  const handleTerminer = () => {
    if (ruptureItems.length > 0) {
      setShowRuptureModal(true);
    } else {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      completeOrderMutation.mutate({ createNewOrder: false });
    }
  };

  // Auto-complete when all items are taken from "À prendre"
  useEffect(() => {
    if (aPrendreItems.length === 0 && itemInstances.length > 0) {
      const timer = setTimeout(() => {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        if (ruptureItems.length > 0) {
          setShowRuptureModal(true);
        } else {
          completeOrderMutation.mutate({ createNewOrder: false });
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [aPrendreItems.length, itemInstances.length]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Tab Navigation */}
      <div className="space-y-2 sm:space-y-3">
        <button
          onClick={() => setActiveTab('a_prendre')}
          className={`w-full sm:w-auto px-4 sm:px-6 py-3 sm:py-4 rounded-lg transition-all flex items-center gap-3 font-bold text-sm sm:text-base ${
            activeTab === 'a_prendre' ? 'bg-white shadow-md' : 'bg-gray-100 text-gray-600'
          }`}
        >
          <Package className="w-5 h-5 sm:w-6 sm:h-6" />
          <span>À PRENDRE</span>
          {aPrendreItems.length > 0 && (
            <span className="ml-auto bg-red-600 text-white w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm">
              {aPrendreItems.length}
            </span>
          )}
        </button>

        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <button
            onClick={() => setActiveTab('check')}
            className={`px-3 sm:px-4 py-2 sm:py-3 rounded-lg transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 font-bold text-xs sm:text-sm ${
              activeTab === 'check' ? 'bg-white shadow-md' : 'bg-gray-100 text-gray-400'
            }`}
          >
            <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" />
            <span>CHECK</span>
            {checkItems.length > 0 && (
              <span className="bg-gray-400 text-white w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center font-bold text-[10px] sm:text-xs">
                {checkItems.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('rupture')}
            className={`px-3 sm:px-4 py-2 sm:py-3 rounded-lg transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 font-bold text-xs sm:text-sm ${
              activeTab === 'rupture' ? 'bg-white shadow-md' : 'bg-gray-100 text-gray-400'
            }`}
          >
            <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6" />
            <span>RUPTURE</span>
            {ruptureItems.length > 0 && (
              <span className="bg-orange-500 text-white w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center font-bold text-[10px] sm:text-xs">
                {ruptureItems.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="mt-4 sm:mt-6">
        {activeTab === 'a_prendre' && (
          aPrendreItems.length === 0 ? (
            <div className="text-center py-8 sm:py-12 text-gray-500">
              <p className="text-sm sm:text-base">Aucun article à prendre</p>
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              {aPrendreItems.map((item, index) => (
                <CourseItemCard
                  key={item.instanceId}
                  item={item}
                  itemNumber={index + 1}
                  onStateChange={(newState, quantity) => updateItemState(item.instanceId, newState, quantity)}
                  onImageClick={(url) => setZoomImage(url)}
                />
              ))}
            </div>
          )
        )}

        {activeTab === 'check' && (
          checkItems.length === 0 ? (
            <div className="text-center py-8 sm:py-12 text-gray-500">
              <p className="text-sm sm:text-base">Aucun article checké</p>
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              {checkItems.map((item, index) => (
                <CourseItemCard
                  key={item.instanceId}
                  item={item}
                  itemNumber={index + 1}
                  isChecked={true}
                  onStateChange={(newState, quantity) => updateItemState(item.instanceId, newState, quantity)}
                  onImageClick={(url) => setZoomImage(url)}
                />
              ))}
            </div>
          )
        )}

        {activeTab === 'rupture' && (
          ruptureItems.length === 0 ? (
            <div className="text-center py-8 sm:py-12 text-gray-500">
              <p className="text-sm sm:text-base">Aucune rupture</p>
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              {ruptureItems.map((item, index) => (
                <CourseItemCard
                  key={item.instanceId}
                  item={item}
                  itemNumber={index + 1}
                  isRupture={true}
                  onStateChange={(newState, quantity) => updateItemState(item.instanceId, newState, quantity)}
                  onImageClick={(url) => setZoomImage(url)}
                />
              ))}
            </div>
          )
        )}
      </div>

      {/* Complete Order Button */}
      <div className="flex gap-2 sm:gap-3 pt-4">
        <Button
          onClick={handleTerminer}
          disabled={completeOrderMutation.isPending}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 text-base h-auto min-h-[48px] rounded-lg"
        >
          {completeOrderMutation.isPending ? '⏳ Terminaison...' : '✓ Terminer les courses'}
        </Button>
      </div>

      {/* Image Zoom Modal */}
      <ImageZoomModal imageUrl={zoomImage} onClose={() => setZoomImage(null)} />

      {/* Rupture Order Modal */}
      <RuptureOrderModal
        open={showRuptureModal}
        ruptureItems={ruptureItems}
        supplierName={order.supplier_name}
        isLoading={completeOrderMutation.isPending}
        onConfirm={(createNew) => {
          setShowRuptureModal(false);
          completeOrderMutation.mutate({ createNewOrder: createNew });
        }}
        onClose={() => setShowRuptureModal(false)}
      />
    </div>
  );
}