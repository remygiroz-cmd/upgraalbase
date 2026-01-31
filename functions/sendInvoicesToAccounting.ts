import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { invoice_ids, recipient, subject, body, method = 'manual' } = await req.json();

    if (!invoice_ids || !Array.isArray(invoice_ids) || invoice_ids.length === 0) {
      return Response.json({ error: 'invoice_ids array required' }, { status: 400 });
    }

    if (!recipient) {
      return Response.json({ error: 'recipient email required' }, { status: 400 });
    }

    // Récupérer les factures
    const invoices = await Promise.all(
      invoice_ids.map(id => base44.asServiceRole.entities.Invoice.filter({ id }))
    );
    const flatInvoices = invoices.flat();

    if (flatInvoices.length === 0) {
      return Response.json({ error: 'No invoices found' }, { status: 404 });
    }

    // Créer le contenu de l'email
    let emailBody = body || `Bonjour,\n\nVeuillez trouver ci-joint ${flatInvoices.length} facture(s) :\n\n`;
    
    flatInvoices.forEach((inv, i) => {
      emailBody += `${i + 1}. ${inv.supplier_name || 'Fournisseur inconnu'} - ${inv.amount_ttc ? inv.amount_ttc + '€' : 'Montant non renseigné'}\n`;
      emailBody += `   Date: ${inv.invoice_date || 'Non renseignée'}\n`;
      emailBody += `   Fichier: ${inv.file_url}\n\n`;
    });

    emailBody += `\nCordialement,\n${user.full_name || user.email}`;

    // Envoi de l'email
    try {
      await base44.integrations.Core.SendEmail({
        to: recipient,
        subject: subject || `Factures - ${new Date().toLocaleDateString('fr-FR')}`,
        body: emailBody
      });

      // Mise à jour du statut et historique pour chaque facture
      const now = new Date().toISOString();
      await Promise.all(
        flatInvoices.map(inv => {
          const newHistory = [
            ...(inv.send_history || []),
            {
              date: now,
              recipient,
              method,
              success: true
            }
          ];

          return base44.asServiceRole.entities.Invoice.update(inv.id, {
            status: 'envoyee',
            sent_at: now,
            sent_by: user.email,
            send_history: newHistory
          });
        })
      );

      return Response.json({
        success: true,
        sent_count: flatInvoices.length,
        recipient
      });

    } catch (emailError) {
      // En cas d'erreur d'envoi, enregistrer l'échec dans l'historique
      const now = new Date().toISOString();
      await Promise.all(
        flatInvoices.map(inv => {
          const newHistory = [
            ...(inv.send_history || []),
            {
              date: now,
              recipient,
              method,
              success: false,
              error: emailError.message
            }
          ];

          return base44.asServiceRole.entities.Invoice.update(inv.id, {
            send_history: newHistory
          });
        })
      );

      throw emailError;
    }

  } catch (error) {
    console.error('Send error:', error);
    return Response.json({ 
      error: error.message,
      success: false
    }, { status: 500 });
  }
});