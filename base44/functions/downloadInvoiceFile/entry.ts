import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Extract invoice ID from URL
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const invoiceId = pathParts[pathParts.length - 1];

    if (!invoiceId) {
      return Response.json({ error: 'Invoice ID required' }, { status: 400 });
    }

    // Get invoice from database
    const invoices = await base44.asServiceRole.entities.Invoice.filter({ id: invoiceId });
    const invoice = invoices[0];

    if (!invoice) {
      return Response.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Check if file URL exists
    if (!invoice.file_url) {
      return Response.json({ 
        error: 'File URL missing. Please re-upload the file.' 
      }, { status: 404 });
    }

    // Fetch the file from the public URL
    const fileResponse = await fetch(invoice.file_url);

    if (!fileResponse.ok) {
      return Response.json({ 
        error: 'File not found in storage' 
      }, { status: 404 });
    }

    // Stream the file back to client with download headers
    const fileBlob = await fileResponse.blob();
    
    return new Response(fileBlob, {
      status: 200,
      headers: {
        'Content-Type': invoice.file_mime || 'application/pdf',
        'Content-Disposition': `attachment; filename="${invoice.file_name || 'invoice.pdf'}"`,
        'Cache-Control': 'no-store'
      }
    });

  } catch (error) {
    console.error('Download error:', error);
    return Response.json({ 
      error: 'Download failed',
      details: error.message 
    }, { status: 500 });
  }
});