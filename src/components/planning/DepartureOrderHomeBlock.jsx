import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { TrendingDown, Clock } from 'lucide-react';
import { formatLocalDate } from '@/components/planning/dateUtils';

/**
 * Shown on Home Page - only if user's role is in the allowed list
 */
export default function DepartureOrderHomeBlock({ currentUser, currentEmployee }) {
  const today = formatLocalDate(new Date());

  const { data: settingsArr = [] } = useQuery({
    queryKey: ['optimisationSettings'],
    queryFn: () => base44.entities.AppSettings.filter({ setting_key: 'optimisation_masse_salariale' }),
    staleTime: 5 * 60 * 1000
  });

  const settings = settingsArr[0];

  // Get user's role record to check if they should see the block
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

  // Check role visibility
  const allowedRoleIds = settings.home_roles || [];

  // Admin always sees it
  const isAdmin = currentUser?.role === 'admin';

  if (!isAdmin && allowedRoleIds.length > 0) {
    // Find user's role by role_id
    const userRoleRecord = userRoles.find(r => r.id === currentUser?.role_id);
    if (!userRoleRecord || !allowedRoleIds.includes(userRoleRecord.id)) {
      return null;
    }
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
    <div className="mb-6 space-y-3">
      <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
        <TrendingDown className="w-5 h-5 text-emerald-600" />
        Ordre de départ aujourd'hui
      </h2>
      {successOrders.map(order => (
        <div key={order.id} className="bg-emerald-50 border border-emerald-300 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-emerald-700 bg-emerald-200 px-2 py-0.5 rounded-full uppercase tracking-wide">
              {order.service}
            </span>
          </div>
          <p className="text-sm text-emerald-800 font-medium leading-relaxed">
            {order.ordered_employees.map((emp, i) => (
              <span key={emp.employee_id}>
                <span className="font-bold">{i + 1}.</span> {emp.employee_name}{i < order.ordered_employees.length - 1 ? '  ' : ''}
              </span>
            ))}
          </p>
          <div className="flex items-center gap-2 mt-2 text-xs text-emerald-600">
            <span>Basé sur les heures du mois en cours</span>
            {order.generated_at && (
              <>
                <span>•</span>
                <Clock className="w-3 h-3" />
                <span>{new Date(order.generated_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}