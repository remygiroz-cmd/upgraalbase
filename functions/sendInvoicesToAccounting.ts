import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { invoice_ids, recipients, method = 'manuel' } = await req.json();

    if (!invoice_ids || invoice_ids.length === 0) {
      return Response.json({ error: 'invoice_ids required' }, { status: 400 });
    }

    if (!recipients || recipients.length === 0) {
      return Response.json({ error: 'recipients required' }, { status: 400 });
    }

    // Charger les factures
    const invoices = await Promise.all(
      invoice_ids.map(id => base44.asServiceRole.entities.Invoice.filter({ id }))
    );
    const flatInvoices = invoices.flat().filter(Boolean);

    if (flatInvoices.length === 0) {
      return Response.json({ error: 'No invoices found' }, { status: 404 });
    }

    // Préparer l'email
    const invoicesList = flatInvoices.map(inv => 
      `- ${inv.supplier_name || 'N/A'} | ${inv.invoice_date || 'N/A'} | ${inv.amount_ttc?.toFixed(2) || '0.00'}€`
    ).join('\n');

    const emailBody = `
Bonjour,

Veuillez trouver ci-joint ${flatInvoices.length} facture${flatInvoices.length > 1 ? 's' : ''} fournisseur${flatInvoices.length > 1 ? 's' : ''} :

${invoicesList}

Total TTC : ${flatInvoices.reduce((sum, inv) => sum + (inv.amount_ttc || 0), 0).toFixed(2)}€

Téléchargez les fichiers via les liens suivants :
${flatInvoices.map(inv => `${inv.supplier_name || 'Facture'} : ${inv.file_url}`).join('\n')}

Cordialement,
${user.full_name || user.email}
    `.trim();

    const emailSubject = `Factures fournisseurs - ${flatInvoices.length} document${flatInvoices.length > 1 ? 's' : ''}`;

    const errors = [];
    const successRecipients = [];

    // Envoyer à chaque destinataire
    for (const recipient of recipients) {
      try {
        await base44.integrations.Core.SendEmail({
          to: recipient,
          subject: emailSubject,
          body: emailBody
        });
        successRecipients.push(recipient);
      } catch (error) {
        errors.push(`${recipient}: ${error.message}`);
      }
    }

    const sendDate = new Date().toISOString();

    // Mettre à jour les factures
    for (const invoice of flatInvoices) {
      const newHistory = [
        ...(invoice.send_history || []),
        {
          date: sendDate,
          recipient: recipients.join(', '),
          success: errors.length === 0,
          error: errors.length > 0 ? errors.join('; ') : null,
          method: method
        }
      ];

      const updateData = {
        send_history: newHistory
      };

      // Si envoi réussi, marquer comme envoyée
      if (errors.length === 0) {
        updateData.status = 'envoyee';
        updateData.sent_at = sendDate;
        updateData.sent_method = method;
        updateData.sent_to = recipients.join(', ');
      }

      await base44.asServiceRole.entities.Invoice.update(invoice.id, updateData);
    }

    return Response.json({
      success: errors.length === 0,
      invoices_sent: flatInvoices.length,
      errors: errors,
      message: errors.length === 0 
        ? `${flatInvoices.length} facture(s) envoyée(s) avec succès`
        : `Envoi partiel : ${successRecipients.length}/${recipients.length} destinataire(s)`
    });

  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});