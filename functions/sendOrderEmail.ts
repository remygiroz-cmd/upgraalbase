import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { jsPDF } from 'npm:jspdf@2.5.2';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
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
      doc.text(establishment.name.toUpperCase(), 20, yPos);
      doc.setFont(undefined, 'normal');
      yPos += 7;
      
      doc.setFontSize(9);
      if (establishment.postal_address) {
        const addressLines = establishment.postal_address.split('\n');
        addressLines.forEach(line => {
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
    doc.text(`COMMANDE ${order.supplier_name.toUpperCase()}`, 20, yPos);
    yPos += 10;
    
    doc.setFontSize(10);
    const orderDate = new Date(order.date);
    doc.text(`Date: ${orderDate.toLocaleDateString('fr-FR')}`, 20, yPos);
    yPos += 5;
    doc.text(`Statut: ${order.status.toUpperCase()}`, 20, yPos);
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
      
      doc.text(item.product_name, 20, y);
      if (item.supplier_reference) {
        doc.setFontSize(8);
        doc.text(`Réf: ${item.supplier_reference}`, 20, y + 4);
        doc.setFontSize(10);
      }
      
      const qtyText = item.unit === 'pièce' ? `${item.quantity} pièce` : 
                      item.unit === 'sac' ? `${item.quantity} sac` : 
                      item.unit === 'bidon' ? `${item.quantity} bidon` :
                      item.unit === 'SACHET' ? `${item.quantity} SACHET` :
                      item.unit === 'Sacs' ? `${item.quantity} Sacs` :
                      `${item.quantity} ${item.unit || ''}`;
      doc.text(qtyText, 120, y);
      
      if (item.unit_price && item.unit_price > 0) {
        const itemTotal = item.quantity * item.unit_price;
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

    // Construire le corps du message
    let emailBody = '';
    
    // Informations de l'établissement
    if (establishment.name) {
      emailBody += `🏢 ${establishment.name.toUpperCase()}\n\n`;
      
      if (establishment.postal_address) {
        emailBody += `📍 Adresse:\n${establishment.postal_address}\n\n`;
      }
      if (establishment.delivery_address && establishment.delivery_address !== establishment.postal_address) {
        emailBody += `🚚 Adresse de livraison:\n${establishment.delivery_address}\n\n`;
      }
      if (establishment.siret) {
        emailBody += `SIRET: ${establishment.siret}\n`;
      }
      if (establishment.contact_email) {
        emailBody += `Email: ${establishment.contact_email}\n`;
      }
      if (establishment.managers?.length > 0) {
        emailBody += `Responsables:\n`;
        establishment.managers.forEach(manager => {
          emailBody += `  • ${manager.name}${manager.phone ? ' - ' + manager.phone : ''}\n`;
        });
      }
      emailBody += '\n';
    }
    
    // Référence client
    if (supplier.internal_reference) {
      emailBody += `📋 Référence Client: ${supplier.internal_reference}\n\n`;
    }
    
    if (supplier.custom_message) {
      emailBody += supplier.custom_message + '\n\n';
    }
    
    emailBody += '─────────────────────────────────\n\n';
    emailBody += `📦 DÉTAILS DE LA COMMANDE\n\n`;
    emailBody += `Date: ${orderDate.toLocaleDateString('fr-FR')}\n`;
    emailBody += `Fournisseur: ${order.supplier_name}\n\n`;
    
    (order.items || []).forEach((item, idx) => {
      emailBody += `${idx + 1}. ${item.product_name}\n`;
      if (item.supplier_reference) {
        emailBody += `   Réf: ${item.supplier_reference}\n`;
      }
      const qtyText = item.unit === 'pièce' ? `${item.quantity} pièce` : 
                      item.unit === 'sac' ? `${item.quantity} sac` : 
                      item.unit === 'bidon' ? `${item.quantity} bidon` :
                      item.unit === 'SACHET' ? `${item.quantity} SACHET` :
                      item.unit === 'Sacs' ? `${item.quantity} Sacs` :
                      `${item.quantity} ${item.unit || ''}`;
      emailBody += `   Quantité: ${qtyText}\n`;
      if (item.unit_price && item.unit_price > 0) {
        emailBody += `   Prix unitaire: ${item.unit_price.toFixed(2)} €\n`;
        emailBody += `   Total: ${(item.quantity * item.unit_price).toFixed(2)} €\n`;
      }
      emailBody += '\n';
    });
    
    emailBody += `\n💰 TOTAL ESTIMÉ HT: ${totalAmount.toFixed(2)} €\n`;

    // Préparer les emails CC
    const ccEmails = supplier.cc_emails 
      ? supplier.cc_emails.split(',').map(e => e.trim()).filter(e => e)
      : [];

    // Récupérer le nom d'expéditeur depuis les paramètres
    let senderName = 'UpGraal';
    try {
      const settings = await base44.asServiceRole.entities.AppSettings.filter({ setting_key: 'email_sender_name' });
      if (settings.length > 0 && settings[0].email_sender_name) {
        senderName = settings[0].email_sender_name;
      }
    } catch (err) {
      console.log('Using default sender name');
    }

    // Préparer l'email avec pièce jointe
    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
    }

    const emailPayload = {
      from: `${senderName} <noreply@upgraal.com>`,
      to: [supplier.email],
      subject: supplier.email_subject || `Commande ${order.supplier_name}`,
      text: emailBody,
      attachments: [
        {
          filename: `commande_${order.supplier_name}_${orderDate.toLocaleDateString('fr-FR').replace(/\//g, '-')}.pdf`,
          content: pdfBase64
        }
      ]
    };

    if (ccEmails.length > 0) {
      emailPayload.cc = ccEmails;
    }

    console.log('Envoi email avec les données suivantes:', {
      to: emailPayload.to,
      cc: emailPayload.cc,
      subject: emailPayload.subject,
      hasAttachment: !!emailPayload.attachments
    });

    // Préparer l'historique
    const currentHistory = order.history || [];
    const emailList = [supplier.email, ...ccEmails].join(', ');
    
    currentHistory.push({
      timestamp: new Date().toISOString(),
      action: 'email_sent',
      details: `Email envoyé à: ${emailList}`,
      user_email: user.email,
      user_name: user.full_name || user.email
    });

    // Envoyer via Resend API
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailPayload)
    });

    const result = await response.json();
    console.log('Résultat Resend:', result);

    if (!response.ok) {
      return Response.json({ 
        error: 'Erreur lors de l\'envoi de l\'email',
        details: result
      }, { status: response.status });
    }

    // Mettre à jour l'historique de la commande
    await base44.asServiceRole.entities.Order.update(order.id, {
      history: currentHistory
    });

    return Response.json({ 
      success: true,
      message: 'Email envoyé avec succès',
      emailId: result.id
    });

  } catch (error) {
    console.error('Erreur:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});