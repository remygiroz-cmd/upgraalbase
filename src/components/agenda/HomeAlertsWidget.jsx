import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Bell, X, Eye, AlertTriangle, Info, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const SEVERITY_CONFIG = {
  URGENT: {
    bg: 'bg-red-50 border-red-300',
    icon: Zap,
    iconColor: 'text-red-600',
    badge: 'bg-red-600 text-white',
    label: 'URGENT',
  },
  WARNING: {
    bg: 'bg-yellow-50 border-yellow-300',
    icon: AlertTriangle,
    iconColor: 'text-yellow-600',
    badge: 'bg-yellow-500 text-white',
    label: 'Attention',
  },
  INFO: {
    bg: 'bg-blue-50 border-blue-200',
    icon: Info,
    iconColor: 'text-blue-500',
    badge: 'bg-blue-500 text-white',
    label: 'Info',
  },
};

export default function HomeAlertsWidget({ employeeId }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: alerts = [] } = useQuery({
    queryKey: ['homeAlerts', employeeId],
    queryFn: async () => {
      const all = await base44.entities.HomeAlert.filter(
        { employee_id: employeeId, is_dismissed: false },
        '-created_date',
        20
      );
      const now = new Date();
      return all
        .filter(a => !a.expires_at || new Date(a.expires_at) > now)
        .sort((a, b) => {
          const order = { URGENT: 3, WARNING: 2, INFO: 1 };
          const diff = (order[b.severity] || 0) - (order[a.severity] || 0);
          if (diff !== 0) return diff;
          return new Date(b.created_date) - new Date(a.created_date);
        });
    },
    enabled: !!employeeId,
    staleTime: 30 * 1000,
    refetchOnMount: true,
  });

  const dismissMutation = useMutation({
    mutationFn: (alertId) => base44.entities.HomeAlert.update(alertId, {
      is_dismissed: true,
      dismissed_at: new Date().toISOString(),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['homeAlerts', employeeId] }),
  });

  if (alerts.length === 0) return null;

  const urgentCount = alerts.filter(a => a.severity === 'URGENT').length;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Bell className="w-5 h-5 text-gray-700" />
        <h2 className="text-base font-bold text-gray-900">Notifications</h2>
        {urgentCount > 0 && (
          <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            {urgentCount} urgent{urgentCount > 1 ? 'es' : 'e'}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {alerts.map(alert => {
          const cfg = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.INFO;
          const Icon = cfg.icon;

          return (
            <div
              key={alert.id}
              className={cn('border rounded-xl p-3 flex items-start gap-3', cfg.bg)}
            >
              <div className={cn('mt-0.5 flex-shrink-0', cfg.iconColor)}>
                <Icon className="w-4 h-4" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', cfg.badge)}>
                    {cfg.label}
                  </span>
                  <span className="text-xs font-semibold text-gray-800 truncate">{alert.title}</span>
                </div>
                <p className="text-xs text-gray-600">{alert.message}</p>
                <p className="text-[10px] text-gray-400 mt-1">
                  {format(new Date(alert.created_date), 'dd/MM HH:mm', { locale: fr })}
                </p>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                {alert.action_type === 'VIEW_EVENT' && alert.event_id && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => navigate(createPageUrl('Agenda') + `?event_id=${alert.event_id}`)}
                  >
                    <Eye className="w-3 h-3 mr-1" />
                    Voir
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-gray-500"
                  onClick={() => dismissMutation.mutate(alert.id)}
                >
                  <X className="w-3 h-3 mr-1" />
                  Traité
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}