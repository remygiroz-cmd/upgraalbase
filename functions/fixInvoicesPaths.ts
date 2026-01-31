import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Récupérer toutes les factures
    const invoices = await base44.asServiceRole.entities.Invoice.list('-created_date', 1000);
    
    const fixed = [];
    const failed = [];

    for (const invoice of invoices) {
      // Si file_bucket et file_path sont déjà remplis, skip
      if (invoice.file_bucket && invoice.file_path) {
        continue;
      }

      // Si pas de file_url, impossible de fixer
      if (!invoice.file_url) {
        failed.push({ id: invoice.id, reason: 'No file_url' });
        continue;
      }

      try {
        // Extraire bucket et path depuis l'URL
        const urlParts = invoice.file_url.split('/storage/v1/object/public/');
        
        if (urlParts.length < 2) {
          failed.push({ id: invoice.id, reason: 'Invalid URL format' });
          continue;
        }

        const pathParts = urlParts[1].split('/');
        const fileBucket = pathParts[0];
        const filePath = pathParts.slice(1).join('/');

        // Mettre à jour la facture
        await base44.asServiceRole.entities.Invoice.update(invoice.id, {
          file_bucket: fileBucket,
          file_path: filePath
        });

        fixed.push({ id: invoice.id, bucket: fileBucket, path: filePath });
      } catch (err) {
        failed.push({ id: invoice.id, reason: err.message });
      }
    }

    return Response.json({
      success: true,
      fixed: fixed.length,
      failed: failed.length,
      details: {
        fixed_count: fixed.length,
        failed_count: failed.length,
        failed_details: failed.slice(0, 10) // Limiter à 10 pour la lisibilité
      }
    });

  } catch (error) {
    console.error('Error in fixInvoicesPaths:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});