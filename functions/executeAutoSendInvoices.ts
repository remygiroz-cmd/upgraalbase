import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function sendEmail(to, subject, html, attachments) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `UpGraal <onboarding@resend.dev>`,
      to,
      subject,
      html,
      attachments,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Resend API error: ${error.message}`);
  }

  return response.json();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Seuls les admins peuvent exécuter
    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { test_mode = false } = await req.json().catch(() => ({}));

    // Récupérer la configuration
    const configs = await base44.asServiceRole.entities.InvoiceSettings.filter({ setting_key: 'auto_send_config' });
    const config = configs[0];

    if (!config || !config.auto_send_enabled) {
      return Response.json({ 
        message: 'Envoi automatique désactivé',
        invoices_to_send: 0
      });
    }

    if (!config.recipients || config.recipients.length === 0) {
      return Response.json({ error: 'Aucun destinataire configuré' }, { status: 400 });
    }

    // Récupérer toutes les factures
    const allInvoices = await base44.asServiceRole.entities.Invoice.list('-created_date', 1000);

    // Filtrer selon les statuts configurés et règles de sécurité
    const invoicesToSend = allInvoices.filter(inv => {
      // Règle absolue : ne JAMAIS renvoyer une facture déjà envoyée automatiquement
      if (inv.status === 'envoyee' && inv.last_sent_method === 'automatic') {
        return false;
      }

      // Vérifier inclusion des statuts
      if (inv.status === 'non_envoyee' && config.include_non_envoyee) return true;
      if (inv.status === 'a_verifier' && config.include_a_verifier) return true;
      
      // Ne jamais inclure les factures envoyées sauf si explicitement activé (désactivé par défaut)
      if (inv.status === 'envoyee' && config.include_envoyee) return true;

      return false;
    });

    if (test_mode) {
      return Response.json({
        message: 'Mode test - aucun email envoyé',
        invoices_to_send: invoicesToSend.length,
        invoices: invoicesToSend.map(inv => ({
          id: inv.id,
          supplier: inv.supplier,
          amount_ttc: inv.amount_ttc,
          status: inv.status
        }))
      });
    }

    if (invoicesToSend.length === 0) {
      // Logger l'exécution
      const execution_log = config.execution_log || [];
      execution_log.push({
        executed_at: new Date().toISOString(),
        invoices_sent: 0,
        success: true
      });

      await base44.asServiceRole.entities.InvoiceSettings.update(config.id, {
        execution_log: execution_log.slice(-50) // Garder les 50 derniers
      });

      return Response.json({
        message: 'Aucune facture à envoyer',
        invoices_sent: 0
      });
    }

    // Récupérer le nom de l'expéditeur
    const appSettings = await base44.asServiceRole.entities.AppSettings.filter({ setting_key: 'email_sender_name' });
    const senderName = appSettings[0]?.email_sender_name || 'UpGraal';

    let successCount = 0;
    let failedInvoices = [];

    if (config.group_in_one_email) {
      // Mode groupé : un seul email avec toutes les factures
      try {
        const attachments = [];
        
        for (const inv of invoicesToSend) {
          try {
            if (!inv.file_url) continue;

            // Télécharger le fichier
            const response = await fetch(inv.file_url);
            if (!response.ok) continue;

            const buffer = await response.arrayBuffer();
            const base64Content = btoa(
              new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
            );

            // Type MIME correct
            const mimeType = inv.file_mime || 
              (inv.file_name?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
            
            let filename = inv.normalized_file_name || inv.file_name || `facture_${inv.id}`;
            if (mimeType === 'image/jpeg' && !filename.toLowerCase().match(/\.(jpg|jpeg)$/)) {
              filename = filename.replace(/\.[^.]*$/, '') + '.jpg';
            } else if (mimeType === 'application/pdf' && !filename.toLowerCase().endsWith('.pdf')) {
              filename = filename + '.pdf';
            }

            // Limite 900 Ko
            if (buffer.byteLength <= 900 * 1024) {
              attachments.push({
                filename,
                content: base64Content,
                type: mimeType
              });
            }
          } catch (err) {
            console.error(`Erreur attachement facture ${inv.id}:`, err);
          }
        }

        // Construire l'email
        const emailBody = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #ea580c;">Envoi automatique de factures</h2>
  <p>Bonjour,</p>
  <p>Vous trouverez ci-joint ${invoicesToSend.length} facture(s) :</p>
  <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
    <thead>
      <tr style="background: #f3f4f6;">
        <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Date</th>
        <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Fournisseur</th>
        <th style="padding: 8px; text-align: right; border: 1px solid #e5e7eb;">Montant TTC</th>
      </tr>
    </thead>
    <tbody>
      ${invoicesToSend.map(inv => `
        <tr>
          <td style="padding: 8px; border: 1px solid #e5e7eb;">${inv.invoice_date || '-'}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb;">${inv.supplier || '-'}</td>
          <td style="padding: 8px; text-align: right; border: 1px solid #e5e7eb;">${inv.amount_ttc?.toFixed(2) || '-'} €</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  <p style="color: #6b7280; font-size: 12px;">
    Email envoyé automatiquement par ${senderName}
  </p>
</div>
`;

        // Envoyer l'email groupé
        await resend.emails.send({
          from: `${senderName} <onboarding@resend.dev>`,
          to: config.recipients,
          subject: `📄 ${invoicesToSend.length} facture(s) - ${new Date().toLocaleDateString('fr-FR')}`,
          html: emailBody,
          attachments: attachments.length > 0 ? attachments : undefined
        });

        // Mettre à jour toutes les factures
        for (const inv of invoicesToSend) {
          const send_history = inv.send_history || [];
          send_history.push({
            sent_at: new Date().toISOString(),
            sent_by: 'system',
            sent_by_name: 'Automatisation',
            method: 'automatic',
            recipient: config.recipients.join(', '),
            delivery_method: 'attachment',
            success: true
          });

          await base44.asServiceRole.entities.Invoice.update(inv.id, {
            status: 'envoyee',
            last_sent_at: new Date().toISOString(),
            last_sent_method: 'automatic',
            send_history
          });

          successCount++;
        }

      } catch (err) {
        console.error('Erreur envoi groupé:', err);
        failedInvoices = invoicesToSend.map(inv => inv.id);
      }

    } else {
      // Mode individuel : un email par facture
      for (const inv of invoicesToSend) {
        try {
          if (!inv.file_url) {
            failedInvoices.push(inv.id);
            continue;
          }

          // Télécharger le fichier
          const response = await fetch(inv.file_url);
          if (!response.ok) {
            failedInvoices.push(inv.id);
            continue;
          }

          const buffer = await response.arrayBuffer();
          const base64Content = btoa(
            new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
          );

          // Type MIME correct
          const mimeType = inv.file_mime || 
            (inv.file_name?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
          
          let filename = inv.normalized_file_name || inv.file_name || `facture_${inv.id}`;
          if (mimeType === 'image/jpeg' && !filename.toLowerCase().match(/\.(jpg|jpeg)$/)) {
            filename = filename.replace(/\.[^.]*$/, '') + '.jpg';
          } else if (mimeType === 'application/pdf' && !filename.toLowerCase().endsWith('.pdf')) {
            filename = filename + '.pdf';
          }

          const attachments = buffer.byteLength <= 900 * 1024 ? [{
            filename,
            content: base64Content,
            type: mimeType
          }] : undefined;

          // Email
          const emailBody = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #ea580c;">Facture - ${inv.supplier || 'Fournisseur'}</h2>
  <p>Bonjour,</p>
  <p>Vous trouverez ci-joint la facture suivante :</p>
  <ul>
    <li><strong>Fournisseur :</strong> ${inv.supplier || '-'}</li>
    <li><strong>Date :</strong> ${inv.invoice_date || '-'}</li>
    <li><strong>Montant TTC :</strong> ${inv.amount_ttc?.toFixed(2) || '-'} €</li>
    <li><strong>Description :</strong> ${inv.short_description || '-'}</li>
  </ul>
  <p style="color: #6b7280; font-size: 12px;">
    Email envoyé automatiquement par ${senderName}
  </p>
</div>
`;

          await resend.emails.send({
            from: `${senderName} <onboarding@resend.dev>`,
            to: config.recipients,
            subject: `📄 Facture ${inv.supplier || ''} - ${inv.invoice_date || ''}`,
            html: emailBody,
            attachments
          });

          // Mise à jour de la facture
          const send_history = inv.send_history || [];
          send_history.push({
            sent_at: new Date().toISOString(),
            sent_by: 'system',
            sent_by_name: 'Automatisation',
            method: 'automatic',
            recipient: config.recipients.join(', '),
            delivery_method: 'attachment',
            success: true
          });

          await base44.asServiceRole.entities.Invoice.update(inv.id, {
            status: 'envoyee',
            last_sent_at: new Date().toISOString(),
            last_sent_method: 'automatic',
            send_history
          });

          successCount++;

        } catch (err) {
          console.error(`Erreur facture ${inv.id}:`, err);
          failedInvoices.push(inv.id);
        }
      }
    }

    // Logger l'exécution
    const execution_log = config.execution_log || [];
    execution_log.push({
      executed_at: new Date().toISOString(),
      invoices_sent: successCount,
      success: failedInvoices.length === 0,
      error_message: failedInvoices.length > 0 ? `${failedInvoices.length} facture(s) en échec` : null
    });

    await base44.asServiceRole.entities.InvoiceSettings.update(config.id, {
      execution_log: execution_log.slice(-50)
    });

    return Response.json({
      message: 'Envoi automatique terminé',
      invoices_sent: successCount,
      invoices_failed: failedInvoices.length,
      failed_ids: failedInvoices
    });

  } catch (error) {
    console.error('Error executeAutoSendInvoices:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});