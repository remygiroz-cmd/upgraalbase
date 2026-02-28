/**
 * DepartureOrderPlanningBlock
 *
 * Calcule les heures complémentaires EXACTEMENT comme MonthlySummary :
 * calculateMonthlyRecap → resolveRecapFinal (priorité manuel > auto)
 * Puis trie les employés ayant un shift Livraison aujourd'hui.
 *
 * Aucun upsert, aucune écriture, 100% front.
 */
import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { TrendingDown } from 'lucide-react';
import { calculateMonthlyRecap } from '@/components/utils/monthlyRecapCalculations';
import { resolveRecapFinal } from './resolveMonthlyPayrollValues';

export default function DepartureOrderPlanningBlock({
  date,         // "YYYY-MM-DD" — aujourd'hui
  monthKey,     // "YYYY-MM"
  shifts,       // Shift[] du mois (déjà chargés dans PlanningV2)
  employees,    // Employee[] (tous actifs visibles)
  nonShiftEvents = [],
  nonShiftTypes = [],
  holidayDates = [],
  weeklyRecaps = [],
  currentUser
}) {
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

  const { data: calculationSettingsArr = [] } = useQuery({
    queryKey: ['appSettings', 'planning_calculation_mode'],
    queryFn: () => base44.entities.AppSettings.filter({ setting_key: 'planning_calculation_mode' }),
    staleTime: 5 * 60 * 1000
  });

  // MonthlyRecapPersisted — pour prendre en compte les overrides manuels (is_manual_override=true)
  const { data: persistedRecaps = [] } = useQuery({
    queryKey: ['monthlyRecapsPersisted', monthKey],
    queryFn: () => base44.entities.MonthlyRecapPersisted.filter({ month_key: monthKey }),
    enabled: !!monthKey,
    staleTime: 30 * 1000
  });

  // MonthlyRecapExtrasOverride
  const { data: extrasOverrides = [] } = useQuery({
    queryKey: ['recapExtrasOverride', monthKey],
    queryFn: () => base44.entities.MonthlyRecapExtrasOverride.filter({ month_key: monthKey }),
    enabled: !!monthKey,
    staleTime: 30 * 1000
  });

  const settings = settingsArr[0];
  const calculationMode = calculationSettingsArr[0]?.planning_calculation_mode || 'disabled';

  // Extraire year/month depuis monthKey
  const [year, monthNum] = (monthKey || '2026-01').split('-').map(Number);
  const month = monthNum - 1; // 0-indexed

  // Shifts du jour
  const shiftsToday = useMemo(() => (shifts || []).filter(s => s.date === date), [shifts, date]);

  // Calcul des H.complémentaires pour chaque employé (même logique que MonthlySummary)
  const holidayDateStrings = useMemo(() => holidayDates.map(h => h.date || h), [holidayDates]);

  const employeeCompl = useMemo(() => {
    if (!employees?.length) return {};
    const map = {};
    for (const emp of employees) {
      const empShifts = (shifts || []).filter(s => s.employee_id === emp.id);
      const empNonShifts = nonShiftEvents.filter(ns => ns.employee_id === emp.id);
      const empWeeklyRecaps = weeklyRecaps.filter(wr => wr.employee_id === emp.id);
      const recapPersisted = persistedRecaps.find(r => r.employee_id === emp.id) || null;
      const recapExtras = extrasOverrides.find(r => r.employee_id === emp.id) || null;

      const autoRecap = calculateMonthlyRecap(
        calculationMode,
        emp,
        empShifts,
        empNonShifts,
        nonShiftTypes,
        holidayDateStrings,
        year,
        month,
        empWeeklyRecaps
      );

      const resolved = resolveRecapFinal(autoRecap, recapPersisted, recapExtras);
      // Utiliser complementary_hours_ui exactement comme la carte
      map[emp.id] = resolved.complementary_hours_ui ?? 0;
    }
    return map;
  }, [employees, shifts, nonShiftEvents, nonShiftTypes, holidayDateStrings, weeklyRecaps, persistedRecaps, extrasOverrides, calculationMode, year, month]);

  // ── Guard ───────────────────────────────────────────────────────────────────
  if (!settings?.enabled || !settings?.show_in_planning) return null;

  const allowedRoleIds = settings.home_roles || [];
  const isAdmin = currentUser?.role === 'admin';
  if (!isAdmin && allowedRoleIds.length > 0) {
    const userRoleRecord = userRoles.find(r => r.id === currentUser?.role_id);
    if (!userRoleRecord || !allowedRoleIds.includes(userRoleRecord.id)) return null;
  } else if (!isAdmin && allowedRoleIds.length === 0) {
    return null;
  }

  const configuredServices = (settings.services || []).map(s => s.toLowerCase());
  if (configuredServices.length === 0) return null;

  // ── Construction des blocs par service ─────────────────────────────────────
  const blocks = configuredServices.map(serviceLower => {
    const empIdsSet = new Set(
      shiftsToday
        .filter(s => (s.position || '').toLowerCase() === serviceLower)
        .map(s => s.employee_id)
    );

    const entries = [...empIdsSet].map(empId => {
      const emp = employees.find(e => e.id === empId);
      return {
        employee_id: empId,
        name: emp ? `${emp.first_name} ${emp.last_name}` : empId,
        complementary_hours: employeeCompl[empId] ?? 0
      };
    });

    entries.sort((a, b) => b.complementary_hours - a.complementary_hours);
    return { service: serviceLower, entries };
  });

  // ── Formatage heures décimal → "1h20" ──────────────────────────────────────
  const formatHours = (h) => {
    const totalMin = Math.round((h || 0) * 60);
    const hh = Math.floor(totalMin / 60);
    const mm = totalMin % 60;
    if (mm === 0) return `${hh}h`;
    return `${hh}h${String(mm).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-2 mb-4">
      {blocks.map(block => (
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