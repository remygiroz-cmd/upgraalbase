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

    // Configuration des limites
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB par fichier
    const MAX_TOTAL_SIZE = 20 * 1024 * 1024; // 20 MB total
    
    // Télécharger et préparer les fichiers
    const attachments = [];
    const invoiceResults = [];
    let totalAttachmentSize = 0;
    
    console.log(`\n========== DÉBUT TRAITEMENT ${invoices.length} FACTURES ==========`);
    
    for (const inv of invoices) {
      const result = {
        invoiceId: inv.id,
        supplier: inv.supplier,
        file_name: inv.file_name,
        file_mime: inv.file_mime,
        file_size: inv.file_size,
        status: 'pending',
        delivery_method: null,
        error: null,
        signed_url: null
      };
      
      console.log(`\n--- Facture ${inv.id} ---`);
      console.log(`Fournisseur: ${inv.supplier}`);
      console.log(`Fichier: ${inv.file_name || 'N/A'}`);
      console.log(`MIME: ${inv.file_mime || 'N/A'}`);
      console.log(`Taille: ${inv.file_size ? `${(inv.file_size / 1024).toFixed(2)} KB` : 'N/A'}`);
      console.log(`URL: ${inv.file_url ? 'exists' : 'MISSING'}`);
      
      if (!inv.file_url) {
        result.status = 'failed';
        result.error = 'Fichier manquant';
        console.error(`❌ ÉCHEC: Pas de file_url`);
        invoiceResults.push(result);
        continue;
      }
      
      // Vérifier la taille avant téléchargement
      if (inv.file_size && inv.file_size > MAX_FILE_SIZE) {
        console.warn(`⚠️ Fichier trop volumineux (${(inv.file_size / 1024 / 1024).toFixed(2)} MB > 10 MB), création d'un lien sécurisé`);
        try {
          // Générer un lien sécurisé (valide 72h)
          const { signed_url } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
            file_uri: `${inv.file_bucket}/${inv.file_path}`,
            expires_in: 259200 // 72 heures
          });
          result.status = 'sent_link';
          result.delivery_method = 'link';
          result.signed_url = signed_url;
          console.log(`✅ Lien sécurisé créé (expire dans 72h)`);
        } catch (err) {
          result.status = 'failed';
          result.error = `Erreur création lien: ${err.message}`;
          console.error(`❌ ÉCHEC création lien: ${err.message}`);
        }
        invoiceResults.push(result);
        continue;
      }
      
      try {
        console.log(`📥 Téléchargement depuis ${inv.file_url}`);
        const fileResponse = await fetch(inv.file_url);
        
        if (!fileResponse.ok) {
          result.status = 'failed';
          result.error = `HTTP ${fileResponse.status}`;
          console.error(`❌ ÉCHEC téléchargement: HTTP ${fileResponse.status}`);
          invoiceResults.push(result);
          continue;
        }
        
        const fileBlob = await fileResponse.blob();
        const fileBuffer = await fileBlob.arrayBuffer();
        const downloadedSize = fileBuffer.byteLength;
        
        console.log(`📦 Téléchargé: ${(downloadedSize / 1024).toFixed(2)} KB`);
        
        // Vérifier si l'ajout dépasserait la limite totale
        if (totalAttachmentSize + downloadedSize > MAX_TOTAL_SIZE) {
          console.warn(`⚠️ Limite totale dépassée (${((totalAttachmentSize + downloadedSize) / 1024 / 1024).toFixed(2)} MB > 20 MB), création d'un lien`);
          try {
            const { signed_url } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
              file_uri: `${inv.file_bucket}/${inv.file_path}`,
              expires_in: 259200
            });
            result.status = 'sent_link';
            result.delivery_method = 'link';
            result.signed_url = signed_url;
            console.log(`✅ Lien sécurisé créé (limite totale)`);
          } catch (err) {
            result.status = 'failed';
            result.error = `Erreur création lien: ${err.message}`;
            console.error(`❌ ÉCHEC création lien: ${err.message}`);
          }
          invoiceResults.push(result);
          continue;
        }
        
        // Convertir en base64
        const base64Content = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)));
        console.log(`🔄 Converti en base64: ${(base64Content.length / 1024).toFixed(2)} KB`);
        
        const filename = inv.normalized_file_name || inv.file_name || `facture_${inv.id}.pdf`;
        attachments.push({
          filename: filename,
          content: base64Content
        });
        
        totalAttachmentSize += downloadedSize;
        result.status = 'sent_attachment';
        result.delivery_method = 'attachment';
        console.log(`✅ Ajouté en PJ: ${filename}`);
        
      } catch (err) {
        result.status = 'failed';
        result.error = err.message;
        console.error(`❌ ÉCHEC traitement: ${err.message}`);
      }
      
      invoiceResults.push(result);
    }
    
    console.log(`\n========== RÉSUMÉ GLOBAL ==========`);
    console.log(`Factures demandées: ${invoices.length}`);
    console.log(`PJ attachées: ${attachments.length}`);
    console.log(`Liens créés: ${invoiceResults.filter(r => r.delivery_method === 'link').length}`);
    console.log(`Échecs: ${invoiceResults.filter(r => r.status === 'failed').length}`);
    console.log(`Taille totale PJ: ${(totalAttachmentSize / 1024 / 1024).toFixed(2)} MB`);
    
    const failedInvoices = invoiceResults.filter(r => r.status === 'failed');
    if (failedInvoices.length > 0) {
      console.log(`\n⚠️ Factures non livrées:`);
      failedInvoices.forEach(f => {
        console.log(`  - ${f.supplier} (${f.invoiceId}): ${f.error}`);
      });
    }
    console.log(`========================================\n`);

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