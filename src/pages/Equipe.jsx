import React from 'react';
import { Users } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';

export default function Equipe() {
  return (
    <div>
      <PageHeader
        icon={Users}
        title="Équipe & Shifts"
        subtitle="Gestion du personnel et planning"
      />

      <EmptyState
        icon={Users}
        title="Page réinitialisée"
        description="Cette page a été vidée et est prête à être reconstruite."
      />
    </div>
  );
}