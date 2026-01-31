import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertCircle, XCircle, Mail, Clock, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';

export default function EmailImportLogModal({ open, onClose }) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['emailImportLogs'],
    queryFn: () => base44.entities.EmailImportLog.list('-import_date', 50),
    enabled: open
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white border-gray-200 sm:max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Journal des imports email</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <LoadingSpinner />
        ) : logs.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="Aucun import email"
            description="Les imports de factures par email apparaîtront ici"
          />
        ) : (
          <div className="space-y-4">
            {logs.map((log) => (
              <div key={log.id} className="bg-gray-50 rounded-lg border-2 border-gray-200 p-4">
                <div className="flex items-start gap-3">
                  {log.status === 'success' ? (
                    <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                  ) : log.status === 'partial' ? (
                    <AlertCircle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                  )}

                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold text-gray-900">
                        {format(new Date(log.import_date), 'dd/MM/yyyy à HH:mm', { locale: fr })}
                      </span>
                      <Badge className={
                        log.status === 'success' ? 'bg-green-100 text-green-800' :
                        log.status === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }>
                        {log.status === 'success' ? 'Succès' :
                         log.status === 'partial' ? 'Partiel' : 'Échec'}
                      </Badge>
                    </div>

                    <div className="space-y-1 text-sm text-gray-700">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-gray-400" />
                        <span className="font-medium">De :</span>
                        <span>{log.sender_email}</span>
                      </div>

                      {log.subject && (
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-gray-400" />
                          <span className="font-medium">Objet :</span>
                          <span className="truncate">{log.subject}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <span className="font-medium">Établissement :</span>
                        <span>{log.establishment_name || '-'}</span>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                      <div className="bg-white rounded p-2 border border-gray-200">
                        <div className="text-gray-500 mb-1">Pièces jointes</div>
                        <div className="font-bold text-gray-900">{log.attachments_count || 0}</div>
                      </div>
                      <div className="bg-white rounded p-2 border border-green-200">
                        <div className="text-gray-500 mb-1">Factures créées</div>
                        <div className="font-bold text-green-600">{log.invoices_created?.length || 0}</div>
                      </div>
                      <div className="bg-white rounded p-2 border border-gray-200">
                        <div className="text-gray-500 mb-1">Ignorées</div>
                        <div className="font-bold text-gray-600">{log.attachments_ignored || 0}</div>
                      </div>
                    </div>

                    {log.errors && log.errors.length > 0 && (
                      <div className="mt-3 bg-red-50 border border-red-200 rounded p-3">
                        <div className="text-xs font-semibold text-red-900 mb-2">Erreurs :</div>
                        <ul className="space-y-1 text-xs text-red-800">
                          {log.errors.map((err, idx) => (
                            <li key={idx}>
                              <strong>{err.attachment_name}:</strong> {err.error_message}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {log.processing_duration_ms && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                        <Clock className="w-3 h-3" />
                        Traité en {(log.processing_duration_ms / 1000).toFixed(1)}s
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}