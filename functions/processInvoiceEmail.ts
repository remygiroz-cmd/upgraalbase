import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Fonction webhook pour traiter les emails entrants avec factures
 * 
 * Cette fonction doit être appelée par un service d'emails entrants
 * (Mailgun Inbound, SendGrid Parse, Postmark Inbound, etc.)
 * 
 * Format attendu du payload :
 * {
 *   sender: "fournisseur@example.com",
 *   recipient: "frenchysushi.factures@upgraal.com",
 *   subject: "Facture 2026-001",
 *   timestamp: "2026-01-31T10:30:00Z",
 *   attachments: [
 *     {
 *       filename: "facture.pdf",
 *       content_type: "application/pdf",
 *       size: 250000,
 *       content: "base64_encoded_content" // ou URL à télécharger
 *     }
 *   ]
 * }
 */

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  try {
    const base44 = createClientFromRequest(req);
    
    // Parser le payload de l'email entrant
    const emailData = await req.json();
    
    const {
      sender,
      recipient,
      subject = '(sans objet)',
      timestamp,
      attachments = []
    } = emailData;

    console.log(`📧 Email reçu de ${sender} à ${recipient}`);
    console.log(`📎 ${attachments.length} pièce(s) jointe(s)`);

    // Extraire le nom de l'établissement depuis l'email destinataire
    // Format attendu: <etablissement>.factures@upgraal.com
    const establishmentSlug = recipient.split('.factures@')[0];
    
    // Récupérer l'établissement correspondant
    const establishments = await base44.asServiceRole.entities.Establishment.list();
    const establishment = establishments.find(e => 
      e.name?.toLowerCase().replace(/[^a-z0-9]/g, '') === establishmentSlug.toLowerCase()
    );

    if (!establishment) {
      console.error(`❌ Aucun établissement trouvé pour ${recipient}`);
      return Response.json({ 
        error: `Établissement non trouvé pour ${recipient}`,
        hint: `Vérifier que l'adresse email correspond au format <nom_etablissement>.factures@upgraal.com`
      }, { status: 404 });
    }

    console.log(`✅ Établissement identifié: ${establishment.name}`);

    // Compteurs pour le log
    let attachmentsProcessed = 0;
    let attachmentsIgnored = 0;
    const invoicesCreated = [];
    const errors = [];

    // Traiter chaque pièce jointe
    for (const attachment of attachments) {
      try {
        const { filename, content_type, size, content, url } = attachment;
        
        console.log(`\n--- Traitement: ${filename} (${content_type}, ${(size / 1024).toFixed(0)} Ko) ---`);

        // 1. Filtrage des pièces jointes
        
        // Ignorer les fichiers trop petits (< 30 Ko = logos, signatures)
        if (size < 30 * 1024) {
          console.log(`⏭️ Ignoré: fichier trop petit (${(size / 1024).toFixed(0)} Ko)`);
          attachmentsIgnored++;
          continue;
        }

        // Vérifier le type de fichier
        const isPDF = content_type === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');
        const isImage = content_type?.startsWith('image/') || 
          /\.(jpg|jpeg|png|heic)$/i.test(filename);

        if (!isPDF && !isImage) {
          console.log(`⏭️ Ignoré: format non supporté (${content_type})`);
          attachmentsIgnored++;
          continue;
        }

        // 2. Récupérer le contenu du fichier
        let fileBlob;
        if (content) {
          // Si le contenu est fourni en base64
          const binaryString = atob(content);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          fileBlob = new Blob([bytes], { type: content_type });
        } else if (url) {
          // Si une URL est fournie (certains services d'email)
          const response = await fetch(url);
          fileBlob = await response.blob();
        } else {
          throw new Error('Ni content ni url fourni pour la pièce jointe');
        }

        // 3. Compression des images (stricte, max 900 Ko)
        let finalFile = new File([fileBlob], filename, { type: content_type });
        let compressionMetadata = {
          original_size: size,
          optimized_size: size,
          compression_applied: false,
          compression_passes_count: 0
        };

        if (isImage && size > 900 * 1024) {
          console.log(`🗜️ Compression nécessaire: ${(size / 1024).toFixed(0)} Ko > 900 Ko`);
          
          // Compression stricte des images
          try {
            const compressed = await compressImageStrict(finalFile);
            finalFile = compressed.file;
            compressionMetadata = compressed.metadata;
            console.log(`✅ Compressé: ${(compressed.metadata.original_size / 1024).toFixed(0)} Ko → ${(compressed.metadata.optimized_size / 1024).toFixed(0)} Ko`);
          } catch (compErr) {
            console.error('❌ Erreur compression:', compErr);
            // Continuer avec le fichier original
          }
        }

        // 4. Upload du fichier
        console.log(`☁️ Upload du fichier...`);
        const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ 
          file: finalFile 
        });

        // Extraire bucket et path
        const urlParts = file_url.split('/storage/v1/object/public/');
        let fileBucket = '';
        let filePath = '';
        if (urlParts.length > 1) {
          const pathParts = urlParts[1].split('/');
          fileBucket = pathParts[0];
          filePath = pathParts.slice(1).join('/');
        }

        // 5. Créer la facture avec statut "À vérifier" par défaut
        console.log(`📄 Création de la facture...`);
        const invoice = await base44.asServiceRole.entities.Invoice.create({
          file_url,
          file_bucket: fileBucket,
          file_path: filePath,
          file_name: filename,
          file_mime: content_type || (isPDF ? 'application/pdf' : 'image/jpeg'),
          file_size: finalFile.size,
          original_size: compressionMetadata.original_size,
          optimized_size: compressionMetadata.optimized_size,
          compression_applied: compressionMetadata.compression_applied,
          compression_passes_count: compressionMetadata.compression_passes_count,
          status: 'a_verifier', // Par défaut "À vérifier" pour import email
          ai_processing: true,
          import_source: 'email',
          import_email_sender: sender,
          import_email_date: timestamp || new Date().toISOString(),
          import_email_subject: subject
        });

        invoicesCreated.push(invoice.id);
        attachmentsProcessed++;
        console.log(`✅ Facture créée: ${invoice.id}`);

        // 6. Lancer l'extraction IA (asynchrone)
        console.log(`🤖 Lancement extraction IA...`);
        base44.asServiceRole.functions.invoke('extractInvoiceData', {
          file_url
        }).then(async (extractedData) => {
          const normalizedName = `${extractedData.data.invoice_date || 'XXXX-XX-XX'}__${(extractedData.data.supplier || 'FOURNISSEUR').replace(/[^a-zA-Z0-9]/g, '_')}__${(extractedData.data.amount_ttc || 0).toFixed(2)}.pdf`;

          await base44.asServiceRole.entities.Invoice.update(invoice.id, {
            normalized_file_name: normalizedName,
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
            status: extractedData.data.status, // Passe en "non_envoyee" si confiance élevée
            ai_processing: false
          });
          
          console.log(`✅ IA terminée pour ${invoice.id}`);
        }).catch(async (err) => {
          console.error(`❌ Extraction IA échouée pour ${invoice.id}:`, err);
          await base44.asServiceRole.entities.Invoice.update(invoice.id, {
            ai_processing: false
          });
        });

      } catch (attachmentError) {
        console.error(`❌ Erreur traitement ${attachment.filename}:`, attachmentError);
        errors.push({
          attachment_name: attachment.filename,
          error_message: attachmentError.message
        });
        attachmentsIgnored++;
      }
    }

    // Créer le log d'import
    const processingDuration = Date.now() - startTime;
    const importStatus = errors.length === 0 ? 'success' : 
                         invoicesCreated.length > 0 ? 'partial' : 'failed';

    await base44.asServiceRole.entities.EmailImportLog.create({
      import_date: timestamp || new Date().toISOString(),
      sender_email: sender,
      recipient_email: recipient,
      subject,
      establishment_id: establishment.id,
      establishment_name: establishment.name,
      attachments_count: attachments.length,
      attachments_processed: attachmentsProcessed,
      attachments_ignored: attachmentsIgnored,
      invoices_created: invoicesCreated,
      errors: errors.length > 0 ? errors : undefined,
      status: importStatus,
      processing_duration_ms: processingDuration
    });

    console.log(`\n✅ Import terminé: ${invoicesCreated.length} facture(s) créée(s)`);

    return Response.json({
      success: true,
      establishment: establishment.name,
      attachments_received: attachments.length,
      attachments_processed: attachmentsProcessed,
      attachments_ignored: attachmentsIgnored,
      invoices_created: invoicesCreated.length,
      invoice_ids: invoicesCreated,
      errors: errors.length > 0 ? errors : undefined,
      processing_duration_ms: processingDuration
    });

  } catch (error) {
    console.error('❌ Erreur globale:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});

/**
 * Fonction de compression stricte des images (max 900 Ko)
 * Basée sur la logique existante de compressImageStrict
 */
async function compressImageStrict(file) {
  const MAX_SIZE = 900 * 1024; // 900 Ko
  const MAX_PASSES = 5;

  let currentFile = file;
  let currentSize = file.size;
  let passCount = 0;
  let quality = 0.85;
  let maxWidth = 2400;

  const originalSize = file.size;

  while (currentSize > MAX_SIZE && passCount < MAX_PASSES) {
    passCount++;
    console.log(`Pass ${passCount}: ${(currentSize / 1024).toFixed(0)} Ko → cible 900 Ko`);

    const img = await loadImage(currentFile);
    const compressedFile = await compressImage(img, maxWidth, quality);
    currentSize = compressedFile.size;
    currentFile = compressedFile;

    // Ajuster les paramètres pour le prochain passage
    quality = Math.max(0.5, quality - 0.1);
    maxWidth = Math.max(1600, maxWidth - 400);
  }

  // Si toujours trop gros, compression extrême
  if (currentSize > MAX_SIZE) {
    console.log('Compression extrême nécessaire');
    const img = await loadImage(currentFile);
    currentFile = await compressImage(img, 1200, 0.4);
    currentSize = currentFile.size;
    passCount++;
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
        const compressedFile = new File([blob], 'compressed.jpg', { type: 'image/jpeg' });
        resolve(compressedFile);
      },
      'image/jpeg',
      quality
    );
  });
}