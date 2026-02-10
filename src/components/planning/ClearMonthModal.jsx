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

  // Fetch ALL planning data for the month - with refetch on mount
  const { data: existingShifts = [], isLoading: shiftsLoading, refetch: refetchShifts } = useQuery({
    queryKey: ['clearMonth-shifts', year, month],
    queryFn: async () => {
      console.log('🔍 [CLEAR MONTH] Fetching shifts...');
      const allShifts = await base44.entities.Shift.list();
      const firstDay = formatDate(monthStart);
      const lastDay = formatDate(monthEnd);
      const filtered = allShifts.filter(s => s.date >= firstDay && s.date <= lastDay);
      console.log('✅ [CLEAR MONTH] Shifts found:', filtered.length, '(Total in DB:', allShifts.length, ')');
      return filtered;
    },
    enabled: open,
    staleTime: 0,
    refetchOnMount: 'always'
  });

  const { data: nonShiftEvents = [], isLoading: eventsLoading, refetch: refetchEvents } = useQuery({
    queryKey: ['clearMonth-nonShiftEvents', year, month],
    queryFn: async () => {
      console.log('🔍 [CLEAR MONTH] Fetching non-shift events...');
      const allEvents = await base44.entities.NonShiftEvent.list();
      const firstDay = formatDate(monthStart);
      const lastDay = formatDate(monthEnd);
      const filtered = allEvents.filter(e => e.date >= firstDay && e.date <= lastDay);
      console.log('✅ [CLEAR MONTH] Non-shift events found:', filtered.length, '(Total in DB:', allEvents.length, ')');
      return filtered;
    },
    enabled: open,
    staleTime: 0,
    refetchOnMount: 'always'
  });

  const { data: paidLeavePeriods = [], isLoading: cpLoading, refetch: refetchCP } = useQuery({
    queryKey: ['clearMonth-paidLeavePeriods', year, month],
    queryFn: async () => {
      console.log('🔍 [CLEAR MONTH] Fetching CP periods...');
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
      
      console.log('✅ [CLEAR MONTH] CP periods found for month:', filtered.length, filtered);
      return filtered;
    },
    enabled: open,
    staleTime: 0,
    refetchOnMount: 'always'
  });

  const { data: monthlyRecaps = [], isLoading: recapsLoading, refetch: refetchRecaps } = useQuery({
    queryKey: ['clearMonth-monthlyRecaps', year, month],
    queryFn: async () => {
      console.log('🔍 [CLEAR MONTH] Fetching monthly recaps...');
      const filtered = await base44.entities.MonthlyRecap.filter({ year, month });
      console.log('✅ [CLEAR MONTH] Monthly recaps found:', filtered.length);
      return filtered;
    },
    enabled: open,
    staleTime: 0,
    refetchOnMount: 'always'
  });

  const { data: weeklyRecaps = [], isLoading: weeklyRecapsLoading, refetch: refetchWeeklyRecaps } = useQuery({
    queryKey: ['clearMonth-weeklyRecaps', year, month],
    queryFn: async () => {
      console.log('🔍 [CLEAR MONTH] Fetching weekly recaps...');
      const allRecaps = await base44.entities.WeeklyRecap.list();
      const firstDay = formatDate(monthStart);
      const lastDay = formatDate(monthEnd);
      const filtered = allRecaps.filter(r => r.week_start_date >= firstDay && r.week_start_date <= lastDay);
      console.log('✅ [CLEAR MONTH] Weekly recaps found:', filtered.length);
      return filtered;
    },
    enabled: open,
    staleTime: 0,
    refetchOnMount: 'always'
  });

  const isLoadingData = shiftsLoading || eventsLoading || cpLoading || recapsLoading || weeklyRecapsLoading;

  const totalItems = existingShifts.length + nonShiftEvents.length + paidLeavePeriods.length + monthlyRecaps.length + weeklyRecaps.length;

  const handleClear = async () => {
    console.log('🔄 [RESET PLANNING] handleClear called', { totalItems });

    // Re-fetch data to ensure we have the latest state
    toast.info('Vérification des données en cours...');
    await Promise.all([
      refetchShifts(),
      refetchEvents(),
      refetchCP(),
      refetchRecaps(),
      refetchWeeklyRecaps()
    ]);

    // Wait a bit for state updates
    await new Promise(resolve => setTimeout(resolve, 500));

    if (totalItems === 0) {
      toast.success('Le planning de ce mois est déjà vierge');
      onOpenChange(false);
      return;
    }

    setClearing(true);

    try {
      console.log('🔄 [RESET PLANNING] Début réinitialisation', { year, month, monthName });
      console.log('🔄 [RESET PLANNING] Données à supprimer:', {
        shifts: existingShifts.length,
        nonShifts: nonShiftEvents.length,
        cpPeriods: paidLeavePeriods.length,
        recaps: monthlyRecaps.length,
        total: totalItems
      });

      let deletedShifts = 0;
      let deletedEvents = 0;
      let deletedCP = 0;
      let deletedRecaps = 0;
      let deletedWeeklyRecaps = 0;
      const deletionErrors = [];
      let progress = 0;
      const totalToDelete = existingShifts.length + nonShiftEvents.length + paidLeavePeriods.length + monthlyRecaps.length + weeklyRecaps.length;

      // Delete weekly recaps first
      console.log('🔄 [RESET] Step 1/5: Deleting weekly recaps...');
      for (const recap of weeklyRecaps) {
        try {
          await base44.entities.WeeklyRecap.delete(recap.id);
          deletedWeeklyRecaps++;
          progress++;
          console.log(`Progress: ${progress}/${totalToDelete}`);
        } catch (err) {
          deletionErrors.push(`WeeklyRecap ${recap.id}: ${err.message}`);
          console.error('Error deleting weekly recap:', recap.id, err);
        }
      }

      // Delete monthly recaps
      console.log('🔄 [RESET] Step 2/5: Deleting monthly recaps...');
      for (const recap of monthlyRecaps) {
        try {
          await base44.entities.MonthlyRecap.delete(recap.id);
          deletedRecaps++;
          progress++;
          console.log(`Progress: ${progress}/${totalToDelete}`);
        } catch (err) {
          deletionErrors.push(`Recap ${recap.id}: ${err.message}`);
          console.error('Error deleting recap:', recap.id, err);
        }
      }

      // Delete paid leave periods
      console.log('🔄 [RESET] Step 3/5: Deleting CP periods...');
      for (const period of paidLeavePeriods) {
        try {
          console.log('🔄 [RESET] Deleting CP period:', period.id, {
            employee_id: period.employee_id,
            start_cp: period.start_cp,
            end_cp: period.end_cp
          });
          await base44.entities.PaidLeavePeriod.delete(period.id);
          deletedCP++;
          progress++;
          console.log(`✅ CP deleted: ${period.id}. Progress: ${progress}/${totalToDelete}`);
        } catch (err) {
          deletionErrors.push(`CP Period ${period.id}: ${err.message}`);
          console.error('❌ Error deleting CP period:', period.id, err);
        }
      }

      // Delete non-shift events
      console.log('🔄 [RESET] Step 4/5: Deleting non-shift events...');
      for (const event of nonShiftEvents) {
        try {
          await base44.entities.NonShiftEvent.delete(event.id);
          deletedEvents++;
          progress++;
          console.log(`Progress: ${progress}/${totalToDelete}`);
        } catch (err) {
          deletionErrors.push(`NonShift ${event.id}: ${err.message}`);
          console.error('Error deleting non-shift:', event.id, err);
        }
      }

      // Delete shifts last
      console.log('🔄 [RESET] Step 5/5: Deleting shifts...');
      for (const shift of existingShifts) {
        try {
          await base44.entities.Shift.delete(shift.id);
          deletedShifts++;
          progress++;
          if (progress % 20 === 0) {
            console.log(`Progress: ${progress}/${totalToDelete}`);
          }
        } catch (err) {
          deletionErrors.push(`Shift ${shift.id}: ${err.message}`);
          console.error('Error deleting shift:', shift.id, err);
        }
      }

      const totalDeleted = deletedShifts + deletedEvents + deletedCP + deletedRecaps + deletedWeeklyRecaps;

      console.log('✅ [RESET PLANNING] Réinitialisation terminée', {
        deletedShifts,
        deletedEvents,
        deletedCP,
        deletedRecaps,
        deletedWeeklyRecaps,
        totalDeleted,
        errors: deletionErrors.length
      });

      // Strict consistency checks
      if (totalDeleted === 0 && totalItems > 0) {
        throw new Error('ERREUR CRITIQUE: Aucun élément supprimé alors que des données existaient');
      }

      if (totalDeleted < totalItems) {
        const missing = totalItems - totalDeleted;
        console.warn(`⚠️ WARNING: ${missing} éléments n'ont pas été supprimés`);
      }

      if (deletionErrors.length > 0) {
        console.error('❌ [RESET PLANNING] Erreurs de suppression:', deletionErrors);
        throw new Error(`${deletionErrors.length} éléments n'ont pas pu être supprimés. Détails: ${deletionErrors.slice(0, 3).join(', ')}${deletionErrors.length > 3 ? '...' : ''}`);
      }

      // Verify deletion success
      console.log('🔍 [RESET] Vérification finale...');
      const verifyShifts = await base44.entities.Shift.list();
      const verifyEvents = await base44.entities.NonShiftEvent.list();
      const verifyCP = await base44.entities.PaidLeavePeriod.list();
      const verifyRecaps = await base44.entities.MonthlyRecap.filter({ year, month });

      const firstDay = formatDate(monthStart);
      const lastDay = formatDate(monthEnd);

      const remainingShifts = verifyShifts.filter(s => s.date >= firstDay && s.date <= lastDay).length;
      const remainingEvents = verifyEvents.filter(e => e.date >= firstDay && e.date <= lastDay).length;
      const remainingCP = verifyCP.filter(p => {
        if (!p.start_cp || !p.end_cp) return false;
        return p.start_cp <= lastDay && p.end_cp >= firstDay;
      }).length;
      const remainingRecaps = verifyRecaps.length;

      const remainingTotal = remainingShifts + remainingEvents + remainingCP + remainingRecaps;

      console.log('🔍 [RESET] Vérification:', {
        remainingShifts,
        remainingEvents,
        remainingCP,
        remainingRecaps,
        remainingTotal
      });

      if (remainingTotal > 0) {
        throw new Error(`ERREUR DE VÉRIFICATION: ${remainingTotal} éléments persistent encore dans la base de données`);
      }

      setClearing(false);
      toast.success(`✓ Planning réinitialisé avec succès: ${deletedShifts} shifts, ${deletedEvents} absences/repos, ${deletedCP} CP, ${deletedRecaps} récaps supprimés`, {
        duration: 5000
      });
      onSuccess?.();
      onOpenChange(false);
      setConfirmChecked(false);

    } catch (error) {
      setClearing(false);
      console.error('❌ [RESET PLANNING ERROR]:', error);
      toast.error('Erreur lors de la réinitialisation: ' + error.message, {
        duration: 7000
      });
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
          {/* Loading state */}
          {isLoadingData && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                <p className="text-sm text-blue-800 font-medium">
                  Analyse du planning en cours...
                </p>
              </div>
            </div>
          )}

          {/* Warning */}
          {!isLoadingData && (
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
          )}

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
              disabled={!confirmChecked || clearing || totalItems === 0 || isLoadingData}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50"
            >
              {clearing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Suppression en cours...
                </>
              ) : isLoadingData ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyse...
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