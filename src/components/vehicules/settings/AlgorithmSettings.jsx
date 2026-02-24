import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';

export default function AlgorithmSettings({ formData, onChange }) {
  const handleSliderChange = (field, value) => {
    onChange(field, value[0]);
  };

  return (
    <div className="space-y-4">
      {/* Mode de calcul LOA */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Calcul LOA</CardTitle>
        </CardHeader>
        <CardContent>
          <div>
            <Label className="text-sm font-medium">Mode de calcul</Label>
            <Select value={formData.loa_calculation_mode} onValueChange={(val) => onChange('loa_calculation_mode', val)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DAILY">Quotidien</SelectItem>
                <SelectItem value="MONTHLY">Mensuel</SelectItem>
                <SelectItem value="MOVING_AVERAGE_30D">Moyenne mobile 30j</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Pondérations algorithme */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pondérations d'assignation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <div className="flex justify-between items-center mb-2">
              <Label className="text-sm font-medium">Équilibrage km</Label>
              <span className="text-lg font-bold text-purple-600">{formData.weight_km_balance}/10</span>
            </div>
            <Slider
              value={[formData.weight_km_balance]}
              onValueChange={(val) => handleSliderChange('weight_km_balance', val)}
              min={0}
              max={10}
              step={1}
              className="w-full"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <Label className="text-sm font-medium">Protection LOA</Label>
              <span className="text-lg font-bold text-purple-600">{formData.weight_loa_protection}/10</span>
            </div>
            <Slider
              value={[formData.weight_loa_protection]}
              onValueChange={(val) => handleSliderChange('weight_loa_protection', val)}
              min={0}
              max={10}
              step={1}
              className="w-full"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <Label className="text-sm font-medium">Rotation chauffeurs</Label>
              <span className="text-lg font-bold text-purple-600">{formData.weight_driver_rotation}/10</span>
            </div>
            <Slider
              value={[formData.weight_driver_rotation]}
              onValueChange={(val) => handleSliderChange('weight_driver_rotation', val)}
              min={0}
              max={10}
              step={1}
              className="w-full"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <Label className="text-sm font-medium">Priorité électrique</Label>
              <span className="text-lg font-bold text-purple-600">{formData.weight_electric_priority}/10</span>
            </div>
            <Slider
              value={[formData.weight_electric_priority]}
              onValueChange={(val) => handleSliderChange('weight_electric_priority', val)}
              min={0}
              max={10}
              step={1}
              className="w-full"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}