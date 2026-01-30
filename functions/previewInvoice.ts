import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { createClient } from 'npm:@supabase/supabase-js@2.39.0';

Deno.serve(async (req) => {
  try {
    console.log('=== previewInvoice ===');
    
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      console.error('❌ Unauthorized');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const invoiceId = url.searchParams.get('id');

    if (!invoiceId) {
      console.error('❌ Missing id parameter');
      return Response.json({ error: 'id required' }, { status: 400 });
    }

    // Récupérer la facture
    console.log('🔍 Fetching invoice:', invoiceId);
    const invoices = await base44.entities.Invoice.filter({ id: invoiceId });
    const invoice = invoices[0];

    if (!invoice) {
      console.error('❌ Invoice not found');
      return Response.json({ error: 'Invoice not found' }, { status: 404 });
    }

    console.log('✅ Invoice found:');
    console.log('  - Bucket:', invoice.file_bucket);
    console.log('  - Path:', invoice.file_path);
    console.log('  - Name:', invoice.file_name);
    console.log('  - MIME:', invoice.file_mime);

    if (!invoice.file_bucket || !invoice.file_path) {
      console.error('❌ Missing file_bucket or file_path');
      return Response.json({ 
        error: 'File location missing',
        details: { bucket: invoice.file_bucket, path: invoice.file_path }
      }, { status: 404 });
    }

    // Initialiser Supabase client avec service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Missing Supabase credentials');
      return Response.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Télécharger le fichier depuis Supabase Storage
    console.log('⬇️ Downloading from storage:', invoice.file_bucket, invoice.file_path);
    const { data, error } = await supabase.storage
      .from(invoice.file_bucket)
      .download(invoice.file_path);

    if (error) {
      console.error('❌ Storage download error:', error);
      return Response.json({ 
        error: 'File not accessible',
        details: { message: error.message, bucket: invoice.file_bucket, path: invoice.file_path }
      }, { status: error.message.includes('not found') ? 404 : 403 });
    }

    console.log('✅ File downloaded, size:', data.size);

    // Déterminer le content type
    const contentType = invoice.file_mime || 'application/octet-stream';
    const fileName = invoice.file_name || 'facture.pdf';

    // Headers pour preview inline
    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Content-Disposition', `inline; filename="${fileName}"`);
    headers.set('Content-Length', data.size.toString());
    headers.set('Cache-Control', 'private, no-store, max-age=0');

    console.log('✅ Streaming file for preview');
    return new Response(data, { status: 200, headers });

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});