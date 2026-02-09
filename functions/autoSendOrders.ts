import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    // Pour les automations scheduled, utiliser le service role
    const base44Client = createClientFromRequest(req);
    const base44 = base44Client.asServiceRole;

    const now = new Date();
    
    // Convertir en heure de Paris en utilisant Intl
    const formatter = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short'
    });
    
    const parts = formatter.formatToParts(now);
    const parisHour = parseInt(parts.find(p => p.type === 'hour').value);
    const parisMinute = parseInt(parts.find(p => p.type === 'minute').value);
    const parisWeekday = parts.find(p => p.type === 'weekday').value;
    
    // Mapper le jour de la semaine français vers notre format
    const dayMap = {
      'dim.': 'D',
      'lun.': 'L',
      'mar.': 'MA',
      'mer.': 'ME',
      'jeu.': 'J',
      'ven.': 'V',
      'sam.': 'S'
    };
    
    const currentDay = dayMap[parisWeekday] || 'D';
    const currentTime = `${String(parisHour).padStart(2, '0')}:${String(parisMinute).padStart(2, '0')}`;
    
    console.log(`Vérification automatique - Jour: ${currentDay}, Heure Paris: ${currentTime}`);

    // Récupérer tous les fournisseurs actifs avec automatisation
    const suppliers = await base44.entities.Supplier.filter({ is_active: true });
    
    // Fonction pour vérifier si l'heure est dans la fenêtre de 5 minutes
    const isWithinTimeWindow = (closingTime) => {
      if (!closingTime) return false;
      
      const [targetHour, targetMinute] = closingTime.split(':').map(Number);
      const targetTimeInMinutes = targetHour * 60 + targetMinute;
      const currentTimeInMinutes = parisHour * 60 + parisMinute;
      
      // Vérifier si on est dans une fenêtre de 5 minutes
      const diff = currentTimeInMinutes - targetTimeInMinutes;
      
      return diff >= 0 && diff < 5;
    };
    
    const suppliersToProcess = suppliers.filter(s => 
      s.delivery_days?.includes(currentDay) && 
      isWithinTimeWindow(s.closing_time)
    );

    console.log(`${suppliersToProcess.length} fournisseur(s) à traiter:`, suppliersToProcess.map(s => s.name));

    const results = [];
    
    for (const supplier of suppliersToProcess) {
      try {
        // Récupérer les commandes en cours pour ce fournisseur
        const orders = await base44.entities.Order.filter({
          supplier_id: supplier.id,
          status: 'en_cours'
        });

        console.log(`${orders.length} commande(s) en cours pour ${supplier.name}`);

        for (const order of orders) {
          try {
            // Envoyer l'email via la fonction sendOrderEmail
            const emailResult = await base44.functions.invoke('sendOrderEmail', {
              orderId: order.id
            });

            if (emailResult.data.success) {
              // Marquer comme terminée
              await base44.entities.Order.update(order.id, {
                status: 'terminee'
              });

              results.push({
                success: true,
                supplier: supplier.name,
                order_id: order.id,
                email_sent: true
              });

              console.log(`✓ Commande ${order.id} envoyée et terminée pour ${supplier.name}`);
            } else {
              results.push({
                success: false,
                supplier: supplier.name,
                order_id: order.id,
                error: emailResult.data.error || 'Erreur inconnue'
              });
              
              console.error(`✗ Échec envoi pour ${supplier.name}:`, emailResult.data.error);
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
      parisTime: currentTime,
      currentDay,
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