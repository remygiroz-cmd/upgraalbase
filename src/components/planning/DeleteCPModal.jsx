import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Trash2, Pencil, Check, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';
import { calculateCPPeriod, calculateCPDays } from './paidLeaveCalculations';
import { getActiveMonthContext } from './monthContext';

export default function DeleteCPModal({ cpPeriod, employee, onClose }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('edit'); // 'edit' | 'delete'

  // Edit state — pre-fill with existing values
  const [cpStartDate, setCpStartDate] = useState(cpPeriod.cp_start_date || cpPeriod.start_cp || '');
  const [returnDate, setReturnDate] = useState(cpPeriod.return_date || '');
  const [manualOverride, setManualOverride] = useState(cpPeriod.cp_days_manual ? String(cpPeriod.cp_days_manual) : '');

  // Computed CP data for edit tab
  const isEditValid = cpStartDate && returnDate && cpStartDate < returnDate;
  let cpData = null;
  if (isEditValid) {
    const period = calculateCPPeriod(cpStartDate, returnDate);
    const days = calculateCPDays(period.startCP, period.endCP);
    cpData = { ...period, ...days };
  }

  // Fetch non-shift types for CP type
  const { data: nonShiftTypes = [] } = useQuery({
    queryKey: ['nonShiftTypes'],
    queryFn: () => base44.entities.NonShiftType.filter({ is_active: true })
  });
  const cpNonShiftType = nonShiftTypes.find(t => t.key === 'conges_payes' || t.code === 'CP');

  // ─── DELETE MUTATION ───────────────────────────────────────────────────────
  const deleteCPMutation = useMutation({
    mutationFn: async () => {
      // Delete the PaidLeavePeriod record
      await base44.entities.PaidLeavePeriod.delete(cpPeriod.id);

      // Restore: delete CP non-shifts that were created for this period
      const oldStartCP = cpPeriod.start_cp;
      const oldEndCP = cpPeriod.end_cp;

      if (oldStartCP && oldEndCP && cpNonShiftType) {
        const existingNonShifts = await base44.entities.NonShiftEvent.filter({
          employee_id: cpPeriod.employee_id,
          non_shift_type_id: cpNonShiftType.id,
          month_key: cpPeriod.month_key,
          reset_version: cpPeriod.reset_version
        });
        const toDelete = existingNonShifts.filter(ns => ns.date >= oldStartCP && ns.date <= oldEndCP);
        await Promise.allSettled(toDelete.map(ns => base44.entities.NonShiftEvent.delete(ns.id)));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paidLeavePeriods'] });
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.invalidateQueries({ queryKey: ['nonShiftEvents'] });
      toast.success('Période de congés payés supprimée');
      onClose();
    },
    onError: (error) => {
      toast.error('Erreur : ' + error.message);
    }
  });

  // ─── EDIT MUTATION ────────────────────────────────────────────────────────
  const editCPMutation = useMutation({
    mutationFn: async () => {
      if (!cpData || !cpNonShiftType) throw new Error('Données invalides');

      const monthKey = cpPeriod.month_key;
      const resetVersion = cpPeriod.reset_version;
      const employeeId = cpPeriod.employee_id;
      const employeeName = cpPeriod.employee_name;

      const newStartCP = cpData.startCP;
      const newEndCP = cpData.endCP;
      const oldStartCP = cpPeriod.start_cp;
      const oldEndCP = cpPeriod.end_cp;

      // Step 1: Update PaidLeavePeriod record
      await base44.entities.PaidLeavePeriod.update(cpPeriod.id, {
        cp_start_date: cpStartDate,
        return_date: returnDate,
        start_cp: newStartCP,
        end_cp: newEndCP,
        cp_days_auto: cpData.countedDays,
        cp_days_manual: manualOverride ? parseFloat(manualOverride) : null,
      });

      // Step 2: Delete OLD CP non-shifts
      const allOldNonShifts = await base44.entities.NonShiftEvent.filter({
        employee_id: employeeId,
        non_shift_type_id: cpNonShiftType.id,
        month_key: monthKey,
        reset_version: resetVersion
      });
      const oldCPNonShifts = allOldNonShifts.filter(ns => ns.date >= oldStartCP && ns.date <= oldEndCP);
      await Promise.allSettled(oldCPNonShifts.map(ns => base44.entities.NonShiftEvent.delete(ns.id)));

      // Step 3: Fetch all shifts for employee in the new period
      const allShifts = await base44.entities.Shift.filter({
        employee_id: employeeId,
        reset_version: resetVersion
      });
      const shiftsInNewPeriod = allShifts.filter(s => s.date >= newStartCP && s.date <= newEndCP);
      const impactedDays = [...new Set(shiftsInNewPeriod.map(s => s.date))].sort();

      // Step 4: Delete shifts in new period
      if (shiftsInNewPeriod.length > 0) {
        await Promise.allSettled(shiftsInNewPeriod.map(s => base44.entities.Shift.delete(s.id)));
      }

      // Step 5: Create new CP non-shifts on impacted days
      if (impactedDays.length > 0) {
        await Promise.allSettled(
          impactedDays.map(date =>
            base44.entities.NonShiftEvent.create({
              employee_id: employeeId,
              employee_name: employeeName,
              date,
              non_shift_type_id: cpNonShiftType.id,
              non_shift_type_label: cpNonShiftType.label,
              notes: `CP (période du ${newStartCP} au ${newEndCP})`,
              month_key: monthKey,
              reset_version: resetVersion
            })
          )
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paidLeavePeriods'] });
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.invalidateQueries({ queryKey: ['nonShiftEvents'] });
      toast.success('Période CP modifiée avec succès');
      onClose();
    },
    onError: (error) => {
      toast.error('Erreur : ' + error.message);
    }
  });

  const cpDays = cpPeriod.cp_days_manual || cpPeriod.cp_days_auto || 0;
  const isPending = deleteCPMutation.isPending || editCPMutation.isPending;

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex border border-gray-200 rounded-lg overflow-hidden">
        <button
          onClick={() => setActiveTab('edit')}
          className={`flex-1 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
            activeTab === 'edit'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Pencil className="w-4 h-4" />
          Modifier
        </button>
        <button
          onClick={() => setActiveTab('delete')}
          className={`flex-1 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
            activeTab === 'delete'
              ? 'bg-red-600 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Trash2 className="w-4 h-4" />
          Supprimer
        </button>
      </div>

      {/* Employee info */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
        <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Employé</div>
        <div className="text-sm font-semibold text-gray-900">
          {employee?.first_name} {employee?.last_name}
        </div>
      </div>

      {/* ── EDIT TAB ── */}
      {activeTab === 'edit' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-semibold text-gray-900">Départ en CP *</Label>
              <Input
                type="date"
                value={cpStartDate}
                onChange={(e) => setCpStartDate(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">Premier jour en congés (inclus)</p>
            </div>
            <div>
              <Label className="text-sm font-semibold text-gray-900">Jour de reprise *</Label>
              <Input
                type="date"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">Premier jour travaillé après CP</p>
            </div>
          </div>

          {cpStartDate && returnDate && cpStartDate >= returnDate && (
            <div className="bg-red-50 border border-red-300 rounded-lg p-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-900">Le jour de reprise doit être postérieur au départ en CP.</p>
            </div>
          )}

          {isEditValid && cpData && (
            <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4 space-y-3">
              <h3 className="font-bold text-green-900 flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4" />
                Période CP recalculée
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Début CP</p>
                  <p className="font-bold text-green-700">{moment(cpData.startCP).format('DD/MM/YYYY')}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Fin CP</p>
                  <p className="font-bold text-green-700">{moment(cpData.endCP).format('DD/MM/YYYY')}</p>
                </div>
              </div>
              <div className="bg-white border border-green-200 rounded p-3 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Jours calendaires :</span>
                  <span className="font-semibold">{cpData.totalDays}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Dim. + fériés exclus :</span>
                  <span className="font-semibold text-red-600">- {cpData.excludedDays}</span>
                </div>
                <div className="flex justify-between border-t border-green-200 pt-2">
                  <span className="text-sm font-bold text-gray-900">CP décomptés :</span>
                  <span className="text-xl font-bold text-green-700">{cpData.countedDays} j</span>
                </div>
              </div>
            </div>
          )}

          {isEditValid && (
            <div className="border border-orange-200 rounded-lg p-3 bg-orange-50">
              <Label className="text-sm font-semibold text-gray-900">Surcharge manuelle (optionnel)</Label>
              <Input
                type="number"
                step="0.5"
                placeholder={`Auto: ${cpData?.countedDays || 0} jours`}
                value={manualOverride}
                onChange={(e) => setManualOverride(e.target.value)}
                className="mt-1"
              />
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button onClick={onClose} variant="outline" className="flex-1" disabled={isPending}>
              Annuler
            </Button>
            <Button
              onClick={() => editCPMutation.mutate()}
              disabled={!isEditValid || isPending}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Check className="w-4 h-4 mr-2" />
              {editCPMutation.isPending ? 'Modification...' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      )}

      {/* ── DELETE TAB ── */}
      {activeTab === 'delete' && (
        <div className="space-y-4">
          <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900 text-sm">Supprimer cette période de congés payés ?</p>
              <p className="text-xs text-red-700 mt-1">Cette action est irréversible.</p>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Début</div>
                <div className="text-sm font-semibold text-gray-900">{moment(cpPeriod.start_cp).format('DD/MM/YYYY')}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Fin</div>
                <div className="text-sm font-semibold text-gray-900">{moment(cpPeriod.end_cp).format('DD/MM/YYYY')}</div>
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Durée</div>
              <div className="text-lg font-bold text-green-600">
                🟢 {cpDays} jour{cpDays > 1 ? 's' : ''} ouvré{cpDays > 1 ? 's' : ''}
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button onClick={onClose} variant="outline" className="flex-1" disabled={isPending}>
              Annuler
            </Button>
            <Button
              onClick={() => deleteCPMutation.mutate()}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              disabled={isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {deleteCPMutation.isPending ? 'Suppression...' : 'Supprimer'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}