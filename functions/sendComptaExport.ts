import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { pdfUrl, pdfFilename, monthName, year, settings, customMessage } = await req.json();

    // Validate settings
    if (!settings.emailCompta || !settings.etablissementName || !settings.responsableName || !settings.responsableEmail) {
      return Response.json({ error: 'Paramètres comptabilité incomplets' }, { status: 400 });
    }

    if (!pdfUrl) {
      return Response.json({ error: 'PDF URL manquant' }, { status: 400 });
    }

    console.log('Envoi email compta:', {
      to: settings.emailCompta,
      monthName,
      year,
      pdfUrl,
      pdfFilename
    });

    // Télécharger le PDF depuis l'URL
    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) {
      throw new Error('Impossible de récupérer le PDF');
    }

    const pdfBuffer = await pdfResponse.arrayBuffer();
    const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)));

    console.log('PDF téléchargé et encodé en base64, taille:', pdfBase64.length);

    // Send email via Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY non configurée');
    }
    
    const emailBody = `Bonjour,

${customMessage ? customMessage + '\n\n' : ''}Veuillez trouver ci-joint le document d'export comptable pour ${monthName} ${year}.

Ce document contient :
- Le tableau récapitulatif des éléments de paie
- Le planning mensuel complet

Cordialement,
${settings.responsableName}
${settings.responsableCoords || ''}`;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #f97316;">Éléments de paie - ${monthName} ${year}</h2>
        <p>Bonjour,</p>
        ${customMessage ? `<p style="background: #f3f4f6; padding: 12px; border-radius: 6px; border-left: 3px solid #f97316;">${customMessage.replace(/\n/g, '<br>')}</p>` : ''}
        <p>Veuillez trouver ci-joint le document d'export comptable pour ${monthName} ${year}.</p>
        
        <div style="background: #eff6ff; padding: 15px; border-radius: 6px; border-left: 3px solid #3b82f6; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #1e40af;">
            <strong>📎 Document joint :</strong><br>
            <span style="color: #374151;">${pdfFilename}</span>
          </p>
          <p style="margin: 8px 0 0 0; font-size: 13px; color: #6b7280;">
            Contient : tableau récapitulatif de paie + planning mensuel complet
          </p>
        </div>

        <p style="margin-top: 30px;">
          Cordialement,<br>
          <strong>${settings.responsableName}</strong><br>
          ${settings.responsableCoords ? settings.responsableCoords.replace(/\n/g, '<br>') : ''}
        </p>

        <p style="font-size: 11px; color: #999; margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 15px;">
          Document généré automatiquement via <strong>UpGraal</strong>
        </p>
      </div>
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
        subject: `Éléments de paie - ${monthName} ${year}`,
        html: htmlBody,
        text: emailBody,
        attachments: [
          {
            filename: pdfFilename,
            content: pdfBase64,
            content_type: 'application/pdf'
          }
        ]
      })
    });

    if (!emailResponse.ok) {
      const error = await emailResponse.json();
      console.error('Erreur Resend:', error);
      throw new Error('Erreur envoi email: ' + JSON.stringify(error));
    }

    const result = await emailResponse.json();
    console.log('Email envoyé avec succès:', result);

    return Response.json({ 
      success: true,
      emailId: result.id
    });

  } catch (error) {
    console.error('Error in sendComptaExport:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});