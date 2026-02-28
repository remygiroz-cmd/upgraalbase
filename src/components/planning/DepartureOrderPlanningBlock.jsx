/**
 * DepartureOrderPlanningBlock
 *
 * Affiche l'ordre de départ basé sur MonthlyRecapPersisted (complementary_hours_ui),
 * entièrement côté front, sans aucun upsert ni backend.
 *
 * Props:
 *  - date: string "YYYY-MM-DD" (jour affiché)
 *  - monthKey: string "YYYY-MM"
 *  - shifts: Shift[] (shifts du mois, déjà chargés dans PlanningV2)
 *  - employees: Employee[] (employés visibles)
 *  - currentUser: object
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { TrendingDown } from 'lucide-react';

export default function DepartureOrderPlanningBlock({ date, monthKey, shifts, employees, currentUser }) {
  const { data: settingsArr = [] } = useQuery({
    queryKey: ['optimisationSettings'],
    queryFn: () => base44.entities.AppSettings.filter({ setting_key: 'optimisation_masse_salariale' }),
    staleTime: 5 * 60 * 1000
  });

  const { data: userRoles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: () => base44.entities.Role.list(),
    staleTime: 10 * 60 * 1000
  });

  const { data: persistedRecaps = [] } = useQuery({
    queryKey: ['monthlyRecapsPersisted', monthKey],
    queryFn: () => base44.entities.MonthlyRecapPersisted.filter({ month_key: monthKey }),
    enabled: !!monthKey,
    staleTime: 60 * 1000
  });

  const settings = settingsArr[0];

  if (!settings?.enabled || !settings?.show_in_planning) return null;

  // Vérification des rôles
  const allowedRoleIds = settings.home_roles || [];
  const isAdmin = currentUser?.role === 'admin';
  if (!isAdmin && allowedRoleIds.length > 0) {
    const userRoleRecord = userRoles.find(r => r.id === currentUser?.role_id);
    if (!userRoleRecord || !allowedRoleIds.includes(userRoleRecord.id)) return null;
  } else if (!isAdmin && allowedRoleIds.length === 0) {
    return null;
  }

  // Services configurés (ex: ["Livraison"])
  const configuredServices = (settings.services || []).map(s => s.toLowerCase());
  if (configuredServices.length === 0) return null;

  // Shifts du jour pour la date affichée
  const shiftsToday = (shifts || []).filter(s => s.date === date);

  // Pour chaque service configuré, calculer la liste triée
  const blocks = configuredServices.map(serviceLower => {
    // Dédoublonner les employee_id dont la position match le service
    const empIdsSet = new Set(
      shiftsToday
        .filter(s => (s.position || '').toLowerCase() === serviceLower)
        .map(s => s.employee_id)
    );

    if (empIdsSet.size === 0) return { service: serviceLower, entries: [] };

    const entries = [...empIdsSet].map(empId => {
      const emp = employees.find(e => e.id === empId);
      const recap = persistedRecaps.find(r => r.employee_id === empId);
      const complHours = recap?.complementary_hours_ui ?? 0;
      return {
        employee_id: empId,
        name: emp ? `${emp.first_name} ${emp.last_name}` : empId,
        complementary_hours: complHours
      };
    });

    // Tri décroissant par heures complémentaires
    entries.sort((a, b) => b.complementary_hours - a.complementary_hours);

    return { service: serviceLower, entries };
  });

  // N'afficher que les services qui ont au moins un livreur OU afficher "aucun" si settings actif
  const visibleBlocks = blocks.filter(b => configuredServices.includes(b.service));
  if (visibleBlocks.length === 0) return null;

  // Formater heures : nombre décimal → "3h30" ou "0h"
  const formatHours = (h) => {
    if (!h && h !== 0) return '0h';
    const totalMin = Math.round(h * 60);
    const hh = Math.floor(totalMin / 60);
    const mm = totalMin % 60;
    if (mm === 0) return `${hh}h`;
    return `${hh}h${String(mm).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-2 mb-4">
      {visibleBlocks.map(block => (
        <div key={block.service} className="bg-emerald-50 border border-emerald-300 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-emerald-700" />
            <span className="text-sm font-bold text-emerald-900 capitalize">
              Optimisation masse salariale — {block.service}
            </span>
          </div>

          {block.entries.length === 0 ? (
            <p className="text-sm text-emerald-700 italic">Aucun livreur aujourd'hui</p>
          ) : (
            <div className="text-sm text-emerald-800 font-medium space-y-0.5">
              {block.entries.map((entry, i) => (
                <div key={entry.employee_id} className="flex items-baseline gap-1.5">
                  <span className="font-bold">{i + 1}.</span>
                  <span>{entry.name}</span>
                  <span className="text-xs text-emerald-600 font-mono">
                    — {formatHours(entry.complementary_hours)} compl.
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-emerald-600 mt-2">
            Basé sur les heures complémentaires du mois en cours
          </p>
        </div>
      ))}
    </div>
  );
}