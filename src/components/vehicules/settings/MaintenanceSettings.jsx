import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';

export default function MaintenanceSettings({ formData, onChange }) {
  return (
    <div className="space-y-4">
      {/* Seuils pneus et entretien */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Seuils d'alerte</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Alerte pneus (km)</Label>
              <Input
                type="number"
                min="0"
                value={formData.tire_km_alert_threshold}
                onChange={(e) => onChange('tire_km_alert_threshold', Number(e.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Révision (km)</Label>
              <Input
                type="number"
                min="0"
                value={formData.revision_km_threshold}
                onChange={(e) => onChange('revision_km_threshold', Number(e.target.value))}
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label className="text-sm font-medium">Rappel entretien (jours)</Label>
            <Input
              type="number"
              min="0"
              value={formData.maintenance_reminder_days}
              onChange={(e) => onChange('maintenance_reminder_days', Number(e.target.value))}
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Score fiabilité */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Score fiabilité</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="flex items-center gap-3">
            <Switch
              checked={formData.enable_vehicle_reliability_score}
              onCheckedChange={(val) => onChange('enable_vehicle_reliability_score', val)}
            />
            <span className="text-sm font-medium">Activer le scoring</span>
          </label>
        </CardContent>
      </Card>

      {/* Véhicule de réserve */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Véhicule de réserve</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3">
            <Switch
              checked={formData.enable_auto_reserve_replacement}
              onCheckedChange={(val) => onChange('enable_auto_reserve_replacement', val)}
            />
            <span className="text-sm font-medium">Remplacement auto en cas de panne</span>
          </label>
          <label className="flex items-center gap-3">
            <Switch
              checked={formData.notify_manager_on_auto_replace}
              onCheckedChange={(val) => onChange('notify_manager_on_auto_replace', val)}
            />
            <span className="text-sm font-medium">Notifier le manager</span>
          </label>
        </CardContent>
      </Card>
    </div>
  );
}