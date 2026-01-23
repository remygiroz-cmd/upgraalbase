import React from 'react';
import { Package } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';

export default function Stocks() {
  return (
    <div>
      <PageHeader
        icon={Package}
        title="Inventaires & Commandes"
        subtitle="Gestion des stocks et fournisseurs"
      />
      <div className="text-center py-16">
        <p className="text-gray-600">En construction...</p>
      </div>
    </div>
  );
}