import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RotateCcw, Save, X } from 'lucide-react';
import { toast } from 'sonner';

export default function ExportOverrideModal({ 
  open, 
  onOpenChange, 
  employee, 
  monthKey,
  autoValues,
  existingOverride
}) {
  const queryClient = useQueryClient();
  const [overrides, setOverrides] = useState({
    override_nbJoursTravailles: null,
    override_joursSupp: null,
    override_payeesHorsSupComp: null,
    override_compl10: null,
    override_compl25: null,
    override_supp25: null,
    override_supp50: null,
    override_ferieDays: null,
    override_ferieHours: null,
    override_nonShiftsText: null,
    override_cpText: null,
    notes: ''
  });

  useEffect(() => {
    if (existingOverride) {
      setOverrides(existingOverride);
    } else {
      setOverrides({
        override_nbJoursTravailles: null,
        override_joursSupp: null,
        override_payeesHorsSupComp: null,
        override_compl10: null,
        override_compl25: null,
        override_supp25: null,
        override_supp50: null,
        override_ferieDays: null,
        override_ferieHours: null,
        override_nonShiftsText: null,
        override_cpText: null,
        notes: ''
      });
    }
  }, [existingOverride, open]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const user = await base44.auth.me();
      
      if (existingOverride) {
        return await base44.entities.ExportComptaOverride.update(existingOverride.id, {
          ...data,
          modified_by: user.email,
          modified_by_name: user.full_name
        });
      } else {
        return await base44.entities.ExportComptaOverride.create({
          month_key: monthKey,
          employee_id: employee.id,
          employee_name: `${employee.first_name} ${employee.last_name}`,
          ...data,
          modified_by: user.email,
          modified_by_name: user.full_name
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exportOverrides'] });
      toast.success('Surcharge enregistrée');
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error('Erreur : ' + error.message);
    }
  });

  const handleSave = () => {
    saveMutation.mutate(overrides);
  };

  const handleReset = (field) => {
    setOverrides(prev => ({ ...prev, [field]: null }));
  };

  const handleChange = (field, value) => {
    setOverrides(prev => ({ ...prev, [field]: value }));
  };

  const formatHours = (h) => h % 1 === 0 ? h.toFixed(0) : h.toFixed(1);

  const fields = [
    { key: 'override_nbJoursTravailles', label: 'Nb jours travaillés', auto: autoValues.nbJoursTravailles, type: 'number' },
    { key: 'override_joursSupp', label: 'Jours supp', auto: autoValues.joursSupp, type: 'number' },
    { key: 'override_payeesHorsSupComp', label: 'Payées (hors sup/comp)', auto: formatHours(autoValues.payeesHorsSup) + 'h', type: 'number', suffix: 'h' },
    { key: 'override_compl10', label: 'Compl +10%', auto: autoValues.compl10 > 0 ? formatHours(autoValues.compl10) + 'h' : '', type: 'number', suffix: 'h' },
    { key: 'override_compl25', label: 'Compl +25%', auto: autoValues.compl25 > 0 ? formatHours(autoValues.compl25) + 'h' : '', type: 'number', suffix: 'h' },
    { key: 'override_supp25', label: 'Supp +25%', auto: autoValues.supp25 > 0 ? formatHours(autoValues.supp25) + 'h' : '', type: 'number', suffix: 'h' },
    { key: 'override_supp50', label: 'Supp +50%', auto: autoValues.supp50 > 0 ? formatHours(autoValues.supp50) + 'h' : '', type: 'number', suffix: 'h' },
    { key: 'override_ferieDays', label: 'Férié (jours)', auto: autoValues.ferieDays || '', type: 'number' },
    { key: 'override_ferieHours', label: 'Férié (heures)', auto: autoValues.ferieHours > 0 ? formatHours(autoValues.ferieHours) + 'h' : '', type: 'number', suffix: 'h' }
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-orange-600">
            Surcharger export compta – {employee.first_name} {employee.last_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900">
            💡 Vous pouvez surcharger uniquement les valeurs que vous souhaitez corriger. Les champs vides utilisent le calcul automatique.
          </div>

          {/* Champs numériques */}
          {fields.map(field => (
            <div key={field.key} className="grid grid-cols-3 gap-3 items-center">
              <Label className="text-sm font-semibold">{field.label}</Label>
              <div className="text-sm text-gray-600">
                Auto : <span className="font-mono">{field.auto || '–'}</span>
              </div>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.1"
                  value={overrides[field.key] ?? ''}
                  onChange={(e) => handleChange(field.key, e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="Auto"
                  className="text-sm"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleReset(field.key)}
                  title="Revenir en auto"
                  className="flex-shrink-0"
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}

          {/* Non-shifts visibles */}
          <div className="space-y-2 border-t pt-4">
            <Label className="text-sm font-semibold">Non-shifts visibles</Label>
            <div className="text-xs text-gray-600 mb-2">
              Auto : <pre className="inline whitespace-pre-line font-mono bg-gray-50 p-2 rounded">{autoValues.nonShiftsStr || '–'}</pre>
            </div>
            <div className="flex gap-2">
              <Textarea
                value={overrides.override_nonShiftsText ?? ''}
                onChange={(e) => handleChange('override_nonShiftsText', e.target.value || null)}
                placeholder="Auto"
                rows={3}
                className="text-sm font-mono"
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => handleReset('override_nonShiftsText')}
                title="Revenir en auto"
                className="flex-shrink-0"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* CP décomptés */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">CP décomptés</Label>
            <div className="text-xs text-gray-600 mb-2">
              Auto : <pre className="inline whitespace-pre-line font-mono bg-gray-50 p-2 rounded">{autoValues.cpStr || '–'}</pre>
            </div>
            <div className="flex gap-2">
              <Textarea
                value={overrides.override_cpText ?? ''}
                onChange={(e) => handleChange('override_cpText', e.target.value || null)}
                placeholder="Auto"
                rows={3}
                className="text-sm font-mono"
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => handleReset('override_cpText')}
                title="Revenir en auto"
                className="flex-shrink-0"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2 border-t pt-4">
            <Label className="text-sm font-semibold">Notes internes</Label>
            <Textarea
              value={overrides.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Notes ou explications sur les corrections..."
              rows={2}
              className="text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4 mr-2" />
            Annuler
          </Button>
          <Button 
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="bg-orange-600 hover:bg-orange-700"
          >
            <Save className="w-4 h-4 mr-2" />
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}