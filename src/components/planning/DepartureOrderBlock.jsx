import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { TrendingDown, Clock, AlertCircle, RefreshCw } from 'lucide-react';
import { formatLocalDate } from '@/components/planning/dateUtils';
import { Button } from '@/components/ui/button';

export default function DepartureOrderBlock({ date, currentUser }) {
  const today = date || formatLocalDate(new Date());
  const [diagnostic, setDiagnostic] = useState(null);
  const [loadingDebug, setLoadingDebug] = useState(false);

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

  const { data: orders = [], refetch: refetchOrders } = useQuery({
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
  const ordersWithEmployees = orders.filter(o =>
    o.employee_order?.length > 0 &&
    (activeServices.length === 0 || activeServices.includes((o.service || '').toLowerCase()))
  );

  // Load diagnostic if no orders or user is admin/manager
  useEffect(() => {
    if ((ordersWithEmployees.length === 0 || isAdmin) && !diagnostic) {
      setLoadingDebug(true);
      base44.functions.invoke('debugDepartureOrderState', { date: today })
        .then(res => setDiagnostic(res.data))
        .catch(() => {})
        .finally(() => setLoadingDebug(false));
    }
  }, [ordersWithEmployees.length, isAdmin, today]);

  const handleForceRecalc = async () => {
    setLoadingDebug(true);
    await base44.functions.invoke('recomputeDepartureOrderIfNeeded', {
      date: today,
      forceImmediate: true
    }).catch(() => {});
    setTimeout(() => refetchOrders(), 500);
    setLoadingDebug(false);
  };

  return (
    <div className="space-y-2 mb-4">
      {successOrders.map(order => (
        <div key={order.id} className="bg-emerald-50 border border-emerald-300 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-emerald-700" />
            <span className="text-sm font-bold text-emerald-900">Optimisation masse salariale — {order.service}</span>
          </div>
          <p className="text-sm text-emerald-800 font-medium">
            {order.ordered_employees.map((emp, i) => (
              <span key={emp.employee_id}>
                <span className="font-bold">{i + 1}.</span> {emp.employee_name}{i < order.ordered_employees.length - 1 ? ', ' : ''}
              </span>
            ))}
          </p>
          <div className="flex items-center gap-3 mt-2 text-xs text-emerald-600">
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
        </div>
      ))}
    </div>
  );
}