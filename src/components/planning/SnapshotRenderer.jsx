/**
 * SnapshotRenderer
 * Composant offscreen autonome : charge ses propres données et rend le planning+export.
 * Utilisé exclusivement depuis CoffrePlannings — JAMAIS importé dans Planning.
 * Rendu hors-écran (left: -99999px), fond blanc, largeur réelle.
 */
import React, { useEffect, useState, forwardRef, useImperativeHandle, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { getActiveMonthContext } from '@/components/planning/monthContext';
import { getActiveShiftsForMonth } from '@/components/planning/shiftService';
import PlanningExportCapture from '@/components/planning/PlanningExportCapture';

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

const SnapshotRenderer = forwardRef(function SnapshotRenderer({ monthKey, onReady, onError }, ref) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const planningCaptureRef = useRef(null);

  // Exposer la ref du composant de capture + les données
  useImperativeHandle(ref, () => ({
    getCaptureElement: () => planningCaptureRef.current,
    getData: () => data,
    getStatus: () => status,
  }));

  useEffect(() => {
    if (!monthKey) return;
    setStatus('loading');
    setData(null);

    let cancelled = false;

    const load = async () => {
      try {
        const [yr, mo] = monthKey.split('-').map(Number);
        const monthIndex = mo - 1;

        // Contexte du mois
        const ctx = await getActiveMonthContext(monthKey);
        if (cancelled) return;

        const monthStart = new Date(yr, monthIndex, 1);
        const monthEnd = new Date(yr, monthIndex + 1, 0);
        const monthStartStr = `${yr}-${String(mo).padStart(2, '0')}-01`;
        const monthEndStr = `${yr}-${String(mo).padStart(2, '0')}-${String(monthEnd.getDate()).padStart(2, '0')}`;

        // Charger toutes les données en parallèle
        const [
          employees,
          teams,
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
          appSettings,
          calculationSettings,
        ] = await Promise.all([
          base44.entities.Employee.filter({ is_active: true }),
          base44.entities.Team.filter({ is_active: true }),
          getActiveShiftsForMonth(monthKey, ctx.reset_version),
          base44.entities.NonShiftEvent.filter({ month_key: monthKey }).then(evs =>
            evs.filter(e => (e.reset_version ?? 0) >= ctx.reset_version && e.date >= monthStartStr && e.date <= monthEndStr)
          ),
          base44.entities.NonShiftType.filter({ is_active: true }),
          base44.entities.Position.filter({ is_active: true }),
          base44.entities.PaidLeavePeriod.filter({ month_key: monthKey }),
          base44.entities.HolidayDate.filter({ date: { $gte: `${yr}-01-01`, $lte: `${yr}-12-31` } }),
          base44.entities.MonthlyExportOverride.filter({ month_key: monthKey }),
          base44.entities.MonthlyRecapExtrasOverride.filter({ month_key: monthKey }),
          base44.entities.MonthlyRecapPersisted.filter({ month_key: monthKey }),
          base44.entities.WeeklyRecap.filter({ month_key: monthKey }),
          base44.entities.AppSettings.filter({ setting_key: 'compta_export' }),
          base44.entities.AppSettings.filter({ setting_key: 'planning_calculation_mode' }),
        ]);

        if (cancelled) return;

        const settings = appSettings[0] || {};
        const calculationMode = calculationSettings[0]?.planning_calculation_mode || 'disabled';

        setData({
          ctx,
          yr,
          monthIndex,
          monthKey,
          monthName: MONTHS[monthIndex],
          monthStart,
          monthEnd,
          employees,
          teams,
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
          settings,
          calculationMode,
        });
        setStatus('ready');
        onReady?.();
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          onError?.(err.message);
        }
      }
    };

    load();
    return () => { cancelled = true; };
  }, [monthKey]);

  if (!data || status !== 'ready') return null;

  return (
    <PlanningExportCapture
      ref={planningCaptureRef}
      year={data.yr}
      month={data.monthIndex}
      monthName={data.monthName}
      employees={data.employees}
      shifts={data.shifts}
      nonShiftEvents={data.nonShiftEvents}
      nonShiftTypes={data.nonShiftTypes}
      positions={data.positions}
      holidayDates={data.holidayDates}
    />
  );
});

export default SnapshotRenderer;