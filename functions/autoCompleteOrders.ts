import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Authentification (permet les appels non authentifiés pour l'automation)
    const isAuthenticated = await base44.auth.isAuthenticated();
    if (isAuthenticated) {
      const user = await base44.auth.me();
      if (user?.role !== 'admin') {
        return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
      }
    }

    // Récupérer toutes les commandes avec le statut "envoyée"
    const orders = await base44.asServiceRole.entities.Order.filter({ status: 'envoyee' });

    const now = new Date();
    const completedOrders = [];

    for (const order of orders) {
      // Chercher dans l'historique la date d'envoi (dernière action "email_sent" ou changement vers "envoyée")
      let sentDate = null;

      if (order.history && order.history.length > 0) {
        // Chercher la date d'envoi dans l'historique (en ordre inverse)
        for (let i = order.history.length - 1; i >= 0; i--) {
          const entry = order.history[i];
          if (entry.action === 'email_sent' || 
              (entry.action === 'status_change' && entry.details.includes('Envoyée'))) {
            sentDate = new Date(entry.timestamp);
            break;
          }
        }
      }

      // Si pas trouvé dans l'historique, utiliser la date de création comme fallback
      if (!sentDate) {
        sentDate = new Date(order.created_date);
      }

      // Calculer la différence en heures
      const hoursSinceSent = (now - sentDate) / (1000 * 60 * 60);

      // Si plus de 24 heures, passer au statut "terminée"
      if (hoursSinceSent >= 24) {
        const updatedHistory = order.history || [];
        updatedHistory.push({
          timestamp: now.toISOString(),
          action: 'status_change',
          details: 'Statut modifié automatiquement: Envoyée → Terminée (24h écoulées)',
          user_email: 'system',
          user_name: 'Système automatique'
        });

        await base44.asServiceRole.entities.Order.update(order.id, {
          status: 'terminee',
          history: updatedHistory
        });

        completedOrders.push({
          id: order.id,
          supplier_name: order.supplier_name,
          sent_date: sentDate,
          hours_elapsed: Math.round(hoursSinceSent)
        });
      }
    }

    return Response.json({
      success: true,
      message: `${completedOrders.length} commande(s) passée(s) au statut terminée`,
      completed_orders: completedOrders,
      total_checked: orders.length
    });

  } catch (error) {
    console.error('Erreur:', error);
    return Response.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
});