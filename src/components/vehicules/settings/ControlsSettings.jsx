import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';

export default function ControlsSettings({ formData, onChange }) {
  return (
    <div className="space-y-4">
      {/* Début de shift */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Début de shift</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3">
            <Switch
              checked={formData.start_shift_km_required}
              onCheckedChange={(val) => onChange('start_shift_km_required', val)}
            />
            <span className="text-sm font-medium">Kilométrage requis</span>
          </label>
          <label className="flex items-center gap-3">
            <Switch
              checked={formData.start_shift_photo_required}
              onCheckedChange={(val) => onChange('start_shift_photo_required', val)}
            />
            <span className="text-sm font-medium">Photo requise</span>
          </label>
          <label className="flex items-center gap-3">
            <Switch
              checked={formData.start_shift_tire_check_required}
              onCheckedChange={(val) => onChange('start_shift_tire_check_required', val)}
            />
            <span className="text-sm font-medium">Vérification pneus requise</span>
          </label>
          <label className="flex items-center gap-3">
            <Switch
              checked={formData.start_shift_warning_lights_required}
              onCheckedChange={(val) => onChange('start_shift_warning_lights_required', val)}
            />
            <span className="text-sm font-medium">Contrôle témoins requis</span>
          </label>
        </CardContent>
      </Card>

      {/* Fin de service */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fin de service</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3">
            <Switch
              checked={formData.end_shift_key_required}
              onCheckedChange={(val) => onChange('end_shift_key_required', val)}
            />
            <span className="text-sm font-medium">Clés requises</span>
          </label>
          <label className="flex items-center gap-3">
            <Switch
              checked={formData.end_shift_photo_required}
              onCheckedChange={(val) => onChange('end_shift_photo_required', val)}
            />
            <span className="text-sm font-medium">Photo requise</span>
          </label>
          <label className="flex items-center gap-3">
            <Switch
              checked={formData.end_shift_signature_required}
              onCheckedChange={(val) => onChange('end_shift_signature_required', val)}
            />
            <span className="text-sm font-medium">Signature requise</span>
          </label>
          <label className="flex items-center gap-3">
            <Switch
              checked={formData.end_shift_block_if_missing}
              onCheckedChange={(val) => onChange('end_shift_block_if_missing', val)}
            />
            <span className="text-sm font-medium">Bloquer si éléments manquants</span>
          </label>
          <div>
            <Label className="text-sm font-medium">Tolérance (minutes)</Label>
            <Input
              type="number"
              min="0"
              value={formData.end_shift_tolerance_minutes}
              onChange={(e) => onChange('end_shift_tolerance_minutes', Number(e.target.value))}
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}