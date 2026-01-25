import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Pour les automations, on skip l'auth car elles tournent sans utilisateur
    const isAutomated = !req.headers.get('authorization');
    
    if (!isAutomated) {
      const user = await base44.auth.me();
      if (user?.role !== 'admin') {
        return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
      }
    }

    const now = new Date();
    
    // Convertir en heure de Paris (Europe/Paris gère automatiquement l'heure d'été/hiver)
    const parisTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
    const currentDay = ['D', 'L', 'MA', 'ME', 'J', 'V', 'S'][parisTime.getDay()];
    const currentTime = `${String(parisTime.getHours()).padStart(2, '0')}:${String(parisTime.getMinutes()).padStart(2, '0')}`;
    
    console.log(`Vérification automatique - Jour: ${currentDay}, Heure Paris: ${currentTime}`);
    console.log(`Debug timezone - UTC:`, now.toISOString(), `Paris:`, parisTime.toString());

    // Récupérer tous les fournisseurs actifs avec automatisation
    const suppliers = await base44.asServiceRole.entities.Supplier.filter({ is_active: true });
    
    // Fonction pour vérifier si l'heure est dans la fenêtre de 5 minutes
    const isWithinTimeWindow = (closingTime) => {
      if (!closingTime) return false;
      
      const [targetHour, targetMinute] = closingTime.split(':').map(Number);
      const targetTimeInMinutes = targetHour * 60 + targetMinute;
      const currentTimeInMinutes = parisTime.getHours() * 60 + parisTime.getMinutes();
      
      // Vérifier si on est dans une fenêtre de 5 minutes (ex: si closing_time=19:20, accepter 19:19, 19:20, 19:21, 19:22, 19:23, 19:24)
      const diff = currentTimeInMinutes - targetTimeInMinutes;
      return diff >= 0 && diff < 5;
    };
    
    const suppliersToProcess = suppliers.filter(s => 
      s.delivery_days?.includes(currentDay) && 
      isWithinTimeWindow(s.closing_time)
    );

    console.log(`Debug - Suppliers:`, suppliers.map(s => ({
      name: s.name,
      day: currentDay,
      hasDay: s.delivery_days?.includes(currentDay),
      closing: s.closing_time,
      currentTime,
      match: isWithinTimeWindow(s.closing_time)
    })));
    
    console.log(`${suppliersToProcess.length} fournisseur(s) à traiter`);

    const results = [];
    
    for (const supplier of suppliersToProcess) {
      try {
        // Récupérer les commandes en cours pour ce fournisseur
        const orders = await base44.asServiceRole.entities.Order.filter({
          supplier_id: supplier.id,
          status: 'en_cours'
        });

        console.log(`${orders.length} commande(s) en cours pour ${supplier.name}`);

        for (const order of orders) {
          try {
            // Envoyer l'email via la fonction sendOrderEmail
            const emailResult = await base44.asServiceRole.functions.invoke('sendOrderEmail', {
              orderId: order.id
            });

            if (emailResult.data.success) {
              // Marquer comme terminée
              await base44.asServiceRole.entities.Order.update(order.id, {
                status: 'terminee'
              });

              results.push({
                success: true,
                supplier: supplier.name,
                order_id: order.id,
                email_sent: true
              });

              console.log(`Commande ${order.id} envoyée et terminée pour ${supplier.name}`);
            } else {
              results.push({
                success: false,
                supplier: supplier.name,
                order_id: order.id,
                error: emailResult.data.error || 'Erreur inconnue'
              });
            }
          } catch (error) {
            console.error(`Erreur pour commande ${order.id}:`, error);
            results.push({
              success: false,
              supplier: supplier.name,
              order_id: order.id,
              error: error.message
            });
          }
        }
      } catch (error) {
        console.error(`Erreur pour fournisseur ${supplier.name}:`, error);
        results.push({
          success: false,
          supplier: supplier.name,
          error: error.message
        });
      }
    }

    return Response.json({
      success: true,
      timestamp: now.toISOString(),
      processed: results.length,
      results
    });

  } catch (error) {
    console.error('Erreur globale:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});