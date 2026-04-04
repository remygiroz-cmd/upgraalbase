import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ========== FONCTIONS DE SÉCURITÉ ==========

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

// Rôles autorisés à envoyer des factures
const ALLOWED_ROLES = ['admin', 'manager', 'comptable', 'gestionnaire'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // ========== VÉRIFICATION D'AUTHENTIFICATION ==========
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ========== VÉRIFICATION DES PERMISSIONS ==========
    if (!ALLOWED_ROLES.includes(user.role)) {
      console.warn(`[SECURITY] User ${user.id} with role "${user.role}" attempted to send invoices`);
      return Response.json({ 
        error: 'Permissions insuffisantes pour envoyer des factures' 
      }, { status: 403 });
    }

    const { invoice_ids, recipient, method = 'manual' } = await req.json();

    if (!invoice_ids || !invoice_ids.length || !recipient) {
      return Response.json({ error: 'invoice_ids and recipient are required' }, { status: 400 });
    }

    // Validation basique de l'email destinataire
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipient)) {
      return Response.json({ error: 'Invalid recipient email format' }, { status: 400 });
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
    
    // Log sécurisé (sans données sensibles)
    console.log(`[INFO] Processing ${invoices.length} invoices for sending`);
    
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
      
      // Log sans données sensibles
      console.log(`[INFO] Processing invoice ${inv.id}`);
      
      if (!inv.file_url) {
        result.status = 'failed';
        result.error = 'Fichier manquant';
        console.error(`[ERROR] Invoice ${inv.id}: No file_url`);
        invoiceResults.push(result);
        continue;
      }
      
      // Vérifier la taille avant téléchargement
      if (inv.file_size && inv.file_size > MAX_FILE_SIZE) {
        console.log(`[INFO] Invoice ${inv.id}: File too large, creating secure link`);
        try {
          const { signed_url } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
            file_uri: `${inv.file_bucket}/${inv.file_path}`,
            expires_in: 259200 // 72 heures
          });
          result.status = 'sent_link';
          result.delivery_method = 'link';
          result.signed_url = signed_url;
        } catch (err) {
          result.status = 'failed';
          result.error = `Erreur création lien: ${err.message}`;
        }
        invoiceResults.push(result);
        continue;
      }
      
      try {
        const fileResponse = await fetch(inv.file_url);
        
        if (!fileResponse.ok) {
          result.status = 'failed';
          result.error = `HTTP ${fileResponse.status}`;
          invoiceResults.push(result);
          continue;
        }
        
        const fileBlob = await fileResponse.blob();
        const fileBuffer = await fileBlob.arrayBuffer();
        const downloadedSize = fileBuffer.byteLength;
        
        // Vérifier si l'ajout dépasserait la limite totale
        if (totalAttachmentSize + downloadedSize > MAX_TOTAL_SIZE) {
          try {
            const { signed_url } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
              file_uri: `${inv.file_bucket}/${inv.file_path}`,
              expires_in: 259200
            });
            result.status = 'sent_link';
            result.delivery_method = 'link';
            result.signed_url = signed_url;
          } catch (err) {
            result.status = 'failed';
            result.error = `Erreur création lien: ${err.message}`;
          }
          invoiceResults.push(result);
          continue;
        }
        
        // Convertir en base64
        let base64Content;
        try {
          const uint8Array = new Uint8Array(fileBuffer);
          const chunkSize = 8192;
          let base64 = '';
          for (let i = 0; i < uint8Array.length; i += chunkSize) {
            const chunk = uint8Array.slice(i, i + chunkSize);
            base64 += String.fromCharCode.apply(null, chunk);
          }
          base64Content = btoa(base64);
        } catch (conversionError) {
          try {
            const { signed_url } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
              file_uri: `${inv.file_bucket}/${inv.file_path}`,
              expires_in: 259200
            });
            result.status = 'sent_link';
            result.delivery_method = 'link';
            result.signed_url = signed_url;
            result.error = `Conversion échouée, lien créé`;
          } catch (linkError) {
            result.status = 'failed';
            result.error = `Échec complet: ${conversionError.message}`;
          }
          invoiceResults.push(result);
          continue;
        }
        
        // Déterminer le type MIME correct
        const mimeType = inv.file_mime || 
          (inv.file_name?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
        
        // Normaliser le nom de fichier
        let filename = inv.normalized_file_name || inv.file_name || `facture_${inv.id}`;
        if (mimeType === 'image/jpeg' && !filename.toLowerCase().match(/\.(jpg|jpeg)$/)) {
          filename = filename.replace(/\.[^.]*$/, '') + '.jpg';
        } else if (mimeType === 'application/pdf' && !filename.toLowerCase().endsWith('.pdf')) {
          filename = filename + '.pdf';
        }
        
        attachments.push({
          filename: filename,
          content: base64Content,
          type: mimeType
        });
        
        totalAttachmentSize += downloadedSize;
        result.status = 'sent_attachment';
        result.delivery_method = 'attachment';
        
      } catch (err) {
        try {
          const { signed_url } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
            file_uri: `${inv.file_bucket}/${inv.file_path}`,
            expires_in: 259200
          });
          result.status = 'sent_link';
          result.delivery_method = 'link';
          result.signed_url = signed_url;
          result.error = `Traitement échoué, lien créé`;
        } catch (linkError) {
          result.status = 'failed';
          result.error = `Échec complet: ${err.message}`;
        }
      }
      
      invoiceResults.push(result);
    }
    
    // Log résumé (sans données sensibles)
    const attachedCount = invoiceResults.filter(r => r.delivery_method === 'attachment').length;
    const linkCount = invoiceResults.filter(r => r.delivery_method === 'link').length;
    const failedCount = invoiceResults.filter(r => r.status === 'failed').length;
    console.log(`[INFO] Summary: ${attachedCount} attachments, ${linkCount} links, ${failedCount} failed`);

    // Préparer le corps de l'email avec données échappées
    const totalTTC = invoices.reduce((sum, inv) => sum + (inv.amount_ttc || 0), 0);
    
    // IMPORTANT: Échapper toutes les données utilisateur pour éviter XSS
    const safeUserName = escapeHtml(user.full_name || user.email);
    
    let htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
        <h2 style="color: #f97316;">Factures - ${new Date().toLocaleDateString('fr-FR')}</h2>
        <p>Bonjour,</p>
        <p>Vous trouverez ${invoices.length} facture(s) pour un montant total de <strong>${totalTTC.toFixed(2)} €</strong>.</p>
        <p style="color: #6b7280; font-size: 14px;">
          ${attachedCount > 0 ? `${attachedCount} en pièce(s) jointe(s)` : ''}
          ${linkCount > 0 ? `${attachedCount > 0 ? ', ' : ''}${linkCount} par lien(s) sécurisé(s) (expire dans 72h)` : ''}
          ${failedCount > 0 ? ` - ⚠️ ${failedCount} échec(s)` : ''}
        </p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="padding: 10px; text-align: left; border: 1px solid #e5e7eb;">Fournisseur</th>
              <th style="padding: 10px; text-align: left; border: 1px solid #e5e7eb;">Date</th>
              <th style="padding: 10px; text-align: left; border: 1px solid #e5e7eb;">Fichier</th>
              <th style="padding: 10px; text-align: right; border: 1px solid #e5e7eb;">TTC</th>
              <th style="padding: 10px; text-align: center; border: 1px solid #e5e7eb;">Livraison</th>
            </tr>
          </thead>
          <tbody>
            ${invoices.map((inv, idx) => {
              const result = invoiceResults[idx];
              let statusBadge = '';
              // IMPORTANT: Échapper les données fournisseur
              const safeSupplier = escapeHtml(inv.supplier);
              const safeFileName = escapeHtml(inv.file_name);
              let fileCell = safeFileName || 'N/A';
              
              if (result.status === 'sent_attachment') {
                statusBadge = '<span style="background: #10b981; color: white; padding: 3px 8px; border-radius: 4px; font-size: 12px;">📎 PJ</span>';
              } else if (result.status === 'sent_link') {
                statusBadge = '<span style="background: #3b82f6; color: white; padding: 3px 8px; border-radius: 4px; font-size: 12px;">🔗 Lien</span>';
                fileCell = `<a href="${escapeHtml(result.signed_url)}" style="color: #3b82f6; text-decoration: none;">📥 Télécharger</a>`;
              } else {
                statusBadge = '<span style="background: #ef4444; color: white; padding: 3px 8px; border-radius: 4px; font-size: 12px;">❌ Échec</span>';
                fileCell = `<span style="color: #ef4444; font-size: 12px;">${escapeHtml(result.error)}</span>`;
              }
              
              return `
                <tr>
                  <td style="padding: 10px; border: 1px solid #e5e7eb;">${safeSupplier || 'N/A'}</td>
                  <td style="padding: 10px; border: 1px solid #e5e7eb;">${inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString('fr-FR') : 'N/A'}</td>
                  <td style="padding: 10px; border: 1px solid #e5e7eb;">${fileCell}</td>
                  <td style="padding: 10px; text-align: right; border: 1px solid #e5e7eb;">${(inv.amount_ttc || 0).toFixed(2)} €</td>
                  <td style="padding: 10px; text-align: center; border: 1px solid #e5e7eb;">${statusBadge}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        
        ${linkCount > 0 ? `
          <p style="color: #6b7280; font-size: 13px; background: #eff6ff; padding: 12px; border-radius: 6px; border-left: 3px solid #3b82f6;">
            ℹ️ Les liens sécurisés expirent dans 72 heures. Téléchargez les fichiers avant cette échéance.
          </p>
        ` : ''}
        
        ${failedCount > 0 ? `
          <p style="color: #991b1b; font-size: 13px; background: #fee; padding: 12px; border-radius: 6px; border-left: 3px solid #ef4444;">
            ⚠️ ${failedCount} facture(s) n'ont pas pu être envoyées. Contactez-nous pour plus d'informations.
          </p>
        ` : ''}
        
        <p style="margin-top: 30px;">Cordialement,<br>${safeUserName}</p>
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
      console.log('[INFO] Using establishment name as sender');
    }

    // Envoyer via Resend API
    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) {
      throw new Error('RESEND_API_KEY not configured');
    }

    const emailPayload = {
      from: `${escapeHtml(senderName)} <noreply@upgraal.com>`,
      to: [recipient],
      subject: `Factures - ${invoices.length} document(s) - ${totalTTC.toFixed(2)} €`,
      html: htmlBody,
      attachments: attachments
    };

    if (establishment.contact_email) {
      emailPayload.reply_to = [establishment.contact_email];
    }

    // Log sécurisé (sans l'email complet du destinataire)
    console.log(`[INFO] Sending email with ${attachments.length} attachments`);

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailPayload)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(`Resend API error: ${JSON.stringify(result)}`);
    }

    // Mettre à jour les factures
    for (let i = 0; i < invoices.length; i++) {
      const invoice = invoices[i];
      const result = invoiceResults[i];
      
      const historyEntry = {
        sent_at: new Date().toISOString(),
        sent_by: user.email,
        sent_by_name: user.full_name || user.email,
        method: method,
        recipient: recipient,
        delivery_method: result.delivery_method || 'unknown',
        success: result.status !== 'failed',
        error_message: result.error || null
      };
      
      let finalStatus = invoice.status;
      if (result.status === 'sent_attachment' || result.status === 'sent_link') {
        finalStatus = 'envoyee';
      } else if (result.status === 'failed') {
        finalStatus = 'a_verifier';
      }
      
      await base44.asServiceRole.entities.Invoice.update(invoice.id, {
        status: finalStatus,
        last_sent_at: historyEntry.sent_at,
        last_sent_method: method,
        send_history: [...(invoice.send_history || []), historyEntry]
      });
    }

    const successCount = invoiceResults.filter(r => r.status !== 'failed').length;
    
    return Response.json({ 
      success: true, 
      requested: invoices.length,
      sent_attachment: attachedCount,
      sent_link: linkCount,
      failed: failedCount,
      total_delivered: successCount,
      total_amount: totalTTC,
      details: invoiceResults
    });

  } catch (error) {
    console.error('[ERROR] Send invoices failed:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
