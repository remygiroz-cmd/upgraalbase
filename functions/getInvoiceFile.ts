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
      console.error('❌ Unauthorized access attempt');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const invoiceId = url.searchParams.get('invoice_id');
    const mode = url.searchParams.get('mode') || 'preview';

    console.log('User:', user.email);
    console.log('Invoice ID:', invoiceId);
    console.log('Mode:', mode);

    if (!invoiceId) {
      console.error('❌ Missing invoice_id parameter');
      return Response.json({ error: 'invoice_id required' }, { status: 400 });
    }

    // Récupérer la facture
    console.log('🔍 Fetching invoice from database...');
    const invoices = await base44.entities.Invoice.filter({ id: invoiceId });
    const invoice = invoices[0];

    if (!invoice) {
      console.error('❌ Invoice not found in database');
      return Response.json({ error: 'Invoice not found' }, { status: 404 });
    }

    console.log('✅ Invoice found:');
    console.log('  - ID:', invoice.id);
    console.log('  - File name:', invoice.file_name);
    console.log('  - File URL:', invoice.file_url);
    console.log('  - Supplier:', invoice.supplier_name);

    if (!invoice.file_url) {
      console.error('❌ Invoice has no file_url');
      return Response.json({ error: 'Invoice file URL missing' }, { status: 404 });
    }

    // Extraire bucket et path depuis l'URL Supabase
    let bucket, filePath;
    try {
      const fileUrlObj = new URL(invoice.file_url);
      const pathParts = fileUrlObj.pathname.split('/');
      const objectIndex = pathParts.indexOf('object');
      if (objectIndex !== -1 && pathParts[objectIndex + 1] === 'public') {
        bucket = pathParts[objectIndex + 2];
        filePath = pathParts.slice(objectIndex + 3).join('/');
      }
      console.log('📦 Storage info:');
      console.log('  - Bucket:', bucket || 'unknown');
      console.log('  - Path:', filePath || 'unknown');
      console.log('  - Full URL:', invoice.file_url);
    } catch (e) {
      console.error('⚠️ Could not parse storage URL:', e.message);
    }

    // Récupérer le fichier depuis l'URL Supabase
    console.log('⬇️ Fetching file from Supabase...');
    const fileResponse = await fetch(invoice.file_url);
    
    console.log('📊 Supabase response:');
    console.log('  - Status:', fileResponse.status, fileResponse.statusText);
    console.log('  - Content-Type:', fileResponse.headers.get('content-type'));
    console.log('  - Content-Length:', fileResponse.headers.get('content-length'));

    if (!fileResponse.ok) {
      console.error('❌ File fetch failed');
      console.error('  - Status:', fileResponse.status);
      console.error('  - Status text:', fileResponse.statusText);
      const errorText = await fileResponse.text();
      console.error('  - Error body:', errorText);
      return Response.json({ 
        error: 'File not accessible',
        details: {
          status: fileResponse.status,
          statusText: fileResponse.statusText,
          bucket: bucket || 'unknown',
          path: filePath || 'unknown'
        }
      }, { status: fileResponse.status === 404 ? 404 : 403 });
    }

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