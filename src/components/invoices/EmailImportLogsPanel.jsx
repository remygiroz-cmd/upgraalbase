import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Loader2, CheckCircle2, XCircle, Clock, AlertCircle, Copy, Check, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const STATUS_CONFIG = {
  received:   { label: 'Reçu',       icon: Clock,         color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200' },
  processing: { label: 'Traitement', icon: Loader2,       color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200', spin: true },
  success:    { label: 'Succès',     icon: CheckCircle2,  color: 'text-green-600',  bg: 'bg-green-50 border-green-200' },
  failed:     { label: 'Échec',      icon: XCircle,       color: 'text-red-600',    bg: 'bg-red-50 border-red-200' },
};

function LogRow({ log }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[log.status] || STATUS_CONFIG.received;
  const Icon = cfg.icon;

  const handleCopy = () => {
    const payload = JSON.stringify({
      message_id: log.message_id,
      from: log.from,
      to: log.to,
      subject: log.subject,
      attachments_count: log.attachments_count,
      status: log.status,
      error_message: log.error_message,
      invoice_ids: log.invoice_ids,
      created_at: log.created_at,
    }, null, 2);
    navigator.clipboard?.writeText(payload).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={cn('border rounded-lg p-3 text-xs space-y-1', cfg.bg)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Icon className={cn('w-4 h-4 flex-shrink-0', cfg.color, cfg.spin && 'animate-spin')} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn('font-semibold', cfg.color)}>{cfg.label}</span>
              <span className="text-gray-500">
                {log.created_at ? format(new Date(log.created_at), 'dd/MM HH:mm:ss', { locale: fr }) : '—'}
              </span>
              {log.attachments_count > 0 && (
                <span className="bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-600">
                  {log.attachments_count} PJ
                </span>
              )}
              {(log.invoice_ids?.length > 0) && (
                <span className="bg-green-100 text-green-700 rounded px-1.5 py-0.5">
                  {log.invoice_ids.length} facture{log.invoice_ids.length > 1 ? 's' : ''} créée{log.invoice_ids.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <p className="text-gray-600 truncate mt-0.5">
              <span className="font-medium">De :</span> {log.from || '—'} &nbsp;|&nbsp;
              <span className="font-medium">Sujet :</span> {log.subject || '—'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 text-gray-400 hover:text-gray-700 transition-colors"
            title="Détails"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleCopy}
            className="p-1 text-gray-400 hover:text-gray-700 transition-colors"
            title="Copier payload"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {log.error_message && (
        <div className="flex items-start gap-1.5 bg-red-100 border border-red-200 rounded p-2 mt-1">
          <AlertCircle className="w-3.5 h-3.5 text-red-600 flex-shrink-0 mt-0.5" />
          <span className="text-red-700 break-all">{log.error_message}</span>
        </div>
      )}

      {expanded && (
        <div className="bg-white/70 rounded p-2 space-y-1 mt-1 border border-white/60">
          <p><span className="font-medium text-gray-600">Message-ID :</span> <span className="font-mono break-all text-gray-700">{log.message_id || '—'}</span></p>
          <p><span className="font-medium text-gray-600">Destinataire :</span> {log.to || '—'}</p>
          {log.invoice_ids?.length > 0 && (
            <p><span className="font-medium text-gray-600">Invoice IDs :</span> {log.invoice_ids.join(', ')}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function EmailImportLogsPanel() {
  const { data: logs = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['emailImportLogs'],
    queryFn: () => base44.entities.InboundEmailImportLog.list('-created_date', 20),
    refetchInterval: 10000,
  });

  return (
    <div className="bg-white border-2 border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800">Derniers imports email</h3>
        <button
          onClick={() => refetch()}
          className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          title="Rafraîchir"
        >
          <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Chargement…
        </div>
      ) : logs.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">Aucun import email pour l'instant.</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {logs.map(log => (
            <LogRow key={log.id} log={log} />
          ))}
        </div>
      )}
    </div>
  );
}