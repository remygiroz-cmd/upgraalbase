import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { jsPDF } from 'npm:jspdf@2.5.2';

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

    // Generate PDF 1: Récapitulatif paie
    const pdfRecap = new jsPDF('landscape', 'mm', 'a4');
    
    pdfRecap.setFontSize(16);
    pdfRecap.text(settings.etablissementName, 15, 15);
    pdfRecap.setFontSize(12);
    pdfRecap.text(`Éléments pour établir les fiches de paie - ${monthName} ${year}`, 15, 23);
    pdfRecap.setFontSize(8);
    pdfRecap.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, 15, 29);

    let y = 40;
    pdfRecap.setFontSize(7);
    pdfRecap.setFont(undefined, 'bold');
    
    const cols = [
      { x: 15, w: 35, label: 'Employé' },
      { x: 50, w: 20, label: 'Poste' },
      { x: 70, w: 15, label: 'Contrat' },
      { x: 85, w: 15, label: 'Base' },
      { x: 100, w: 15, label: 'Décomp.' },
      { x: 115, w: 15, label: 'Payée' },
      { x: 130, w: 15, label: 'Effect.' },
      { x: 145, w: 12, label: 'C+10%' },
      { x: 157, w: 12, label: 'C+25%' },
      { x: 169, w: 12, label: 'S+25%' },
      { x: 181, w: 12, label: 'S+50%' },
      { x: 193, w: 15, label: 'Total' },
      { x: 208, w: 30, label: 'Absences' },
      { x: 238, w: 12, label: 'CP' }
    ];

    cols.forEach(col => {
      pdfRecap.text(col.label, col.x, y);
    });

    y += 5;
    pdfRecap.setFont(undefined, 'normal');

    payrollData.forEach((data) => {
      if (y > 180) {
        pdfRecap.addPage();
        y = 20;
      }

      pdfRecap.setFontSize(7);
      pdfRecap.text(data.employeeName, 15, y);
      pdfRecap.text(data.team || data.position || '-', 50, y);
      pdfRecap.text(data.contractType + ' ' + (data.workTimeType === 'Temps plein' ? 'TP' : 'PT'), 70, y);
      pdfRecap.text(data.contractHours.toFixed(1) + 'h', 85, y);
      pdfRecap.text(data.deductedHours > 0 ? data.deductedHours.toFixed(1) + 'h' : '-', 100, y);
      pdfRecap.text(data.paidBaseHours.toFixed(1) + 'h', 115, y);
      pdfRecap.text(data.totalHours.toFixed(1) + 'h', 130, y);
      pdfRecap.text(data.complementary_10 > 0 ? data.complementary_10.toFixed(1) + 'h' : '-', 145, y);
      pdfRecap.text(data.complementary_25 > 0 ? data.complementary_25.toFixed(1) + 'h' : '-', 157, y);
      pdfRecap.text(data.overtime_25 > 0 ? data.overtime_25.toFixed(1) + 'h' : '-', 169, y);
      pdfRecap.text(data.overtime_50 > 0 ? data.overtime_50.toFixed(1) + 'h' : '-', 181, y);
      pdfRecap.setFont(undefined, 'bold');
      pdfRecap.text(data.totalPaidHours.toFixed(1) + 'h', 193, y);
      pdfRecap.setFont(undefined, 'normal');
      pdfRecap.text(data.nonShifts || '-', 208, y);
      pdfRecap.text(data.cpDays > 0 ? data.cpDays + 'j' : '-', 238, y);

      y += 6;
    });

    y += 3;
    pdfRecap.setFont(undefined, 'bold');
    pdfRecap.setFontSize(8);
    pdfRecap.text('TOTAL', 15, y);
    pdfRecap.text(totals.contractHours.toFixed(1) + 'h', 85, y);
    pdfRecap.text(totals.deductedHours.toFixed(1) + 'h', 100, y);
    pdfRecap.text(totals.paidBaseHours.toFixed(1) + 'h', 115, y);
    pdfRecap.text(totals.totalHours.toFixed(1) + 'h', 130, y);
    pdfRecap.text(totals.complementary_10.toFixed(1) + 'h', 145, y);
    pdfRecap.text(totals.complementary_25.toFixed(1) + 'h', 157, y);
    pdfRecap.text(totals.overtime_25.toFixed(1) + 'h', 169, y);
    pdfRecap.text(totals.overtime_50.toFixed(1) + 'h', 181, y);
    pdfRecap.text(totals.totalPaidHours.toFixed(1) + 'h', 193, y);

    const pdfRecapBytes = pdfRecap.output('arraybuffer');

    // Generate PDF 2: Planning (simplified)
    const pdfPlanning = new jsPDF('landscape', 'mm', 'a4');
    pdfPlanning.setFontSize(14);
    pdfPlanning.text(`Planning ${monthName} ${year}`, 15, 15);
    pdfPlanning.setFontSize(8);
    pdfPlanning.text(`${settings.etablissementName} - Document généré depuis UpGraal`, 15, 21);
    pdfPlanning.setFontSize(7);
    pdfPlanning.text('Voir le planning détaillé dans l\'application pour plus d\'informations', 15, 26);
    
    const pdfPlanningBytes = pdfPlanning.output('arraybuffer');

    // Send email
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    
    const emailBody = `Bonjour,

${customMessage ? customMessage + '\n\n' : ''}Veuillez trouver ci-dessous et ci-joint, les éléments pour établir les fiches de paie.

Cordialement,
${settings.responsableName}
${settings.responsableCoords || ''}`;

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
        text: emailBody,
        attachments: [
          {
            filename: `Elements_paie_${monthName}_${year}.pdf`,
            content: btoa(String.fromCharCode(...new Uint8Array(pdfRecapBytes)))
          },
          {
            filename: `Planning_${monthName}_${year}.pdf`,
            content: btoa(String.fromCharCode(...new Uint8Array(pdfPlanningBytes)))
          }
        ]
      })
    });

    if (!emailResponse.ok) {
      const error = await emailResponse.json();
      throw new Error('Erreur envoi email: ' + JSON.stringify(error));
    }

    return Response.json({ success: true });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});