import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Users, Circle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { calculatePresenceStatus } from '@/components/utils/presenceUtils';

export default function Presence() {
  // Get current user and employee
  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: employees = [], refetch } = useQuery({
    queryKey: ['allEmployees'],
    queryFn: () => base44.entities.Employee.list(),
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 0
  });

  const currentEmployee = useMemo(() => {
    if (!currentUser?.email || !employees.length) return null;
    const normalizeEmail = (email) => email?.trim().toLowerCase() || '';
    return employees.find(emp => normalizeEmail(emp.email) === normalizeEmail(currentUser.email));
  }, [currentUser, employees]);

  // Check permissions
  const canView = useMemo(() => {
    if (!currentEmployee) return false;
    return currentUser?.role === 'admin' || currentEmployee.permission_level === 'manager';
  }, [currentUser, currentEmployee]);

  // Process employees with presence status
  const processedEmployees = useMemo(() => {
    const activeEmployees = employees.filter(emp => emp.is_active !== false);
    
    return activeEmployees.map(emp => ({
      ...emp,
      presence: calculatePresenceStatus(emp.last_seen_at)
    })).sort((a, b) => {
      // Sort by status: online > away > offline
      const statusOrder = { online: 0, away: 1, offline: 2 };
      const statusDiff = statusOrder[a.presence.status] - statusOrder[b.presence.status];
      if (statusDiff !== 0) return statusDiff;
      
      // Then by name
      return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
    });
  }, [employees]);

  // Count by status
  const counts = useMemo(() => {
    return processedEmployees.reduce((acc, emp) => {
      acc[emp.presence.status] = (acc[emp.presence.status] || 0) + 1;
      return acc;
    }, { online: 0, away: 0, offline: 0 });
  }, [processedEmployees]);

  if (!canView) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Accès refusé</h2>
          <p className="text-gray-600">Seuls les administrateurs et managers peuvent accéder à cette page.</p>
        </div>
      </div>
    );
  }

  if (!currentEmployee) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Présence des employés</h1>
              <p className="text-sm text-gray-600">Statuts en temps réel</p>
            </div>
            <button
              onClick={() => refetch()}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Actualiser
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <Circle className="w-5 h-5 text-green-600 fill-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{counts.online}</div>
                <div className="text-sm text-gray-600">En ligne</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                <Circle className="w-5 h-5 text-orange-500 fill-orange-500" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{counts.away}</div>
                <div className="text-sm text-gray-600">Récemment vu</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                <Circle className="w-5 h-5 text-gray-400 fill-gray-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{counts.offline}</div>
                <div className="text-sm text-gray-600">Hors ligne</div>
              </div>
            </div>
          </div>
        </div>

        {/* Employees List */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-gray-600" />
              <h2 className="text-lg font-semibold text-gray-900">
                Tous les employés ({processedEmployees.length})
              </h2>
            </div>
          </div>

          <div className="divide-y divide-gray-200">
            {processedEmployees.map(emp => (
              <div key={emp.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Avatar with presence indicator */}
                    <div className="relative flex-shrink-0">
                      <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-sm">
                        {emp.first_name?.charAt(0)}{emp.last_name?.charAt(0)}
                      </div>
                      <div className={cn(
                        "absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white",
                        emp.presence.dotColor
                      )} />
                    </div>

                    {/* Name and team */}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900">
                        {emp.first_name} {emp.last_name}
                      </div>
                      <div className="text-sm text-gray-500 truncate">
                        {emp.position || emp.team || 'Sans équipe'}
                      </div>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Circle className={cn("w-2 h-2", emp.presence.dotColor)} />
                    <span className={cn("text-sm font-medium", emp.presence.color)}>
                      {emp.presence.label}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}