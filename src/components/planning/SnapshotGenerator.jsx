/**
 * SnapshotGenerator
 * Logique de génération PDF (planning + export compta) + upload + sauvegarde.
 * Import dynamique de html2canvas et jsPDF pour isolation totale de la page Planning.
 * Utilisé exclusivement depuis CoffrePlannings.
 */
import { calculateMonthlyRecap } from '@/components/utils/monthlyRecapCalculations';
import { resolveExportFinal } from '@/components/planning/resolveMonthlyPayrollValues';

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

function formatDateFR(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function parseContractHours(hoursStr) {
  if (!hoursStr) return null;
  const cleanStr = String(hoursStr).trim().replace(/h/gi, '').replace(/,/g, '.');
  const hours = parseFloat(cleanStr);
  return isNaN(hours) ? null : hours;
}

/**
 * Capture un élément DOM en tuiles verticales (max tileHeight px par tuile).
 * Retourne un tableau de { canvas, dataUrl } par tuile.
 */
async function captureTiles(el, scale, tileHeight) {
  const html2canvas = (await import('html2canvas')).default;

  const totalW = el.scrollWidth;
  const totalH = el.scrollHeight;
  const tiles = [];
  let yOffset = 0;

  while (yOffset < totalH) {
    const currentH = Math.min(tileHeight, totalH - yOffset);

    const canvas = await html2canvas(el, {
      scale,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      x: 0,
      y: yOffset,
      width: totalW,
      height: currentH,
      windowWidth: totalW,
      windowHeight: currentH,
    });

    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    tiles.push({ canvas, dataUrl, width: totalW, height: currentH });

    // Libérer la mémoire
    canvas.width = 0;
    canvas.height = 0;

    yOffset += currentH;

    // Yield CPU entre tuiles
    await new Promise(r => setTimeout(r, 50));
  }

  return tiles;
}

/**
 * Construit les données export compta (même logique que ExportComptaModal)
 */
function buildExportData(data) {
  const {
    employees, shifts, nonShiftEvents, nonShiftTypes, cpPeriods, holidayDates,
    recapsPersisted, recapExtrasOverrides, exportOverrides, weeklyRecaps,
    calculationMode, monthIndex, yr,
  } = data;

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

    // payees auto
    let payeesAuto = null;
    const monthly = parseContractHours(emp.contract_hours);
    if (monthly) {
      let deduction = 0;
      empNonShifts.forEach(ns => {
        const nsType = nonShiftTypes.find(t => t.id === ns.non_shift_type_id);
        if (nsType?.impacts_payroll === true) {
          const d = new Date(ns.date);
          const dayName = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][d.getDay()];
          if (emp.weekly_schedule?.[dayName]) {
            deduction += emp.weekly_schedule[dayName].worked ? (emp.weekly_schedule[dayName].hours || 0) : 0;
          } else {
            deduction += parseContractHours(emp.contract_hours_weekly) / (emp.work_days_per_week || 5);
          }
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
      return `${code} ${dates.length}j le ${formatDateFR(dates.sort()[0])}`;
    }).join('\n') || '';

    const cpStr = (cpPeriods || []).filter(cp => cp.employee_id === emp.id).map(cp => {
      const d = cp.cp_days_manual || cp.cp_days_auto || 0;
      return `${d} CP (départ le ${formatDateFR(cp.cp_start_date)}, reprise le ${formatDateFR(cp.return_date)})`;
    }).join('\n') || '';

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
      nonShiftsStr,
      cpStr,
    };

    const final = resolveExportFinal(autoExport, recapPersisted, recapExtras, exportOverride);

    const fh = final.ferie_heures || 0;
    const fd = final.ferie_jours || 0;
    const ferieStr = fd > 0 && fh > 0 ? `${fd}j, ${fh % 1 === 0 ? fh.toFixed(0) : fh.toFixed(1)}h` : '';
    const totalPaid = (final.payees_hors_sup_comp || 0)
      + (final.compl_10 || 0) + (final.compl_25 || 0)
      + (final.supp_25 || 0) + (final.supp_50 || 0)
      + (ferieStr ? fh : 0);

    return {
      employee: emp,
      employeeName: `${emp.first_name} ${emp.last_name}`,
      nbJoursTravailles: final.nb_jours_travailles || 0,
      joursSupp: (final.jours_supp || 0) > 0 ? `+${final.jours_supp}` : '',
      totalPaid,
      payeesHorsSup: final.payees_hors_sup_comp || 0,
      compl10: final.compl_10 || 0,
      compl25: final.compl_25 || 0,
      supp25: final.supp_25 || 0,
      supp50: final.supp_50 || 0,
      ferieStr,
      nonShiftsStr: final.non_shifts_visibles || '',
      cpStr: final.cp_decomptes || '',
    };
  }).filter(Boolean);
}

/**
 * Génère le PDF snapshot (planning + export compta) et retourne le Blob.
 * @param {HTMLElement} planningEl - élément offscreen du PlanningExportCapture
 * @param {object} data - données chargées par SnapshotRenderer
 * @param {function} onProgress - callback(message)
 */
export async function generateSnapshotPDF(planningEl, data, onProgress) {
  const { jsPDF } = await import('jspdf');
  await import('jspdf-autotable');

  const { yr, monthIndex, monthName, settings } = data;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;

  // ── Page 1 : Export compta ────────────────────────────────────────────────
  onProgress?.('Calcul des données de paie…');

  const exportData = buildExportData(data);
  const totals = exportData.reduce((acc, row) => ({
    nbJoursTravailles: acc.nbJoursTravailles + (row.nbJoursTravailles || 0),
    totalPaid: acc.totalPaid + row.totalPaid,
    payeesHorsSup: acc.payeesHorsSup + row.payeesHorsSup,
    compl10: acc.compl10 + row.compl10,
    compl25: acc.compl25 + row.compl25,
    supp25: acc.supp25 + row.supp25,
    supp50: acc.supp50 + row.supp50,
  }), { nbJoursTravailles:0, totalPaid:0, payeesHorsSup:0, compl10:0, compl25:0, supp25:0, supp50:0 });

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(settings.etablissement_name || 'Établissement', margin, margin + 8);
  doc.setFontSize(12);
  doc.text(`Éléments de paie – ${monthName} ${yr}`, margin, margin + 15);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(128, 128, 128);
  doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, margin, margin + 20);
  doc.setTextColor(0, 0, 0);

  const tableBody = exportData.map(row => [
    row.employeeName,
    row.nbJoursTravailles || 0,
    row.joursSupp || '',
    row.totalPaid.toFixed(1) + 'h',
    row.payeesHorsSup.toFixed(1) + 'h',
    row.compl10 > 0 ? row.compl10.toFixed(1) + 'h' : '',
    row.compl25 > 0 ? row.compl25.toFixed(1) + 'h' : '',
    row.supp25 > 0 ? row.supp25.toFixed(1) + 'h' : '',
    row.supp50 > 0 ? row.supp50.toFixed(1) + 'h' : '',
    row.ferieStr || '',
    row.nonShiftsStr || '',
    row.cpStr || '',
  ]);

  tableBody.push([
    'TOTAL', totals.nbJoursTravailles, '',
    totals.totalPaid.toFixed(1) + 'h',
    totals.payeesHorsSup.toFixed(1) + 'h',
    totals.compl10 > 0 ? totals.compl10.toFixed(1) + 'h' : '',
    totals.compl25 > 0 ? totals.compl25.toFixed(1) + 'h' : '',
    totals.supp25 > 0 ? totals.supp25.toFixed(1) + 'h' : '',
    totals.supp50 > 0 ? totals.supp50.toFixed(1) + 'h' : '',
    '', '', '',
  ]);

  doc.autoTable({
    startY: margin + 25,
    head: [['Employé', 'Nb j.\ntrav.', 'J.supp', 'Total payé', 'Payées\n(hors sup)', 'C+10%', 'C+25%', 'S+25%', 'S+50%', 'Férié', 'Non-shifts', 'CP']],
    body: tableBody,
    styles: { fontSize: 7, cellPadding: { top: 1.5, right: 1, bottom: 1.5, left: 1 }, overflow: 'linebreak' },
    headStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 6.5 },
    columnStyles: {
      0: { cellWidth: 30 }, 1: { cellWidth: 9, halign: 'center' }, 2: { cellWidth: 9, halign: 'center' },
      3: { cellWidth: 18, halign: 'right', fillColor: [219, 234, 254], fontStyle: 'bold' },
      4: { cellWidth: 17, halign: 'right' }, 5: { cellWidth: 12, halign: 'right' },
      6: { cellWidth: 12, halign: 'right' }, 7: { cellWidth: 11, halign: 'right' },
      8: { cellWidth: 11, halign: 'right' }, 9: { cellWidth: 13, halign: 'center', fontSize: 6 },
      10: { cellWidth: 38, fontSize: 6 }, 11: { cellWidth: 36, fontSize: 6 },
    },
    didParseCell: (d) => {
      if (d.row.index === tableBody.length - 1) {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fillColor = [229, 231, 235];
      }
    },
    margin: { left: margin, right: margin },
  });

  doc.setFontSize(7);
  doc.setTextColor(128, 128, 128);
  doc.text('Page 1 – Récapitulatif de paie', pageW / 2, pageH - 5, { align: 'center' });

  // ── Pages 2+ : Planning (tuiles verticales) ───────────────────────────────
  onProgress?.('Capture du planning en cours…');

  const scale = planningEl.scrollWidth > 2400 ? 1.8 : 2.2;
  const tileHeight = 1400;

  const tiles = await captureTiles(planningEl, scale, tileHeight);
  const totalRealH = planningEl.scrollHeight;
  const totalRealW = planningEl.scrollWidth;

  for (let i = 0; i < tiles.length; i++) {
    onProgress?.(`Planning – tuile ${i + 1}/${tiles.length}…`);
    const tile = tiles[i];

    doc.addPage('a4', 'landscape');
    doc.setTextColor(0, 0, 0);

    const titleY = margin + 5;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Planning ${monthName} ${yr}${tiles.length > 1 ? ` (${i + 1}/${tiles.length})` : ''}`, pageW / 2, titleY, { align: 'center' });

    if (settings.etablissement_name) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 80, 80);
      doc.text(settings.etablissement_name, pageW / 2, titleY + 5, { align: 'center' });
      doc.setTextColor(0, 0, 0);
    }

    const imgY = titleY + (settings.etablissement_name ? 9 : 5);
    const availW = pageW - 2 * margin;
    const availH = pageH - imgY - 8;

    // Ratio réel de la tuile
    const tileRatio = (tile.height / scale) / (totalRealH / scale);
    const naturalTileH = (tile.height / scale);
    const naturalTileW = totalRealW;

    const scaleW = availW / naturalTileW;
    const scaleH2 = availH / naturalTileH;
    const drawScale = Math.min(scaleW, scaleH2);

    const drawW = naturalTileW * drawScale;
    const drawH = naturalTileH * drawScale;
    const xOff = margin + (availW - drawW) / 2;

    doc.addImage(tile.dataUrl, 'JPEG', xOff, imgY, drawW, drawH);

    doc.setFontSize(7);
    doc.setTextColor(128, 128, 128);
    doc.text(`Page ${i + 2} – Planning${tiles.length > 1 ? ` (${i + 1}/${tiles.length})` : ''}`, pageW / 2, pageH - 5, { align: 'center' });
  }

  onProgress?.('Finalisation du PDF…');
  return { blob: doc.output('blob'), exportRowsCount: exportData.length };
}