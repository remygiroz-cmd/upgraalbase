import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function AutomationHistoryPanel({ config }) {
  if (!config || !config.run_history || config.run_history.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Aucun historique d'envoi</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {config.run_history.slice().reverse().map((run, idx) => (
        <div
          key={idx}
          className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100"
        >
          <div className="flex items-center gap-3 flex-1">
            {run.status === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            )}

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">
                {run.invoices_count} facture(s) envoyée(s)
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {format(new Date(run.run_at), 'dd MMMM yyyy à HH:mm', { locale: fr })}
              </p>
              {run.error_message && (
                <p className="text-xs text-red-600 mt-1">{run.error_message}</p>
              )}
            </div>
          </div>

          <Badge className={run.status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
            {run.status === 'success' ? 'Succès' : 'Échec'}
          </Badge>
        </div>
      ))}
    </div>
  );
}