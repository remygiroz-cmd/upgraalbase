/**
 * Webhook inbound Resend → import automatique des factures
 * Répond IMMÉDIATEMENT 200, puis traite les pièces jointes en background.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const MAX_ATTACHMENTS = 10;
const MAX_TOTAL_SIZE = 30 * 1024 * 1024; // 30 MB

async function sha256(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function processAttachments(base44, payload) {
  const { from, to, subject, message_id: messageId, attachments = [], data } = payload;

  // Resend wraps the email in a "data" object for email.received events
  const email = data?.email || payload;
  const emailFrom = email.from || from || '';
  const emailSubject = email.subject || subject || '';
  const emailMessageId = email.message_id || messageId || '';
  const emailAttachments = email.attachments || attachments || [];

  console.log(`[inboundFactures] Processing: from=${emailFrom} subject="${emailSubject}" attachments=${emailAttachments.length} messageId=${emailMessageId}`);

  if (emailAttachments.length === 0) {
    console.log('[inboundFactures] No attachments, nothing to import');
    return;
  }

  const totalSize = emailAttachments.reduce((sum, a) => sum + (a.size || a.content?.length || 0), 0);
  if (totalSize > MAX_TOTAL_SIZE) {
    console.warn('[inboundFactures] Total attachments too large, skipping');
    return;
  }

  const limited = emailAttachments.slice(0, MAX_ATTACHMENTS);

  for (const attachment of limited) {
    const filename = attachment.filename || attachment.name || 'facture.pdf';
    const mimeType = attachment.content_type || attachment.mime_type || attachment.type || 'application/pdf';
    const normalizedMime = mimeType.split(';')[0].trim().toLowerCase();

    if (!ALLOWED_MIME.includes(normalizedMime)) {
      console.log(`[inboundFactures] SKIP unsupported mime ${normalizedMime} for ${filename}`);
      continue;
    }

    // Récupération du contenu
    let fileContent;
    try {
      if (attachment.content) {
        const b64 = typeof attachment.content === 'string' ? attachment.content : '';
        const binaryStr = atob(b64);
        fileContent = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          fileContent[i] = binaryStr.charCodeAt(i);
        }
      } else if (attachment.url || attachment.attachment_url) {
        const attachUrl = attachment.url || attachment.attachment_url;
        console.log(`[inboundFactures] Downloading from ${attachUrl}`);
        const resp = await fetch(attachUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        fileContent = new Uint8Array(await resp.arrayBuffer());
      } else {
        throw new Error('No content or URL');
      }
    } catch (err) {
      console.error(`[inboundFactures] Failed to get content for ${filename}:`, err.message);
      continue;
    }

    if (fileContent.length > MAX_FILE_SIZE) {
      console.log(`[inboundFactures] SKIP too large: ${filename} (${fileContent.length} bytes)`);
      continue;
    }

    // Déduplication
    const dedupeKey = await sha256(`${emailMessageId}__${filename}`);
    try {
      const existing = await base44.asServiceRole.entities.Invoice.filter({ dedupe_key: dedupeKey });
      if (existing.length > 0) {
        console.log(`[inboundFactures] SKIP duplicate: ${filename}`);
        continue;
      }
    } catch (err) {
      console.warn(`[inboundFactures] Dedupe check failed for ${filename}:`, err.message);
    }

    // Upload
    let file_url;
    try {
      const file = new File([fileContent], filename, { type: normalizedMime });
      const uploaded = await base44.asServiceRole.integrations.Core.UploadFile({ file });
      file_url = uploaded.file_url;
      if (!file_url) throw new Error('No file_url returned');
      console.log(`[inboundFactures] Uploaded: ${filename}`);
    } catch (err) {
      console.error(`[inboundFactures] Upload failed for ${filename}:`, err.message);
      continue;
    }

    // Création facture
    let invoice;
    try {
      invoice = await base44.asServiceRole.entities.Invoice.create({
        file_url,
        file_name: filename,
        file_mime: normalizedMime,
        file_size: fileContent.length,
        original_size: fileContent.length,
        optimized_size: fileContent.length,
        status: 'non_envoyee',
        ai_processing: true,
        source: 'email_inbound',
        source_email_from: emailFrom,
        source_email_subject: emailSubject,
        source_email_message_id: emailMessageId,
        received_at: new Date().toISOString(),
        dedupe_key: dedupeKey,
      });
      console.log(`[inboundFactures] Invoice created: ${invoice.id} (${filename})`);
    } catch (err) {
      console.error(`[inboundFactures] Invoice create failed for ${filename}:`, err.message);
      continue;
    }

    // Scan IA (fire & forget)
    base44.asServiceRole.functions.invoke('extractInvoiceData', { file_url })
      .then(async (response) => {
        const d = response.data || response;
        const normalizedName = `${d.invoice_date || 'XXXX-XX-XX'}__${(d.supplier || 'FOURNISSEUR').replace(/[^a-zA-Z0-9]/g, '_')}__${(d.amount_ttc || 0).toFixed(2)}.pdf`;
        await base44.asServiceRole.entities.Invoice.update(invoice.id, {
          normalized_file_name: normalizedName,
          supplier: d.supplier,
          invoice_date: d.invoice_date,
          categories: d.categories || [],
          short_description: d.short_description,
          accounting_account: d.accounting_account,
          amount_ht: d.amount_ht,
          amount_ttc: d.amount_ttc,
          vat: d.vat,
          indexed_text: d.indexed_text,
          ai_confidence: d.confidence,
          status: d.status || 'non_envoyee',
          ai_processing: false,
        });
        console.log(`[inboundFactures] AI done for ${invoice.id}`);
      })
      .catch(async (err) => {
        console.error(`[inboundFactures] AI failed for ${invoice.id}:`, err.message);
        await base44.asServiceRole.entities.Invoice.update(invoice.id, {
          ai_processing: false,
          status: 'a_verifier',
        });
      });
  }
}

Deno.serve(async (req) => {
  console.log('[inboundFactures] method=', req.method, 'url=', req.url);

  // Toujours 200 quelle que soit la méthode (jamais de 405)
  if (req.method !== 'POST') {
    return Response.json({ ok: true, method: req.method }, { status: 200 });
  }

  // Vérification du secret (query param ?secret=...)
  const expectedSecret = Deno.env.get('RESEND_INBOUND_SECRET');
  if (expectedSecret) {
    const url = new URL(req.url);
    const querySecret = url.searchParams.get('secret');
    if (!querySecret || querySecret !== expectedSecret) {
      console.warn('[inboundFactures] Invalid or missing secret');
      return Response.json({ success: true, warning: 'unauthorized' }, { status: 200 });
    }
  }

  // Parse body
  let payload;
  try {
    const text = await req.text();
    console.log('[inboundFactures] raw body (first 500):', text.substring(0, 500));
    payload = JSON.parse(text);
  } catch (err) {
    console.error('[inboundFactures] Failed to parse body:', err.message);
    return Response.json({ success: true, warning: 'invalid JSON body' }, { status: 200 });
  }

  console.log('[inboundFactures] event type:', payload?.type, '| keys:', Object.keys(payload || {}));

  // ── ACK IMMÉDIAT 200 ───────────────────────────────────────────────────────
  const base44 = createClientFromRequest(req);
  processAttachments(base44, payload).catch(err => {
    console.error('[inboundFactures] Background processing error:', err.message);
  });

  console.log('[inboundFactures] ACK 200 sent');
  return Response.json({ success: true }, { status: 200 });
});