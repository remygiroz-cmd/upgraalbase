import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Package, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import confetti from 'canvas-confetti';
import CourseItemCard from './CourseItemCard';
import ImageZoomModal from './ImageZoomModal';

const TAB_CONFIG = [
  { id: 'a_prendre', label: 'À PRENDRE', icon: Package, color: 'text-red-600', bgColor: 'bg-white' },
  { id: 'check', label: 'CHECK', icon: CheckCircle2, color: 'text-gray-400', bgColor: 'bg-gray-100' },
  { id: 'rupture', label: 'RUPTURE', icon: AlertCircle, color: 'text-gray-400', bgColor: 'bg-gray-100' }
];

export default function CoursesTabs({ order }) {
  const [activeTab, setActiveTab] = useState('a_prendre');
  const [zoomImage, setZoomImage] = useState(null);
  const queryClient = useQueryClient();

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const completeOrderMutation = useMutation({
    mutationFn: async () => {
      // Calculate statistics
      const aPrendreCount = aPrendreItems.length;
      const checkDetails = checkItems.map(item => `${item.product_name} (${item.quantity} ${item.unit})`).join(' | ');
      const ruptureDetails = ruptureItems.map(item => `${item.product_name} (${item.quantity} ${item.unit})`).join(' | ');

      // Create history entry
      const historyEntry = {
        timestamp: new Date().toISOString(),
        action: 'Courses terminées',
        details: `À prendre: ${aPrendreCount} articles | Check: ${checkDetails || 'Aucun'} | Rupture: ${ruptureDetails || 'Aucune'}`,
        user_email: currentUser?.email,
        user_name: currentUser?.full_name
      };

      // Update order
      const updatedOrder = {
        ...order,
        status: 'terminee',
        history: [...(order.history || []), historyEntry]
      };

      await base44.entities.Order.update(order.id, updatedOrder);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    }
  });

  const { data: articles = [] } = useQuery({
    queryKey: ['articles'],
    queryFn: () => base44.entities.Article.filter({ is_active: true })
  });

  // Initialize items with state tracking - use array to allow splitting items
  const [itemInstances, setItemInstances] = useState(() => {
    // Trier par ordre de parcours magasin avant de créer les instances
    const sortedItems = [...(order.items || [])].sort((a, b) => {
      const articleA = articles.find(art => art.id === a.product_id);
      const articleB = articles.find(art => art.id === b.product_id);
      return (articleA?.order || 0) - (articleB?.order || 0);
    });
    
    return sortedItems.map((item, index) => ({
      instanceId: `${item.product_id}-${index}`,
      ...item,
      state: 'a_prendre'
    }));
  });

  const getItemsByState = (state) => {
    const items = itemInstances.filter(item => item.state === state);
    // Trier par ordre de parcours magasin
    return items.sort((a, b) => {
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

      // Si c'est une rupture partielle (partialQuantity est fourni)
      if (partialQuantity !== null && partialQuantity > 0 && partialQuantity < item.quantity) {
        // Créer une instance en check avec la quantité trouvée
        result[itemIndex] = {
          ...item,
          instanceId: `${item.product_id}-check-${Date.now()}`,
          quantity: partialQuantity,
          state: 'check'
        };
        // Ajouter une instance en rupture avec le reste
        result.push({
          ...item,
          instanceId: `${item.product_id}-rupture-${Date.now()}`,
          quantity: item.quantity - partialQuantity,
          state: 'rupture'
        });
      } else {
        // Cas normal : tout l'article change d'état
        result[itemIndex] = {
          ...item,
          state: newState
        };
      }
      return result;
    });
  };

  const aPrendreItems = getItemsByState('a_prendre');
  const checkItems = getItemsByState('check');
  const ruptureItems = getItemsByState('rupture');

  // Auto-complete when all items are taken from "À prendre"
  useEffect(() => {
    if (aPrendreItems.length === 0 && itemInstances.length > 0) {
      // Delay to ensure smooth UI transition
      const timer = setTimeout(() => {
        // Trigger confetti animation
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
        
        // Auto-complete order
        completeOrderMutation.mutate();
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [aPrendreItems.length, itemInstances.length]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Tab Navigation - Styled like screenshot */}
      <div className="space-y-2 sm:space-y-3">
        {/* À PRENDRE Tab */}
        <button
          onClick={() => setActiveTab('a_prendre')}
          className={`w-full sm:w-auto px-4 sm:px-6 py-3 sm:py-4 rounded-lg transition-all flex items-center gap-3 font-bold text-sm sm:text-base ${
            activeTab === 'a_prendre'
              ? 'bg-white shadow-md'
              : 'bg-gray-100 text-gray-600'
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

        {/* CHECK & RUPTURE - Same row */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <button
            onClick={() => setActiveTab('check')}
            className={`px-3 sm:px-4 py-2 sm:py-3 rounded-lg transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 font-bold text-xs sm:text-sm ${
              activeTab === 'check'
                ? 'bg-white shadow-md'
                : 'bg-gray-100 text-gray-400'
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
              activeTab === 'rupture'
                ? 'bg-white shadow-md'
                : 'bg-gray-100 text-gray-400'
            }`}
          >
            <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6" />
            <span>RUPTURE</span>
            {ruptureItems.length > 0 && (
              <span className="bg-gray-400 text-white w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center font-bold text-[10px] sm:text-xs">
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
                  onStateChange={(newState, quantity) => 
                    updateItemState(item.instanceId, newState, quantity)
                  }
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
                  onStateChange={(newState, quantity) => 
                    updateItemState(item.instanceId, newState, quantity)
                  }
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
                  onStateChange={(newState, quantity) => 
                    updateItemState(item.instanceId, newState, quantity)
                  }
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
          onClick={() => completeOrderMutation.mutate()}
          disabled={completeOrderMutation.isPending}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 text-base h-auto min-h-[48px] rounded-lg"
        >
          {completeOrderMutation.isPending ? '⏳ Terminaison...' : '✓ Terminer les courses'}
        </Button>
      </div>

      {/* Image Zoom Modal */}
      <ImageZoomModal 
        imageUrl={zoomImage} 
        onClose={() => setZoomImage(null)} 
      />
    </div>
  );
}