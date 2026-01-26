import React, { useState } from 'react';
import { Package, Box, Truck, ShoppingCart, List, AlertTriangle } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import ArticlesTab from '@/components/stocks/ArticlesTab';
import SuppliersTab from '@/components/stocks/SuppliersTab';
import InventoryTab from '@/components/stocks/InventoryTab';
import CommandesTab from '@/components/stocks/CommandesTab';
import CoursesMode from '@/components/stocks/CoursesMode';
import RupturesTab from '@/components/stocks/RupturesTab';

export default function Stocks() {
  const [activeTab, setActiveTab] = useState('inventory');

  const tabs = [
    { id: 'inventory', label: 'Inventaire', icon: Package },
    { id: 'articles', label: 'Articles', icon: Box },
    { id: 'suppliers', label: 'Fournisseurs', icon: Truck },
    { id: 'orders', label: 'Commandes', icon: ShoppingCart },
    { id: 'shopping', label: 'Courses', icon: List },
    { id: 'stockouts', label: 'Ruptures', icon: AlertTriangle },
  ];

  return (
    <div>
      <PageHeader
        icon={Package}
        title="Inventaires & Commandes"
        subtitle="Gestion des stocks et fournisseurs"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-6 h-auto bg-transparent p-0">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <TabsTrigger 
                key={tab.id} 
                value={tab.id} 
                className="flex flex-col items-center gap-2 p-3 rounded-lg border-2 border-gray-300 data-[state=active]:border-blue-600 data-[state=active]:bg-blue-50"
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs font-medium text-center">{tab.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {tabs.map(tab => (
          <TabsContent key={tab.id} value={tab.id}>
            {tab.id === 'inventory' ? (
              <InventoryTab />
            ) : tab.id === 'articles' ? (
              <ArticlesTab />
            ) : tab.id === 'suppliers' ? (
              <SuppliersTab />
            ) : tab.id === 'orders' ? (
              <CommandesTab />
            ) : tab.id === 'shopping' ? (
              <CoursesMode />
            ) : tab.id === 'stockouts' ? (
              <RupturesTab />
            ) : (
              <EmptyState
                icon={tab.icon}
                title={`${tab.label} - En construction`}
                description={`La section ${tab.label.toLowerCase()} sera bientôt disponible`}
              />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}