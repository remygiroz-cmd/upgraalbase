import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Users, User, FileText, Download, Printer, Upload, Trash2, FileJson } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/ui/PageHeader';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import EmployeeList from '@/components/personnel/EmployeeList';
import TeamsManager from '@/components/personnel/TeamsManager';
import RegistryImportModal from '@/components/personnel/RegistryImportModal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';

export default function Equipe() {
  const [activeTab, setActiveTab] = useState('equipes');

  return (
    <div>
      <PageHeader
        icon={Users}
        title="Équipe & Shifts"
        subtitle="Gestion du personnel et planning"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-8">
        <TabsList className="bg-transparent border-b-2 border-gray-200 p-0 w-full grid grid-cols-2 sm:grid-cols-2 h-auto gap-0 rounded-none">
          <TabsTrigger 
            value="equipes" 
            className="data-[state=active]:bg-transparent data-[state=active]:border-b-[3px] data-[state=active]:border-orange-600 data-[state=active]:text-orange-600 text-gray-600 hover:text-gray-900 text-sm sm:text-base font-medium min-h-[48px] rounded-none border-b-[3px] border-transparent transition-all"
          >
            <Users className="w-5 h-5 mr-2" />
            Équipes
          </TabsTrigger>
          <TabsTrigger 
            value="personnel" 
            className="data-[state=active]:bg-transparent data-[state=active]:border-b-[3px] data-[state=active]:border-orange-600 data-[state=active]:text-orange-600 text-gray-600 hover:text-gray-900 text-sm sm:text-base font-medium min-h-[48px] rounded-none border-b-[3px] border-transparent transition-all"
          >
            <User className="w-5 h-5 mr-2" />
            Personnel
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === 'equipes' ? (
        <TeamsManager />
      ) : (
        <EmployeeList />
      )}
    </div>
  );
}