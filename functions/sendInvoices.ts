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

    // Télécharger et préparer les fichiers pour pièces jointes
    const attachments = [];
    for (const inv of invoices) {
      if (!inv.file_url) continue;
      
      try {
        // Télécharger le fichier
        const fileResponse = await fetch(inv.file_url);
        if (!fileResponse.ok) {
          console.error(`Failed to download file for invoice ${inv.id}`);
          continue;
        }
        
        const fileBlob = await fileResponse.blob();
        const fileBuffer = await fileBlob.arrayBuffer();
        const base64Content = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)));
        
        attachments.push({
          filename: inv.normalized_file_name || inv.file_name || `facture_${inv.id}.pdf`,
          content: base64Content,
          type: inv.file_mime || 'application/pdf'
        });
      } catch (err) {
        console.error(`Error processing file for invoice ${inv.id}:`, err);
      }
    }

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

    // Envoyer l'email via EmailJS avec pièces jointes
    const SERVICE_ID = Deno.env.get('EMAILJS_SERVICE_ID');
    const TEMPLATE_ID = Deno.env.get('EMAILJS_TEMPLATE_ID');
    const PUBLIC_KEY = Deno.env.get('EMAILJS_PUBLIC_KEY');
    const PRIVATE_KEY = Deno.env.get('EMAILJS_PRIVATE_KEY');

    if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY || !PRIVATE_KEY) {
      throw new Error('EmailJS configuration missing');
    }

    const [emailSettings] = await base44.asServiceRole.entities.AppSettings.filter({ setting_key: 'app_logo' });
    const fromName = emailSettings?.email_sender_name || 'UpGraal';

    // Construire le contenu avec liens de téléchargement
    let emailBodyWithLinks = htmlBody + `
      <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #e5e7eb;">
        <p style="font-weight: bold; margin-bottom: 10px;">📎 Fichiers joints :</p>
        <ul>
          ${invoices.map(inv => `
            <li style="margin-bottom: 8px;">
              <a href="${inv.file_url}" style="color: #f97316; text-decoration: none;">
                ${inv.normalized_file_name || inv.file_name || 'Télécharger la facture'}
              </a>
            </li>
          `).join('')}
        </ul>
      </div>
    `;

    const emailPayload = {
      service_id: SERVICE_ID,
      template_id: TEMPLATE_ID,
      user_id: PUBLIC_KEY,
      accessToken: PRIVATE_KEY,
      template_params: {
        from_name: fromName,
        to_email: recipient,
        subject: `Factures - ${invoices.length} document(s) - ${totalTTC.toFixed(2)} €`,
        message: emailBodyWithLinks,
        reply_to: user.email
      }
    };

    const emailResponse = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailPayload)
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      throw new Error(`EmailJS error: ${errorText}`);
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