import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Automation planifiée : pas de contexte utilisateur, on utilise directement le service role

    // Récupérer toutes les commandes avec le statut "envoyée"
    const orders = await base44.asServiceRole.entities.Order.filter({ status: 'envoyee' });

    const now = new Date();
    const completedOrders = [];

    const updatePromises = [];

    for (const order of orders) {
      // Chercher la date d'envoi dans l'historique
      let sentDate = null;
      if (order.history && order.history.length > 0) {
        for (let i = order.history.length - 1; i >= 0; i--) {
          const entry = order.history[i];
          if (entry.action === 'email_sent' ||
              (entry.action === 'status_change' && entry.details && entry.details.includes('Envoyée'))) {
            sentDate = new Date(entry.timestamp);
            break;
          }
        }
      }
      if (!sentDate) sentDate = new Date(order.created_date);

      const hoursSinceSent = (now - sentDate) / (1000 * 60 * 60);

      if (hoursSinceSent >= 24) {
        const updatedHistory = [...(order.history || []), {
          timestamp: now.toISOString(),
          action: 'status_change',
          details: 'Statut modifié automatiquement: Envoyée → Terminée (24h écoulées)',
          user_email: 'system',
          user_name: 'Système automatique'
        }];

        updatePromises.push(
          base44.asServiceRole.entities.Order.update(order.id, {
            status: 'terminee',
            history: updatedHistory
          }).then(() => ({
            id: order.id,
            supplier_name: order.supplier_name,
            sent_date: sentDate,
            hours_elapsed: Math.round(hoursSinceSent)
          }))
        );
      }
    }

    const completedOrders = await Promise.all(updatePromises);

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