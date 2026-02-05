import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { AlertTriangle, Calendar, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { calculateCPPeriod, calculateCPDays } from './paidLeaveCalculations';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function AddPaidLeaveModalContent({ employee, existingPeriod = null, onClose }) {
  const queryClient = useQueryClient();
  const [lastWorkDay, setLastWorkDay] = useState('');
  const [firstWorkDayAfter, setFirstWorkDayAfter] = useState('');
  const [notes, setNotes] = useState('');
  const [manualOverride, setManualOverride] = useState('');
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    if (existingPeriod) {
      setLastWorkDay(existingPeriod.last_work_day || '');
      setFirstWorkDayAfter(existingPeriod.first_work_day_after || '');
      setNotes(existingPeriod.notes || '');
      setManualOverride(existingPeriod.cp_days_manual || '');
    } else {
      setLastWorkDay('');
      setFirstWorkDayAfter('');
      setNotes('');
      setManualOverride('');
      setShowDebug(false);
    }
  }, [existingPeriod]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (existingPeriod) {
        return await base44.entities.PaidLeavePeriod.update(existingPeriod.id, data);
      } else {
        return await base44.entities.PaidLeavePeriod.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paidLeavePeriods'] });
      toast.success(existingPeriod ? 'Période CP modifiée' : 'Période CP créée');
      onClose();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (existingPeriod) {
        return await base44.entities.PaidLeavePeriod.delete(existingPeriod.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paidLeavePeriods'] });
      toast.success('Période CP supprimée');
      onClose();
    }
  });

  const isValid = lastWorkDay && firstWorkDayAfter && lastWorkDay < firstWorkDayAfter;
  
  let cpData = null;
  if (isValid) {
    const period = calculateCPPeriod(lastWorkDay, firstWorkDayAfter);
    const days = calculateCPDays(period.startCP, period.endCP, showDebug);
    cpData = { ...period, ...days };
  }

  const handleSave = () => {
    if (!isValid) {
      toast.error('Dates invalides');
      return;
    }

    const data = {
      employee_id: employee.id,
      employee_name: `${employee.first_name} ${employee.last_name}`,
      last_work_day: lastWorkDay,
      first_work_day_after: firstWorkDayAfter,
      start_cp: cpData.startCP,
      end_cp: cpData.endCP,
      cp_days_auto: cpData.countedDays,
      cp_days_manual: manualOverride ? parseFloat(manualOverride) : null,
      notes
    };

    saveMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm text-gray-600 font-medium">
          {employee ? `${employee.first_name} ${employee.last_name}` : ''}
        </p>
      </div>

      <Alert className="bg-blue-50 border-blue-200">
        <div className="text-sm text-blue-900">
          <p className="font-semibold mb-1">📋 Principe :</p>
          <p>Définissez le <strong>dernier jour travaillé</strong> et le <strong>jour de reprise</strong>.</p>
          <p className="mt-1 text-xs text-blue-700">
            La période CP sera automatiquement calculée (lendemain dernier jour → veille reprise).
          </p>
        </div>
      </Alert>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-sm font-semibold text-gray-900">Dernier jour travaillé *</Label>
          <Input
            type="date"
            value={lastWorkDay}
            onChange={(e) => setLastWorkDay(e.target.value)}
            className="mt-1"
          />
          <p className="text-xs text-gray-500 mt-1">Jour avec shift avant CP</p>
        </div>
        <div>
          <Label className="text-sm font-semibold text-gray-900">Jour de reprise *</Label>
          <Input
            type="date"
            value={firstWorkDayAfter}
            onChange={(e) => setFirstWorkDayAfter(e.target.value)}
            className="mt-1"
          />
          <p className="text-xs text-gray-500 mt-1">Jour avec shift après CP</p>
        </div>
      </div>

      {lastWorkDay && firstWorkDayAfter && lastWorkDay >= firstWorkDayAfter && (
        <Alert className="bg-red-50 border-red-300">
          <AlertTriangle className="w-4 h-4 text-red-600" />
          <p className="text-sm text-red-900 ml-2">
            Le jour de reprise doit être postérieur au dernier jour travaillé.
          </p>
        </Alert>
      )}

      {isValid && cpData && (
        <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
          <h3 className="font-bold text-green-900 mb-3 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Période CP calculée
          </h3>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-xs text-gray-600">Début CP</p>
              <p className="text-lg font-bold text-green-700">{cpData.startCP}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Fin CP</p>
              <p className="text-lg font-bold text-green-700">{cpData.endCP}</p>
            </div>
          </div>

          <div className="bg-white border border-green-200 rounded p-3 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-700">Total jours calendaires :</span>
              <span className="font-semibold text-gray-900">{cpData.totalDays}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-700">Jours non comptés (dim. + fériés) :</span>
              <span className="font-semibold text-red-600">- {cpData.excludedDays}</span>
            </div>
            <div className="border-t border-green-200 pt-2 flex justify-between items-center">
              <span className="text-sm font-bold text-gray-900">CP décomptés (ouvrables) :</span>
              <span className="text-2xl font-bold text-green-700">{cpData.countedDays} j</span>
            </div>
          </div>
        </div>
      )}

      {isValid && (
        <div className="border-2 border-orange-200 rounded-lg p-4 bg-orange-50">
          <Label className="text-sm font-semibold text-gray-900">
            Surcharge manuelle (badge) - optionnel
          </Label>
          <Input
            type="number"
            step="0.5"
            placeholder={`Auto: ${cpData?.countedDays || 0} jours`}
            value={manualOverride}
            onChange={(e) => setManualOverride(e.target.value)}
            className="mt-2"
          />
          <p className="text-xs text-gray-600 mt-2">
            ⚠️ Cette valeur remplacera le calcul automatique sur le badge affiché dans le planning.
          </p>
        </div>
      )}

      <div>
        <Label className="text-sm font-semibold text-gray-900">Notes (optionnel)</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex: CP anticipés, ajustement RH, etc."
          rows={2}
          className="mt-1"
        />
      </div>

      {isValid && (
        <div>
          <button
            type="button"
            onClick={() => setShowDebug(!showDebug)}
            className="text-xs text-purple-700 hover:text-purple-900 font-semibold"
          >
            {showDebug ? '🔻 Masquer' : '🔍 Afficher'} le détail debug
          </button>
          
          {showDebug && cpData?.details && (
            <div className="mt-2 bg-purple-50 border border-purple-200 rounded p-3 max-h-48 overflow-y-auto">
              <div className="text-xs space-y-1">
                {cpData.details.map((d, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex justify-between",
                      d.counted ? "text-green-700" : "text-red-600"
                    )}
                  >
                    <span>{d.date} ({d.dayName})</span>
                    <span>
                      {d.counted ? '✓ Compté' : `✗ ${d.reason}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3 pt-4 border-t">
        <Button
          onClick={handleSave}
          disabled={!isValid || saveMutation.isPending}
          className="flex-1 bg-green-600 hover:bg-green-700"
        >
          <Check className="w-4 h-4 mr-2" />
          {saveMutation.isPending ? 'Enregistrement...' : (existingPeriod ? 'Modifier' : 'Créer la période')}
        </Button>
        
        {existingPeriod && (
          <Button
            onClick={() => {
              if (window.confirm('Supprimer cette période CP ?')) {
                deleteMutation.mutate();
              }
            }}
            variant="outline"
            className="border-red-300 text-red-700 hover:bg-red-50"
          >
            Supprimer
          </Button>
        )}
        
        <Button
          onClick={onClose}
          variant="outline"
        >
          Annuler
        </Button>
      </div>
    </div>
  );
}