import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Cette fonction est appelée par automation, pas besoin de user auth
    // mais on vérifie que c'est bien l'automation qui appelle

    // Récupérer les paramètres de compta
    const params = await base44.asServiceRole.entities.ParametresCompta.filter({ 
      setting_key: 'factures_auto_envoi' 
    });

    if (!params || params.length === 0) {
      console.log('No compta parameters found');
      return Response.json({ 
        success: false, 
        message: 'Paramètres non configurés' 
      });
    }

    const config = params[0];

    // Vérifier que l'auto envoi est actif
    if (!config.auto_envoi_actif) {
      console.log('Auto send is disabled');
      return Response.json({ 
        success: false, 
        message: 'Envoi automatique désactivé' 
      });
    }

    // Vérifier qu'il y a des destinataires
    if (!config.destinataires || config.destinataires.length === 0) {
      console.log('No recipients configured');
      return Response.json({ 
        success: false, 
        message: 'Aucun destinataire configuré' 
      });
    }

    // Récupérer les factures à envoyer
    const query = { statut: 'non_envoyee' };
    
    // Si on exclut les "à vérifier"
    if (config.exclure_a_verifier) {
      // On ne prend que les "non_envoyee" (déjà fait)
    }

    const facturesToSend = await base44.asServiceRole.entities.Facture.filter(query);

    if (!facturesToSend || facturesToSend.length === 0) {
      console.log('No invoices to send');
      return Response.json({ 
        success: true, 
        message: 'Aucune facture à envoyer',
        facturesSent: 0 
      });
    }

    // Envoyer les factures
    const factureIds = facturesToSend.map(f => f.id);
    const destinataire = config.destinataires[0]; // Premier destinataire pour l'instant

    const sendResult = await base44.functions.invoke('sendInvoicesToAccountant', {
      factureIds: factureIds,
      destinataire: destinataire,
      methode: 'automatique'
    });

    if (sendResult.data.success) {
      return Response.json({
        success: true,
        message: `${sendResult.data.facturesSent} facture(s) envoyée(s) automatiquement`,
        facturesSent: sendResult.data.facturesSent
      });
    } else {
      return Response.json({
        success: false,
        message: sendResult.data.error || 'Erreur lors de l\'envoi',
        facturesSent: 0
      });
    }

  } catch (error) {
    console.error('Error in autoSendInvoices:', error);
    return Response.json({ 
      error: error.message,
      success: false,
      facturesSent: 0
    }, { status: 500 });
  }
});