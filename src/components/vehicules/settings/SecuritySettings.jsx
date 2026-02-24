import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';

export default function SecuritySettings({ formData, onChange }) {
  return (
    <div className="space-y-4">
      {/* Score conducteur */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Score conducteur</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3">
            <Switch
              checked={formData.enable_driver_score}
              onCheckedChange={(val) => onChange('enable_driver_score', val)}
            />
            <span className="text-sm font-medium">Activer le scoring conducteur</span>
          </label>

          {formData.enable_driver_score && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Seuil vert (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.driver_score_green_threshold}
                    onChange={(e) => onChange('driver_score_green_threshold', Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Seuil orange (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.driver_score_orange_threshold}
                    onChange={(e) => onChange('driver_score_orange_threshold', Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
              </div>

              <label className="flex items-center gap-3">
                <Switch
                  checked={formData.show_driver_score_dashboard}
                  onCheckedChange={(val) => onChange('show_driver_score_dashboard', val)}
                />
                <span className="text-sm font-medium">Afficher au dashboard</span>
              </label>
            </>
          )}
        </CardContent>
      </Card>

      {/* Contrôles de conformité */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conformité</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-gray-500 mb-3">Les contrôles de début et fin de shift sont configurés dans l'onglet "Obligations".</p>
        </CardContent>
      </Card>
    </div>
  );
}