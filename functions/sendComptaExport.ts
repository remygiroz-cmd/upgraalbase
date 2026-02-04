import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { htmlRecap, htmlPlanning, monthName, year, settings, customMessage } = await req.json();

    // Validate settings
    if (!settings.emailCompta || !settings.etablissementName || !settings.responsableName || !settings.responsableEmail) {
      return Response.json({ error: 'Paramètres comptabilité incomplets' }, { status: 400 });
    }

    // Validate HTML
    if (!htmlRecap || !htmlPlanning) {
      return Response.json({ error: 'HTML manquant' }, { status: 400 });
    }

    console.log('Envoi email compta:', {
      to: settings.emailCompta,
      monthName,
      year,
      htmlRecapSize: htmlRecap.length,
      htmlPlanningSize: htmlPlanning.length
    });

    // Upload HTML files to storage
    const htmlRecapBlob = new Blob([htmlRecap], { type: 'text/html' });
    const htmlPlanningBlob = new Blob([htmlPlanning], { type: 'text/html' });

    const recapUpload = await base44.asServiceRole.integrations.Core.UploadFile({ file: htmlRecapBlob });
    const planningUpload = await base44.asServiceRole.integrations.Core.UploadFile({ file: htmlPlanningBlob });

    const recapUrl = recapUpload.file_url;
    const planningUrl = planningUpload.file_url;

    console.log('Fichiers uploadés:', { recapUrl, planningUrl });

    // Send email via Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY non configurée');
    }
    
    const emailBody = `Bonjour,

${customMessage ? customMessage + '\n\n' : ''}Veuillez trouver ci-dessous les éléments pour établir les fiches de paie de ${monthName} ${year}.

Cordialement,
${settings.responsableName}
${settings.responsableCoords || ''}`;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #f97316;">Éléments de paie - ${monthName} ${year}</h2>
        <p>Bonjour,</p>
        ${customMessage ? `<p style="background: #f3f4f6; padding: 12px; border-radius: 6px; border-left: 3px solid #f97316;">${customMessage.replace(/\n/g, '<br>')}</p>` : ''}
        <p>Veuillez trouver ci-dessous les documents nécessaires pour établir les fiches de paie.</p>
        
        <div style="margin: 25px 0;">
          <a href="${recapUrl}" 
             style="display: inline-block; margin: 10px 10px 10px 0; padding: 14px 28px; background-color: #f97316; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">
            📄 Récapitulatif de paie
          </a>
          <a href="${planningUrl}" 
             style="display: inline-block; margin: 10px 0; padding: 14px 28px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">
            📅 Planning mensuel
          </a>
        </div>

        <div style="background: #eff6ff; padding: 15px; border-radius: 6px; border-left: 3px solid #3b82f6; margin-top: 20px;">
          <p style="margin: 0; font-size: 13px; color: #1e40af;">
            💡 <strong>Pour convertir en PDF :</strong><br>
            Cliquez sur chaque lien, puis dans votre navigateur : <strong>Ctrl+P</strong> (ou Cmd+P sur Mac) → <strong>"Enregistrer en PDF"</strong>
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
        text: emailBody
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