import React, { useState } from 'react';
import { Package, CheckCircle2, AlertCircle } from 'lucide-react';
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

  // Initialize items with state tracking - use array to allow splitting items
  const [itemInstances, setItemInstances] = useState(() => {
    return (order.items || []).map((item, index) => ({
      instanceId: `${item.product_id}-${index}`,
      ...item,
      state: 'a_prendre'
    }));
  });

  const getItemsByState = (state) => {
    return itemInstances.filter(item => item.state === state);
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
                  key={item.product_id}
                  item={item}
                  itemNumber={index + 1}
                  onStateChange={(newState, quantity) => 
                    updateItemState(item.product_id, newState, quantity)
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
                  key={item.product_id}
                  item={item}
                  itemNumber={index + 1}
                  isChecked={true}
                  onStateChange={(newState, quantity) => 
                    updateItemState(item.product_id, newState, quantity)
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
                  key={item.product_id}
                  item={item}
                  itemNumber={index + 1}
                  isRupture={true}
                  onStateChange={(newState, quantity) => 
                    updateItemState(item.product_id, newState, quantity)
                  }
                  onImageClick={(url) => setZoomImage(url)}
                />
              ))}
            </div>
          )
        )}
      </div>

      {/* Image Zoom Modal */}
      <ImageZoomModal 
        imageUrl={zoomImage} 
        onClose={() => setZoomImage(null)} 
      />
    </div>
  );
}