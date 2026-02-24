import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { AlertTriangle, RotateCcw, Save, Zap } from 'lucide-react';

// Import des composants de sections
import AssignationSettings from '@/components/vehicules/settings/AssignationSettings.jsx';
import DashboardSettings from '@/components/vehicules/settings/DashboardSettings.jsx';
import ControlsSettings from '@/components/vehicules/settings/ControlsSettings.jsx';
import DocumentsSettings from '@/components/vehicules/settings/DocumentsSettings.jsx';
import MaintenanceSettings from '@/components/vehicules/settings/MaintenanceSettings.jsx';
import AlgorithmSettings from '@/components/vehicules/settings/AlgorithmSettings.jsx';
import SecuritySettings from '@/components/vehicules/settings/SecuritySettings.jsx';
import AdvancedSettings from '@/components/vehicules/settings/AdvancedSettings.jsx';

const DEFAULT_SETTINGS = {
  setting_key: 'fleet_main',
  assignment_target_type: 'ALL_PRESENT',
  assignment_target_team_ids: [],
  assignment_target_employee_ids: [],
  assignment_mode: 'MANUAL_ONLY',
  auto_assign_hour: '08:00',
  auto_assign_days: [],
  auto_assign_do_not_override: false,
  required_vehicles_mon_thu: 0,
  required_vehicles_fri_sat_sun: 0,
  weight_km_balance: 5,
  weight_loa_protection: 5,
  weight_driver_rotation: 5,
  weight_electric_priority: 3,
  show_widget_loa: true,
  show_widget_km_30j: true,
  show_widget_conformite: true,
  show_widget_incidents: true,
  show_widget_documents: true,
  show_widget_thermique_electrique: true,
  show_widget_score_fiabilite: true,
  show_widget_loa_projection_cost: false,
  show_widget_pneus_alert: true,
  show_widget_missing_key: true,
  start_shift_km_required: false,
  start_shift_photo_required: false,
  start_shift_tire_check_required: false,
  start_shift_warning_lights_required: false,
  end_shift_key_required: false,
  end_shift_photo_required: false,
  end_shift_signature_required: false,
  end_shift_block_if_missing: false,
  end_shift_tolerance_minutes: 5,
  document_reminder_days_1: 30,
  document_reminder_days_2: 60,
  document_reminder_days_3: 90,
  block_assignment_if_insurance_expired: false,
  block_assignment_if_ct_expired: false,
  tire_km_alert_threshold: 3000,
  revision_km_threshold: 15000,
  maintenance_reminder_days: 30,
  enable_vehicle_reliability_score: true,
  enable_auto_reserve_replacement: false,
  reserve_priority_order: [],
  notify_manager_on_auto_replace: true,
  enable_driver_score: true,
  driver_score_green_threshold: 80,
  driver_score_orange_threshold: 50,
  show_driver_score_dashboard: true,
  loa_calculation_mode: 'MONTHLY',
  allow_multi_driver_same_day: false,
  enforce_one_driver_one_vehicle: true,
  enable_settings_audit_log: false
};

export default function VehiclesSettings() {
  const queryClient = useQueryClient();
  const [hasChanges, setHasChanges] = useState(false);
  const [formData, setFormData] = useState(DEFAULT_SETTINGS);

  // Load current user
  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  // Load current settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['fleetSettings'],
    queryFn: async () => {
      const result = await base44.entities.FleetSettings.filter({ setting_key: 'fleet_main' });
      return result[0] || null;
    }
  });

  // Initialize form when settings load
  React.useEffect(() => {
    if (settings) {
      setFormData({ ...DEFAULT_SETTINGS, ...settings });
      setHasChanges(false);
    }
  }, [settings]);

  // Check permissions
  const canEdit = useMemo(() => {
    if (!currentUser) return false;
    const role = (currentUser.role || '').toLowerCase();
    return ['admin', 'manager', 'gérant', 'bureau'].some(r => role.includes(r));
  }, [currentUser]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!settings?.id) {
        // Create new
        return await base44.entities.FleetSettings.create(formData);
      } else {
        // Update existing
        return await base44.entities.FleetSettings.update(settings.id, formData);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fleetSettings'] });
      setHasChanges(false);
      toast.success('Paramètres sauvegardés avec succès');
    },
    onError: (err) => {
      toast.error('Erreur lors de la sauvegarde : ' + err.message);
    }
  });

  const handleFieldChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleReset = () => {
    setFormData(DEFAULT_SETTINGS);
    setHasChanges(true);
    toast.success('Paramètres réinitialisés aux valeurs par défaut');
  };

  if (isLoading) {
    return <div className="p-6 text-center">Chargement...</div>;
  }

  if (!canEdit) {
    return (
      <div className="p-6">
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-6 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-600" />
            <p className="text-sm text-orange-900">
              Vous n'avez pas les permissions pour modifier les paramètres du parc véhicules.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <PageHeader
        title="Paramètres Parc Véhicules"
        description="Configuration complète du module, assignation, dashboard et conformité"
        icon={<Zap className="w-6 h-6" />}
      />

      <Tabs defaultValue="assignation" className="w-full">
        <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8">
          <TabsTrigger value="assignation">Assignation</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="obligations">Obligations</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="entretien">Entretien</TabsTrigger>
          <TabsTrigger value="algorithme">LOA & Algo</TabsTrigger>
          <TabsTrigger value="securite">Sécurité</TabsTrigger>
          <TabsTrigger value="avance">Avancé</TabsTrigger>
        </TabsList>

        <TabsContent value="assignation" className="space-y-4">
          <AssignationSettings formData={formData} onChange={handleFieldChange} />
        </TabsContent>

        <TabsContent value="dashboard" className="space-y-4">
          <DashboardSettings formData={formData} onChange={handleFieldChange} />
        </TabsContent>

        <TabsContent value="obligations" className="space-y-4">
          <ControlsSettings formData={formData} onChange={handleFieldChange} />
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <DocumentsSettings formData={formData} onChange={handleFieldChange} />
        </TabsContent>

        <TabsContent value="entretien" className="space-y-4">
          <MaintenanceSettings formData={formData} onChange={handleFieldChange} />
        </TabsContent>

        <TabsContent value="algorithme" className="space-y-4">
          <AlgorithmSettings formData={formData} onChange={handleFieldChange} />
        </TabsContent>

        <TabsContent value="securite" className="space-y-4">
          <SecuritySettings formData={formData} onChange={handleFieldChange} />
        </TabsContent>

        <TabsContent value="avance" className="space-y-4">
          <AdvancedSettings formData={formData} onChange={handleFieldChange} />
        </TabsContent>
      </Tabs>

      {/* Action buttons */}
      <div className="fixed bottom-6 right-6 flex gap-3 bg-white p-4 rounded-lg shadow-lg border">
        <Button
          variant="outline"
          onClick={handleReset}
          disabled={!hasChanges}
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Restaurer défaut
        </Button>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={!hasChanges || saveMutation.isPending}
          className="bg-purple-600 hover:bg-purple-700"
        >
          <Save className="w-4 h-4 mr-2" />
          {saveMutation.isPending ? 'Sauvegarde...' : 'Sauvegarder'}
        </Button>
      </div>
    </div>
  );
}