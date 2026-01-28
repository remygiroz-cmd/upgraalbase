import React, { useState } from 'react';
import { Users, User } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import EmployeeList from '@/components/personnel/EmployeeList';

export default function Equipe() {
  const [activeTab, setActiveTab] = useState('equipes');

  return (
    <div>
      <PageHeader
        icon={Users}
        title="Équipe & Shifts"
        subtitle="Gestion du personnel et planning"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList className="bg-white border-2 border-gray-300 p-1 w-full sm:w-auto grid grid-cols-2 sm:inline-flex">
          <TabsTrigger value="equipes" className="data-[state=active]:bg-gray-100 text-gray-900 text-xs sm:text-sm min-h-[44px]">
            <Users className="w-4 h-4 sm:mr-2" />
            <span>Équipes</span>
          </TabsTrigger>
          <TabsTrigger value="personnel" className="data-[state=active]:bg-gray-100 text-gray-900 text-xs sm:text-sm min-h-[44px]">
            <User className="w-4 h-4 sm:mr-2" />
            <span>Personnel</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === 'equipes' ? (
        <EmptyState
          icon={Users}
          title="Équipes"
          description="Gérez vos équipes ici"
        />
      ) : (
        <EmployeeList />
      )}
    </div>
  );
}