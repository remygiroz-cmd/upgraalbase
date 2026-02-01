import React from 'react';
import { Calendar } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';

export default function PayslipsManagement() {
  return (
    <div className="space-y-6">
      <EmptyState
        icon={Calendar}
        title="Aucune fiche de paie"
        description="Aucune fiche de paie uploadée. Commencez par ajouter des fiches de paie."
      />
    </div>
  );
}