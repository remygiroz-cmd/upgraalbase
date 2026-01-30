import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const appId = Deno.env.get("BASE44_APP_ID");
    console.log('=== getInvoiceFile called ===');
    console.log('App ID:', appId);
    console.log('Request URL:', req.url);
    
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      console.error('Unauthorized access attempt');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const invoiceId = url.searchParams.get('invoice_id');
    const mode = url.searchParams.get('mode') || 'preview'; // preview or download

    console.log('Invoice ID:', invoiceId, 'Mode:', mode);

    if (!invoiceId) {
      console.error('Missing invoice_id parameter');
      return Response.json({ error: 'invoice_id required' }, { status: 400 });
    }

    // Récupérer la facture
    const invoices = await base44.entities.Invoice.filter({ id: invoiceId });
    const invoice = invoices[0];

    console.log('Invoice found:', !!invoice, 'File URL:', invoice?.file_url);

    if (!invoice || !invoice.file_url) {
      console.error('Invoice not found or no file_url');
      return Response.json({ error: 'Invoice file not found' }, { status: 404 });
    }

    // Récupérer le fichier depuis l'URL Supabase
    console.log('Fetching file from:', invoice.file_url);
    const fileResponse = await fetch(invoice.file_url);
    
    if (!fileResponse.ok) {
      console.error('File fetch failed:', fileResponse.status);
      return Response.json({ error: 'File not accessible' }, { status: 500 });
    }

    console.log('File fetched successfully, content-type:', fileResponse.headers.get('content-type'));

    const fileBlob = await fileResponse.blob();
    const contentType = fileResponse.headers.get('content-type') || 'application/octet-stream';

    // Déterminer le nom du fichier
    const fileName = invoice.file_name || `facture_${invoice.supplier_name || 'document'}.pdf`;

    console.log('Sending file:', fileName, 'Type:', contentType, 'Mode:', mode, 'Size:', fileBlob.size);

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

    console.log('✅ Success: streaming file to client');
    return new Response(fileBlob, {
      status: 200,
      headers: headers
    });

  } catch (error) {
    console.error('❌ ERROR in getInvoiceFile:', error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});