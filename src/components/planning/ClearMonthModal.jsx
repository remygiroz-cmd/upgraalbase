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

      // Get or create PlanningMonth record
      let planningMonths = await base44.entities.PlanningMonth.filter({ 
        year, 
        month 
      });

      let planningMonth = planningMonths[0];

      if (planningMonth) {
        // Increment reset version
        const newVersion = (planningMonth.reset_version || 0) + 1;
        
        await base44.entities.PlanningMonth.update(planningMonth.id, {
          reset_version: newVersion,
          reset_at: new Date().toISOString(),
          reset_by: user.email,
          reset_by_name: user.full_name
        });

        return { version: newVersion, isNew: false };
      } else {
        // Create new PlanningMonth with version 1
        const newMonth = await base44.entities.PlanningMonth.create({
          year,
          month,
          month_key: monthKey,
          reset_version: 1,
          reset_at: new Date().toISOString(),
          reset_by: user.email,
          reset_by_name: user.full_name
        });

        return { version: 1, isNew: true };
      }
    },
    onSuccess: ({ version, isNew }) => {
      console.log(`✅ [HARD RESET] Mois ${monthKey} réinitialisé instantanément - version ${version}`);
      
      // Invalidate all planning queries to force refetch with new version
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.invalidateQueries({ queryKey: ['nonShiftEvents'] });
      queryClient.invalidateQueries({ queryKey: ['paidLeavePeriods'] });
      queryClient.invalidateQueries({ queryKey: ['weeklyRecaps'] });
      queryClient.invalidateQueries({ queryKey: ['monthlyRecaps'] });
      queryClient.invalidateQueries({ queryKey: ['planningMonth'] });

      setResetting(false);
      toast.success(`✓ Planning réinitialisé instantanément (version ${version})`, {
        duration: 3000
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
                  ⚡ Réinitialisation instantanée
                </h3>
                <p className="text-red-800 text-sm leading-relaxed">
                  <strong>Cette action est immédiate et définitive.</strong>
                  <br />
                  Le mois sera marqué comme "réinitialisé" - toutes les données actuelles 
                  (shifts, absences, CP, récaps, surcharges) deviendront invisibles instantanément.
                </p>
              </div>
            </div>
          </div>

          {/* Explanation */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
            <p className="font-semibold mb-2">💡 Nouveau système de reset ultra-rapide :</p>
            <ul className="list-disc list-inside space-y-1 text-blue-800">
              <li>Pas de suppression manuelle = instantané</li>
              <li>Le mois est versionné - les anciennes données sont archivées automatiquement</li>
              <li>Vous repartez sur un mois complètement vierge</li>
              <li>Les surcharges manuelles sont également réinitialisées</li>
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
              Je confirme vouloir réinitialiser ce mois instantanément
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
                Réinitialiser instantanément
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}