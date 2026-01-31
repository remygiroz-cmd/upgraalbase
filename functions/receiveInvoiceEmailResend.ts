import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Webhook pour recevoir les factures via Resend Inbound
 * 
 * Format Resend Inbound :
 * {
 *   "from": "sender@example.com",
 *   "to": "etablissement.factures@upgraal.com",
 *   "subject": "Facture",
 *   "text": "...",
 *   "html": "...",
 *   "attachments": [
 *     {
 *       "filename": "facture.pdf",
 *       "content": "base64_string",
 *       "contentType": "application/pdf"
 *     }
 *   ]
 * }
 */

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  try {
    const base44 = createClientFromRequest(req);
    
    const emailData = await req.json();
    const { from, to, subject = '(sans objet)', attachments = [] } = emailData;

    console.log(`📧 Email Resend reçu de ${from} à ${to}`);
    console.log(`📎 ${attachments.length} pièce(s) jointe(s)`);

    // Extraire le nom de l'établissement depuis l'email destinataire
    const establishmentSlug = to.split('.factures@')[0];
    
    // Récupérer l'établissement
    const establishments = await base44.asServiceRole.entities.Establishment.list();
    const establishment = establishments.find(e => 
      e.name?.toLowerCase().replace(/[^a-z0-9]/g, '') === establishmentSlug.toLowerCase()
    );

    if (!establishment) {
      console.error(`❌ Établissement non trouvé pour ${to}`);
      return Response.json({ 
        error: `Établissement non trouvé pour ${to}`
      }, { status: 404 });
    }

    console.log(`✅ Établissement: ${establishment.name}`);

    let attachmentsProcessed = 0;
    let attachmentsIgnored = 0;
    const invoicesCreated = [];
    const errors = [];

    // Traiter les pièces jointes
    for (const attachment of attachments) {
      try {
        const { filename, content, contentType } = attachment;
        
        // Estimer la taille (base64 → taille réelle)
        const binaryLength = Math.ceil(content.length * 0.75);
        console.log(`\n--- ${filename} (${contentType}, ~${(binaryLength / 1024).toFixed(0)} Ko) ---`);

        // Ignorer les fichiers trop petits
        if (binaryLength < 30 * 1024) {
          console.log(`⏭️ Ignoré: fichier trop petit`);
          attachmentsIgnored++;
          continue;
        }

        // Vérifier le type
        const isPDF = contentType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');
        const isImage = contentType?.startsWith('image/') || /\.(jpg|jpeg|png|heic)$/i.test(filename);

        if (!isPDF && !isImage) {
          console.log(`⏭️ Ignoré: format non supporté`);
          attachmentsIgnored++;
          continue;
        }

        // Décoder le contenu base64
        const binaryString = atob(content);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const fileBlob = new Blob([bytes], { type: contentType });
        let finalFile = new File([fileBlob], filename, { type: contentType });

        let compressionMetadata = {
          original_size: binaryLength,
          optimized_size: binaryLength,
          compression_applied: false,
          compression_passes_count: 0
        };

        // Compression si nécessaire
        if (isImage && binaryLength > 900 * 1024) {
          console.log(`🗜️ Compression nécessaire`);
          try {
            const compressed = await compressImageStrict(finalFile);
            finalFile = compressed.file;
            compressionMetadata = compressed.metadata;
            console.log(`✅ Compressé: ${(compressed.metadata.optimized_size / 1024).toFixed(0)} Ko`);
          } catch (err) {
            console.error('Erreur compression:', err);
          }
        }

        // Upload
        console.log(`☁️ Upload...`);
        const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ 
          file: finalFile 
        });

        const urlParts = file_url.split('/storage/v1/object/public/');
        let fileBucket = '';
        let filePath = '';
        if (urlParts.length > 1) {
          const pathParts = urlParts[1].split('/');
          fileBucket = pathParts[0];
          filePath = pathParts.slice(1).join('/');
        }

        // Créer la facture
        console.log(`📄 Création facture...`);
        const invoice = await base44.asServiceRole.entities.Invoice.create({
          file_url,
          file_bucket: fileBucket,
          file_path: filePath,
          file_name: filename,
          file_mime: contentType,
          file_size: finalFile.size,
          original_size: compressionMetadata.original_size,
          optimized_size: compressionMetadata.optimized_size,
          compression_applied: compressionMetadata.compression_applied,
          compression_passes_count: compressionMetadata.compression_passes_count,
          status: 'a_verifier',
          ai_processing: true,
          import_source: 'email',
          import_email_sender: from,
          import_email_date: new Date().toISOString(),
          import_email_subject: subject
        });

        invoicesCreated.push(invoice.id);
        attachmentsProcessed++;
        console.log(`✅ Créée: ${invoice.id}`);

        // IA async
        base44.asServiceRole.functions.invoke('extractInvoiceData', {
          file_url
        }).then(async (extractedData) => {
          await base44.asServiceRole.entities.Invoice.update(invoice.id, {
            normalized_file_name: `${extractedData.data.invoice_date || 'XXXX-XX-XX'}__${(extractedData.data.supplier || 'FOURNISSEUR').replace(/[^a-zA-Z0-9]/g, '_')}__${(extractedData.data.amount_ttc || 0).toFixed(2)}.pdf`,
            supplier: extractedData.data.supplier,
            invoice_date: extractedData.data.invoice_date,
            categories: extractedData.data.categories || [],
            short_description: extractedData.data.short_description,
            accounting_account: extractedData.data.accounting_account,
            amount_ht: extractedData.data.amount_ht,
            amount_ttc: extractedData.data.amount_ttc,
            vat: extractedData.data.vat,
            indexed_text: extractedData.data.indexed_text,
            ai_confidence: extractedData.data.confidence,
            status: extractedData.data.status,
            ai_processing: false
          });
        }).catch(async (err) => {
          console.error('IA échouée:', err);
          await base44.asServiceRole.entities.Invoice.update(invoice.id, {
            ai_processing: false
          });
        });

      } catch (err) {
        console.error(`❌ Erreur ${attachment.filename}:`, err);
        errors.push({
          attachment_name: attachment.filename,
          error_message: err.message
        });
        attachmentsIgnored++;
      }
    }

    // Log d'import
    const duration = Date.now() - startTime;
    const status = errors.length === 0 ? 'success' : invoicesCreated.length > 0 ? 'partial' : 'failed';

    await base44.asServiceRole.entities.EmailImportLog.create({
      import_date: new Date().toISOString(),
      sender_email: from,
      recipient_email: to,
      subject,
      establishment_id: establishment.id,
      establishment_name: establishment.name,
      attachments_count: attachments.length,
      attachments_processed: attachmentsProcessed,
      attachments_ignored: attachmentsIgnored,
      invoices_created: invoicesCreated,
      errors: errors.length > 0 ? errors : undefined,
      status,
      processing_duration_ms: duration
    });

    console.log(`✅ Import: ${invoicesCreated.length} créée(s)`);

    return Response.json({
      success: true,
      establishment: establishment.name,
      invoices_created: invoicesCreated.length,
      invoice_ids: invoicesCreated,
      processing_duration_ms: duration
    });

  } catch (error) {
    console.error('❌ Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function compressImageStrict(file) {
  const MAX_SIZE = 900 * 1024;
  let currentFile = file;
  let currentSize = file.size;
  let passCount = 0;
  const originalSize = file.size;

  while (currentSize > MAX_SIZE && passCount < 5) {
    passCount++;
    const quality = Math.max(0.5, 0.85 - passCount * 0.1);
    const maxWidth = Math.max(1600, 2400 - passCount * 400);

    try {
      const img = await loadImage(currentFile);
      currentFile = await compressImage(img, maxWidth, quality);
      currentSize = currentFile.size;
    } catch (err) {
      console.error('Erreur compression:', err);
      break;
    }
  }

  return {
    file: currentFile,
    metadata: {
      original_size: originalSize,
      optimized_size: currentSize,
      compression_applied: true,
      compression_passes_count: passCount
    }
  };
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function compressImage(img, maxWidth, quality) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    let width = img.width;
    let height = img.height;

    if (width > maxWidth) {
      height = (height * maxWidth) / width;
      width = maxWidth;
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        resolve(new File([blob], 'compressed.jpg', { type: 'image/jpeg' }));
      },
      'image/jpeg',
      quality
    );
  });
}