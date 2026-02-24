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

  // If no orders with employees, show diagnostic
  if (ordersWithEmployees.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-amber-700" />
              <span className="text-sm font-bold text-amber-900">Aucun ordre de départ généré</span>
            </div>
            
            {diagnostic && (
              <div className="text-xs text-amber-800 space-y-1 bg-white rounded p-2">
                <div><strong>Paramètres :</strong> {diagnostic.settings?.enabled ? '✓ Activée' : '✗ Désactivée'}</div>
                <div><strong>Services :</strong> {diagnostic.settings?.services?.join(', ') || '(aucun)'}</div>
                <div><strong>Shifts trouvés :</strong> {diagnostic.shiftsToday.length}</div>
                <div><strong>Ordres en DB :</strong> {diagnostic.departureOrders.length}</div>
                {diagnostic.locks.length > 0 && (
                  <div className="text-orange-600">
                    <strong>🔒 Lock actif :</strong> recalcul debouncé ({diagnostic.locks[0].expires_at})
                  </div>
                )}
                {diagnostic.issues.length > 0 && (
                  <div className="mt-1 pt-1 border-t border-amber-200">
                    {diagnostic.issues.map((issue, i) => (
                      <div key={i} className="text-orange-700">• {issue}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <p className="text-xs text-amber-600 mt-2">
              L'ordre peut évoluer automatiquement si le planning ou les recaps sont modifiés.
            </p>
          </div>

          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleForceRecalc}
              disabled={loadingDebug}
              className="flex-shrink-0"
            >
              {loadingDebug ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              Recalculer
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 mb-4">
      {ordersWithEmployees.map(order => (
        <div key={order.id} className="bg-emerald-50 border border-emerald-300 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-emerald-700" />
            <span className="text-sm font-bold text-emerald-900">Optimisation masse salariale — {order.service}</span>
          </div>
          <p className="text-sm text-emerald-800 font-medium">
            {order.employee_order?.map((emp, i) => (
              <span key={emp.employee_id}>
                <span className="font-bold">{i + 1}.</span> {emp.employee_name}{i < (order.employee_order?.length || 1) - 1 ? ', ' : ''}
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