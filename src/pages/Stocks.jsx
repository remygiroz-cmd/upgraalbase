import React, { useState } from 'react';
import { Package, Box, Truck, ShoppingCart, List, AlertTriangle } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';

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
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 mb-6">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <TabsTrigger key={tab.id} value={tab.id} className="flex items-center gap-2">
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {tabs.map(tab => (
          <TabsContent key={tab.id} value={tab.id}>
            <EmptyState
              icon={tab.icon}
              title={`${tab.label} - En construction`}
              description={`La section ${tab.label.toLowerCase()} sera bientôt disponible`}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}