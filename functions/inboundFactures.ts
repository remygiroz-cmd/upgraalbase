/**
 * Webhook inbound Resend → import automatique des factures
 * POST /api/inbound/factures
 *
 * Sécurité : header "svix-signature" OU "x-resend-signature" OU query param "secret"
 * Anti-doublon : hash sha256(messageId + filename) stocké dans Invoice.dedupe_key
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

Deno.serve(async (req) => {
  console.log('[inboundFactures] method=', req.method, 'url=', req.url);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  // ── DEBUG COMPAT : HEAD/GET → 200 sans import (diagnostic Resend) ─────────
  if (req.method === 'HEAD') {
    return Response.json({ ok: true, method: req.method, url: req.url });
  }
  if (req.method === 'GET') {
    return Response.json({ ok: true, method: req.method, url: req.url });
  }

  // ── Méthodes non gérées → 200 pour éviter les retries Resend ─────────────
  if (req.method !== 'POST') {
    console.warn('[inboundFactures] Unexpected method:', req.method);
    return Response.json({ ok: false, method: req.method, url: req.url });
  }

  // ── Vérification du secret ─────────────────────────────────────────────────
  const expectedSecret = Deno.env.get('RESEND_INBOUND_SECRET');
  const headerSecret = req.headers.get('x-resend-signature') || req.headers.get('svix-signature');
  const url = new URL(req.url);
  const querySecret = url.searchParams.get('secret');

  if (expectedSecret) {
    const provided = headerSecret || querySecret;
    if (!provided || provided !== expectedSecret) {
      console.warn('[inboundFactures] Unauthorized: invalid secret');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // ── Parse du body ──────────────────────────────────────────────────────────
  let payload;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { from, to, subject, message_id: messageId, attachments = [] } = payload;

  console.log(`[inboundFactures] Received from=${from} to=${to} subject="${subject}" attachments=${attachments.length} messageId=${messageId}`);

  // ── Vérif destinataire ─────────────────────────────────────────────────────
  const toStr = Array.isArray(to) ? to.join(',') : (to || '');
  if (!toStr.toLowerCase().includes(TARGET_EMAIL)) {
    return Response.json({ error: `Wrong recipient: ${toStr}` }, { status: 400 });
  }

  // ── Anti-spam ──────────────────────────────────────────────────────────────
  if (attachments.length > MAX_ATTACHMENTS) {
    return Response.json({ error: `Too many attachments: ${attachments.length}` }, { status: 400 });
  }

  const totalSize = attachments.reduce((sum, a) => sum + (a.size || a.content?.length || 0), 0);
  if (totalSize > MAX_TOTAL_SIZE) {
    return Response.json({ error: 'Total attachments size exceeds 30MB' }, { status: 400 });
  }

  // ── Init SDK service role ──────────────────────────────────────────────────
  const base44 = createClientFromRequest(req);

  let imported_count = 0;
  let skipped_count = 0;
  const errors = [];

  for (const attachment of attachments) {
    const filename = attachment.filename || attachment.name || 'facture';
    const mimeType = attachment.content_type || attachment.mime_type || attachment.type || '';

    // Filtre MIME
    const normalizedMime = mimeType.split(';')[0].trim().toLowerCase();
    if (!ALLOWED_MIME.includes(normalizedMime)) {
      console.log(`[inboundFactures] SKIP: unsupported mime ${normalizedMime} for ${filename}`);
      skipped_count++;
      continue;
    }

    // ── Récupération du contenu ────────────────────────────────────────────
    let fileContent; // Uint8Array
    try {
      if (attachment.content) {
        // base64 content direct
        const b64 = typeof attachment.content === 'string' ? attachment.content : '';
        const binaryStr = atob(b64);
        fileContent = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          fileContent[i] = binaryStr.charCodeAt(i);
        }
      } else if (attachment.url || attachment.attachment_url) {
        // URL à télécharger
        const attachUrl = attachment.url || attachment.attachment_url;
        console.log(`[inboundFactures] Downloading attachment from ${attachUrl}`);
        const resp = await fetch(attachUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching attachment`);
        const buf = await resp.arrayBuffer();
        fileContent = new Uint8Array(buf);
      } else {
        throw new Error('No content or URL for attachment');
      }
    } catch (err) {
      console.error(`[inboundFactures] Error fetching attachment ${filename}:`, err.message);
      errors.push({ filename, error: err.message });
      continue;
    }

    // Vérif taille
    if (fileContent.length > MAX_FILE_SIZE) {
      console.log(`[inboundFactures] SKIP: file too large ${filename} (${fileContent.length} bytes)`);
      skipped_count++;
      continue;
    }

    // ── Déduplication ──────────────────────────────────────────────────────
    const dedupeKey = await sha256(`${messageId || ''}__${filename}`);
    try {
      const existing = await base44.asServiceRole.entities.Invoice.filter({ dedupe_key: dedupeKey });
      if (existing.length > 0) {
        console.log(`[inboundFactures] SKIP (duplicate): ${filename} dedupeKey=${dedupeKey}`);
        skipped_count++;
        continue;
      }
    } catch (err) {
      console.warn(`[inboundFactures] dedupe check failed for ${filename}:`, err.message);
    }

    // ── Upload ─────────────────────────────────────────────────────────────
    let file_url;
    try {
      const file = new File([fileContent], filename, { type: normalizedMime });
      const uploaded = await base44.asServiceRole.integrations.Core.UploadFile({ file });
      file_url = uploaded.file_url;
      if (!file_url) throw new Error('Upload returned no file_url');
      console.log(`[inboundFactures] Uploaded: ${filename} → ${file_url.substring(0, 60)}`);
    } catch (err) {
      console.error(`[inboundFactures] Upload failed for ${filename}:`, err.message);
      errors.push({ filename, error: 'Upload failed: ' + err.message });
      continue;
    }

    // ── Création de la facture ─────────────────────────────────────────────
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
        source_email_from: from || '',
        source_email_subject: subject || '',
        source_email_message_id: messageId || '',
        received_at: new Date().toISOString(),
        dedupe_key: dedupeKey,
      });
      console.log(`[inboundFactures] Invoice created: ${invoice.id} (${filename})`);
    } catch (err) {
      console.error(`[inboundFactures] Invoice create failed for ${filename}:`, err.message);
      errors.push({ filename, error: 'DB create failed: ' + err.message });
      continue;
    }

    // ── Scan IA (async, ne bloque pas la réponse) ─────────────────────────
    base44.asServiceRole.functions.invoke('extractInvoiceData', { file_url })
      .then(async (response) => {
        const extractedData = response.data || response;
        const normalizedName = `${extractedData.invoice_date || 'XXXX-XX-XX'}__${(extractedData.supplier || 'FOURNISSEUR').replace(/[^a-zA-Z0-9]/g, '_')}__${(extractedData.amount_ttc || 0).toFixed(2)}.pdf`;
        await base44.asServiceRole.entities.Invoice.update(invoice.id, {
          normalized_file_name: normalizedName,
          supplier: extractedData.supplier,
          invoice_date: extractedData.invoice_date,
          categories: extractedData.categories || [],
          short_description: extractedData.short_description,
          accounting_account: extractedData.accounting_account,
          amount_ht: extractedData.amount_ht,
          amount_ttc: extractedData.amount_ttc,
          vat: extractedData.vat,
          indexed_text: extractedData.indexed_text,
          ai_confidence: extractedData.confidence,
          status: extractedData.status || 'non_envoyee',
          ai_processing: false,
        });
        console.log(`[inboundFactures] AI scan done for invoice ${invoice.id}`);
      })
      .catch(async (err) => {
        console.error(`[inboundFactures] AI scan failed for ${invoice.id}:`, err.message);
        await base44.asServiceRole.entities.Invoice.update(invoice.id, {
          ai_processing: false,
          status: 'a_verifier',
        });
      });

    imported_count++;
  }

  console.log(`[inboundFactures] Done: imported=${imported_count} skipped=${skipped_count} errors=${errors.length}`);

  return Response.json({
    imported_count,
    skipped_count,
    errors,
    message: `${imported_count} facture(s) importée(s) depuis ${from}`,
  });
});