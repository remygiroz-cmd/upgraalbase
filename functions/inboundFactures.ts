/**
 * Webhook inbound Resend → import automatique des factures
 * - Répond 200 IMMÉDIATEMENT à Resend (jamais de 405)
 * - Crée un InboundEmailImportLog dès réception
 * - Traitement en background avec mise à jour du log (processing → success/failed)
 * - Mode dryRun : ?dryRun=1 → log payload sans upload/create
 *
 * ENV requis :
 * - RESEND_INBOUND_SECRET (optionnel mais recommandé) : secret vérifié via query ?secret=
 * - RESEND_API_KEY : obligatoire pour télécharger les pièces jointes (webhook ne contient pas le contenu)
 * - INVOICE_WORKSPACE_ID (optionnel) : workspace_id à poser sur les factures
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MAX_ATTACHMENTS = 10;
const MAX_TOTAL_SIZE = 30 * 1024 * 1024;
const TARGET_EMAIL = 'factures@factures.upgraal.com';

function normalizeEmail(s: string) {
  return (s || '').toLowerCase().trim();
}

function toArray(x: any): string[] {
  if (!x) return [];
  if (Array.isArray(x)) return x.filter(Boolean).map(String);
  return [String(x)];
}

function extractEmailPayload(payload: any) {
  // Resend webhook: { type, created_at, data: { ...emailFields } }
  // Certains exemples internes peuvent envelopper différemment: payload.data.email
  const data = payload?.data?.email ?? payload?.data ?? payload ?? {};
  return data;
}

function extractRecipients(email: any) {
  const toArr = toArray(email?.to);
  const ccArr = toArray(email?.cc);
  const bccArr = toArray(email?.bcc);
  const allRecipients = [...toArr, ...ccArr, ...bccArr]
    .map(normalizeEmail)
    .filter(Boolean);
  return { toArr, ccArr, bccArr, allRecipients };
}

async function sha256(str: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function downloadAttachmentFromResend(emailId: string, attachmentId: string) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY not set');

  // 1) Récupérer un download_url via l’API Resend
  const metaResp = await fetch(
    `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachmentId)}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );
  if (!metaResp.ok) {
    const txt = await metaResp.text().catch(() => '');
    console.error('[inboundFactures] Resend meta failed', {
      status: metaResp.status,
      statusText: metaResp.statusText,
      body: txt?.slice(0, 500),
      email_id: emailId,
      attachment_id: attachmentId,
    });
    throw new Error(`Resend attachment meta HTTP ${metaResp.status}`);
  }

  const metaJson = await metaResp.json().catch(() => ({}));
  const downloadUrl =
    metaJson?.download_url ||
    metaJson?.data?.download_url ||
    metaJson?.attachment?.download_url;

  if (!downloadUrl) {
    throw new Error('No download_url returned by Resend attachment API');
  }

  // 2) Télécharger le contenu réel
  const fileResp = await fetch(downloadUrl);
  if (!fileResp.ok) throw new Error(`Download HTTP ${fileResp.status}`);
  return new Uint8Array(await fileResp.arrayBuffer());
}

async function processAttachments(base44: any, payload: any, logId: string, dryRun = false) {
  const db = base44.asServiceRole;

  // Passage à "processing"
  await db.entities.InboundEmailImportLog.update(logId, { status: 'processing' });

  try {
    const email = extractEmailPayload(payload);

    const rawData = payload?.data ?? {};
    console.log('[inboundFactures] inbound ids=', {
      payloadDataId: rawData?.id,
      payloadDataEmailId: rawData?.email_id,
      payloadDataMessageId: rawData?.message_id,
      emailId: email?.id,
      emailEmailId: email?.email_id,
      emailMessageId: email?.message_id,
    });

    const emailFrom = (email?.from || '').trim();
    const emailSubject = (email?.subject || '').trim();
    const emailMessageId = (email?.message_id || email?.messageId || email?.id || '').trim();

    const { allRecipients } = extractRecipients(email);
    const toStr = allRecipients.join(',');

    const emailId = (email?.email_id || email?.emailId || '').trim(); // présent dans ton raw body
    const emailAttachments = Array.isArray(email?.attachments) ? email.attachments : [];

    console.log('[inboundFactures] email identifiers:', {
      email_id: email?.email_id,
      id: email?.id,
      message_id: email?.message_id,
      messageId: email?.messageId,
      created_at: email?.created_at,
    });
    console.log(`[inboundFactures] from="${emailFrom}" subject="${emailSubject}" messageId="${emailMessageId}"`);
    console.log(`[inboundFactures] recipients=${JSON.stringify(allRecipients)} TARGET_EMAIL="${TARGET_EMAIL}"`);
    console.log(`[inboundFactures] attachments count=${emailAttachments.length}`);
    console.log(`[inboundFactures] email_id="${emailId}"`);

    const workspaceId = Deno.env.get('INVOICE_WORKSPACE_ID') || '';
    if (!workspaceId) console.log('[inboundFactures] (info) INVOICE_WORKSPACE_ID not set (ok)');

    // Vérif destinataire (to + cc + bcc)
    if (!allRecipients.includes(normalizeEmail(TARGET_EMAIL))) {
      const msg = `Recipient(s) ${JSON.stringify(allRecipients)} does not match TARGET_EMAIL "${TARGET_EMAIL}"`;
      console.warn('[inboundFactures] SKIP:', msg);
      await db.entities.InboundEmailImportLog.update(logId, { status: 'failed', error_message: msg });
      return;
    }

    if (emailAttachments.length === 0) {
      console.log('[inboundFactures] No attachments');
      await db.entities.InboundEmailImportLog.update(logId, { status: 'success', invoice_ids: [] });
      return;
    }

    // Attention: dans le webhook, Resend ne fournit pas la taille / contenu → on ne peut pas calculer totalSize ici proprement.
    // On garde un garde-fou après download (MAX_FILE_SIZE) + limite du nombre d’attachements.
    const limited = emailAttachments.slice(0, MAX_ATTACHMENTS);

    if (dryRun) {
      console.log('[inboundFactures] DRY RUN — would process', limited.length, 'attachments:');
      limited.forEach((a: any, i: number) => {
        console.log(
          `  [${i}] id="${a.id}" filename="${a.filename || a.name}" mime="${a.content_type || a.type}"`,
        );
      });
      await db.entities.InboundEmailImportLog.update(logId, {
        status: 'success',
        error_message: 'DRY RUN — aucune facture créée',
        invoice_ids: [],
      });
      return;
    }

    // Si on a beaucoup de pièces, on check un totalSize après download (limite MAX_TOTAL_SIZE)
    let totalDownloaded = 0;
    const invoiceIds: string[] = [];

    for (const attachment of limited) {
      const attachmentId = attachment?.id ? String(attachment.id) : '';
      const filename = attachment?.filename || attachment?.name || 'facture.pdf';
      const mimeType = attachment?.content_type || attachment?.mime_type || attachment?.type || 'application/pdf';
      const normalizedMime = String(mimeType).split(';')[0].trim().toLowerCase();

      console.log(`[inboundFactures] → Processing: "${filename}" mime="${normalizedMime}" id="${attachmentId}"`);

      if (!ALLOWED_MIME.includes(normalizedMime)) {
        console.log(`[inboundFactures]   SKIP unsupported mime: ${normalizedMime}`);
        continue;
      }

      if (!emailId || !attachmentId) {
        console.error(`[inboundFactures]   SKIP missing email_id or attachment.id (email_id="${emailId}", id="${attachmentId}")`);
        continue;
      }

      // Récupération du contenu via Resend API
      let fileContent: Uint8Array;
      try {
        console.log(`[inboundFactures]   Downloading from Resend API (email_id="${emailId}", attachment_id="${attachmentId}")...`);
        fileContent = await downloadAttachmentFromResend(emailId, attachmentId);
        console.log(`[inboundFactures]   Content OK: ${fileContent.length} bytes`);
      } catch (err: any) {
        console.error(`[inboundFactures]   DOWNLOAD ERROR for "${filename}":`, err?.message || String(err));
        continue;
      }

      totalDownloaded += fileContent.length;
      if (totalDownloaded > MAX_TOTAL_SIZE) {
        const msg = `Total attachments too large after download: ${totalDownloaded} bytes`;
        console.warn('[inboundFactures]', msg);
        await db.entities.InboundEmailImportLog.update(logId, { status: 'failed', error_message: msg });
        return;
      }

      if (fileContent.length > MAX_FILE_SIZE) {
        console.log(`[inboundFactures]   SKIP too large: ${fileContent.length} bytes`);
        continue;
      }

      // Déduplication
      const dedupeKey = await sha256(`${emailMessageId || emailId}__${filename}`);
      try {
        const existing = await db.entities.Invoice.filter({ dedupe_key: dedupeKey });
        if (existing.length > 0) {
          console.log(`[inboundFactures]   SKIP duplicate: "${filename}"`);
          continue;
        }
      } catch (err: any) {
        console.warn(`[inboundFactures]   Dedupe check failed for "${filename}":`, err?.message || String(err));
      }

      // Upload
      let file_url: string;
      try {
        const file = new File([fileContent], filename, { type: normalizedMime });
        console.log(`[inboundFactures]   Uploading "${filename}"...`);
        const uploaded = await db.integrations.Core.UploadFile({ file });
        file_url = uploaded?.file_url;
        if (!file_url) throw new Error('No file_url returned from UploadFile');
        console.log(`[inboundFactures]   Upload OK: ${file_url.substring(0, 80)}`);
      } catch (err: any) {
        console.error(`[inboundFactures]   UPLOAD ERROR for "${filename}":`, err?.message || String(err));
        continue;
      }

      // Création facture
      let invoice: any;
      try {
        const invoiceData: any = {
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
          source_email_message_id: emailMessageId || emailId,
          received_at: new Date().toISOString(),
          dedupe_key: dedupeKey,
        };
        if (workspaceId) invoiceData.workspace_id = workspaceId;

        console.log(`[inboundFactures]   Creating Invoice for "${filename}"...`);
        invoice = await db.entities.Invoice.create(invoiceData);
        invoiceIds.push(invoice.id);
        console.log(`[inboundFactures]   ✅ Invoice created: id=${invoice.id}`);
      } catch (err: any) {
        console.error(`[inboundFactures]   INVOICE CREATE ERROR for "${filename}":`, err?.message || String(err));
        continue;
      }

      // Scan IA (fire & forget)
      db.functions
        .invoke('extractInvoiceData', { file_url })
        .then(async (response: any) => {
          const d = response?.data ?? response ?? {};
          const supplier = (d.supplier || 'FOURNISSEUR').toString().replace(/[^a-zA-Z0-9]/g, '_');
          const amount = Number(d.amount_ttc || 0);
          const normalizedName = `${d.invoice_date || 'XXXX-XX-XX'}__${supplier}__${amount.toFixed(2)}.pdf`;

          await db.entities.Invoice.update(invoice.id, {
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
          console.log(`[inboundFactures]   AI scan done for ${invoice.id}`);
        })
        .catch(async (err: any) => {
          console.error(`[inboundFactures]   AI scan failed for ${invoice.id}:`, err?.message || String(err));
          await db.entities.Invoice.update(invoice.id, { ai_processing: false, status: 'a_verifier' });
        });
    }

    // Mise à jour log : succès
    await db.entities.InboundEmailImportLog.update(logId, {
      status: 'success',
      invoice_ids: invoiceIds,
      to: toStr,
      attachments_count: emailAttachments.length,
    });
    console.log(`[inboundFactures] ✅ Done. ${invoiceIds.length} invoice(s) created.`);
  } catch (err: any) {
    console.error('[inboundFactures] processAttachments fatal error:', err?.message || String(err), err?.stack);
    await base44.asServiceRole.entities.InboundEmailImportLog.update(logId, {
      status: 'failed',
      error_message: `${err?.message || String(err)}\n${err?.stack || ''}`.substring(0, 1000),
    });
  }
}

Deno.serve(async (req) => {
  console.log('[inboundFactures] method=', req.method, 'url=', req.url);

  // Toujours 200 quelle que soit la méthode (jamais de 405 pour Resend)
  if (req.method !== 'POST') {
    return Response.json({ ok: true, method: req.method }, { status: 200 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dryRun') === '1';

  // Vérification du secret (optionnel)
  const expectedSecret = Deno.env.get('RESEND_INBOUND_SECRET');
  if (expectedSecret) {
    const querySecret = url.searchParams.get('secret');
    if (!querySecret || querySecret !== expectedSecret) {
      console.warn('[inboundFactures] Invalid or missing secret');
      return Response.json({ success: true, warning: 'unauthorized' }, { status: 200 });
    }
  }

  // Parse body
  let payload: any;
  try {
    const text = await req.text();
    console.log('[inboundFactures] raw body (first 800):', text.substring(0, 800));
    payload = JSON.parse(text);
  } catch (err: any) {
    console.error('[inboundFactures] Failed to parse JSON body:', err?.message || String(err));
    return Response.json({ success: true, warning: 'invalid JSON body' }, { status: 200 });
  }

  console.log('[inboundFactures] event type=', payload?.type, '| top-level keys=', Object.keys(payload || {}));

  try {
    const apiKey = Deno.env.get('RESEND_API_KEY');
    const hasKey = !!apiKey;
    console.log('[inboundFactures] RESEND_API_KEY present=', hasKey);

    if (hasKey) {
      const r = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      console.log('[inboundFactures] Resend API key test /domains status=', r.status);
    }
  } catch (e) {
    console.error('[inboundFactures] Resend API key test failed:', e?.message || String(e));
  }

  // Extraire infos email pour le log
  const email = extractEmailPayload(payload);
  const emailFrom = (email?.from || '').trim();
  const emailSubject = (email?.subject || '').trim();
  const emailMessageId = (email?.message_id || email?.messageId || email?.id || '').trim();

  const { allRecipients } = extractRecipients(email);
  const toStr = allRecipients.join(',');
  const attachmentsCount = Array.isArray(email?.attachments) ? email.attachments.length : 0;

  // Créer le log immédiatement (status="received")
  const base44 = createClientFromRequest(req);
  let logId: string | null = null;

  try {
    const log = await base44.asServiceRole.entities.InboundEmailImportLog.create({
      created_at: new Date().toISOString(),
      message_id: emailMessageId,
      from: emailFrom,
      to: toStr,
      subject: emailSubject,
      attachments_count: attachmentsCount,
      status: 'received',
      invoice_ids: [],
    });
    logId = log.id;
    console.log('[inboundFactures] Log created:', logId);
  } catch (err: any) {
    console.error('[inboundFactures] Failed to create log:', err?.message || String(err));
    // On continue quand même
  }

  // ACK immédiat 200
  const job = (logId ? processAttachments(base44, payload, logId, dryRun) : Promise.resolve()).catch((err: any) => {
    console.error('[inboundFactures] Background job error:', err?.message || String(err));
  });

  // Base44 / Deno edge: si waitUntil dispo, on l'utilise
  // (sinon on laisse tourner en "fire & forget")
  // @ts-ignore
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(job);
    console.log('[inboundFactures] ACK 200 (EdgeRuntime.waitUntil registered)');
  } else {
    console.log('[inboundFactures] ACK 200 (fire & forget)');
  }

  return Response.json({ success: true, logId, dryRun }, { status: 200 });
});