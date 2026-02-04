// Génération du HTML "print-ready" pour l'export comptable
export function generateRecapHTML(payrollData, totals, monthName, year, etablissementName) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Récapitulatif Paie - ${monthName} ${year}</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 15mm;
    }
    @media print {
      body { margin: 0; padding: 0; }
      .no-print { display: none !important; }
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: Arial, sans-serif;
      font-size: 9pt;
      margin: 0;
      padding: 20px;
      background: white;
    }
    .header {
      margin-bottom: 20px;
    }
    .header h1 {
      font-size: 18pt;
      margin: 0 0 5px 0;
      color: #333;
    }
    .header h2 {
      font-size: 14pt;
      margin: 0 0 5px 0;
      color: #666;
    }
    .header p {
      font-size: 8pt;
      color: #999;
      margin: 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 7.5pt;
      margin-top: 10px;
    }
    th {
      background-color: #f3f4f6;
      padding: 6px 3px;
      text-align: left;
      font-weight: bold;
      border: 1px solid #d1d5db;
      font-size: 7pt;
    }
    th.right, td.right { text-align: right; }
    td {
      padding: 5px 3px;
      border: 1px solid #e5e7eb;
      font-size: 7pt;
      vertical-align: top;
    }
    tr.total {
      background-color: #e5e7eb !important;
      font-weight: bold;
    }
    .highlight {
      background-color: #dbeafe !important;
      font-weight: bold;
    }
    .small {
      font-size: 6pt;
      color: #6b7280;
      display: block;
      margin-top: 2px;
    }
    .footer {
      margin-top: 20px;
      text-align: center;
      font-size: 7pt;
      color: #999;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${etablissementName || 'Établissement'}</h1>
    <h2>Éléments pour établir les fiches de paie - ${monthName} ${year}</h2>
    <p>Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}</p>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 11%;">Employé</th>
        <th style="width: 9%;">Poste</th>
        <th style="width: 7%;">Contrat</th>
        <th class="right" style="width: 5.5%;">Base</th>
        <th class="right" style="width: 5.5%;">Décomp.</th>
        <th class="right" style="width: 6%;">Payée</th>
        <th class="right" style="width: 5.5%;">Effect.</th>
        <th class="right" style="width: 5.5%;">C+10%</th>
        <th class="right" style="width: 5.5%;">C+25%</th>
        <th class="right" style="width: 5.5%;">S+25%</th>
        <th class="right" style="width: 5.5%;">S+50%</th>
        <th class="right" style="width: 6.5%;">Total</th>
        <th style="width: 12%;">Absences</th>
        <th class="right" style="width: 4.5%;">CP</th>
      </tr>
    </thead>
    <tbody>
      ${payrollData.map(data => `
        <tr>
          <td>${data.employeeName}</td>
          <td>${data.team || data.position || '-'}</td>
          <td>
            ${data.contractType}
            <span class="small">${data.workTimeType === 'Temps plein' ? 'TP' : 'PT'}</span>
          </td>
          <td class="right">${data.contractHours.toFixed(1)}h</td>
          <td class="right" style="color: #dc2626;">${data.deductedHours > 0 ? data.deductedHours.toFixed(1) + 'h' : '-'}</td>
          <td class="right highlight">${data.paidBaseHours.toFixed(1)}h</td>
          <td class="right" style="color: #6b7280;">${data.totalHours.toFixed(1)}h</td>
          <td class="right">${data.complementary_10 > 0 ? data.complementary_10.toFixed(1) + 'h' : '-'}</td>
          <td class="right">${data.complementary_25 > 0 ? data.complementary_25.toFixed(1) + 'h' : '-'}</td>
          <td class="right">${data.overtime_25 > 0 ? data.overtime_25.toFixed(1) + 'h' : '-'}</td>
          <td class="right">${data.overtime_50 > 0 ? data.overtime_50.toFixed(1) + 'h' : '-'}</td>
          <td class="right highlight">${data.totalPaidHours.toFixed(1)}h</td>
          <td class="small">${data.nonShifts || '-'}</td>
          <td class="right">${data.cpDays > 0 ? data.cpDays + 'j' : '-'}</td>
        </tr>
      `).join('')}
      <tr class="total">
        <td colspan="3">TOTAL</td>
        <td class="right">${totals.contractHours.toFixed(1)}h</td>
        <td class="right" style="color: #dc2626;">${totals.deductedHours.toFixed(1)}h</td>
        <td class="right highlight">${totals.paidBaseHours.toFixed(1)}h</td>
        <td class="right">${totals.totalHours.toFixed(1)}h</td>
        <td class="right">${totals.complementary_10.toFixed(1)}h</td>
        <td class="right">${totals.complementary_25.toFixed(1)}h</td>
        <td class="right">${totals.overtime_25.toFixed(1)}h</td>
        <td class="right">${totals.overtime_50.toFixed(1)}h</td>
        <td class="right highlight">${totals.totalPaidHours.toFixed(1)}h</td>
        <td colspan="2"></td>
      </tr>
    </tbody>
  </table>

  <div class="footer">
    Document généré automatiquement via UpGraal
  </div>
</body>
</html>
  `.trim();
}

export function generatePlanningHTML(monthName, year, etablissementName) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Planning - ${monthName} ${year}</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 20mm;
    }
    @media print {
      body { margin: 0; padding: 0; }
      .no-print { display: none !important; }
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 30px;
      background: white;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
    }
    .header h1 {
      font-size: 24pt;
      margin: 0 0 10px 0;
      color: #333;
    }
    .header p {
      font-size: 11pt;
      color: #666;
      margin: 5px 0;
    }
    .info-box {
      background-color: #f3f4f6;
      padding: 20px;
      border-radius: 8px;
      margin-top: 30px;
      border: 1px solid #e5e7eb;
    }
    .info-box p {
      margin: 8px 0;
      font-size: 10pt;
      color: #374151;
      line-height: 1.6;
    }
    .info-box strong {
      color: #1f2937;
    }
    .footer {
      margin-top: 40px;
      text-align: center;
      font-size: 8pt;
      color: #999;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Planning ${monthName} ${year}</h1>
    <p><strong>${etablissementName || 'Établissement'}</strong></p>
    <p style="font-size: 9pt; color: #999;">Document généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}</p>
  </div>

  <div class="info-box">
    <p><strong>📋 Planning mensuel complet</strong></p>
    <p>Ce document accompagne le récapitulatif des éléments de paie pour la période ${monthName} ${year}.</p>
    <p>Pour consulter le planning détaillé avec tous les horaires de travail, absences, congés payés et événements, veuillez vous connecter à l'application UpGraal.</p>
    <br>
    <p style="color: #6b7280; font-size: 9pt;">
      Le planning complet inclut : tous les employés, shifts quotidiens avec horaires précis, heures de pause, 
      statuts des absences (maladie, congés, etc.), et récapitulatifs hebdomadaires/mensuels.
    </p>
  </div>

  <div class="footer">
    Document généré automatiquement via UpGraal
  </div>
</body>
</html>
  `.trim();
}