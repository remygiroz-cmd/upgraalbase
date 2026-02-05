import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Trash2, Loader2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export default function ClearMonthModal({ open, onOpenChange, monthStart, monthEnd, onSuccess }) {
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [clearing, setClearing] = useState(false);

  const year = monthStart.getFullYear();
  const month = monthStart.getMonth() + 1;
  const monthName = MONTHS[monthStart.getMonth()];

  // Fetch ALL planning data for the month
  const { data: existingShifts = [] } = useQuery({
    queryKey: ['shifts', year, month],
    queryFn: async () => {
      const allShifts = await base44.entities.Shift.list();
      const firstDay = formatDate(monthStart);
      const lastDay = formatDate(monthEnd);
      return allShifts.filter(s => s.date >= firstDay && s.date <= lastDay);
    },
    enabled: open
  });

  const { data: nonShiftEvents = [] } = useQuery({
    queryKey: ['nonShiftEvents', year, month],
    queryFn: async () => {
      const allEvents = await base44.entities.NonShiftEvent.list();
      const firstDay = formatDate(monthStart);
      const lastDay = formatDate(monthEnd);
      return allEvents.filter(e => e.date >= firstDay && e.date <= lastDay);
    },
    enabled: open
  });

  const { data: paidLeavePeriods = [] } = useQuery({
    queryKey: ['paidLeavePeriods', year, month],
    queryFn: async () => {
      const allPeriods = await base44.entities.PaidLeavePeriod.list();
      const firstDay = formatDate(monthStart);
      const lastDay = formatDate(monthEnd);
      
      console.log('📊 [CLEAR MONTH] All CP periods in DB:', allPeriods.length);
      console.log('📊 [CLEAR MONTH] Month range:', { firstDay, lastDay });
      
      // Include ALL periods that touch the month in ANY way
      const filtered = allPeriods.filter(p => {
        // Handle missing dates
        if (!p.start_cp && !p.end_cp) return false;
        
        // If only one date is present, check if it falls in the month
        if (!p.end_cp) return p.start_cp >= firstDay && p.start_cp <= lastDay;
        if (!p.start_cp) return p.end_cp >= firstDay && p.end_cp <= lastDay;
        
        // Period overlaps if: start_cp <= lastDay AND end_cp >= firstDay
        const overlaps = p.start_cp <= lastDay && p.end_cp >= firstDay;
        
        if (overlaps) {
          console.log('📊 [CLEAR MONTH] CP period overlaps:', {
            id: p.id,
            employee_id: p.employee_id,
            start_cp: p.start_cp,
            end_cp: p.end_cp
          });
        }
        
        return overlaps;
      });
      
      console.log('📊 [CLEAR MONTH] CP periods found for month:', filtered.length, filtered);
      return filtered;
    },
    enabled: open
  });

  const { data: monthlyRecaps = [] } = useQuery({
    queryKey: ['monthlyRecaps', year, month],
    queryFn: async () => {
      return await base44.entities.MonthlyRecap.filter({ year, month });
    },
    enabled: open
  });

  const totalItems = existingShifts.length + nonShiftEvents.length + paidLeavePeriods.length + monthlyRecaps.length;

  const handleClear = async () => {
    if (totalItems === 0) {
      toast.success('Le planning de ce mois est déjà vierge');
      onOpenChange(false);
      return;
    }

    setClearing(true);

    try {
      console.log('🔄 [RESET PLANNING] Début réinitialisation', { year, month, monthName });
      console.log('🔄 [RESET PLANNING] Shifts:', existingShifts.length);
      console.log('🔄 [RESET PLANNING] NonShifts:', nonShiftEvents.length);
      console.log('🔄 [RESET PLANNING] CP Periods:', paidLeavePeriods.length);
      console.log('🔄 [RESET PLANNING] Recaps:', monthlyRecaps.length);

      let deletedShifts = 0;
      let deletedEvents = 0;
      let deletedCP = 0;
      let deletedRecaps = 0;
      const deletionErrors = [];

      // Delete all shifts
      for (const shift of existingShifts) {
        try {
          await base44.entities.Shift.delete(shift.id);
          deletedShifts++;
        } catch (err) {
          deletionErrors.push(`Shift ${shift.id}: ${err.message}`);
          console.error('Error deleting shift:', shift.id, err);
        }
      }

      // Delete all non-shift events
      for (const event of nonShiftEvents) {
        try {
          await base44.entities.NonShiftEvent.delete(event.id);
          deletedEvents++;
        } catch (err) {
          deletionErrors.push(`NonShift ${event.id}: ${err.message}`);
          console.error('Error deleting non-shift:', event.id, err);
        }
      }

      // Delete all paid leave periods (CRITICAL)
      console.log('🔄 [RESET PLANNING] Deleting CP periods:', paidLeavePeriods.length);
      for (const period of paidLeavePeriods) {
        try {
          console.log('🔄 [RESET PLANNING] Deleting CP period:', period.id, {
            employee_id: period.employee_id,
            start_cp: period.start_cp,
            end_cp: period.end_cp
          });
          await base44.entities.PaidLeavePeriod.delete(period.id);
          deletedCP++;
          console.log('✅ [RESET PLANNING] CP period deleted:', period.id);
        } catch (err) {
          deletionErrors.push(`CP Period ${period.id}: ${err.message}`);
          console.error('❌ Error deleting CP period:', period.id, err);
        }
      }
      console.log('✅ [RESET PLANNING] CP periods deleted:', deletedCP, '/', paidLeavePeriods.length);

      // Delete monthly recaps
      for (const recap of monthlyRecaps) {
        try {
          await base44.entities.MonthlyRecap.delete(recap.id);
          deletedRecaps++;
        } catch (err) {
          deletionErrors.push(`Recap ${recap.id}: ${err.message}`);
          console.error('Error deleting recap:', recap.id, err);
        }
      }

      const totalDeleted = deletedShifts + deletedEvents + deletedCP + deletedRecaps;

      console.log('✅ [RESET PLANNING] Réinitialisation terminée', {
        deletedShifts,
        deletedEvents,
        deletedCP,
        deletedRecaps,
        totalDeleted,
        errors: deletionErrors.length
      });

      // Vérification de cohérence stricte
      if (totalDeleted === 0 && totalItems > 0) {
        throw new Error('ERREUR: Aucun élément supprimé alors que des données existaient');
      }

      if (deletedCP < paidLeavePeriods.length) {
        console.warn('⚠️ WARNING: Certaines périodes CP n\'ont pas été supprimées', {
          expected: paidLeavePeriods.length,
          deleted: deletedCP
        });
      }

      if (deletionErrors.length > 0) {
        console.error('❌ [RESET PLANNING] Erreurs de suppression:', deletionErrors);
        throw new Error(`Certains éléments n'ont pas pu être supprimés: ${deletionErrors.join(', ')}`);
      }

      setClearing(false);
      toast.success(`✓ Planning de ${monthName} ${year} réinitialisé`);
      onSuccess?.();
      onOpenChange(false);
      setConfirmChecked(false);

    } catch (error) {
      setClearing(false);
      console.error('❌ [RESET PLANNING ERROR]:', error);
      toast.error('Erreur lors de la réinitialisation: ' + error.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      onOpenChange(open);
      if (!open) setConfirmChecked(false);
    }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-red-600 flex items-center gap-2">
            <AlertTriangle className="w-6 h-6" />
            Réinitialiser le planning de {monthName} {year}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Warning */}
          <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-7 h-7 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold text-red-900 mb-2 text-base">⚠️ Action irréversible</p>
                <p className="text-sm text-red-800 mb-4 leading-relaxed">
                  Cette action remettra le planning dans son <strong>état initial</strong>, comme un <strong>mois vierge</strong>. Toutes les données du planning pour <strong>{monthName} {year}</strong> seront définitivement supprimées.
                </p>
                <div className="bg-white border-2 border-red-300 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-700 font-medium">Shifts (travail) :</span>
                    <span className="font-bold text-red-900">{existingShifts.length}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-700 font-medium">Absences / Repos :</span>
                    <span className="font-bold text-red-900">{nonShiftEvents.length}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-700 font-medium">Périodes CP :</span>
                    <span className="font-bold text-red-900">{paidLeavePeriods.length}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-700 font-medium">Récaps mensuels :</span>
                    <span className="font-bold text-red-900">{monthlyRecaps.length}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm mt-3 pt-3 border-t-2 border-red-300">
                    <span className="font-bold text-gray-900 text-base">TOTAL :</span>
                    <span className="font-bold text-red-900 text-xl">{totalItems}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {totalItems === 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-blue-600" />
              <p className="text-sm text-blue-800 font-medium">
                Aucune donnée à supprimer pour ce mois
              </p>
            </div>
          )}

          {/* Confirmation checkbox */}
          {totalItems > 0 && (
            <div className="bg-gray-50 border-2 border-gray-300 rounded-lg p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmChecked}
                  onChange={(e) => setConfirmChecked(e.target.checked)}
                  disabled={clearing}
                  className="w-5 h-5 rounded border-gray-400 mt-0.5"
                />
                <span className="text-sm font-semibold text-gray-900 leading-relaxed">
                  Je confirme la réinitialisation complète du mois
                </span>
              </label>
            </div>
          )}

          {/* Progress */}
          {clearing && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-red-600" />
                <span className="text-sm font-medium text-gray-900">
                  Suppression en cours...
                </span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t-2 border-gray-200">
            <Button
              onClick={() => {
                onOpenChange(false);
                setConfirmChecked(false);
              }}
              variant="outline"
              disabled={clearing}
              className="flex-1 border-gray-400"
            >
              Annuler
            </Button>
            <Button
              onClick={handleClear}
              disabled={!confirmChecked || clearing || totalItems === 0}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50"
            >
              {clearing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Réinitialisation en cours...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Réinitialiser le mois
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}