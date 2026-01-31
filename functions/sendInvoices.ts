import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { invoice_ids, recipient, method = 'manual' } = await req.json();

    if (!invoice_ids || !invoice_ids.length || !recipient) {
      return Response.json({ error: 'invoice_ids and recipient are required' }, { status: 400 });
    }

    // Récupérer les factures
    const invoices = [];
    for (const id of invoice_ids) {
      const invoice = await base44.asServiceRole.entities.Invoice.get(id);
      invoices.push(invoice);
    }

    // Récupérer les informations de l'établissement
    const establishments = await base44.asServiceRole.entities.Establishment.list();
    const establishment = establishments[0] || {};

    // Télécharger et préparer les fichiers pour pièces jointes
    const attachments = [];
    console.log(`Processing ${invoices.length} invoices for attachments`);
    
    for (const inv of invoices) {
      console.log(`Processing invoice ${inv.id} - ${inv.supplier} - file_url: ${inv.file_url ? 'exists' : 'MISSING'}`);
      
      if (!inv.file_url) {
        console.error(`Invoice ${inv.id} (${inv.supplier}) has no file_url - SKIPPING`);
        continue;
      }
      
      try {
        console.log(`Downloading file for invoice ${inv.id} from ${inv.file_url}`);
        const fileResponse = await fetch(inv.file_url);
        
        if (!fileResponse.ok) {
          console.error(`Failed to download file for invoice ${inv.id} (${inv.supplier}) - HTTP ${fileResponse.status}`);
          continue;
        }
        
        const fileBlob = await fileResponse.blob();
        const fileBuffer = await fileBlob.arrayBuffer();
        console.log(`Downloaded ${fileBuffer.byteLength} bytes for invoice ${inv.id}`);
        
        const base64Content = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)));
        
        const filename = inv.normalized_file_name || inv.file_name || `facture_${inv.id}.pdf`;
        attachments.push({
          filename: filename,
          content: base64Content
        });
        
        console.log(`Successfully added attachment: ${filename}`);
      } catch (err) {
        console.error(`Error processing file for invoice ${inv.id} (${inv.supplier}):`, err.message);
      }
    }
    
    console.log(`Total attachments prepared: ${attachments.length}`);

    // Préparer le corps de l'email
    const totalTTC = invoices.reduce((sum, inv) => sum + (inv.amount_ttc || 0), 0);
    
    let htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #f97316;">Factures - ${new Date().toLocaleDateString('fr-FR')}</h2>
        <p>Bonjour,</p>
        <p>Veuillez trouver ci-joint ${invoices.length} facture(s) pour un montant total de <strong>${totalTTC.toFixed(2)} €</strong>.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="padding: 10px; text-align: left; border: 1px solid #e5e7eb;">Fournisseur</th>
              <th style="padding: 10px; text-align: left; border: 1px solid #e5e7eb;">Date</th>
              <th style="padding: 10px; text-align: right; border: 1px solid #e5e7eb;">Montant TTC</th>
            </tr>
          </thead>
          <tbody>
            ${invoices.map(inv => `
              <tr>
                <td style="padding: 10px; border: 1px solid #e5e7eb;">${inv.supplier || 'N/A'}</td>
                <td style="padding: 10px; border: 1px solid #e5e7eb;">${inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString('fr-FR') : 'N/A'}</td>
                <td style="padding: 10px; text-align: right; border: 1px solid #e5e7eb;">${(inv.amount_ttc || 0).toFixed(2)} €</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <p>Cordialement,<br>${user.full_name || user.email}</p>
      </div>
    `;

    // Récupérer le nom d'expéditeur depuis les paramètres
    let senderName = establishment.name || 'UpGraal';
    try {
      const settings = await base44.asServiceRole.entities.AppSettings.filter({ setting_key: 'email_sender_name' });
      if (settings.length > 0 && settings[0].email_sender_name) {
        senderName = settings[0].email_sender_name;
      }
    } catch (err) {
      console.log('Using establishment name as sender');
    }

    // Envoyer via Resend API
    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) {
      throw new Error('RESEND_API_KEY not configured');
    }

    const emailPayload = {
      from: `${senderName} <noreply@upgraal.com>`,
      to: [recipient],
      subject: `Factures - ${invoices.length} document(s) - ${totalTTC.toFixed(2)} €`,
      html: htmlBody,
      attachments: attachments
    };

    if (establishment.contact_email) {
      emailPayload.reply_to = [establishment.contact_email];
    }

    console.log('Envoi email avec les données suivantes:', {
      to: emailPayload.to,
      subject: emailPayload.subject,
      hasAttachments: attachments.length,
      reply_to: emailPayload.reply_to
    });

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailPayload)
    });

    const result = await response.json();
    console.log('Résultat Resend:', result);

    if (!response.ok) {
      throw new Error(`Resend API error: ${JSON.stringify(result)}`);
    }

    // Mettre à jour les factures
    const historyEntry = {
      sent_at: new Date().toISOString(),
      sent_by: user.email,
      sent_by_name: user.full_name || user.email,
      method: method,
      recipient: recipient,
      success: true,
      error_message: null
    };

    for (const invoice of invoices) {
      await base44.asServiceRole.entities.Invoice.update(invoice.id, {
        status: 'envoyee',
        last_sent_at: historyEntry.sent_at,
        last_sent_method: method,
        send_history: [...(invoice.send_history || []), historyEntry]
      });
    }

    return Response.json({ 
      success: true, 
      sent_count: invoices.length,
      total_amount: totalTTC
    });

  } catch (error) {
    console.error('Error sending invoices:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});