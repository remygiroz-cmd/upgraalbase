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
  const [resetStats, setResetStats] = useState(null);
  const queryClient = useQueryClient();

  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

  const resetMutation = useMutation({
    mutationFn: async () => {
      console.log(`🧨 [RESET UI] Soft reset immédiat ${monthKey}`);
      
      // PHASE A: Invalider immédiatement le cache pour masquer les données
      queryClient.setQueryData(['planningMonth', year, month], (old) => ({
        ...old,
        reset_in_progress: true,
        reset_version: (old?.reset_version || 0) + 1
      }));
      
      // Masquer visuellement toutes les données
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.invalidateQueries({ queryKey: ['nonShiftEvents'] });
      queryClient.invalidateQueries({ queryKey: ['paidLeavePeriods'] });
      queryClient.invalidateQueries({ queryKey: ['exportOverrides'] });
      
      console.log(`  ✓ UI masquée instantanément`);
      
      // PHASE B: Lancer la purge backend
      const response = await base44.functions.invoke('resetMonth', {
        year,
        month,
        monthKey
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Erreur lors du reset');
      }

      console.log(`✅ [RESET UI] Backend terminé:`, response.data.stats);
      return response.data;
    },
    onSuccess: (data) => {
      const { stats, totalDeleted } = data;
      
      console.log(`✅ [RESET COMPLET] ${monthKey} en ${stats.duration}ms - ${totalDeleted} éléments`);
      
      setResetStats(stats);
      
      // PHASE C: Invalider TOUT le cache pour refetch propre
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.invalidateQueries({ queryKey: ['nonShiftEvents'] });
      queryClient.invalidateQueries({ queryKey: ['paidLeavePeriods'] });
      queryClient.invalidateQueries({ queryKey: ['weeklyRecaps'] });
      queryClient.invalidateQueries({ queryKey: ['allMonthlyRecaps'] });
      queryClient.invalidateQueries({ queryKey: ['exportOverrides'] });
      queryClient.invalidateQueries({ queryKey: ['planningMonth'] });
      
      // Clear aussi les queries spécifiques au mois
      queryClient.removeQueries({ queryKey: ['shifts', monthKey] });
      queryClient.removeQueries({ queryKey: ['nonShiftEvents', monthKey] });
      queryClient.removeQueries({ queryKey: ['exportOverrides', monthKey] });

      setResetting(false);
      
      // Toast succinct
      toast.success(`✓ Reset ${monthKey} terminé en ${(stats.duration / 1000).toFixed(1)}s`, {
        duration: 3000
      });
    },
    onError: (error) => {
      console.error('❌ [RESET] Erreur:', error);
      setResetting(false);
      setResetStats(null);
      
      // Unlock UI
      queryClient.invalidateQueries({ queryKey: ['planningMonth'] });
      
      toast.error(`Erreur: ${error.message}`);
    }
  });

  const handleReset = async () => {
    if (!confirmed) {
      toast.error('Veuillez confirmer la réinitialisation');
      return;
    }

    setResetting(true);
    setResetStats(null);
    resetMutation.mutate();
  };

  const handleClose = () => {
    setConfirmed(false);
    setResetStats(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Trash2 className="w-5 h-5" />
            Réinitialiser le mois {monthKey}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Résumé du reset si disponible */}
          {resetStats && (
            <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="text-green-600 text-2xl">✓</div>
                <div className="flex-1">
                  <h3 className="font-bold text-green-900 text-base mb-2">
                    Reset terminé en {(resetStats.duration / 1000).toFixed(1)}s
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-sm text-green-800">
                    <div>• Shifts: {resetStats.deleted.shifts}</div>
                    <div>• Absences: {resetStats.deleted.nonShifts}</div>
                    <div>• CP: {resetStats.deleted.cpPeriods}</div>
                    <div>• Récaps hebdo: {resetStats.deleted.weeklyRecaps}</div>
                    <div>• Récaps mensuels: {resetStats.deleted.monthlyRecaps}</div>
                    <div>• Overrides export: {resetStats.deleted.exportOverrides}</div>
                  </div>
                  {Object.values(resetStats.verified).some(v => v > 0) && (
                    <div className="mt-2 text-xs text-orange-700">
                      ⚠️ Retry effectué sur {Object.values(resetStats.verified).reduce((a,b) => a+b, 0)} éléments
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
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
            onClick={handleClose}
            disabled={resetting}
          >
            {resetStats ? 'Fermer' : 'Annuler'}
          </Button>
          {!resetStats && (
            <Button
              variant="destructive"
              onClick={handleReset}
              disabled={!confirmed || resetting}
            >
              {resetting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Reset en cours...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Supprimer et réinitialiser
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}