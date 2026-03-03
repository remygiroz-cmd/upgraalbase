/**
 * SnapshotRenderer
 * Charge toutes les données du mois et appelle onReady(data) quand c'est prêt.
 * Rendu offscreen (invisible), utilisé uniquement depuis CoffrePlannings.
 */
import React, { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { getActiveMonthContext } from '@/components/planning/monthContext';
import { getActiveShiftsForMonth } from '@/components/planning/shiftService';

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export default function SnapshotRenderer({ monthKey, onReady, onError }) {
  const calledRef = useRef(false);

  useEffect(() => {
    if (!monthKey || calledRef.current) return;
    calledRef.current = true;
    let cancelled = false;

    const load = async () => {
      try {
        const [yr, mo] = monthKey.split('-').map(Number);
        const monthIndex = mo - 1;

        const ctx = await getActiveMonthContext(monthKey);
        if (cancelled) return;

        const monthEnd = new Date(yr, monthIndex + 1, 0);
        const monthStartStr = `${yr}-${String(mo).padStart(2, '0')}-01`;
        const monthEndStr = `${yr}-${String(mo).padStart(2, '0')}-${String(monthEnd.getDate()).padStart(2, '0')}`;

        const employees = await base44.entities.Employee.filter({ is_active: true });
        if (cancelled) return;
        const nonShiftTypes = await base44.entities.NonShiftType.filter({ is_active: true });
        if (cancelled) return;
        const positions = await base44.entities.Position.filter({ is_active: true });
        if (cancelled) return;
        const shifts = await getActiveShiftsForMonth(monthKey, ctx.reset_version);
        if (cancelled) return;
        const nonShiftEventsRaw = await base44.entities.NonShiftEvent.filter({ month_key: monthKey });
        const nonShiftEvents = nonShiftEventsRaw.filter(e =>
          (e.reset_version ?? 0) >= ctx.reset_version &&
          e.date >= monthStartStr && e.date <= monthEndStr
        );
        if (cancelled) return;
        const holidayDates = await base44.entities.HolidayDate.filter({
          date: { $gte: `${yr}-01-01`, $lte: `${yr}-12-31` }
        });
        if (cancelled) return;
        const cpPeriods = await base44.entities.PaidLeavePeriod.filter({ month_key: monthKey });
        if (cancelled) return;
        const weeklyRecaps = await base44.entities.WeeklyRecap.filter({ month_key: monthKey });
        if (cancelled) return;
        const exportOverrides = await base44.entities.MonthlyExportOverride.filter({ month_key: monthKey });
        if (cancelled) return;
        const recapExtrasOverrides = await base44.entities.MonthlyRecapExtrasOverride.filter({ month_key: monthKey });
        if (cancelled) return;
        const recapsPersisted = await base44.entities.MonthlyRecapPersisted.filter({ month_key: monthKey });
        if (cancelled) return;
        const appSettings = await base44.entities.AppSettings.filter({ setting_key: 'compta_export' });
        if (cancelled) return;
        const calculationSettings = await base44.entities.AppSettings.filter({ setting_key: 'planning_calculation_mode' });
        if (cancelled) return;

        const data = {
          ctx,
          yr,
          monthIndex,
          monthKey,
          monthName: MONTHS[monthIndex],
          monthStart: new Date(yr, monthIndex, 1),
          monthEnd,
          employees,
          teams: [],
          shifts,
          nonShiftEvents,
          nonShiftTypes,
          positions,
          cpPeriods,
          holidayDates,
          exportOverrides,
          recapExtrasOverrides,
          recapsPersisted,
          weeklyRecaps,
          settings: appSettings[0] || {},
          calculationMode: calculationSettings[0]?.planning_calculation_mode || 'disabled',
        };

        if (!cancelled) onReady?.(data);
      } catch (err) {
        if (!cancelled) onError?.(err.message);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [monthKey]);

  return null;
}