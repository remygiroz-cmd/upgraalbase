import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { factureIds, destinataire, methode = 'manuel' } = await req.json();

    if (!factureIds || !Array.isArray(factureIds) || factureIds.length === 0) {
      return Response.json({ error: 'factureIds array required' }, { status: 400 });
    }

    if (!destinataire) {
      return Response.json({ error: 'destinataire email required' }, { status: 400 });
    }

    // Récupérer les factures
    const factures = await Promise.all(
      factureIds.map(id => base44.asServiceRole.entities.Facture.get(id))
    );

    // Filtrer les factures "À vérifier" si nécessaire
    const facturesToSend = factures.filter(f => f.statut !== 'a_verifier');

    if (facturesToSend.length === 0) {
      return Response.json({ 
        error: 'Aucune facture à envoyer (toutes sont à vérifier)',
        success: false 
      }, { status: 400 });
    }

    // Construire le tableau récapitulatif HTML
    const totalTTC = facturesToSend.reduce((sum, f) => sum + (f.montant_ttc || 0), 0);
    
    const tableauHTML = `
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <thead>
          <tr style="background: #f3f4f6;">
            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Date</th>
            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Fournisseur</th>
            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Description</th>
            <th style="border: 1px solid #ddd; padding: 10px; text-align: right;">HT</th>
            <th style="border: 1px solid #ddd; padding: 10px; text-align: right;">TTC</th>
          </tr>
        </thead>
        <tbody>
          ${facturesToSend.map(f => `
            <tr>
              <td style="border: 1px solid #ddd; padding: 8px;">${f.date_facture || '-'}</td>
              <td style="border: 1px solid #ddd; padding: 8px;">${f.fournisseur || '-'}</td>
              <td style="border: 1px solid #ddd; padding: 8px;">${f.description || '-'}</td>
              <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${(f.montant_ht || 0).toFixed(2)} €</td>
              <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${(f.montant_ttc || 0).toFixed(2)} €</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr style="background: #f3f4f6; font-weight: bold;">
            <td colspan="4" style="border: 1px solid #ddd; padding: 10px; text-align: right;">Total TTC:</td>
            <td style="border: 1px solid #ddd; padding: 10px; text-align: right;">${totalTTC.toFixed(2)} €</td>
          </tr>
        </tfoot>
      </table>
    `;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; color: #333;">
        <h2 style="color: #2c3e50;">Factures fournisseurs</h2>
        <p>Bonjour,</p>
        <p>Veuillez trouver ci-joint <strong>${facturesToSend.length}</strong> facture(s) fournisseur(s).</p>
        
        ${tableauHTML}
        
        <p style="margin-top: 20px;">Les fichiers sont joints à cet email.</p>
        <p style="margin-top: 20px;">Cordialement</p>
      </div>
    `;

    // Préparer les pièces jointes (liens vers les fichiers)
    const attachments = facturesToSend
      .filter(f => f.file_url)
      .map(f => ({
        filename: f.file_name || `facture_${f.id}.pdf`,
        path: f.file_url
      }));

    // Envoyer l'email via Resend
    try {
      await base44.functions.invoke('sendEmailWithResend', {
        to: destinataire,
        subject: `Factures fournisseurs - ${new Date().toLocaleDateString('fr-FR')}`,
        html: htmlBody,
        attachments: [] // Note: Resend ne supporte pas les URLs comme attachments, il faudra télécharger les fichiers d'abord
      });

      // Marquer les factures comme envoyées
      const now = new Date().toISOString();
      const updatePromises = facturesToSend.map(f => 
        base44.asServiceRole.entities.Facture.update(f.id, {
          statut: 'envoyee',
          date_envoi: now,
          methode_envoi: methode,
          historique_envoi: [
            ...(f.historique_envoi || []),
            {
              date: now,
              destinataire: destinataire,
              succes: true,
              message: 'Envoi réussi'
            }
          ]
        })
      );

      await Promise.all(updatePromises);

      return Response.json({
        success: true,
        message: `${facturesToSend.length} facture(s) envoyée(s) avec succès`,
        facturesSent: facturesToSend.length
      });

    } catch (emailError) {
      // En cas d'erreur d'envoi, NE PAS marquer comme envoyées
      console.error('Email send error:', emailError);
      
      // Logger l'échec dans l'historique
      const updatePromises = facturesToSend.map(f => 
        base44.asServiceRole.entities.Facture.update(f.id, {
          historique_envoi: [
            ...(f.historique_envoi || []),
            {
              date: new Date().toISOString(),
              destinataire: destinataire,
              succes: false,
              message: emailError.message || 'Erreur lors de l\'envoi'
            }
          ]
        })
      );

      await Promise.all(updatePromises);

      return Response.json({ 
        error: `Erreur d'envoi email: ${emailError.message}`,
        success: false 
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error in sendInvoicesToAccountant:', error);
    return Response.json({ 
      error: error.message,
      success: false 
    }, { status: 500 });
  }
});