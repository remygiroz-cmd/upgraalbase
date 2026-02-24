import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { AlertTriangle } from 'lucide-react';

export default function AdvancedSettings({ formData, onChange }) {
  return (
    <div className="space-y-4">
      {/* Règles métier */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Règles métier</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3">
            <Switch
              checked={formData.allow_multi_driver_same_day}
              onCheckedChange={(val) => onChange('allow_multi_driver_same_day', val)}
            />
            <span className="text-sm font-medium">Permettre plusieurs chauffeurs le même jour</span>
          </label>

          <label className="flex items-center gap-3">
            <Switch
              checked={formData.enforce_one_driver_one_vehicle}
              onCheckedChange={(val) => onChange('enforce_one_driver_one_vehicle', val)}
            />
            <span className="text-sm font-medium">Un chauffeur = un véhicule</span>
          </label>
        </CardContent>
      </Card>

      {/* Audit et logging */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit et logging</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-3">
            <Switch
              checked={formData.enable_settings_audit_log}
              onCheckedChange={(val) => onChange('enable_settings_audit_log', val)}
            />
            <span className="text-sm font-medium">Enregistrer les modifications (journal d'audit)</span>
          </label>
          {formData.enable_settings_audit_log && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-900 flex gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>Chaque modification sera enregistrée avec l'utilisateur, la date et les champs modifiés.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Informations système */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informations</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-gray-500 space-y-2">
          <p>Cette page configure entièrement le module Parc Véhicules.</p>
          <p>Les changements s'appliquent immédiatement après sauvegarde.</p>
          <p>Réservé aux rôles : Manager, Admin, Gérant, Bureau</p>
        </CardContent>
      </Card>
    </div>
  );
}