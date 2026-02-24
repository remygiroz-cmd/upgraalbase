import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';

export default function DocumentsSettings({ formData, onChange }) {
  return (
    <div className="space-y-4">
      {/* Rappels documents */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rappels documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-sm font-medium">1er rappel (jours)</Label>
              <Input
                type="number"
                min="1"
                value={formData.document_reminder_days_1}
                onChange={(e) => onChange('document_reminder_days_1', Number(e.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">2e rappel (jours)</Label>
              <Input
                type="number"
                min="1"
                value={formData.document_reminder_days_2}
                onChange={(e) => onChange('document_reminder_days_2', Number(e.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">3e rappel (jours)</Label>
              <Input
                type="number"
                min="1"
                value={formData.document_reminder_days_3}
                onChange={(e) => onChange('document_reminder_days_3', Number(e.target.value))}
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Blocages légaux */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Blocages légaux</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3">
            <Switch
              checked={formData.block_assignment_if_insurance_expired}
              onCheckedChange={(val) => onChange('block_assignment_if_insurance_expired', val)}
            />
            <span className="text-sm font-medium">Bloquer si assurance expirée</span>
          </label>
          <label className="flex items-center gap-3">
            <Switch
              checked={formData.block_assignment_if_ct_expired}
              onCheckedChange={(val) => onChange('block_assignment_if_ct_expired', val)}
            />
            <span className="text-sm font-medium">Bloquer si CT expiré</span>
          </label>
        </CardContent>
      </Card>
    </div>
  );
}