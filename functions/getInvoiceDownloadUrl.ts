import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { createClient } from 'npm:@supabase/supabase-js@2.39.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { invoiceId } = await req.json();

    if (!invoiceId) {
      return Response.json({ error: 'invoiceId required' }, { status: 400 });
    }

    // Récupérer la facture
    const invoices = await base44.entities.Invoice.filter({ id: invoiceId });
    const invoice = invoices[0];

    if (!invoice || !invoice.file_bucket || !invoice.file_path) {
      return Response.json({ error: 'Invoice or file not found' }, { status: 404 });
    }

    // Initialiser Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      return Response.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Générer signed URL (5 minutes)
    const { data, error } = await supabase.storage
      .from(invoice.file_bucket)
      .createSignedUrl(invoice.file_path, 300); // 5 minutes

    if (error) {
      console.error('Signed URL error:', error);
      return Response.json({ error: 'Could not generate download link' }, { status: 500 });
    }

    return Response.json({ url: data.signedUrl });

  } catch (error) {
    console.error('ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});