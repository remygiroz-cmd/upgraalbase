import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const invoiceId = url.searchParams.get('invoice_id');
    const mode = url.searchParams.get('mode') || 'preview'; // preview or download

    if (!invoiceId) {
      return Response.json({ error: 'invoice_id required' }, { status: 400 });
    }

    // Récupérer la facture
    const invoices = await base44.entities.Invoice.filter({ id: invoiceId });
    const invoice = invoices[0];

    if (!invoice || !invoice.file_url) {
      return Response.json({ error: 'Invoice file not found' }, { status: 404 });
    }

    // Récupérer le fichier depuis l'URL Supabase
    const fileResponse = await fetch(invoice.file_url);
    
    if (!fileResponse.ok) {
      return Response.json({ error: 'File not accessible' }, { status: 500 });
    }

    const fileBlob = await fileResponse.blob();
    const contentType = fileResponse.headers.get('content-type') || 'application/octet-stream';

    // Déterminer le nom du fichier
    const fileName = invoice.file_name || `facture_${invoice.supplier_name || 'document'}.pdf`;

    // Headers selon le mode
    const headers = new Headers();
    headers.set('Content-Type', contentType);
    
    if (mode === 'download') {
      // Mode téléchargement: forcer le download
      headers.set('Content-Disposition', `attachment; filename="${fileName}"`);
    } else {
      // Mode preview: affichage inline
      headers.set('Content-Disposition', `inline; filename="${fileName}"`);
    }

    // Empêcher la mise en cache pour les fichiers sensibles
    headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    headers.set('Pragma', 'no-cache');
    headers.set('Expires', '0');

    return new Response(fileBlob, {
      status: 200,
      headers: headers
    });

  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});