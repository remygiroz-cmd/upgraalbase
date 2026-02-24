import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Car, BarChart3, FileText, Wrench, Calendar } from 'lucide-react';
import VehiclesFleetTab from '@/components/vehicules/VehiclesFleetTab.jsx';
import VehiclesAssignmentTab from '@/components/vehicules/VehiclesAssignmentTab.jsx';
import VehiclesDashboard from '@/components/vehicules/VehiclesDashboard.jsx';
import VehiclesDocumentsTab from '@/components/vehicules/VehiclesDocumentsTab.jsx';
import VehiclesMaintenanceTab from '@/components/vehicules/VehiclesMaintenanceTab.jsx';
import DriverView from '@/components/vehicules/DriverView.jsx';

export default function Vehicules() {
  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: userRole } = useQuery({
    queryKey: ['userRole', currentUser?.role_id],
    queryFn: async () => {
      if (!currentUser?.role_id) return null;
      const roles = await base44.entities.Role.filter({ id: currentUser.role_id });
      return roles[0] || null;
    },
    enabled: !!currentUser?.role_id
  });

  const { data: currentEmployee } = useQuery({
    queryKey: ['employeeByEmail', currentUser?.email],
    queryFn: async () => {
      if (!currentUser?.email) return null;
      const emps = await base44.entities.Employee.filter({ email: currentUser.email, is_active: true });
      return emps[0] || null;
    },
    enabled: !!currentUser?.email
  });

  const isManager = currentUser?.role === 'admin' ||
    ['responsable', 'gérant', 'manager', 'bureau'].some(r =>
      (userRole?.name || '').toLowerCase().includes(r)
    );

  if (!isManager) {
    return <DriverView currentUser={currentUser} currentEmployee={currentEmployee} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
          <Car className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Parc Véhicules</h1>
          <p className="text-sm text-gray-500">Gestion intelligente de la flotte</p>
        </div>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="dashboard" className="flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="flotte" className="flex items-center gap-1.5">
            <Car className="w-4 h-4" /> Flotte
          </TabsTrigger>
          <TabsTrigger value="assignations" className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4" /> Assignations
          </TabsTrigger>
          <TabsTrigger value="maintenance" className="flex items-center gap-1.5">
            <Wrench className="w-4 h-4" /> Maintenance
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-1.5">
            <FileText className="w-4 h-4" /> Documents
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard"><VehiclesDashboard /></TabsContent>
        <TabsContent value="flotte"><VehiclesFleetTab /></TabsContent>
        <TabsContent value="assignations"><VehiclesAssignmentTab currentEmployee={currentEmployee} /></TabsContent>
        <TabsContent value="maintenance"><VehiclesMaintenanceTab /></TabsContent>
        <TabsContent value="documents"><VehiclesDocumentsTab /></TabsContent>
      </Tabs>
    </div>
  );
}