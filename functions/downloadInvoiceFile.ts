import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const appId = Deno.env.get("BASE44_APP_ID");
    console.log('=== downloadInvoiceFile called ===');
    console.log('App ID:', appId);
    
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      console.error('❌ Unauthorized');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const invoiceId = url.searchParams.get('invoice_id');

    console.log('User:', user.email);
    console.log('Invoice ID:', invoiceId);

    if (!invoiceId) {
      console.error('❌ Missing invoice_id');
      return Response.json({ error: 'invoice_id required' }, { status: 400 });
    }

    // Récupérer la facture
    const invoices = await base44.entities.Invoice.filter({ id: invoiceId });
    const invoice = invoices[0];

    if (!invoice || !invoice.file_url) {
      console.error('❌ Invoice not found or no file_url');
      return Response.json({ error: 'Invoice file not found' }, { status: 404 });
    }

    console.log('✅ Invoice found:', invoice.file_name);
    console.log('📥 Downloading from:', invoice.file_url);

    // Récupérer le fichier
    const fileResponse = await fetch(invoice.file_url);
    
    if (!fileResponse.ok) {
      console.error('❌ Download failed:', fileResponse.status);
      return Response.json({ error: 'File not accessible' }, { status: fileResponse.status });
    }

    const fileBlob = await fileResponse.blob();
    const contentType = fileResponse.headers.get('content-type') || 'application/octet-stream';
    const fileName = invoice.file_name || 'facture.pdf';

    console.log('✅ Streaming download:', fileName, 'Size:', fileBlob.size);

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Content-Disposition', `attachment; filename="${fileName}"`);
    headers.set('Content-Length', fileBlob.size.toString());
    headers.set('Cache-Control', 'private, no-cache');

    return new Response(fileBlob, { status: 200, headers });

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});