import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    // Pour les automations scheduled, utiliser le service role
    const base44Client = createClientFromRequest(req);
    const base44 = base44Client.asServiceRole;

    // Parse query params pour dry run et tests
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const dryRun = url.searchParams.get('dryRun') === '1' || body.dryRun === '1' || body.dryRun === 1;
    const forceHour = url.searchParams.get('forceHour') || body.forceHour; // Ex: "7" pour forcer 07:00
    const forceSupplierId = url.searchParams.get('forceSupplierId') || body.forceSupplierId;

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
    const parisYear = parts.find(p => p.type === 'year').value;
    const parisMonth = parts.find(p => p.type === 'month').value;
    const parisDay = parts.find(p => p.type === 'day').value;
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
    const currentHour = forceHour ? parseInt(forceHour) : parisHour;
    const currentTime = `${String(currentHour).padStart(2, '0')}:00`;
    const currentDate = `${parisYear}-${parisMonth}-${parisDay}`;
    const autoSendSlot = `${currentDate}-${String(currentHour).padStart(2, '0')}`; // Pour idempotence
    
    console.log(`═══════════════════════════════════════════════════`);
    console.log(`🕐 AUTOMATION RUN - ${now.toISOString()}`);
    console.log(`═══════════════════════════════════════════════════`);
    console.log(`Date Paris: ${currentDate}`);
    console.log(`Heure Paris: ${currentTime} (minute: ${parisMinute})`);
    console.log(`Jour: ${currentDay}`);
    console.log(`Auto-send slot: ${autoSendSlot}`);
    console.log(`Dry run: ${dryRun ? 'OUI (simulation)' : 'NON (envoi réel)'}`);
    console.log(`Force: hour=${forceHour || 'none'}, supplier=${forceSupplierId || 'none'}`);
    console.log(`═══════════════════════════════════════════════════\n`);

    // OPTIMISATION: Ne traiter que si on est à l'heure pleine (minute == 00)
    // Sauf si forceHour est spécifié (mode test)
    if (!forceHour && parisMinute !== 0) {
      console.log(`⏭️  SKIP - pas à l'heure pleine (minute: ${parisMinute})`);
      return Response.json({
        success: true,
        skipped: true,
        reason: 'Pas à l\'heure pleine',
        currentTime,
        currentMinute: parisMinute
      });
    }

    // Récupérer tous les fournisseurs actifs avec automatisation
    let suppliers = await base44.entities.Supplier.filter({ is_active: true });
    
    // Filter par forceSupplierId si spécifié
    if (forceSupplierId) {
      suppliers = suppliers.filter(s => s.id === forceSupplierId);
      console.log(`🔍 MODE TEST - Force supplier: ${suppliers[0]?.name || 'NOT FOUND'}`);
    }
    
    // Filtre: fournisseurs dont l'heure d'envoi correspond à l'heure actuelle
    const suppliersToProcess = suppliers.filter(s => {
      // Vérifier que delivery_days contient le jour actuel
      if (!s.delivery_days?.includes(currentDay)) return false;
      
      // Vérifier que closing_time correspond à l'heure actuelle (HH:00)
      if (!s.closing_time) return false;
      
      // Normaliser closing_time pour extraire l'heure
      const closingHour = s.closing_time.split(':')[0];
      const targetTime = `${closingHour}:00`;
      
      return targetTime === currentTime;
    });

    console.log(`📋 ${suppliers.length} fournisseur(s) actif(s)`);
    console.log(`✅ ${suppliersToProcess.length} fournisseur(s) éligible(s) à traiter:`);
    suppliersToProcess.forEach(s => {
      console.log(`   - ${s.name} (heure: ${s.closing_time}, jours: ${s.delivery_days?.join(', ')})`);
    });
    console.log('');

    const results = [];
    
    for (const supplier of suppliersToProcess) {
      try {
        console.log(`\n📦 TRAITEMENT - ${supplier.name}`);
        console.log(`   Email: ${supplier.email}`);
        console.log(`   CC: ${supplier.cc_emails || 'none'}`);
        
        // Récupérer les commandes EN COURS pour ce fournisseur
        const orders = await base44.entities.Order.filter({
          supplier_id: supplier.id,
          status: 'en_cours'
        });

        console.log(`   ${orders.length} commande(s) en cours trouvée(s)`);

        // Filtrer les commandes déjà envoyées dans ce slot (idempotence)
        const ordersToSend = orders.filter(order => {
          const alreadySent = order.auto_send_slot === autoSendSlot;
          if (alreadySent) {
            console.log(`   ⚠️  Commande ${order.id} déjà envoyée dans ce slot (skip)`);
          }
          return !alreadySent;
        });

        console.log(`   ${ordersToSend.length} commande(s) à envoyer (après filtre idempotence)`);

        if (ordersToSend.length === 0) {
          results.push({
            success: true,
            supplier: supplier.name,
            supplier_id: supplier.id,
            orders_found: orders.length,
            orders_sent: 0,
            skipped: 'Aucune commande à envoyer (déjà envoyées ou aucune en cours)'
          });
          continue;
        }

        // DRY RUN: Ne pas envoyer, juste lister
        if (dryRun) {
          console.log(`   🧪 DRY RUN - Simulation uniquement, pas d'envoi réel`);
          results.push({
            success: true,
            dry_run: true,
            supplier: supplier.name,
            supplier_id: supplier.id,
            orders_to_send: ordersToSend.map(o => ({ id: o.id, items_count: o.items?.length || 0 }))
          });
          continue;
        }

        // ENVOI RÉEL
        for (const order of ordersToSend) {
          try {
            console.log(`   📧 Envoi commande ${order.id}...`);
            
            // Envoyer l'email via la fonction sendOrderEmail
            const emailResult = await base44.functions.invoke('sendOrderEmail', {
              orderId: order.id
            });

            console.log(`   📬 Résultat sendOrderEmail:`, emailResult.data);

            if (emailResult.data?.success) {
              // Marquer comme envoyée avec tracking d'idempotence
              await base44.entities.Order.update(order.id, {
                status: 'envoyee',
                sent_at: now.toISOString(),
                sent_by: 'automation',
                auto_send_slot: autoSendSlot
              });

              results.push({
                success: true,
                supplier: supplier.name,
                supplier_id: supplier.id,
                order_id: order.id,
                email_sent: true,
                sent_at: now.toISOString()
              });

              console.log(`   ✅ Commande ${order.id} envoyée et marquée comme 'envoyee'`);
            } else {
              const errorMsg = emailResult.data?.error || emailResult.data?.details || 'Erreur inconnue lors de l\'envoi';
              results.push({
                success: false,
                supplier: supplier.name,
                supplier_id: supplier.id,
                order_id: order.id,
                error: errorMsg,
                full_response: emailResult.data
              });
              
              console.error(`   ❌ Échec envoi commande ${order.id}:`, errorMsg);
              console.error(`   📋 Response complète:`, JSON.stringify(emailResult.data));
            }
          } catch (error) {
            console.error(`   ❌ Erreur commande ${order.id}:`, error.message);
            console.error(`   📋 Stack:`, error.stack);
            results.push({
              success: false,
              supplier: supplier.name,
              supplier_id: supplier.id,
              order_id: order.id,
              error: error.message,
              stack: error.stack
            });
          }
        }
      } catch (error) {
        console.error(`❌ Erreur fournisseur ${supplier.name}:`, error.message);
        results.push({
          success: false,
          supplier: supplier.name,
          supplier_id: supplier.id,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success && r.email_sent).length;
    const errorCount = results.filter(r => !r.success).length;

    console.log(`\n═══════════════════════════════════════════════════`);
    console.log(`📊 RÉSUMÉ`);
    console.log(`═══════════════════════════════════════════════════`);
    console.log(`✅ Succès: ${successCount}`);
    console.log(`❌ Erreurs: ${errorCount}`);
    console.log(`📋 Total traité: ${results.length}`);
    console.log(`═══════════════════════════════════════════════════\n`);

    return Response.json({
      success: true,
      timestamp: now.toISOString(),
      parisTime: currentTime,
      currentDay,
      autoSendSlot,
      dry_run: dryRun,
      suppliers_eligible: suppliersToProcess.length,
      orders_sent: successCount,
      errors: errorCount,
      results
    });

  } catch (error) {
    console.error('❌ ERREUR GLOBALE:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});