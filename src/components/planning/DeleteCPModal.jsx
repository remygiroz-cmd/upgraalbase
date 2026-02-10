import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';

export default function DeleteCPModal({ cpPeriod, employee, onClose }) {
  const queryClient = useQueryClient();

  const deleteCPMutation = useMutation({
    mutationFn: async () => {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('🗑️ SUPPRESSION PÉRIODE CP AVEC ROLLBACK - DÉBUT');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('CP Period ID:', cpPeriod.id);
      console.log('Employé ID:', cpPeriod.employee_id);
      console.log('Période:', cpPeriod.start_cp, '→', cpPeriod.end_cp);

      // Step 1: Delete CP non-shifts created by this period
      console.log('\n🔍 Step 1: Finding CP non-shifts to delete...');
      const cpNonShifts = await base44.entities.NonShiftEvent.filter({
        employee_id: cpPeriod.employee_id,
        month_key: cpPeriod.month_key,
        reset_version: cpPeriod.reset_version
      });
      
      // Filter non-shifts in CP date range
      const cpNonShiftsInPeriod = cpNonShifts.filter(ns => 
        ns.date >= cpPeriod.start_cp && ns.date <= cpPeriod.end_cp
      );
      console.log(`Found ${cpNonShiftsInPeriod.length} CP non-shifts to delete`);

      if (cpNonShiftsInPeriod.length > 0) {
        console.log('Deleting CP non-shifts...', cpNonShiftsInPeriod.map(ns => ns.date));
        const deleteNSResults = await Promise.allSettled(
          cpNonShiftsInPeriod.map(ns => base44.entities.NonShiftEvent.delete(ns.id))
        );
        
        const deletedNS = deleteNSResults.filter(r => r.status === 'fulfilled').length;
        const failedNS = deleteNSResults.filter(r => r.status === 'rejected');
        
        if (failedNS.length > 0) {
          console.error(`❌ Failed to delete ${failedNS.length} non-shifts:`, failedNS.map(f => f.reason));
        }
        console.log(`✓ Deleted ${deletedNS} CP non-shifts`);
      }

      // Step 2: Restore cancelled shifts
      console.log('\n🔄 Step 2: Restoring cancelled shifts...');
      const allShifts = await base44.entities.Shift.filter({
        employee_id: cpPeriod.employee_id,
        reset_version: cpPeriod.reset_version
      });
      
      const shiftsToRestore = allShifts.filter(shift => 
        shift.cp_period_id === cpPeriod.id && shift.is_cancelled === true
      );
      
      console.log(`Found ${shiftsToRestore.length} shifts to restore`);
      console.log('Shift IDs to restore:', shiftsToRestore.map(s => ({ id: s.id, date: s.date })));

      let restoredCount = 0;
      if (shiftsToRestore.length > 0) {
        const restoreResults = await Promise.allSettled(
          shiftsToRestore.map(shift => {
            console.log(`  → Restoring shift ID ${shift.id} (${shift.date})...`);
            return base44.entities.Shift.update(shift.id, {
              is_cancelled: false,
              cancel_reason: null,
              cp_period_id: null,
              cancelled_at: null
            });
          })
        );
        
        restoredCount = restoreResults.filter(r => r.status === 'fulfilled').length;
        const failedRestore = restoreResults.filter(r => r.status === 'rejected');
        
        if (failedRestore.length > 0) {
          console.error(`❌ Failed to restore ${failedRestore.length} shifts:`, failedRestore.map(f => f.reason));
        }
        console.log(`✓ Restored ${restoredCount} shifts`);
      }

      // Step 3: Delete the CP period
      console.log('\n🗑️ Step 3: Deleting CP period record...');
      await base44.entities.PaidLeavePeriod.delete(cpPeriod.id);
      console.log('✓ CP period deleted');

      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('✅ SUPPRESSION CP AVEC ROLLBACK - TERMINÉ');
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`📋 Non-shifts CP supprimés: ${cpNonShiftsInPeriod.length}`);
      console.log(`🔄 Shifts restaurés: ${restoredCount}`);
      console.log('═══════════════════════════════════════════════════════════\n');

      return {
        deletedNonShifts: cpNonShiftsInPeriod.length,
        restoredShifts: restoredCount
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['paidLeavePeriods'] });
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.invalidateQueries({ queryKey: ['nonShiftEvents'] });
      
      toast.success(
        'Période CP supprimée',
        { 
          description: `${result.restoredShifts} shift(s) restauré(s), ${result.deletedNonShifts} CP retiré(s)` 
        }
      );
      onClose();
    },
    onError: (error) => {
      console.error('Error during CP deletion with rollback:', error);
      toast.error('Erreur : ' + error.message);
    }
  });

  const handleDelete = () => {
    if (window.confirm('Voulez-vous vraiment supprimer cette période de congés payés ?')) {
      deleteCPMutation.mutate();
    }
  };

  const cpDays = cpPeriod.cp_days_manual || cpPeriod.cp_days_auto || 0;

  return (
    <div className="space-y-4">
      <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 flex items-start gap-3">
        <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
        <div>
          <p className="font-semibold text-red-900 text-sm">
            Supprimer cette période de congés payés ?
          </p>
          <p className="text-xs text-red-700 mt-1">
            Les CP seront supprimés et les shifts remplacés seront restaurés automatiquement.
          </p>
        </div>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
        <div>
          <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
            Employé
          </div>
          <div className="text-sm font-semibold text-gray-900">
            {employee?.first_name} {employee?.last_name}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
              Début
            </div>
            <div className="text-sm font-semibold text-gray-900">
              {moment(cpPeriod.start_cp).format('DD/MM/YYYY')}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
              Fin
            </div>
            <div className="text-sm font-semibold text-gray-900">
              {moment(cpPeriod.end_cp).format('DD/MM/YYYY')}
            </div>
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
            Durée
          </div>
          <div className="text-lg font-bold text-green-600">
            🟢 {cpDays} jour{cpDays > 1 ? 's' : ''} ouvré{cpDays > 1 ? 's' : ''}
          </div>
        </div>

        {cpPeriod.notes && (
          <div>
            <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
              Notes
            </div>
            <div className="text-sm text-gray-700 bg-white p-2 rounded border border-gray-200">
              {cpPeriod.notes}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <Button
          onClick={onClose}
          variant="outline"
          className="flex-1"
          disabled={deleteCPMutation.isPending}
        >
          Annuler
        </Button>
        <Button
          onClick={handleDelete}
          className="flex-1 bg-red-600 hover:bg-red-700 text-white"
          disabled={deleteCPMutation.isPending}
        >
          <Trash2 className="w-4 h-4 mr-2" />
          {deleteCPMutation.isPending ? 'Suppression...' : 'Supprimer'}
        </Button>
      </div>
    </div>
  );
}