import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

const WIDGETS = [
  { key: 'show_widget_loa', label: 'Widget LOA' },
  { key: 'show_widget_km_30j', label: 'Widget Km (30j)' },
  { key: 'show_widget_conformite', label: 'Widget Conformité' },
  { key: 'show_widget_incidents', label: 'Widget Incidents' },
  { key: 'show_widget_documents', label: 'Widget Documents' },
  { key: 'show_widget_thermique_electrique', label: 'Thermique vs Électrique' },
  { key: 'show_widget_score_fiabilite', label: 'Score Fiabilité' },
  { key: 'show_widget_loa_projection_cost', label: 'Projection Coûts LOA' },
  { key: 'show_widget_pneus_alert', label: 'Alerte Pneus' },
  { key: 'show_widget_missing_key', label: 'Clés manquantes' }
];

export default function DashboardSettings({ formData, onChange }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Widgets affichés au dashboard</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {WIDGETS.map(widget => (
            <label key={widget.key} className="flex items-center gap-3 p-3 rounded border border-gray-200 hover:bg-gray-50 cursor-pointer">
              <Switch
                checked={formData[widget.key] ?? true}
                onCheckedChange={(val) => onChange(widget.key, val)}
              />
              <span className="text-sm font-medium text-gray-700">{widget.label}</span>
            </label>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}