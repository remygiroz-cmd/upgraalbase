import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export default function ClearMonthModal({ open, onOpenChange, monthStart, monthEnd, onSuccess }) {
  const [confirmText, setConfirmText] = useState('');
  const [clearing, setClearing] = useState(false);

  const year = monthStart.getFullYear();
  const month = monthStart.getMonth() + 1;
  const monthName = MONTHS[monthStart.getMonth()];
  const expectedText = `EFFACER ${monthName.toUpperCase()} ${year}`;

  // Fetch existing shifts to count
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

  const totalItems = existingShifts.length + nonShiftEvents.length;
  const isConfirmed = confirmText.trim() === expectedText;

  const handleClear = async () => {
    setClearing(true);

    try {
      let deletedShifts = 0;
      let deletedEvents = 0;

      // Delete all shifts
      for (const shift of existingShifts) {
        await base44.entities.Shift.delete(shift.id);
        deletedShifts++;
      }

      // Delete all non-shift events
      for (const event of nonShiftEvents) {
        await base44.entities.NonShiftEvent.delete(event.id);
        deletedEvents++;
      }

      setClearing(false);
      toast.success(`✓ Planning effacé : ${deletedShifts} shifts + ${deletedEvents} événements supprimés`);
      onSuccess?.();
      onOpenChange(false);
      setConfirmText('');

    } catch (error) {
      setClearing(false);
      console.error('Clear month error:', error);
      toast.error('Erreur lors de la suppression: ' + error.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      onOpenChange(open);
      if (!open) setConfirmText('');
    }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-red-600 flex items-center gap-2">
            <AlertTriangle className="w-6 h-6" />
            Effacer le planning de {monthName} {year}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Warning */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-900 mb-2">⚠️ Action irréversible</p>
                <p className="text-sm text-red-800 mb-3">
                  Cette action supprime définitivement <strong>tous les shifts et événements du mois</strong> pour <strong>tous les employés</strong>.
                </p>
                <div className="bg-white border border-red-300 rounded p-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-700">Shifts à supprimer :</span>
                    <span className="font-bold text-red-900">{existingShifts.length}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm mt-1">
                    <span className="text-gray-700">Événements (CP/Abs) :</span>
                    <span className="font-bold text-red-900">{nonShiftEvents.length}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm mt-2 pt-2 border-t border-red-200">
                    <span className="font-semibold text-gray-900">Total :</span>
                    <span className="font-bold text-red-900 text-lg">{totalItems}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Confirmation input */}
          <div>
            <Label className="text-sm font-semibold text-gray-900 mb-2 block">
              Pour confirmer, tapez exactement :
            </Label>
            <div className="bg-gray-100 border border-gray-300 rounded-lg p-3 mb-3">
              <code className="text-sm font-mono font-bold text-gray-900">{expectedText}</code>
            </div>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Tapez ici..."
              className={`text-center font-mono text-sm ${
                confirmText && !isConfirmed ? 'border-red-500 focus:ring-red-500' : ''
              } ${isConfirmed ? 'border-green-500 bg-green-50' : ''}`}
              disabled={clearing}
              autoComplete="off"
            />
            {confirmText && !isConfirmed && (
              <p className="text-xs text-red-600 mt-1">❌ Le texte ne correspond pas</p>
            )}
            {isConfirmed && (
              <p className="text-xs text-green-600 mt-1 font-semibold">✓ Confirmation valide</p>
            )}
          </div>

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
          <div className="flex gap-3 pt-4 border-t">
            <Button
              onClick={() => onOpenChange(false)}
              variant="outline"
              disabled={clearing}
              className="flex-1"
            >
              Annuler
            </Button>
            <Button
              onClick={handleClear}
              disabled={!isConfirmed || clearing || totalItems === 0}
              className="flex-1 bg-red-600 hover:bg-red-700"
            >
              {clearing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Suppression...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Effacer définitivement
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