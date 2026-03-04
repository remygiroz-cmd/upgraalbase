/**
 * Webhook inbound Resend → import automatique des factures
 * - Répond 200 IMMÉDIATEMENT à Resend (jamais de 405)
 * - Traitement en background via EdgeRuntime.waitUntil (si dispo) ou Promise fire&forget
 * - Mode dryRun : ?dryRun=1 → log payload sans rien créer
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const MAX_ATTACHMENTS = 10;
const MAX_TOTAL_SIZE = 30 * 1024 * 1024; // 30 MB
const TARGET_EMAIL = 'factures@factures.upgraal.com';

async function sha256(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function processAttachments(base44, payload, dryRun = false) {
  console.log('[inboundFactures] ▶ processAttachments start, dryRun=', dryRun);

  // Resend envelope : event type "email.received" wraps data in payload.data.email
  const email = payload?.data?.email || payload;

  const emailFrom = email.from || '';
  const emailSubject = email.subject || '';
  const emailMessageId = email.message_id || email.id || '';
  const emailAttachments = email.attachments || [];
  const toStr = Array.isArray(email.to) ? email.to.join(',') : (email.to || '');

  console.log(`[inboundFactures] from="${emailFrom}" subject="${emailSubject}" messageId="${emailMessageId}"`);
  console.log(`[inboundFactures] to="${toStr}" (TARGET_EMAIL="${TARGET_EMAIL}")`);
  console.log(`[inboundFactures] attachments count=${emailAttachments.length}`);

  // Workspace
  const workspaceId = Deno.env.get('INVOICE_WORKSPACE_ID') || '';
  if (!workspaceId) {
    console.error('[inboundFactures] ⚠ INVOICE_WORKSPACE_ID not set — invoices may go to wrong workspace');
  } else {
    console.log('[inboundFactures] workspaceId=', workspaceId);
  }

  // Vérif destinataire
  if (!toStr.toLowerCase().includes(TARGET_EMAIL.toLowerCase())) {
    console.warn(`[inboundFactures] SKIP: recipient "${toStr}" does not match TARGET_EMAIL "${TARGET_EMAIL}"`);
    return;
  }

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

  if (dryRun) {
    console.log('[inboundFactures] DRY RUN — would process', limited.length, 'attachments:');
    limited.forEach((a, i) => {
      console.log(`  [${i}] filename="${a.filename || a.name}" mime="${a.content_type || a.type}" size=${a.size || '?'} hasContent=${!!a.content} hasUrl=${!!(a.url || a.attachment_url)}`);
    });
    return;
  }

  for (const attachment of limited) {
    const filename = attachment.filename || attachment.name || 'facture.pdf';
    const mimeType = attachment.content_type || attachment.mime_type || attachment.type || 'application/pdf';
    const normalizedMime = mimeType.split(';')[0].trim().toLowerCase();

    console.log(`[inboundFactures] → Processing: "${filename}" mime="${normalizedMime}"`);

    if (!ALLOWED_MIME.includes(normalizedMime)) {
      console.log(`[inboundFactures]   SKIP unsupported mime: ${normalizedMime}`);
      continue;
    }

    // Récupération du contenu
    let fileContent;
    try {
      if (attachment.content) {
        console.log(`[inboundFactures]   Reading base64 content (${attachment.content.length} chars)`);
        const b64 = typeof attachment.content === 'string' ? attachment.content : '';
        const binaryStr = atob(b64);
        fileContent = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          fileContent[i] = binaryStr.charCodeAt(i);
        }
      } else if (attachment.url || attachment.attachment_url) {
        const attachUrl = attachment.url || attachment.attachment_url;
        console.log(`[inboundFactures]   Downloading from ${attachUrl}`);
        const resp = await fetch(attachUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${attachUrl}`);
        fileContent = new Uint8Array(await resp.arrayBuffer());
      } else {
        throw new Error('No content or URL for attachment');
      }
      console.log(`[inboundFactures]   Content OK: ${fileContent.length} bytes`);
    } catch (err) {
      console.error(`[inboundFactures]   DOWNLOAD ERROR for "${filename}":`, err.message);
      continue;
    }

    if (fileContent.length > MAX_FILE_SIZE) {
      console.log(`[inboundFactures]   SKIP too large: ${fileContent.length} bytes`);
      continue;
    }

    // Déduplication
    const dedupeKey = await sha256(`${emailMessageId}__${filename}`);
    try {
      const existing = await base44.asServiceRole.entities.Invoice.filter({ dedupe_key: dedupeKey });
      if (existing.length > 0) {
        console.log(`[inboundFactures]   SKIP duplicate: "${filename}" (dedupeKey=${dedupeKey})`);
        continue;
      }
    } catch (err) {
      console.warn(`[inboundFactures]   Dedupe check failed for "${filename}":`, err.message);
    }

    // Upload
    let file_url;
    try {
      const file = new File([fileContent], filename, { type: normalizedMime });
      console.log(`[inboundFactures]   Uploading "${filename}"...`);
      const uploaded = await base44.asServiceRole.integrations.Core.UploadFile({ file });
      file_url = uploaded.file_url;
      if (!file_url) throw new Error('No file_url returned from UploadFile');
      console.log(`[inboundFactures]   Upload OK: ${file_url.substring(0, 80)}`);
    } catch (err) {
      console.error(`[inboundFactures]   UPLOAD ERROR for "${filename}":`, err.message);
      continue;
    }

    // Création facture
    let invoice;
    try {
      const invoiceData = {
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
      };
      if (workspaceId) invoiceData.workspace_id = workspaceId;

      console.log(`[inboundFactures]   Creating Invoice for "${filename}"...`);
      invoice = await base44.asServiceRole.entities.Invoice.create(invoiceData);
      console.log(`[inboundFactures]   ✅ Invoice created: id=${invoice.id} file="${filename}"`);
    } catch (err) {
      console.error(`[inboundFactures]   INVOICE CREATE ERROR for "${filename}":`, err.message);
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
        console.log(`[inboundFactures]   AI scan done for invoice ${invoice.id}`);
      })
      .catch(async (err) => {
        console.error(`[inboundFactures]   AI scan failed for ${invoice.id}:`, err.message);
        await base44.asServiceRole.entities.Invoice.update(invoice.id, {
          ai_processing: false,
          status: 'a_verifier',
        });
      });
  }

  console.log('[inboundFactures] ✅ processAttachments done');
}

Deno.serve(async (req) => {
  console.log('[inboundFactures] method=', req.method, 'url=', req.url);

  // Toujours 200 quelle que soit la méthode (jamais de 405 pour Resend)
  if (req.method !== 'POST') {
    return Response.json({ ok: true, method: req.method }, { status: 200 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dryRun') === '1';

  // Vérification du secret (query param ?secret=...)
  const expectedSecret = Deno.env.get('RESEND_INBOUND_SECRET');
  if (expectedSecret) {
    const querySecret = url.searchParams.get('secret');
    if (!querySecret || querySecret !== expectedSecret) {
      console.warn('[inboundFactures] Invalid or missing secret, ignoring request');
      return Response.json({ success: true, warning: 'unauthorized' }, { status: 200 });
    }
  }

  // Parse body
  let payload;
  try {
    const text = await req.text();
    console.log('[inboundFactures] raw body (first 800):', text.substring(0, 800));
    payload = JSON.parse(text);
  } catch (err) {
    console.error('[inboundFactures] Failed to parse JSON body:', err.message);
    return Response.json({ success: true, warning: 'invalid JSON body' }, { status: 200 });
  }

  console.log('[inboundFactures] event type=', payload?.type, '| top-level keys=', Object.keys(payload || {}));

  // ACK immédiat 200, traitement en background
  const base44 = createClientFromRequest(req);
  const job = processAttachments(base44, payload, dryRun).catch(err => {
    console.error('[inboundFactures] Background job error:', err.message);
  });

  // Utiliser EdgeRuntime.waitUntil si disponible pour garantir l'exécution
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
    EdgeRuntime.waitUntil(job);
    console.log('[inboundFactures] ACK 200 sent (EdgeRuntime.waitUntil registered)');
  } else {
    console.log('[inboundFactures] ACK 200 sent (fire & forget)');
  }

  return Response.json({ success: true, dryRun }, { status: 200 });
});