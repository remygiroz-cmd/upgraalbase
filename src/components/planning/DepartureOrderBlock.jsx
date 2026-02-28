import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { TrendingDown, Clock, RefreshCw } from 'lucide-react';
import { formatLocalDate } from '@/components/planning/dateUtils';
import { toast } from 'sonner';

export default function DepartureOrderBlock({ date, currentUser }) {
  const today = date || formatLocalDate(new Date());
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await base44.functions.invoke('generateDailyDepartureOrder', {});
      await queryClient.invalidateQueries({ queryKey: ['departureOrders', today] });
      toast.success('Ordre de départ mis à jour');
    } catch {
      toast.error('Erreur lors de la mise à jour');
    } finally {
      setRefreshing(false);
    }
  };

  const { data: settingsArr = [] } = useQuery({
    queryKey: ['optimisationSettings'],
    queryFn: () => base44.entities.AppSettings.filter({ setting_key: 'optimisation_masse_salariale' }),
    staleTime: 5 * 60 * 1000
  });

  const settings = settingsArr[0];

  const { data: userRoles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: () => base44.entities.Role.list(),
    staleTime: 10 * 60 * 1000,
    enabled: !!(settings?.enabled)
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['departureOrders', today],
    queryFn: () => base44.entities.DepartureOrder.filter({ date: today }),
    enabled: !!(settings?.enabled),
    staleTime: 5 * 60 * 1000
  });

  if (!settings?.enabled) return null;

  // Check role visibility (same logic as Home block)
  const allowedRoleIds = settings.home_roles || [];
  const isAdmin = currentUser?.role === 'admin';
  if (!isAdmin && allowedRoleIds.length > 0) {
    const userRoleRecord = userRoles.find(r => r.id === currentUser?.role_id);
    if (!userRoleRecord || !allowedRoleIds.includes(userRoleRecord.id)) return null;
  } else if (!isAdmin && allowedRoleIds.length === 0) {
    return null;
  }

  const activeServices = (settings?.services || []).map(s => s.toLowerCase());
  const successOrders = orders.filter(o =>
    o.status === 'success' &&
    o.ordered_employees?.length > 0 &&
    (activeServices.length === 0 || activeServices.includes((o.service || '').toLowerCase()))
  );
  if (successOrders.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {successOrders.map(order => (
        <div key={order.id} className="bg-emerald-50 border border-emerald-300 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-emerald-700" />
            <span className="text-sm font-bold text-emerald-900">Optimisation masse salariale — {order.service}</span>
          </div>
          <div className="text-sm text-emerald-800 font-medium space-y-0.5">
            {order.ordered_employees.map((emp, i) => (
              <div key={emp.employee_id} className="flex items-baseline gap-1.5">
                <span className="font-bold">{i + 1}.</span>
                <span>{emp.employee_name}</span>
                {emp.score_minutes !== undefined && (
                  <span className="text-[10px] text-emerald-600 font-mono">
                    + = {emp.score_minutes} min ({emp.src || 'auto'})
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-3 text-xs text-emerald-600">
              <span>Basé sur les heures du mois en cours</span>
              {order.generated_at && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Mis à jour à {new Date(order.generated_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </>
              )}
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 transition-colors disabled:opacity-50"
              title="Rafraîchir maintenant"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Mise à jour...' : 'Rafraîchir'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}