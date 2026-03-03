/**
 * SnapshotGenerator
 * Capture DOM en tuiles → PDF 2 pages (planning p1, export compta p2) → Blob.
 * Import dynamique de html2canvas + jsPDF (isolation totale de la page Planning).
 */

const SNAP_T = {};
function t(key) { SNAP_T[key] = performance.now(); }
function elapsed(key) { return SNAP_T[key] ? `${(performance.now() - SNAP_T[key]).toFixed(0)}ms` : '?'; }

/**
 * Capture un element DOM en tuiles verticales.
 * Libère chaque canvas après usage pour économiser la mémoire.
 */
async function captureTiles(el, scale, tileHeight, label, onProgress) {
  const html2canvas = (await import('html2canvas')).default;

  const totalW = el.scrollWidth;
  const totalH = el.scrollHeight;
  const tiles = [];
  let yOffset = 0;
  let tileIdx = 0;

  console.log(`[SnapshotGenerator] captureTiles: ${label} — ${totalW}×${totalH} @scale${scale}`);

  if (totalW === 0 || totalH === 0) {
    throw new Error(`Dimensions nulles pour ${label}: ${totalW}×${totalH}`);
  }

  while (yOffset < totalH) {
    const currentH = Math.min(tileHeight, totalH - yOffset);
    tileIdx++;
    onProgress?.(`Capture ${label} tuile ${tileIdx}…`);
    console.log(`[SnapshotGenerator] Tuile ${tileIdx} y=${yOffset} h=${currentH}`);

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

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    tiles.push({ dataUrl, naturalW: totalW, naturalH: currentH });

    // Libérer la mémoire du canvas
    canvas.width = 0;
    canvas.height = 0;

    yOffset += currentH;
    // Yield event loop
    await new Promise(r => setTimeout(r, 30));
  }

  console.log(`[SnapshotGenerator] captureTiles: ${label} → ${tiles.length} tuile(s) OK`);
  return tiles;
}

/**
 * Ajoute des tuiles dans le PDF sur une ou plusieurs pages A4 paysage.
 * Chaque tuile = image dans la page, calculée au ratio naturel.
 */
function addTilesToPDF(doc, tiles, naturalTotalW, pageTitle, pageLabel, margin = 10) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  for (let i = 0; i < tiles.length; i++) {
    if (i > 0) doc.addPage();

    const tile = tiles[i];
    const titleH = 14;
    const availW = pageW - 2 * margin;
    const availH = pageH - margin - titleH - 8;

    // Ratio pour tenir dans la page
    const scaleW = availW / tile.naturalW;
    const scaleH = availH / tile.naturalH;
    const drawScale = Math.min(scaleW, scaleH);

    const drawW = tile.naturalW * drawScale;
    const drawH = tile.naturalH * drawScale;
    const xOff = margin + (availW - drawW) / 2;
    const yOff = margin + titleH;

    // Titre de page
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text(`${pageTitle}${tiles.length > 1 ? ` (${i+1}/${tiles.length})` : ''}`, margin, margin + 7);

    doc.addImage(tile.dataUrl, 'JPEG', xOff, yOff, drawW, drawH);

    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.setFont('helvetica', 'normal');
    doc.text(pageLabel + (tiles.length > 1 ? ` — partie ${i+1}/${tiles.length}` : ''), pageW / 2, pageH - 4, { align: 'center' });
    doc.setTextColor(0, 0, 0);
  }
}

/**
 * Point d'entrée principal.
 * @param {HTMLElement} planningEl — container DOM offscreen planning
 * @param {HTMLElement} exportEl — container DOM offscreen export compta
 * @param {object} data — données brutes chargées par SnapshotRenderer
 * @param {function} onProgress — callback(msg)
 * @returns {{ blob: Blob, exportRowsCount: number }}
 */
export async function generateSnapshotPDF(planningEl, exportEl, data, onProgress) {
  const { jsPDF } = await import('jspdf');

  const { yr, monthIndex, monthName } = data;

  // Vérifications pré-capture
  if (!planningEl) throw new Error('planningEl manquant');
  if (!exportEl) throw new Error('exportEl manquant');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const margin = 10;

  // ── PAGE 1 : Planning ─────────────────────────────────────────────────────
  onProgress?.('Capture du planning…');
  t('planning');

  const planningScale = planningEl.scrollWidth > 2000 ? 1.8 : 2.2;
  console.log(`[SnapshotGenerator] Planning DOM: ${planningEl.scrollWidth}×${planningEl.scrollHeight} @scale${planningScale}`);

  const planningTiles = await captureTiles(planningEl, planningScale, 1600, 'Planning', onProgress);
  console.log(`[SnapshotGenerator] snapshot:capturePlanningDone (${elapsed('planning')})`);

  addTilesToPDF(
    doc,
    planningTiles,
    planningEl.scrollWidth,
    `Planning ${monthName} ${yr}`,
    'Page 1 – Planning mensuel',
    margin
  );

  // ── PAGE 2 : Export compta ────────────────────────────────────────────────
  onProgress?.('Capture de l\'export comptable…');
  t('export');

  const exportScale = 2.0;
  console.log(`[SnapshotGenerator] Export DOM: ${exportEl.scrollWidth}×${exportEl.scrollHeight} @scale${exportScale}`);

  const exportTiles = await captureTiles(exportEl, exportScale, 2400, 'Export compta', onProgress);
  console.log(`[SnapshotGenerator] snapshot:captureExportDone (${elapsed('export')})`);

  doc.addPage();
  addTilesToPDF(
    doc,
    exportTiles,
    exportEl.scrollWidth,
    `Éléments de paie – ${monthName} ${yr}`,
    'Page 2 – Récapitulatif comptable',
    margin
  );

  onProgress?.('Finalisation du PDF…');
  const blob = doc.output('blob');

  if (blob.size === 0) throw new Error('PDF généré fait 0 octet');
  console.log(`[SnapshotGenerator] PDF OK: ${(blob.size / 1024).toFixed(0)} Ko`);

  // Compter les lignes export (approx)
  const exportRowsCount = data.employees?.filter(emp => {
    const hasShifts = data.shifts?.some(s => s.employee_id === emp.id);
    const hasNS = data.nonShiftEvents?.some(e => e.employee_id === emp.id);
    return hasShifts || hasNS;
  }).length || 0;

  return { blob, exportRowsCount };
}