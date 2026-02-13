import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Rôles autorisés à envoyer des exports compta
const ALLOWED_ROLES = ['admin', 'manager', 'comptable'];

// Fonction pour échapper les caractères HTML dangereux (protection XSS)
const escapeHtml = (text: string | null | undefined): string => {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Vérification authentification
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Vérification des permissions
    if (!ALLOWED_ROLES.includes(user.role)) {
      console.warn(`[SECURITY] User ${user.id} attempted to send compta export without permission`);
      return Response.json({ error: 'Permissions insuffisantes' }, { status: 403 });
    }

    const { pdfUrl, pdfFilename, monthName, year, settings, customMessage } = await req.json();

    // Vérifier RESEND_API_KEY en premier
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      return Response.json({ error: 'Configuration email manquante (RESEND_API_KEY)' }, { status: 500 });
    }

    // Validate settings
    if (!settings.emailCompta || !settings.etablissementName || !settings.responsableName || !settings.responsableEmail) {
      return Response.json({ error: 'Paramètres comptabilité incomplets' }, { status: 400 });
    }

    if (!pdfUrl) {
      return Response.json({ error: 'PDF URL manquant' }, { status: 400 });
    }

    // Log sécurisé (sans données sensibles)
    console.log(`[INFO] Sending compta export for ${monthName} ${year}`);
    console.log(`[DEBUG] PDF URL: ${pdfUrl}`);

    // Télécharger le PDF depuis l'URL
    console.log('[INFO] Fetching PDF from URL...');
    const pdfResponse = await fetch(pdfUrl);
    console.log(`[INFO] Fetch response status: ${pdfResponse.status} ${pdfResponse.statusText}`);
    
    if (!pdfResponse.ok) {
      const errorBody = await pdfResponse.text();
      console.error('[ERROR] PDF fetch failed:', errorBody);
      throw new Error(`Impossible de récupérer le PDF (HTTP ${pdfResponse.status})`);
    }

    console.log('[INFO] Converting PDF to buffer...');
    const pdfBuffer = await pdfResponse.arrayBuffer();
    const pdfSize = pdfBuffer.byteLength;
    console.log(`[INFO] PDF buffer size: ${pdfSize} bytes`);

    if (pdfSize === 0) {
      throw new Error('Le PDF téléchargé est vide');
    }

    // Conversion base64 par chunks pour éviter stack overflow
    const uint8Array = new Uint8Array(pdfBuffer);
    const chunkSize = 8192;
    let base64String = '';
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize);
      base64String += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const pdfBase64 = btoa(base64String);

    // Échapper les données utilisateur pour éviter XSS
    const safeResponsableName = escapeHtml(settings.responsableName);
    const safeResponsableCoords = escapeHtml(settings.responsableCoords);
    const safeCustomMessage = escapeHtml(customMessage);
    const safePdfFilename = escapeHtml(pdfFilename);
    const safeMonthName = escapeHtml(monthName);
    const safeEtablissementName = escapeHtml(settings.etablissementName);

    // Préparer l'email
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
        <h2 style="color: #f97316;">Éléments de paie - ${safeMonthName} ${year}</h2>
        <p>Bonjour,</p>
        ${safeCustomMessage ? `<p style="background: #f3f4f6; padding: 12px; border-radius: 6px; border-left: 3px solid #f97316;">${safeCustomMessage.replace(/\n/g, '<br>')}</p>` : ''}
        <p>Veuillez trouver ci-joint le document d'export comptable pour ${safeMonthName} ${year}.</p>

        <div style="background: #eff6ff; padding: 15px; border-radius: 6px; border-left: 3px solid #3b82f6; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #1e40af;">
            <strong>📎 Document joint :</strong><br>
            <span style="color: #374151;">${safePdfFilename}</span>
          </p>
          <p style="margin: 8px 0 0 0; font-size: 13px; color: #6b7280;">
            Contient : tableau récapitulatif de paie + planning mensuel complet
          </p>
        </div>

        <p style="margin-top: 30px;">
          Cordialement,<br>
          <strong>${safeResponsableName}</strong><br>
          ${safeResponsableCoords ? safeResponsableCoords.replace(/\n/g, '<br>') : ''}
        </p>

        <p style="font-size: 11px; color: #999; margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 15px;">
          Document généré automatiquement via <strong>UpGraal</strong>
        </p>
      </div>
    `;

    console.log('[INFO] Sending email via Resend API...');
    console.log(`[DEBUG] To: ${settings.emailCompta}, From: ${safeEtablissementName} <noreply@upgraal.com>`);
    console.log(`[DEBUG] PDF base64 length: ${pdfBase64.length} chars`);
    
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${safeEtablissementName} <noreply@upgraal.com>`,
        reply_to: settings.responsableEmail,
        to: [settings.emailCompta],
        subject: `Éléments de paie - ${monthName} ${year}`,
        html: htmlBody,
        text: emailBody,
        attachments: [
          {
            filename: pdfFilename,
            content: pdfBase64,
            type: 'application/pdf'
          }
        ]
      })
    });

    console.log(`[INFO] Resend API response status: ${emailResponse.status}`);
    const result = await emailResponse.json();
    console.log('[INFO] Resend API result:', JSON.stringify(result));

    if (!emailResponse.ok) {
      // Messages d'erreur clairs selon le code HTTP
      let errorMessage = 'Erreur lors de l\'envoi de l\'email';
      if (emailResponse.status === 403) {
        errorMessage = 'Domaine d\'envoi non vérifié dans Resend';
      } else if (emailResponse.status === 422) {
        errorMessage = 'Adresse email invalide ou configuration incorrecte';
      } else if (result.message) {
        errorMessage = result.message;
      }

      return Response.json({
        error: errorMessage,
        status: emailResponse.status
      }, { status: emailResponse.status });
    }

    console.log(`[INFO] Compta export email sent successfully`);

    return Response.json({
      success: true,
      emailId: result.id,
      message: 'Email envoyé avec succès'
    });

  } catch (error) {
    console.error('[ERROR] sendComptaExport:', error.message);
    return Response.json({
      error: error.message
    }, { status: 500 });
  }
});