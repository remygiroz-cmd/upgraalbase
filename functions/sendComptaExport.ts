import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { year, month, monthName, payrollData, totals, settings, customMessage } = await req.json();

    // Validate settings
    if (!settings.emailCompta || !settings.etablissementName || !settings.responsableName || !settings.responsableEmail) {
      return Response.json({ error: 'Paramètres comptabilité incomplets' }, { status: 400 });
    }

    // Generate HTML for PDF 1: Récapitulatif paie
    const htmlRecap = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4 landscape; margin: 15mm; }
    body { font-family: Arial, sans-serif; font-size: 9pt; margin: 0; padding: 0; }
    .header { margin-bottom: 20px; }
    .header h1 { font-size: 18pt; margin: 0 0 5px 0; color: #333; }
    .header h2 { font-size: 14pt; margin: 0 0 5px 0; color: #666; }
    .header p { font-size: 8pt; color: #999; margin: 0; }
    table { width: 100%; border-collapse: collapse; font-size: 8pt; margin-top: 10px; }
    th { background-color: #f3f4f6; padding: 6px 4px; text-align: left; font-weight: bold; border: 1px solid #d1d5db; font-size: 7pt; }
    th.right, td.right { text-align: right; }
    td { padding: 5px 4px; border: 1px solid #e5e7eb; font-size: 7pt; }
    tr.total { background-color: #e5e7eb; font-weight: bold; }
    .highlight { background-color: #dbeafe; font-weight: bold; }
    .small { font-size: 6pt; color: #6b7280; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${settings.etablissementName}</h1>
    <h2>Éléments pour établir les fiches de paie - ${monthName} ${year}</h2>
    <p>Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}</p>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width: 12%;">Employé</th>
        <th style="width: 10%;">Poste</th>
        <th style="width: 8%;">Contrat</th>
        <th class="right" style="width: 6%;">Base</th>
        <th class="right" style="width: 6%;">Décomp.</th>
        <th class="right" style="width: 6%;">Payée</th>
        <th class="right" style="width: 6%;">Effect.</th>
        <th class="right" style="width: 6%;">C+10%</th>
        <th class="right" style="width: 6%;">C+25%</th>
        <th class="right" style="width: 6%;">S+25%</th>
        <th class="right" style="width: 6%;">S+50%</th>
        <th class="right" style="width: 7%;">Total</th>
        <th style="width: 10%;">Absences</th>
        <th class="right" style="width: 5%;">CP</th>
      </tr>
    </thead>
    <tbody>
      ${payrollData.map(data => `
        <tr>
          <td>${data.employeeName}</td>
          <td>${data.team || data.position || '-'}</td>
          <td>${data.contractType}<br><span class="small">${data.workTimeType === 'Temps plein' ? 'TP' : 'PT'}</span></td>
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
</body>
</html>
    `;

    // Generate HTML for PDF 2: Planning simplifié
    const htmlPlanning = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4 landscape; margin: 20mm; }
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
    .header { text-align: center; margin-bottom: 30px; }
    .header h1 { font-size: 24pt; margin: 0 0 10px 0; color: #333; }
    .header p { font-size: 11pt; color: #666; margin: 5px 0; }
    .info-box { background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin-top: 20px; }
    .info-box p { margin: 5px 0; font-size: 10pt; color: #374151; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Planning ${monthName} ${year}</h1>
    <p>${settings.etablissementName}</p>
    <p style="font-size: 9pt; color: #999;">Document généré depuis UpGraal le ${new Date().toLocaleDateString('fr-FR')}</p>
  </div>
  <div class="info-box">
    <p><strong>📋 Planning mensuel complet</strong></p>
    <p>Ce document accompagne le récapitulatif des éléments de paie.</p>
    <p>Pour consulter le planning détaillé avec tous les shifts et horaires, veuillez vous connecter à l'application UpGraal.</p>
  </div>
</body>
</html>
    `;

    // Upload HTML files
    const htmlRecapBlob = new Blob([htmlRecap], { type: 'text/html' });
    const htmlPlanningBlob = new Blob([htmlPlanning], { type: 'text/html' });

    const recapUpload = await base44.asServiceRole.integrations.Core.UploadFile({ file: htmlRecapBlob });
    const planningUpload = await base44.asServiceRole.integrations.Core.UploadFile({ file: htmlPlanningBlob });

    const recapUrl = recapUpload.file_url;
    const planningUrl = planningUpload.file_url;

    // Send email via Resend with download links
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    
    const emailBody = `Bonjour,

${customMessage ? customMessage + '\n\n' : ''}Veuillez trouver ci-dessous les éléments pour établir les fiches de paie.

Cordialement,
${settings.responsableName}
${settings.responsableCoords || ''}`;

    const htmlBody = `
      <p>Bonjour,</p>
      ${customMessage ? `<p>${customMessage.replace(/\n/g, '<br>')}</p>` : ''}
      <p>Veuillez trouver ci-dessous les éléments pour établir les fiches de paie.</p>
      <p style="margin: 20px 0;">
        <a href="${recapUrl}" style="display: inline-block; margin: 10px 10px 10px 0; padding: 12px 24px; background-color: #f97316; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">📄 Récapitulatif paie (HTML)</a>
        <a href="${planningUrl}" style="display: inline-block; margin: 10px 0; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">📅 Planning mensuel (HTML)</a>
      </p>
      <p style="font-size: 12px; color: #6b7280; background: #f3f4f6; padding: 12px; border-radius: 6px;">
        💡 <strong>Pour convertir en PDF :</strong> Ouvrez chaque document dans votre navigateur, puis utilisez <strong>Imprimer > Enregistrer en PDF</strong>.
      </p>
      <p>Cordialement,<br>${settings.responsableName}<br>${settings.responsableCoords ? settings.responsableCoords.replace(/\n/g, '<br>') : ''}</p>
    `;

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${settings.etablissementName} <onboarding@resend.dev>`,
        reply_to: settings.responsableEmail,
        to: [settings.emailCompta],
        subject: 'Éléments pour établir les fiches de paie',
        html: htmlBody,
        text: emailBody
      })
    });

    if (!emailResponse.ok) {
      const error = await emailResponse.json();
      throw new Error('Erreur envoi email: ' + JSON.stringify(error));
    }

    return Response.json({ success: true });

  } catch (error) {
    console.error('Error in sendComptaExport:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});