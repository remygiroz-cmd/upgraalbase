import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RotateCcw, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { upsertExportOverride, deleteExportOverride } from './monthlyExportOverrideService';

const EMPTY_STATE = {
  nb_jours_travailles: null,
  jours_supp: null,
  payees_hors_sup_comp: null,
  compl_10: null,
  compl_25: null,
  supp_25: null,
  supp_50: null,
  ferie_jours: null,
  ferie_heures: null,
  non_shifts_visibles: null,
  cp_decomptes: null,
  notes: ''
};

export default function ExportOverrideModal({ 
  open, 
  onOpenChange, 
  employee, 
  monthKey,
  autoValues,
  existingOverride  // kept for backward compat but not used anymore
}) {
  const queryClient = useQueryClient();
  const [overrides, setOverrides] = useState(EMPTY_STATE);

  // Charger la surcharge export depuis MonthlyExportOverride (nouvelle entité)
  useEffect(() => {
    if (!open || !employee?.id) return;
    base44.entities.MonthlyExportOverride.filter({ month_key: monthKey, employee_id: employee.id })
      .then(arr => {
        const rec = arr[0];
        if (rec) {
          setOverrides({
            nb_jours_travailles:  rec.nb_jours_travailles ?? null,
            jours_supp:           rec.jours_supp ?? null,
            payees_hors_sup_comp: rec.payees_hors_sup_comp ?? null,
            compl_10:             rec.compl_10 ?? null,
            compl_25:             rec.compl_25 ?? null,
            supp_25:              rec.supp_25 ?? null,
            supp_50:              rec.supp_50 ?? null,
            ferie_jours:          rec.ferie_jours ?? null,
            ferie_heures:         rec.ferie_heures ?? null,
            non_shifts_visibles:  rec.non_shifts_visibles ?? null,
            cp_decomptes:         rec.cp_decomptes ?? null,
            notes:                rec.notes || ''
          });
        } else {
          setOverrides(EMPTY_STATE);
        }
      });
  }, [open, employee?.id, monthKey]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await upsertExportOverride(monthKey, employee.id, overrides);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exportOverrides', monthKey] });
      queryClient.invalidateQueries({ queryKey: ['monthlyExportOverrides', monthKey] });
      toast.success('Surcharge export enregistrée');
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error('Erreur : ' + error.message);
    }
  });

  const resetAllMutation = useMutation({
    mutationFn: () => deleteExportOverride(monthKey, employee.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exportOverrides', monthKey] });
      queryClient.invalidateQueries({ queryKey: ['monthlyExportOverrides', monthKey] });
      setOverrides(EMPTY_STATE);
      toast.success('Surcharges export supprimées');
      onOpenChange(false);
    },
    onError: (e) => toast.error('Erreur lors de la réinitialisation: ' + e.message)
  });

  const handleSave = () => saveMutation.mutate();

  const handleReset = (field) => {
    setOverrides(prev => ({ ...prev, [field]: null }));
  };

  const handleChange = (field, value) => {
    setOverrides(prev => ({ ...prev, [field]: value }));
  };

  const formatHours = (h) => {
    if (h === null || h === undefined) return '';
    return h % 1 === 0 ? h.toFixed(0) : h.toFixed(1);
  };

  const fields = [
    { key: 'nb_jours_travailles', label: 'Nb jours travaillés', auto: autoValues?.nbJoursTravailles, type: 'number' },
    { key: 'jours_supp', label: 'Jours supp', auto: autoValues?.joursSupp, type: 'number' },
    { key: 'payees_hors_sup_comp', label: 'Payées (hors sup/comp)', auto: autoValues?.payeesHorsSup != null ? formatHours(autoValues.payeesHorsSup) + 'h' : '', type: 'number', suffix: 'h' },
    { key: 'compl_10', label: 'Compl +10%', auto: autoValues?.compl10 > 0 ? formatHours(autoValues.compl10) + 'h' : '', type: 'number', suffix: 'h' },
    { key: 'compl_25', label: 'Compl +25%', auto: autoValues?.compl25 > 0 ? formatHours(autoValues.compl25) + 'h' : '', type: 'number', suffix: 'h' },
    { key: 'supp_25', label: 'Supp +25%', auto: autoValues?.supp25 > 0 ? formatHours(autoValues.supp25) + 'h' : '', type: 'number', suffix: 'h' },
    { key: 'supp_50', label: 'Supp +50%', auto: autoValues?.supp50 > 0 ? formatHours(autoValues.supp50) + 'h' : '', type: 'number', suffix: 'h' },
    { key: 'ferie_jours', label: 'Férié (jours)', auto: autoValues?.ferieDays || '', type: 'number' },
    { key: 'ferie_heures', label: 'Férié (heures)', auto: autoValues?.ferieHours > 0 ? formatHours(autoValues.ferieHours) + 'h' : '', type: 'number', suffix: 'h' }
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
              Auto : <pre className="inline whitespace-pre-line font-mono bg-gray-50 p-2 rounded">{autoValues?.nonShiftsStr || '–'}</pre>
            </div>
            <div className="flex gap-2">
              <Textarea
                value={overrides.non_shifts_visibles ?? ''}
                onChange={(e) => handleChange('non_shifts_visibles', e.target.value || null)}
                placeholder="Auto"
                rows={3}
                className="text-sm font-mono"
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => handleReset('non_shifts_visibles')}
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
              Auto : <pre className="inline whitespace-pre-line font-mono bg-gray-50 p-2 rounded">{autoValues?.cpStr || '–'}</pre>
            </div>
            <div className="flex gap-2">
              <Textarea
                value={overrides.cp_decomptes ?? ''}
                onChange={(e) => handleChange('cp_decomptes', e.target.value || null)}
                placeholder="Auto"
                rows={3}
                className="text-sm font-mono"
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => handleReset('cp_decomptes')}
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
            variant="outline"
            onClick={() => resetAllMutation.mutate()}
            disabled={resetAllMutation.isPending}
            className="border-red-300 text-red-700 hover:bg-red-50"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Tout réinitialiser
          </Button>
          <Button 
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="bg-orange-600 hover:bg-orange-700"
          >
            <Save className="w-4 h-4 mr-2" />
            {saveMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}