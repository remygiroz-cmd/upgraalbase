import React from 'react';
import { ShoppingCart } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';

export default function CoursesMode() {
  return (
    <div className="space-y-6 pb-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900">🛒 Mode Courses</h2>
      
      <EmptyState
        icon={ShoppingCart}
        title="Mode Courses"
        description="On va construire cette fonctionnalité étape par étape"
      />
    </div>
  );
}