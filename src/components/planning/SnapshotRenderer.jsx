/**
 * SnapshotRenderer
 * Monte 2 containers DOM offscreen (planning + export compta) pour capture fidèle.
 * Appelle onReady({ planningEl, exportEl, data }) une fois les DOM stabilisés.
 * Anti-429 : requêtes séquentielles uniquement.
 */
import React, { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { getActiveMonthContext } from '@/components/planning/monthContext';
import { getActiveShiftsForMonth } from '@/components/planning/shiftService';
import PlanningExportCapture from '@/components/planning/PlanningExportCapture';
import { calculateMonthlyRecap } from '@/components/utils/monthlyRecapCalculations';
import { resolveExportFinal } from '@/components/planning/resolveMonthlyPayrollValues';

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const SNAP_LOG = [];

function snapLog(step, detail = '') {
  const entry = { step, detail, t: Date.now() };
  SNAP_LOG.push(entry);
  console.log(`[Snapshot] ${step}${detail ? ' — ' + detail : ''}`);
}

export function getSnapshotLogs() {
  return SNAP_LOG.slice();
}

function formatDateFR(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function parseContractHours(hoursStr) {
  if (!hoursStr) return null;
  const h = parseFloat(String(hoursStr).replace(/h/gi, '').replace(/,/g, '.'));
  return isNaN(h) ? null : h;
}

function buildExportRows(data) {
  const { employees, shifts, nonShiftEvents, nonShiftTypes, cpPeriods, holidayDates,
    recapsPersisted, recapExtrasOverrides, exportOverrides, weeklyRecaps,
    calculationMode, monthIndex, yr } = data;

  const hdStrings = (holidayDates || []).map(h => h.date || h);

  return employees.map(emp => {
    const empShifts = shifts.filter(s => s.employee_id === emp.id);
    const empNonShifts = nonShiftEvents.filter(e => e.employee_id === emp.id);
    if (empShifts.length === 0 && empNonShifts.length === 0) return null;

    const empWeeklyRecaps = (weeklyRecaps || []).filter(wr => wr.employee_id === emp.id);
    const autoRecap = calculateMonthlyRecap(
      calculationMode, emp, empShifts, empNonShifts, nonShiftTypes,
      hdStrings, yr, monthIndex, empWeeklyRecaps
    );

    const recapPersisted = (recapsPersisted || []).find(r => r.employee_id === emp.id) || null;
    const recapExtras = (recapExtrasOverrides || []).find(r => r.employee_id === emp.id) || null;
    const exportOverride = (exportOverrides || []).find(o => o.employee_id === emp.id) || null;

    let payeesAuto = null;
    const monthly = parseContractHours(emp.contract_hours);
    if (monthly) {
      let deduction = 0;
      empNonShifts.forEach(ns => {
        const nsType = nonShiftTypes.find(t => t.id === ns.non_shift_type_id);
        if (nsType?.impacts_payroll === true) {
          const d = new Date(ns.date);
          const dayName = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][d.getDay()];
          deduction += emp.weekly_schedule?.[dayName]?.worked
            ? (emp.weekly_schedule[dayName].hours || 0)
            : (parseContractHours(emp.contract_hours_weekly) || monthly / 4.33) / (emp.work_days_per_week || 5);
        }
      });
      payeesAuto = Math.max(0, monthly - deduction);
    }

    const nonShiftsByType = {};
    empNonShifts.forEach(ns => {
      const nsType = nonShiftTypes.find(t => t.id === ns.non_shift_type_id);
      if (nsType?.visible_in_recap) {
        if (!nonShiftsByType[nsType.id]) nonShiftsByType[nsType.id] = { type: nsType, dates: [] };
        nonShiftsByType[nsType.id].dates.push(ns.date);
      }
    });
    const nonShiftsStr = Object.values(nonShiftsByType).map(({ type, dates }) => {
      const code = type.code || type.label?.substring(0, 3).toUpperCase();
      return `${code} ${dates.length}j`;
    }).join(' / ') || '';

    const cpStr = (cpPeriods || []).filter(cp => cp.employee_id === emp.id).map(cp => {
      const d = cp.cp_days_manual || cp.cp_days_auto || 0;
      return `${d}j CP`;
    }).join(', ') || '';

    const autoExport = {
      nbJoursTravailles: autoRecap?.workedDays || 0,
      joursSupp: autoRecap?.extraDays || 0,
      payeesHorsSup: payeesAuto ?? autoRecap?.workedHours ?? 0,
      compl10: autoRecap?.complementaryHours10 || 0,
      compl25: autoRecap?.complementaryHours25 || 0,
      supp25: autoRecap?.overtimeHours25 || 0,
      supp50: autoRecap?.overtimeHours50 || 0,
      ferieDays: autoRecap?.ferieDays || null,
      ferieHours: autoRecap?.ferieHours || null,
      nonShiftsStr, cpStr,
    };

    const final = resolveExportFinal(autoExport, recapPersisted, recapExtras, exportOverride);
    const fh = final.ferie_heures || 0;
    const fd = final.ferie_jours || 0;
    const totalPaid = (final.payees_hors_sup_comp || 0) + (final.compl_10 || 0) + (final.compl_25 || 0)
      + (final.supp_25 || 0) + (final.supp_50 || 0) + (fd > 0 ? fh : 0);

    return {
      employeeName: `${emp.first_name} ${emp.last_name}`,
      position: emp.position || '', team: emp.team || '',
      nbJoursTravailles: final.nb_jours_travailles || 0,
      joursSupp: final.jours_supp || 0,
      totalPaid,
      payeesHorsSup: final.payees_hors_sup_comp || 0,
      compl10: final.compl_10 || 0,
      compl25: final.compl_25 || 0,
      supp25: final.supp_25 || 0,
      supp50: final.supp_50 || 0,
      ferieJours: fd, ferieHeures: fh,
      nonShiftsStr: final.non_shifts_visibles || nonShiftsStr,
      cpStr: final.cp_decomptes || cpStr,
    };
  }).filter(Boolean);
}

/** Export compta HTML inline */
function ExportComptaCapture({ data, innerRef }) {
  if (!data) return null;
  const { yr, monthIndex, monthName, settings } = data;
  const rows = buildExportRows(data);
  const totals = rows.reduce((a, r) => ({
    jours: a.jours + r.nbJoursTravailles,
    total: a.total + r.totalPaid,
    payees: a.payees + r.payeesHorsSup,
    c10: a.c10 + r.compl10, c25: a.c25 + r.compl25,
    s25: a.s25 + r.supp25, s50: a.s50 + r.supp50,
  }), { jours:0, total:0, payees:0, c10:0, c25:0, s25:0, s50:0 });

  const tdS = { border: '1px solid #e5e7eb', padding: '4px 5px', fontSize: 11, verticalAlign: 'top' };
  const thS = { ...tdS, background: '#f3f4f6', fontWeight: 'bold', fontSize: 10 };

  return (
    <div
      ref={innerRef}
      style={{
        position: 'fixed',
        left: '-99999px',
        top: 0,
        background: '#ffffff',
        width: '1400px',
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: 11,
        color: '#111',
        padding: 20,
        boxSizing: 'border-box',
        zIndex: -1,
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 'bold', fontSize: 18, color: '#1f2937' }}>
          {settings?.etablissement_name || 'Établissement'}
        </div>
        <div style={{ fontSize: 14, color: '#374151', marginTop: 4 }}>
          Éléments de paie – {monthName} {yr}
        </div>
        <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 3 }}>
          Généré le {new Date().toLocaleDateString('fr-FR')} à {new Date().toLocaleTimeString('fr-FR')} via UpGraal
        </div>
      </div>

      <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: 150 }} />
          <col style={{ width: 45 }} />
          <col style={{ width: 40 }} />
          <col style={{ width: 75 }} />
          <col style={{ width: 70 }} />
          <col style={{ width: 55 }} />
          <col style={{ width: 55 }} />
          <col style={{ width: 55 }} />
          <col style={{ width: 55 }} />
          <col style={{ width: 55 }} />
          <col style={{ width: 130 }} />
          <col style={{ width: 120 }} />
        </colgroup>
        <thead>
          <tr>
            {['Employé','Nb j.','J.sup','Total payé','Payées\n(hors sup)','C+10%','C+25%','S+25%','S+50%','Férié','Non-shifts','CP'].map((h, i) => (
              <th key={i} style={{ ...thS, textAlign: i > 0 && i < 10 ? 'right' : 'left', whiteSpace: 'pre-line' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
              <td style={tdS}>{r.employeeName}</td>
              <td style={{ ...tdS, textAlign: 'right' }}>{r.nbJoursTravailles}</td>
              <td style={{ ...tdS, textAlign: 'right' }}>{r.joursSupp > 0 ? `+${r.joursSupp}` : ''}</td>
              <td style={{ ...tdS, textAlign: 'right', background: '#dbeafe', fontWeight: 'bold' }}>{r.totalPaid.toFixed(1)}h</td>
              <td style={{ ...tdS, textAlign: 'right' }}>{r.payeesHorsSup.toFixed(1)}h</td>
              <td style={{ ...tdS, textAlign: 'right', color: r.compl10 > 0 ? '#111' : '#ccc' }}>{r.compl10 > 0 ? r.compl10.toFixed(1)+'h' : '—'}</td>
              <td style={{ ...tdS, textAlign: 'right', color: r.compl25 > 0 ? '#111' : '#ccc' }}>{r.compl25 > 0 ? r.compl25.toFixed(1)+'h' : '—'}</td>
              <td style={{ ...tdS, textAlign: 'right', color: r.supp25 > 0 ? '#111' : '#ccc' }}>{r.supp25 > 0 ? r.supp25.toFixed(1)+'h' : '—'}</td>
              <td style={{ ...tdS, textAlign: 'right', color: r.supp50 > 0 ? '#111' : '#ccc' }}>{r.supp50 > 0 ? r.supp50.toFixed(1)+'h' : '—'}</td>
              <td style={{ ...tdS, textAlign: 'right', fontSize: 10 }}>
                {r.ferieJours > 0 ? `${r.ferieJours}j ${r.ferieHeures.toFixed(1)}h` : ''}
              </td>
              <td style={{ ...tdS, fontSize: 9.5 }}>{r.nonShiftsStr || ''}</td>
              <td style={{ ...tdS, fontSize: 9.5 }}>{r.cpStr || ''}</td>
            </tr>
          ))}
          <tr style={{ background: '#e5e7eb', fontWeight: 'bold' }}>
            <td style={tdS} colSpan={1}>TOTAL</td>
            <td style={{ ...tdS, textAlign: 'right' }}>{totals.jours}</td>
            <td style={tdS}></td>
            <td style={{ ...tdS, textAlign: 'right', background: '#bfdbfe', fontWeight: 'bold' }}>{totals.total.toFixed(1)}h</td>
            <td style={{ ...tdS, textAlign: 'right' }}>{totals.payees.toFixed(1)}h</td>
            <td style={{ ...tdS, textAlign: 'right' }}>{totals.c10 > 0 ? totals.c10.toFixed(1)+'h' : ''}</td>
            <td style={{ ...tdS, textAlign: 'right' }}>{totals.c25 > 0 ? totals.c25.toFixed(1)+'h' : ''}</td>
            <td style={{ ...tdS, textAlign: 'right' }}>{totals.s25 > 0 ? totals.s25.toFixed(1)+'h' : ''}</td>
            <td style={{ ...tdS, textAlign: 'right' }}>{totals.s50 > 0 ? totals.s50.toFixed(1)+'h' : ''}</td>
            <td style={tdS}></td>
            <td style={tdS}></td>
            <td style={tdS}></td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: 15, fontSize: 8, color: '#9ca3af', textAlign: 'center' }}>
        Page 2 — Récapitulatif de paie — UpGraal
      </div>
    </div>
  );
}

export default function SnapshotRenderer({ monthKey, onReady, onError }) {
  const [data, setData] = useState(null);
  const planningRef = useRef(null);
  const exportRef = useRef(null);
  const calledRef = useRef(false);
  const readyCalledRef = useRef(false);

  // ── 1. Chargement séquentiel des données (anti-429) ───────────────────────
  useEffect(() => {
    if (!monthKey || calledRef.current) return;
    calledRef.current = true;
    SNAP_LOG.length = 0;
    let cancelled = false;

    const load = async () => {
      try {
        snapLog('snapshot:loadStart', monthKey);
        const [yr, mo] = monthKey.split('-').map(Number);
        const monthIndex = mo - 1;

        snapLog('snapshot:getContext');
        const ctx = await getActiveMonthContext(monthKey);
        if (cancelled) return;
        snapLog('snapshot:contextOK', `v${ctx.reset_version}`);

        const monthEnd = new Date(yr, monthIndex + 1, 0);
        const monthStartStr = `${yr}-${String(mo).padStart(2, '0')}-01`;
        const monthEndStr = `${yr}-${String(mo).padStart(2, '0')}-${String(monthEnd.getDate()).padStart(2, '0')}`;

        // Requêtes séquentielles pour éviter 429
        snapLog('snapshot:fetchEmployees');
        const employees = await base44.entities.Employee.filter({ is_active: true });
        if (cancelled) return;

        snapLog('snapshot:fetchNonShiftTypes');
        const nonShiftTypes = await base44.entities.NonShiftType.filter({ is_active: true });
        if (cancelled) return;

        snapLog('snapshot:fetchPositions');
        const positions = await base44.entities.Position.filter({ is_active: true });
        if (cancelled) return;

        snapLog('snapshot:fetchShifts');
        const shifts = await getActiveShiftsForMonth(monthKey, ctx.reset_version);
        if (cancelled) return;
        snapLog('snapshot:shiftsOK', `${shifts.length} shifts`);

        snapLog('snapshot:fetchNonShiftEvents');
        const rawNSE = await base44.entities.NonShiftEvent.filter({ month_key: monthKey });
        const nonShiftEvents = rawNSE.filter(e =>
          (e.reset_version ?? 0) >= ctx.reset_version &&
          e.date >= monthStartStr && e.date <= monthEndStr
        );
        if (cancelled) return;

        snapLog('snapshot:fetchHolidays');
        const holidayDates = await base44.entities.HolidayDate.filter({
          date: { $gte: `${yr}-01-01`, $lte: `${yr}-12-31` }
        });
        if (cancelled) return;

        snapLog('snapshot:fetchCP');
        const cpPeriods = await base44.entities.PaidLeavePeriod.filter({ month_key: monthKey });
        if (cancelled) return;

        snapLog('snapshot:fetchWeeklyRecaps');
        const weeklyRecaps = await base44.entities.WeeklyRecap.filter({ month_key: monthKey });
        if (cancelled) return;

        snapLog('snapshot:fetchExportOverrides');
        const exportOverrides = await base44.entities.MonthlyExportOverride.filter({ month_key: monthKey });
        if (cancelled) return;

        snapLog('snapshot:fetchRecapExtras');
        const recapExtrasOverrides = await base44.entities.MonthlyRecapExtrasOverride.filter({ month_key: monthKey });
        if (cancelled) return;

        snapLog('snapshot:fetchRecapsPersisted');
        const recapsPersisted = await base44.entities.MonthlyRecapPersisted.filter({ month_key: monthKey });
        if (cancelled) return;

        snapLog('snapshot:fetchSettings');
        const appSettings = await base44.entities.AppSettings.filter({ setting_key: 'compta_export' });
        if (cancelled) return;
        const calcSettings = await base44.entities.AppSettings.filter({ setting_key: 'planning_calculation_mode' });
        if (cancelled) return;

        snapLog('snapshot:allDataLoaded', `${employees.length} empl, ${shifts.length} shifts`);

        const d = {
          ctx, yr, monthIndex, monthKey,
          monthName: MONTHS[monthIndex],
          monthStart: new Date(yr, monthIndex, 1),
          monthEnd,
          employees, shifts, nonShiftEvents, nonShiftTypes, positions,
          cpPeriods, holidayDates, exportOverrides, recapExtrasOverrides,
          recapsPersisted, weeklyRecaps,
          settings: appSettings[0] || {},
          calculationMode: calcSettings[0]?.planning_calculation_mode || 'disabled',
        };

        if (!cancelled) setData(d);
      } catch (err) {
        if (!cancelled) {
          snapLog('snapshot:loadError', err.message);
          console.error('[SnapshotRenderer] Load error:', err);
          onError?.('Erreur chargement données : ' + err.message);
        }
      }
    };

    load();
    return () => { cancelled = true; };
  }, [monthKey]);

  // ── 2. Attente stabilisation DOM après rendu ──────────────────────────────
  useEffect(() => {
    if (!data || readyCalledRef.current) return;

    // On attend 2 RAF + fonts.ready pour s'assurer que le DOM est stable
    const waitForStable = async () => {
      snapLog('snapshot:waitingFonts');
      await document.fonts.ready;

      snapLog('snapshot:RAF1');
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      // Petite pause pour laisser le layout se calculer
      await new Promise(r => setTimeout(r, 200));

      const planningEl = planningRef.current;
      const exportEl = exportRef.current;

      if (!planningEl || !exportEl) {
        snapLog('snapshot:domMissing', `planningEl=${!!planningEl} exportEl=${!!exportEl}`);
        console.error('[SnapshotRenderer] DOM refs not available after RAF');
        onError?.('DOM offscreen non disponible après rendu');
        return;
      }

      const pw = planningEl.scrollWidth;
      const ph = planningEl.scrollHeight;
      const ew = exportEl.scrollWidth;
      const eh = exportEl.scrollHeight;

      snapLog('snapshot:domReady', `planning=${pw}×${ph} export=${ew}×${eh}`);

      if (pw === 0 || ph === 0 || ew === 0 || eh === 0) {
        snapLog('snapshot:domZero', 'Dimensions nulles');
        onError?.('DOM offscreen a des dimensions nulles');
        return;
      }

      readyCalledRef.current = true;
      snapLog('snapshot:rendererReady');
      onReady?.({ planningEl, exportEl, data });
    };

    waitForStable();
  }, [data]);

  if (!data) return null;

  return (
    <>
      {/* Container 1 : Planning */}
      <PlanningExportCapture
        ref={planningRef}
        year={data.yr}
        month={data.monthIndex}
        employees={data.employees}
        shifts={data.shifts}
        nonShiftEvents={data.nonShiftEvents}
        nonShiftTypes={data.nonShiftTypes}
        positions={data.positions}
        holidayDates={data.holidayDates}
        monthName={data.monthName}
      />

      {/* Container 2 : Export compta */}
      <ExportComptaCapture
        data={data}
        innerRef={exportRef}
      />
    </>
  );
}