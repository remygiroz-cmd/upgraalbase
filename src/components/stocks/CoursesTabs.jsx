import React, { useState } from 'react';
import { Package, CheckCircle2, AlertCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CourseItemCard from './CourseItemCard';

const TAB_CONFIG = [
  { id: 'a_prendre', label: 'À PRENDRE', icon: Package, color: 'text-red-600' },
  { id: 'check', label: 'CHECK', icon: CheckCircle2, color: 'text-blue-600' },
  { id: 'rupture', label: 'RUPTURE', icon: AlertCircle, color: 'text-orange-600' }
];

export default function CoursesTabs({ order }) {
  const [activeTab, setActiveTab] = useState('a_prendre');

  // Initialize items with state tracking
  const [itemStates, setItemStates] = useState(() => {
    return order.items?.reduce((acc, item) => {
      acc[item.product_id] = { state: 'a_prendre', quantity: item.quantity };
      return acc;
    }, {}) || {};
  });

  const getItemsByState = (state) => {
    return (order.items || []).filter(item => itemStates[item.product_id]?.state === state);
  };

  const updateItemState = (productId, newState, quantity = null) => {
    setItemStates(prev => ({
      ...prev,
      [productId]: {
        state: newState,
        quantity: quantity !== null ? quantity : prev[productId]?.quantity || 0
      }
    }));
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-gray-100 p-1 h-auto gap-0">
          {TAB_CONFIG.map(tab => {
            const Icon = tab.icon;
            const itemCount = getItemsByState(tab.id).length;
            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 py-2 sm:py-3 px-2 sm:px-4 data-[state=active]:bg-white data-[state=active]:shadow-sm transition-all text-xs sm:text-sm font-semibold"
              >
                <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${tab.color}`} />
                <span className="hidden xs:inline">{tab.label}</span>
                {itemCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] sm:text-xs rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center font-bold">
                    {itemCount}
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Tab Contents */}
        {TAB_CONFIG.map(tab => (
          <TabsContent key={tab.id} value={tab.id} className="space-y-3 sm:space-y-4 mt-4 sm:mt-6">
            {getItemsByState(tab.id).length === 0 ? (
              <div className="text-center py-8 sm:py-12 text-gray-500">
                <p className="text-sm sm:text-base">Aucun article</p>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {getItemsByState(tab.id).map((item, index) => (
                  <CourseItemCard
                    key={item.product_id}
                    item={item}
                    itemNumber={index + 1}
                    currentState={itemStates[item.product_id]?.state}
                    onStateChange={(newState, quantity) => 
                      updateItemState(item.product_id, newState, quantity)
                    }
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}