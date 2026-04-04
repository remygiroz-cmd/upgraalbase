import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    // Initialiser le client avec le service role pour les automations scheduled
    const base44 = createClientFromRequest(req);
    
    // Utiliser asServiceRole pour toutes les opérations
    const serviceClient = base44.asServiceRole;

    const now = new Date();
    
    // Convertir en heure de Paris
    const formatter = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short'
    });
    
    const parts = formatter.formatToParts(now);
    const parisHour = parseInt(parts.find(p => p.type === 'hour').value);
    const parisMinute = parseInt(parts.find(p => p.type === 'minute').value);
    const parisWeekday = parts.find(p => p.type === 'weekday').value;
    
    // Mapper le jour de la semaine français vers notre format
    const dayMap = {
      'dim.': 'sunday',
      'lun.': 'monday',
      'mar.': 'tuesday',
      'mer.': 'wednesday',
      'jeu.': 'thursday',
      'ven.': 'friday',
      'sam.': 'saturday'
    };
    
    const currentDay = dayMap[parisWeekday] || 'sunday';
    const currentTime = `${String(parisHour).padStart(2, '0')}:${String(parisMinute).padStart(2, '0')}`;
    
    console.log(`[executeAutoSendInvoices] Vérification - Jour: ${currentDay}, Heure Paris: ${currentTime}`);
    console.log(`[executeAutoSendInvoices] Details - Hour: ${parisHour}, Minute: ${parisMinute}`);

    // Récupérer toutes les configurations actives
    const configs = await serviceClient.entities.InvoiceAutomationConfig.filter({ enabled: true });
    
    console.log(`[executeAutoSendInvoices] Configurations actives trouvées: ${configs.length}`);
    configs.forEach(c => console.log(`  - ${c.name}: ${c.send_day} à ${c.send_time}`));
    
    if (configs.length === 0) {
      return Response.json({
        success: true,
        timestamp: now.toISOString(),
        parisTime: currentTime,
        currentDay,
        message: 'Aucune configuration active'
      });
    }

    // Fonction pour vérifier si l'heure est dans la fenêtre de 5 minutes
    const isWithinTimeWindow = (sendTime) => {
      if (!sendTime) return false;
      
      const [targetHour, targetMinute] = sendTime.split(':').map(Number);
      const targetTimeInMinutes = targetHour * 60 + targetMinute;
      const currentTimeInMinutes = parisHour * 60 + parisMinute;
      
      // Vérifier si on est dans une fenêtre de 5 minutes
      const diff = currentTimeInMinutes - targetTimeInMinutes;
      
      return diff >= 0 && diff < 5;
    };

    // Filtrer les configs à traiter (bon jour et dans la fenêtre)
    const configsToProcess = configs.filter(c => 
      c.send_day === currentDay && 
      isWithinTimeWindow(c.send_time)
    );

    console.log(`[executeAutoSendInvoices] ${configsToProcess.length} config(s) à traiter`);

    const results = [];
    
    for (const config of configsToProcess) {
      try {
        // Récupérer les factures à envoyer
        const allInvoices = await serviceClient.entities.Invoice.list();
        
        // Filtrer par statut et vérifier qu'il y a un fichier
        const invoicesToSend = allInvoices.filter(inv => 
          config.status_filter.includes(inv.status) && inv.file_url
        );

        if (invoicesToSend.length === 0) {
          console.log(`[executeAutoSendInvoices] Aucune facture à envoyer pour ${config.name}`);
          results.push({
            config_id: config.id,
            config_name: config.name,
            status: 'success',
            invoices_count: 0
          });
          continue;
        }

        console.log(`[executeAutoSendInvoices] ${invoicesToSend.length} facture(s) pour ${config.name}`);

        // Préparer les fichiers
        const attachments = [];
        let totalSize = 0;

        for (const invoice of invoicesToSend) {
          try {
            const response = await fetch(invoice.file_url);
            if (!response.ok) continue;

            const blob = await response.blob();
            const size = blob.size;

            // Vérifier la taille totale (limiter à 20 MB)
            if (totalSize + size > 20 * 1024 * 1024) {
              console.log(`[executeAutoSendInvoices] Limite totale atteinte, création de lien pour ${invoice.file_name}`);
              continue;
            }

            const base64 = await blob.arrayBuffer().then(ab => 
              btoa(String.fromCharCode(...new Uint8Array(ab)))
            );

            attachments.push({
              filename: invoice.file_name || `facture_${invoice.id}.pdf`,
              content: base64,
              type: invoice.file_mime || 'application/pdf'
            });
            totalSize += size;
          } catch (err) {
            console.error(`[executeAutoSendInvoices] Erreur traitement fichier ${invoice.id}:`, err.message);
          }
        }

        // Construire le corps de l'email
        const totalTTC = invoicesToSend.reduce((sum, inv) => sum + (inv.amount_ttc || 0), 0);
        const emailBody = `
Bonjour,

Veuillez trouver ci-joint ${invoicesToSend.length} facture(s) à traiter.

Montant total: ${totalTTC.toFixed(2)}€

Factures incluses:
${invoicesToSend.map(inv => `- ${inv.supplier || 'N/A'} - ${inv.invoice_date || 'N/A'} - ${(inv.amount_ttc || 0).toFixed(2)}€`).join('\n')}

Date d'envoi automatique: ${new Date().toLocaleString('fr-FR')}

Cordialement,
Système de gestion des factures`;

        // Récupérer le nom d'expéditeur depuis les paramètres
        let senderName = 'UpGraal';
        try {
          const settings = await serviceClient.entities.AppSettings.filter({ setting_key: 'email_sender_name' });
          if (settings.length > 0 && settings[0].email_sender_name) {
            senderName = settings[0].email_sender_name;
          }
        } catch (err) {
          console.log('[executeAutoSendInvoices] Using default sender name');
        }

        // Envoyer l'email via Resend
        const apiKey = Deno.env.get('RESEND_API_KEY');
        if (!apiKey) {
          throw new Error('RESEND_API_KEY not configured');
        }

        const emailPayload = {
          from: `${senderName} <noreply@upgraal.com>`,
          to: [config.recipient_email],
          subject: `Factures à traiter - ${invoicesToSend.length} document(s) - ${totalTTC.toFixed(2)}€`,
          text: emailBody,
          attachments: attachments
        };

        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(emailPayload)
        });

        const emailResult = await response.json();

        if (!response.ok) {
          throw new Error(`Resend API error: ${JSON.stringify(emailResult)}`);
        }

        console.log(`[executeAutoSendInvoices] Email envoyé pour ${config.name}, ID: ${emailResult.id}`);

        // Mettre à jour le statut de chaque facture à "envoyee"
        for (const invoice of invoicesToSend) {
          try {
            const sendHistoryEntry = {
              sent_at: new Date().toISOString(),
              sent_by: 'automation',
              sent_by_name: 'Automation',
              method: 'automatic',
              recipient: config.recipient_email,
              delivery_method: 'attachment',
              success: true
            };

            const updatedSendHistory = invoice.send_history || [];
            updatedSendHistory.push(sendHistoryEntry);

            await serviceClient.entities.Invoice.update(invoice.id, {
              status: 'envoyee',
              last_sent_at: new Date().toISOString(),
              last_sent_method: 'automatic',
              send_history: updatedSendHistory
            });

            console.log(`[executeAutoSendInvoices] Statut mis à jour: ${invoice.id} -> envoyee`);
          } catch (err) {
            console.error(`[executeAutoSendInvoices] Erreur mise à jour statut ${invoice.id}:`, err.message);
          }
        }

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

        await serviceClient.entities.InvoiceAutomationConfig.update(config.id, {
          last_run_at: new Date().toISOString(),
          last_run_status: 'success',
          run_history: updatedHistory
        });

        results.push({
          config_id: config.id,
          config_name: config.name,
          status: 'success',
          invoices_count: invoicesToSend.length,
          email_id: emailResult.id
        });

      } catch (err) {
        console.error(`[executeAutoSendInvoices] Erreur pour config ${config.id}:`, err.message);

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

        await serviceClient.entities.InvoiceAutomationConfig.update(config.id, {
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

    return Response.json({
      success: true,
      timestamp: now.toISOString(),
      parisTime: currentTime,
      currentDay,
      processed: configsToProcess.length,
      results
    });

  } catch (error) {
    console.error('[executeAutoSendInvoices] Erreur globale:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});