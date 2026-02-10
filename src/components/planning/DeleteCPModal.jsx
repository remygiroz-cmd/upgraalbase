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
    mutationFn: () => base44.entities.PaidLeavePeriod.delete(cpPeriod.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paidLeavePeriods'] });
      toast.success('Période de congés payés supprimée');
      onClose();
    },
    onError: (error) => {
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
            Cette action est irréversible.
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