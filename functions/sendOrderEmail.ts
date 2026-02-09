import { createClientFromRequest, createClient } from 'npm:@base44/sdk@0.8.6';
import { jsPDF } from 'npm:jspdf@2.5.2';

// Rôles autorisés à envoyer des commandes (pour appels frontend)
const ALLOWED_ROLES = ['admin', 'manager', 'gestionnaire', 'cuisinier'];

// Clé secrète pour les automations (à configurer dans Base44 Secrets)
const AUTOMATION_SECRET_KEY = Deno.env.get('AUTOMATION_SECRET_KEY');

/**
 * Vérifie si l'appel vient d'une automation authentifiée
 */
const isAutomationCall = (req: Request): boolean => {
  const automationKey = req.headers.get('x-automation-key');
  if (!automationKey || !AUTOMATION_SECRET_KEY) {
    return false;
  }
  return automationKey === AUTOMATION_SECRET_KEY;
};

/**
 * Empêche l'injection d'en-têtes email (CRLF) et nettoie les caractères non désirés.
 * On ne fait PAS d'escape HTML (inutile ici), on "sanitize" pour les headers email.
 */
const sanitizeEmailHeaderText = (input: unknown, maxLen = 80): string => {
  let s = String(input ?? '').trim();

  // Anti CRLF injection
  s = s.replace(/[\r\n]+/g, ' ');

  // Supprime les caractères de contrôle
  s = s.replace(/[\u0000-\u001F\u007F]/g, '');

  // Réduit espaces multiples
  s = s.replace(/\s{2,}/g, ' ');

  // Limite longueur
  if (s.length > maxLen) s = s.slice(0, maxLen).trim();

  // Si vide après nettoyage, fallback
  return s || 'UpGraal';
};

/**
 * Subject email: pas de CRLF, pas de contrôles, longueur raisonnable.
 */
const sanitizeSubject = (input: unknown, maxLen = 140): string => {
  let s = String(input ?? '').trim();
  s = s.replace(/[\r\n]+/g, ' ');
  s = s.replace(/[\u0000-\u001F\u007F]/g, '');
  s = s.replace(/\s{2,}/g, ' ');
  if (s.length > maxLen) s = s.slice(0, maxLen).trim();
  return s || 'Commande';
};

/**
 * Nom de fichier sûr (Windows/Mac/Linux) + limite longueur
 */
const sanitizeFilename = (input: unknown, maxLen = 120): string => {
  let s = String(input ?? '').trim();

  // Anti CRLF / contrôles
  s = s.replace(/[\r\n]+/g, ' ');
  s = s.replace(/[\u0000-\u001F\u007F]/g, '');

  // Caractères interdits dans noms de fichiers
  s = s.replace(/[\/\\:\*\?"<>\|]/g, '_');

  // Nettoyage espaces
  s = s.replace(/\s{2,}/g, ' ').trim();

  if (s.length > maxLen) s = s.slice(0, maxLen).trim();

  return s || 'document';
};

/**
 * Format quantité (ton format "pro" de A) — centralisé pour PDF + email
 */
const formatQty = (quantity: number, unit?: string): string => {
  const u = (unit || '').trim();

  // Normalise un peu pour éviter les variantes casse/espaces
  const uLower = u.toLowerCase();

  if (uLower === 'pièce' || uLower === 'piece') return `${quantity} pièce`;
  if (uLower === 'sac') return `${quantity} sac`;
  if (uLower === 'bidon') return `${quantity} bidon`;
  if (uLower === 'sachet') return `${quantity} sachet`;
  if (uLower === 'sacs') return `${quantity} sacs`;

  return u ? `${quantity} ${u}` : `${quantity}`;
};

Deno.serve(async (req) => {
  try {
    // Vérifier si c'est un appel automation (machine-to-machine)
    const isAutomation = isAutomationCall(req);
    let base44;
    let user = null;
    let sentBy = 'unknown';

    if (isAutomation) {
      // Appel automation: utiliser service role, pas besoin d'utilisateur
      console.log('[INFO] Automation call detected - using service role');
      base44 = createClient({
        appId: Deno.env.get('BASE44_APP_ID'),
        serviceRoleKey: true
      });
      sentBy = 'automation';
    } else {
      // Appel frontend: vérifier l'authentification utilisateur
      base44 = createClientFromRequest(req);
      user = await base44.auth.me();

      // Vérification authentification
      if (!user) {
        return Response.json({ error: 'You must be logged in to access this app' }, { status: 401 });
      }

      // Vérification des permissions
      if (!ALLOWED_ROLES.includes(user.role)) {
        console.warn(
          `[SECURITY] User ${user.id} attempted to send order email without permission`,
        );
        return Response.json({ error: 'Permissions insuffisantes' }, { status: 403 });
      }
      sentBy = user.id;
    }

    const { orderId } = await req.json();

    // Récupérer la commande
    const order = await base44.entities.Order.get(orderId);
    if (!order) {
      return Response.json({ error: 'Commande non trouvée' }, { status: 404 });
    }

    // Récupérer le fournisseur
    const supplier = await base44.entities.Supplier.get(order.supplier_id);
    if (!supplier || !supplier.email) {
      return Response.json({ error: 'Email du fournisseur non configuré' }, { status: 400 });
    }

    // Récupérer les informations de l'établissement
    const establishments = await base44.entities.Establishment.list();
    const establishment = establishments[0] || {};

    // Générer le PDF
    const doc = new jsPDF();
    let yPos = 20;

    // Informations de l'établissement
    if (establishment.name) {
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.text(String(establishment.name).toUpperCase(), 20, yPos);
      doc.setFont(undefined, 'normal');
      yPos += 7;

      doc.setFontSize(9);
      if (establishment.postal_address) {
        const addressLines = String(establishment.postal_address).split('\n');
        addressLines.forEach((line) => {
          doc.text(line, 20, yPos);
          yPos += 4;
        });
      }
      if (establishment.siret) {
        doc.text(`SIRET: ${establishment.siret}`, 20, yPos);
        yPos += 4;
      }
      if (establishment.contact_email) {
        doc.text(`Email: ${establishment.contact_email}`, 20, yPos);
        yPos += 4;
      }
      yPos += 5;
    }

    // Référence client interne
    if (supplier.internal_reference) {
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text(`Réf. Client: ${supplier.internal_reference}`, 20, yPos);
      doc.setFont(undefined, 'normal');
      yPos += 7;
    }

    // En-tête de commande
    doc.setFontSize(20);
    doc.text(`COMMANDE ${(order.supplier_name || '').toUpperCase()}`, 20, yPos);
    yPos += 10;

    doc.setFontSize(10);
    const orderDate = new Date(order.date);
    doc.text(`Date: ${orderDate.toLocaleDateString('fr-FR')}`, 20, yPos);
    yPos += 5;

    if (order.desired_delivery_day) {
      doc.text(`Livraison souhaitée: ${order.desired_delivery_day}`, 20, yPos);
      yPos += 5;
    }

    doc.text(`Statut: ${(order.status || '').toUpperCase()}`, 20, yPos);
    yPos += 10;

    // Tableau des articles
    doc.setFontSize(12);
    doc.text('DÉSIGNATION', 20, yPos);
    doc.text('QUANTITÉ', 120, yPos);
    doc.text('TOTAL HT', 170, yPos);

    let y = yPos + 10;
    let totalAmount = 0;

    doc.setFontSize(10);
    (order.items || []).forEach((item) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }

      doc.text(item.product_name || '', 20, y);

      if (item.supplier_reference) {
        doc.setFontSize(8);
        doc.text(`Réf: ${item.supplier_reference}`, 20, y + 4);
        doc.setFontSize(10);
      }

      const qtyText = formatQty(Number(item.quantity || 0), item.unit);
      doc.text(qtyText, 120, y);

      if (item.unit_price && item.unit_price > 0) {
        const itemTotal = Number(item.quantity || 0) * Number(item.unit_price || 0);
        totalAmount += itemTotal;
        doc.text(`${itemTotal.toFixed(2)} €`, 170, y);
      }

      y += item.supplier_reference ? 10 : 8;
    });

    // Total
    y += 10;
    doc.setFontSize(14);
    doc.text('TOTAL ESTIMÉ HT', 20, y);
    doc.text(`${totalAmount.toFixed(2)} €`, 170, y);

    // Convertir en base64
    const pdfBase64 = doc.output('datauristring').split(',')[1];

    // Corps email (texte simple)
    let emailBody = '';

    if (establishment.name) {
      emailBody += `🏢 ${String(establishment.name).toUpperCase()}\n\n`;

      if (establishment.postal_address) {
        emailBody += `📍 Adresse:\n${establishment.postal_address}\n\n`;
      }
      if (
        establishment.delivery_address &&
        establishment.delivery_address !== establishment.postal_address
      ) {
        emailBody += `🚚 Adresse de livraison:\n${establishment.delivery_address}\n\n`;
      }
      if (establishment.siret) emailBody += `SIRET: ${establishment.siret}\n`;
      if (establishment.contact_email) emailBody += `Email: ${establishment.contact_email}\n`;

      if (establishment.managers?.length > 0) {
        emailBody += `Responsables:\n`;
        establishment.managers.forEach((manager) => {
          emailBody += `  • ${manager.name}${manager.phone ? ' - ' + manager.phone : ''}\n`;
        });
      }

      emailBody += '\n';
    }

    if (supplier.internal_reference) {
      emailBody += `📋 Référence Client: ${supplier.internal_reference}\n\n`;
    }

    if (supplier.custom_message) {
      emailBody += supplier.custom_message + '\n\n';
    }

    emailBody += '─────────────────────────────────\n\n';
    emailBody += `📦 DÉTAILS DE LA COMMANDE\n\n`;
    emailBody += `Date: ${orderDate.toLocaleDateString('fr-FR')}\n`;

    if (order.desired_delivery_day) {
      emailBody += `🚚 Livraison souhaitée: ${order.desired_delivery_day}\n`;
    }

    emailBody += `Fournisseur: ${order.supplier_name}\n\n`;

    (order.items || []).forEach((item, idx) => {
      emailBody += `${idx + 1}. ${item.product_name}\n`;
      if (item.supplier_reference) emailBody += `   Réf: ${item.supplier_reference}\n`;

      const qtyText = formatQty(Number(item.quantity || 0), item.unit);
      emailBody += `   Quantité: ${qtyText}\n`;

      if (item.unit_price && item.unit_price > 0) {
        emailBody += `   Prix unitaire: ${Number(item.unit_price).toFixed(2)} €\n`;
        emailBody += `   Total: ${(Number(item.quantity || 0) * Number(item.unit_price || 0)).toFixed(
          2,
        )} €\n`;
      }

      emailBody += '\n';
    });

    emailBody += `\n💰 TOTAL ESTIMÉ HT: ${totalAmount.toFixed(2)} €\n`;

    // CC
    const ccEmails = supplier.cc_emails
      ? String(supplier.cc_emails).split(',').map((e) => e.trim()).filter(Boolean)
      : [];

    // Sender name depuis settings
    let senderName = 'UpGraal';
    try {
      const settings = await base44.asServiceRole.entities.AppSettings.filter({
        setting_key: 'email_sender_name',
      });
      if (settings.length > 0 && settings[0].email_sender_name) {
        senderName = settings[0].email_sender_name;
      }
    } catch (_) {
      // fallback
    }

    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
    }

    // Subject sûr
    let rawSubject = supplier.email_subject || `Commande ${order.supplier_name}`;
    if (order.desired_delivery_day) {
      rawSubject += ` - Livraison souhaitée ${String(order.desired_delivery_day).toLowerCase()}`;
    }
    const emailSubject = sanitizeSubject(rawSubject);

    // Filename sûr
    const safeSupplierNameForFile = sanitizeFilename(order.supplier_name || 'fournisseur', 40);
    const safeDateForFile = orderDate.toLocaleDateString('fr-FR').replace(/\//g, '-');
    const filename = sanitizeFilename(
      `commande_${safeSupplierNameForFile}_${safeDateForFile}.pdf`,
      120,
    );

    const emailPayload: any = {
      from: `${sanitizeEmailHeaderText(senderName)} <noreply@upgraal.com>`,
      to: [supplier.email],
      subject: emailSubject,
      text: emailBody,
      attachments: [{ filename, content: pdfBase64 }],
    };

    if (ccEmails.length > 0) emailPayload.cc = ccEmails;
    if (establishment.contact_email) emailPayload.reply_to = [establishment.contact_email];

    console.log(`[INFO] Sending order email for order ${order.id}`);

    // Historique
    const currentHistory = order.history || [];
    currentHistory.push({
      timestamp: new Date().toISOString(),
      action: 'email_sent',
      details: `Email envoyé${isAutomation ? ' (automatique)' : ''}`,
      user_id: sentBy,
    });

    // Envoi Resend
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
    });

    const result = await response.json();

    if (!response.ok) {
      return Response.json(
        { error: "Erreur lors de l'envoi de l'email", details: result },
        { status: response.status },
      );
    }

    // Update historique
    await base44.asServiceRole.entities.Order.update(order.id, {
      history: currentHistory,
    });

    console.log(`[INFO] Order email sent successfully for order ${order.id}`);

    return Response.json({
      success: true,
      message: 'Email envoyé avec succès',
      emailId: result.id,
    });
  } catch (error) {
    console.error('[ERROR] sendOrderEmail:', error?.message || error);
    return Response.json({ error: error?.message || 'Unknown error' }, { status: 500 });
  }
});
