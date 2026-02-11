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
      console.log(`🧨 [RESET FRONTEND] Lancement reset ${monthKey} via backend function`);
      
      // Appeler la fonction backend qui fait le travail lourd
      const response = await base44.functions.invoke('resetMonth', {
        year,
        month,
        monthKey
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Erreur lors du reset');
      }

      console.log(`✅ [RESET FRONTEND] Terminé:`, response.data.stats);
      return response.data;
    },
    onSuccess: (data) => {
      const { stats, totalDeleted } = data;
      
      console.log(`✅ [RESET FRONTEND] ${monthKey} réinitialisé en ${stats.duration}ms`);
      
      // Invalidate all planning queries
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.invalidateQueries({ queryKey: ['nonShiftEvents'] });
      queryClient.invalidateQueries({ queryKey: ['paidLeavePeriods'] });
      queryClient.invalidateQueries({ queryKey: ['weeklyRecaps'] });
      queryClient.invalidateQueries({ queryKey: ['allMonthlyRecaps'] });
      queryClient.invalidateQueries({ queryKey: ['exportOverrides'] });
      queryClient.invalidateQueries({ queryKey: ['planningMonth'] });

      setResetting(false);
      
      // Toast avec détails
      toast.success(
        <div className="text-sm">
          <div className="font-bold mb-1">✓ Mois {monthKey} réinitialisé</div>
          <div className="text-xs space-y-0.5 text-gray-600">
            <div>• {stats.deleted.shifts} shifts supprimés</div>
            <div>• {stats.deleted.nonShifts} absences supprimées</div>
            <div>• {stats.deleted.cpPeriods} périodes CP supprimées</div>
            <div>• {stats.deleted.monthlyRecaps} récaps mensuels supprimés</div>
            <div>• {stats.deleted.exportOverrides} overrides export supprimés</div>
            <div className="text-blue-600 font-medium pt-1">
              Total: {totalDeleted} éléments en {stats.duration}ms
            </div>
          </div>
        </div>,
        { duration: 6000 }
      );
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