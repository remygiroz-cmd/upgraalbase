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

    // Check if file info is available
    if (!invoice.file_bucket || !invoice.file_path) {
      return Response.json({ 
        error: 'File information missing. Please re-upload the file.' 
      }, { status: 404 });
    }

    // Download file from Supabase Storage using service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const storageUrl = `${supabaseUrl}/storage/v1/object/${invoice.file_bucket}/${invoice.file_path}`;
    
    const fileResponse = await fetch(storageUrl, {
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`
      }
    });

    if (!fileResponse.ok) {
      return Response.json({ 
        error: 'File not found in storage' 
      }, { status: 404 });
    }

    // Stream the file back to client
    const fileBlob = await fileResponse.blob();
    
    return new Response(fileBlob, {
      status: 200,
      headers: {
        'Content-Type': invoice.file_mime || 'application/pdf',
        'Content-Disposition': `attachment; filename="${invoice.file_name || 'invoice.pdf'}"`,
        'Cache-Control': 'no-store',
        'Content-Length': invoice.file_size?.toString() || fileBlob.size.toString()
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