import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Webhook Mailgun pour recevoir les factures
 * 
 * Format Mailgun (multipart form-data) :
 * - sender, recipient, subject, timestamp
 * - attachment-count, attachments[0], attachments[1], etc.
 * 
 * Configuration Mailgun Routes :
 * Expression: match_recipient(".*\\.factures@upgraal\\.com")
 * Action: forward("https://your-domain/functions/receiveInvoiceEmailMailgun")
 */

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  try {
    const base44 = createClientFromRequest(req);
    
    // Parser le multipart form-data de Mailgun
    const formData = await req.formData();
    
    const sender = formData.get('sender');
    const recipient = formData.get('recipient');
    const subject = formData.get('subject') || '(sans objet)';
    const attachmentCount = parseInt(formData.get('attachment-count') || '0');

    console.log(`📧 Email Mailgun: ${sender} → ${recipient}`);
    console.log(`📎 ${attachmentCount} pièce(s) jointe(s)`);

    // Récupérer l'établissement
    const establishmentSlug = recipient.split('.factures@')[0];
    const establishments = await base44.asServiceRole.entities.Establishment.list();
    const establishment = establishments.find(e => 
      e.name?.toLowerCase().replace(/[^a-z0-9]/g, '') === establishmentSlug.toLowerCase()
    );

    if (!establishment) {
      console.error(`❌ Établissement non trouvé: ${recipient}`);
      return Response.json({ error: 'Établissement non trouvé' }, { status: 404 });
    }

    console.log(`✅ Établissement: ${establishment.name}`);

    let attachmentsProcessed = 0;
    let attachmentsIgnored = 0;
    const invoicesCreated = [];
    const errors = [];

    // Traiter les pièces jointes
    for (let i = 0; i < attachmentCount; i++) {
      try {
        const attachmentKey = `attachment-${i}`;
        const attachment = formData.get(attachmentKey);

        if (!attachment) {
          console.log(`⏭️ Attachement ${i}: non trouvé`);
          continue;
        }

        const filename = attachment.name;
        const contentType = attachment.type;
        const size = attachment.size;

        console.log(`\n--- ${filename} (${contentType}, ${(size / 1024).toFixed(0)} Ko) ---`);

        // Filtrer par taille
        if (size < 30 * 1024) {
          console.log(`⏭️ Ignoré: trop petit (< 30 Ko)`);
          attachmentsIgnored++;
          continue;
        }

        // Vérifier le type
        const isPDF = contentType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');
        const isImage = contentType?.startsWith('image/') || /\.(jpg|jpeg|png|heic)$/i.test(filename);

        if (!isPDF && !isImage) {
          console.log(`⏭️ Ignoré: format non supporté (${contentType})`);
          attachmentsIgnored++;
          continue;
        }

        // Lire le fichier
        const arrayBuffer = await attachment.arrayBuffer();
        const fileBlob = new Blob([arrayBuffer], { type: contentType });
        let finalFile = new File([fileBlob], filename, { type: contentType });

        let compressionMetadata = {
          original_size: size,
          optimized_size: size,
          compression_applied: false,
          compression_passes_count: 0
        };

        // Compression si image > 900 Ko
        if (isImage && size > 900 * 1024) {
          console.log(`🗜️ Compression nécessaire: ${(size / 1024).toFixed(0)} Ko`);
          try {
            const compressed = await compressImageStrict(finalFile);
            finalFile = compressed.file;
            compressionMetadata = compressed.metadata;
            console.log(`✅ Compressé: ${(compressed.metadata.optimized_size / 1024).toFixed(0)} Ko`);
          } catch (err) {
            console.error('Erreur compression:', err);
          }
        }

        // Upload fichier
        console.log(`☁️ Upload...`);
        const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ 
          file: finalFile 
        });

        // Parser URL
        const urlParts = file_url.split('/storage/v1/object/public/');
        let fileBucket = '';
        let filePath = '';
        if (urlParts.length > 1) {
          const pathParts = urlParts[1].split('/');
          fileBucket = pathParts[0];
          filePath = pathParts.slice(1).join('/');
        }

        // Créer facture
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
          import_email_sender: sender,
          import_email_date: new Date().toISOString(),
          import_email_subject: subject
        });

        invoicesCreated.push(invoice.id);
        attachmentsProcessed++;
        console.log(`✅ Facture créée: ${invoice.id}`);

        // Lancer extraction IA (asynchrone)
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
        console.error(`❌ Erreur attachment ${i}:`, err);
        errors.push({
          attachment_name: attachment?.name || `attachment-${i}`,
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
      sender_email: sender,
      recipient_email: recipient,
      subject,
      establishment_id: establishment.id,
      establishment_name: establishment.name,
      attachments_count: attachmentCount,
      attachments_processed: attachmentsProcessed,
      attachments_ignored: attachmentsIgnored,
      invoices_created: invoicesCreated,
      errors: errors.length > 0 ? errors : undefined,
      status,
      processing_duration_ms: duration
    });

    console.log(`✅ Import terminé: ${invoicesCreated.length} facture(s)`);

    return Response.json({
      success: true,
      establishment: establishment.name,
      invoices_created: invoicesCreated.length,
      invoice_ids: invoicesCreated,
      processing_duration_ms: duration
    });

  } catch (error) {
    console.error('❌ Erreur globale:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
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
      console.error('Erreur compression pass', passCount, ':', err);
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