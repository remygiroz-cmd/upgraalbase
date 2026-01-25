import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { Resend } from 'npm:resend@4.0.0';
import { jsPDF } from 'npm:jspdf@2.5.2';

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

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

    // Générer le PDF
    const doc = new jsPDF();
    
    // En-tête
    doc.setFontSize(20);
    doc.text(`COMMANDE ${order.supplier_name.toUpperCase()}`, 20, 20);
    
    doc.setFontSize(10);
    const orderDate = new Date(order.date);
    doc.text(`Date: ${orderDate.toLocaleDateString('fr-FR')}`, 20, 30);
    doc.text(`Statut: ${order.status.toUpperCase()}`, 20, 35);
    
    // Tableau des articles
    doc.setFontSize(12);
    doc.text('DÉSIGNATION', 20, 50);
    doc.text('QUANTITÉ', 120, 50);
    doc.text('TOTAL HT', 170, 50);
    
    let y = 60;
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

    // Envoyer l'email
    const emailData = {
      from: 'UpGraal <onboarding@resend.dev>',
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
      emailData.cc = ccEmails;
    }

    console.log('Envoi email avec les données suivantes:', {
      to: emailData.to,
      cc: emailData.cc,
      subject: emailData.subject,
      hasAttachment: !!emailData.attachments
    });

    const result = await resend.emails.send(emailData);
    console.log('Résultat Resend:', result);

    // Mettre à jour le statut de la commande à "envoyée"
    await base44.asServiceRole.entities.Order.update(orderId, {
      status: 'envoyee'
    });

    return Response.json({ 
      success: true,
      message: 'Email envoyé avec succès'
    });

  } catch (error) {
    console.error('Erreur:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});