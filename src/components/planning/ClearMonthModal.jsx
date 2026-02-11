import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ClearMonthModal({ isOpen, onClose, year, month }) {
  const [confirmed, setConfirmed] = useState(false);
  const [resetting, setResetting] = useState(false);
  const queryClient = useQueryClient();

  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

  const resetMutation = useMutation({
    mutationFn: async () => {
      const user = await base44.auth.me();
      const stats = { deleted: {} };

      console.log(`🧨 [RESET TOTAL] Début du reset pour ${monthKey}`);

      // 1) Supprimer tous les shifts du mois
      const shiftsToDelete = await base44.entities.Shift.filter({ month_key: monthKey });
      for (const shift of shiftsToDelete) {
        await base44.entities.Shift.delete(shift.id);
      }
      stats.deleted.shifts = shiftsToDelete.length;
      console.log(`✓ Supprimé ${shiftsToDelete.length} shifts`);

      // 2) Supprimer tous les non-shifts du mois
      const nonShiftsToDelete = await base44.entities.NonShiftEvent.filter({ month_key: monthKey });
      for (const ns of nonShiftsToDelete) {
        await base44.entities.NonShiftEvent.delete(ns.id);
      }
      stats.deleted.nonShifts = nonShiftsToDelete.length;
      console.log(`✓ Supprimé ${nonShiftsToDelete.length} non-shifts`);

      // 3) Supprimer toutes les périodes de CP qui commencent dans ce mois
      const cpToDelete = await base44.entities.PaidLeavePeriod.filter({ month_key: monthKey });
      for (const cp of cpToDelete) {
        await base44.entities.PaidLeavePeriod.delete(cp.id);
      }
      stats.deleted.cpPeriods = cpToDelete.length;
      console.log(`✓ Supprimé ${cpToDelete.length} périodes CP`);

      // 4) Supprimer tous les récaps hebdomadaires
      const weeklyRecaps = await base44.entities.WeeklyRecap.filter({ month_key: monthKey });
      for (const recap of weeklyRecaps) {
        await base44.entities.WeeklyRecap.delete(recap.id);
      }
      stats.deleted.weeklyRecaps = weeklyRecaps.length;
      console.log(`✓ Supprimé ${weeklyRecaps.length} récaps hebdo`);

      // 5) Supprimer tous les récaps mensuels
      const monthlyRecaps = await base44.entities.MonthlyRecap.filter({ 
        year, 
        month: month + 1 
      });
      for (const recap of monthlyRecaps) {
        await base44.entities.MonthlyRecap.delete(recap.id);
      }
      stats.deleted.monthlyRecaps = monthlyRecaps.length;
      console.log(`✓ Supprimé ${monthlyRecaps.length} récaps mensuels`);

      // 6) Supprimer tous les overrides d'export compta
      const exportOverrides = await base44.entities.ExportComptaOverride.filter({ 
        month_key: monthKey 
      });
      for (const override of exportOverrides) {
        await base44.entities.ExportComptaOverride.delete(override.id);
      }
      stats.deleted.exportOverrides = exportOverrides.length;
      console.log(`✓ Supprimé ${exportOverrides.length} overrides export`);

      // 7) Nettoyer/créer le PlanningMonth
      let planningMonths = await base44.entities.PlanningMonth.filter({ 
        year, 
        month 
      });

      let planningMonth = planningMonths[0];

      if (planningMonth) {
        // Incrémenter la version ET marquer le reset
        const newVersion = (planningMonth.reset_version || 0) + 1;
        
        await base44.entities.PlanningMonth.update(planningMonth.id, {
          reset_version: newVersion,
          reset_at: new Date().toISOString(),
          reset_by: user.email,
          reset_by_name: user.full_name
        });

        stats.version = newVersion;
      } else {
        // Créer un nouveau mois propre
        const newMonth = await base44.entities.PlanningMonth.create({
          year,
          month,
          month_key: monthKey,
          reset_version: 1,
          reset_at: new Date().toISOString(),
          reset_by: user.email,
          reset_by_name: user.full_name
        });

        stats.version = 1;
      }

      console.log(`✅ [RESET TOTAL] Terminé:`, stats);
      return stats;
    },
    onSuccess: (stats) => {
      const { deleted, version } = stats;
      const total = Object.values(deleted).reduce((acc, val) => acc + val, 0);
      
      console.log(`✅ [RESET TOTAL] ${monthKey} réinitialisé - ${total} lignes supprimées`);
      
      // Invalidate all planning queries
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.invalidateQueries({ queryKey: ['nonShiftEvents'] });
      queryClient.invalidateQueries({ queryKey: ['paidLeavePeriods'] });
      queryClient.invalidateQueries({ queryKey: ['weeklyRecaps'] });
      queryClient.invalidateQueries({ queryKey: ['allMonthlyRecaps'] });
      queryClient.invalidateQueries({ queryKey: ['exportOverrides'] });
      queryClient.invalidateQueries({ queryKey: ['planningMonth'] });

      setResetting(false);
      toast.success(`✓ Mois ${monthKey} réinitialisé - ${total} éléments supprimés`, {
        duration: 4000
      });
      onClose();
    },
    onError: (error) => {
      console.error('❌ [HARD RESET] Erreur:', error);
      setResetting(false);
      toast.error(`Erreur lors de la réinitialisation: ${error.message}`);
    }
  });

  const handleReset = async () => {
    if (!confirmed) {
      toast.error('Veuillez confirmer la réinitialisation');
      return;
    }

    setResetting(true);
    resetMutation.mutate();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Trash2 className="w-5 h-5" />
            Réinitialiser le mois {monthKey}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Warning Banner */}
          <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-bold text-red-900 text-base mb-2">
                  🧨 Réinitialisation complète
                </h3>
                <p className="text-red-800 text-sm leading-relaxed">
                  <strong>Cette action est IRRÉVERSIBLE.</strong>
                  <br />
                  Toutes les données du mois seront SUPPRIMÉES définitivement :
                  shifts, absences, CP, récaps hebdo/mensuels, et overrides d'export compta.
                  Vous repartirez sur un mois complètement vierge.
                </p>
              </div>
            </div>
          </div>

          {/* Explanation */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
            <p className="font-semibold mb-2">📋 Éléments supprimés :</p>
            <ul className="list-disc list-inside space-y-1 text-blue-800">
              <li>Tous les shifts et absences</li>
              <li>Toutes les périodes de CP</li>
              <li>Tous les récaps hebdomadaires et mensuels</li>
              <li>Tous les overrides d'export compta</li>
              <li>Le mois sera comme neuf - prêt à être replanifié</li>
            </ul>
          </div>

          {/* Confirmation */}
          <div className="flex items-center gap-3 p-4 border-2 border-gray-300 rounded-lg bg-gray-50">
            <Checkbox
              id="confirm"
              checked={confirmed}
              onCheckedChange={setConfirmed}
              disabled={resetting}
            />
            <label
              htmlFor="confirm"
              className="text-sm font-medium text-gray-900 cursor-pointer select-none"
            >
              Je confirme vouloir SUPPRIMER DÉFINITIVEMENT toutes les données de ce mois
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={resetting}
          >
            Annuler
          </Button>
          <Button
            variant="destructive"
            onClick={handleReset}
            disabled={!confirmed || resetting}
          >
            {resetting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Réinitialisation...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                Supprimer et réinitialiser
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}