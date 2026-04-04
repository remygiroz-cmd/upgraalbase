import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Récupérer les configurations actives
    const configs = await base44.asServiceRole.entities.InvoiceAutomationConfig.filter({ enabled: true });

    if (configs.length === 0) {
      return Response.json({ message: 'Aucune configuration active' });
    }

    const results = [];

    for (const config of configs) {
      try {
        // Récupérer les factures à envoyer
        const invoices = await base44.asServiceRole.entities.Invoice.filter({});
        
        // Filtrer par statut
        const invoicesToSend = invoices.filter(inv => 
          config.status_filter.includes(inv.status) && inv.file_url
        );

        if (invoicesToSend.length === 0) {
          results.push({
            config_id: config.id,
            config_name: config.name,
            status: 'success',
            invoices_count: 0
          });
          continue;
        }

        // Préparer les fichiers
        const attachments = [];
        let totalSize = 0;

        for (const invoice of invoicesToSend) {
          try {
            const response = await fetch(invoice.file_url);
            if (!response.ok) continue;

            const blob = await response.blob();
            const size = blob.size;

            // Vérifier la taille totale
            if (totalSize + size > 20 * 1024 * 1024) {
              // Si trop lourd, générer un lien sécurisé
              const signedUrl = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
                file_uri: invoice.file_path,
                expires_in: 7 * 24 * 3600
              });
              continue; // Skip cette facture pour les attachments
            }

            const base64 = await blob.arrayBuffer().then(ab => 
              btoa(String.fromCharCode(...new Uint8Array(ab)))
            );

            attachments.push({
              filename: invoice.file_name || `facture_${invoice.id}.pdf`,
              content: base64,
              contentType: invoice.file_mime
            });
            totalSize += size;
          } catch (err) {
            console.error(`Erreur traitement fichier ${invoice.id}:`, err.message);
          }
        }

        // Construire le corps de l'email
        const emailBody = `
Bonjour,

Veuillez trouver ci-joint ${invoicesToSend.length} facture(s) à traiter.

Factures incluses:
${invoicesToSend.map(inv => `- ${inv.supplier || 'N/A'} - ${inv.invoice_date || 'N/A'} - ${inv.amount_ttc?.toFixed(2) || '0.00'}€`).join('\n')}

Date d'envoi automatique: ${new Date().toLocaleString('fr-FR')}

Cordialement,
Système de gestion des factures
        `;

        // Envoyer l'email via Resend
        await base44.integrations.Core.SendEmail({
          to: config.recipient_email,
          subject: `Factures à traiter - ${new Date().toLocaleDateString('fr-FR')}`,
          body: emailBody
        });

        // Mettre à jour l'historique
        const updatedHistory = config.run_history || [];
        updatedHistory.push({
          run_at: new Date().toISOString(),
          status: 'success',
          invoices_count: invoicesToSend.length
        });

        // Garder seulement les 50 derniers envois
        if (updatedHistory.length > 50) {
          updatedHistory.shift();
        }

        await base44.asServiceRole.entities.InvoiceAutomationConfig.update(config.id, {
          last_run_at: new Date().toISOString(),
          last_run_status: 'success',
          run_history: updatedHistory
        });

        results.push({
          config_id: config.id,
          config_name: config.name,
          status: 'success',
          invoices_count: invoicesToSend.length
        });

      } catch (err) {
        console.error(`Erreur traitement config ${config.id}:`, err);

        // Mettre à jour l'historique avec l'erreur
        const updatedHistory = config.run_history || [];
        updatedHistory.push({
          run_at: new Date().toISOString(),
          status: 'failed',
          invoices_count: 0,
          error_message: err.message
        });

        if (updatedHistory.length > 50) {
          updatedHistory.shift();
        }

        await base44.asServiceRole.entities.InvoiceAutomationConfig.update(config.id, {
          last_run_at: new Date().toISOString(),
          last_run_status: 'failed',
          run_history: updatedHistory
        });

        results.push({
          config_id: config.id,
          config_name: config.name,
          status: 'failed',
          error: err.message
        });
      }
    }

    return Response.json({ results });

  } catch (error) {
    console.error('Error in autoSendInvoices:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});