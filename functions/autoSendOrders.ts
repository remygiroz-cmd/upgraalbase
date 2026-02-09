import { createClient } from 'npm:@base44/sdk@0.8.6';

/**
 * Automation: Envoi automatique des commandes fournisseurs
 *
 * Logique:
 * - Tourne toutes les 5 minutes via scheduler Base44
 * - Pour chaque fournisseur: vérifie si le jour/heure correspond à sa config
 * - Envoie les commandes "en_cours" pour les fournisseurs éligibles
 * - Idempotence: ne renvoie jamais une commande déjà envoyée
 *
 * Test modes:
 * - ?dryRun=1 : simule sans envoyer
 * - ?forceSupplierId=xxx : force l'envoi pour un fournisseur spécifique
 */

// Clé secrète pour appeler sendOrderEmail sans session utilisateur
const AUTOMATION_SECRET_KEY = Deno.env.get('AUTOMATION_SECRET_KEY');

// Mapping jours français -> codes
const DAY_MAP: Record<string, string> = {
  'dim.': 'D',
  'lun.': 'L',
  'mar.': 'MA',
  'mer.': 'ME',
  'jeu.': 'J',
  'ven.': 'V',
  'sam.': 'S'
};

interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  message: string;
  data?: unknown;
}

interface SupplierResult {
  supplierId: string;
  supplierName: string;
  slotMatch: boolean;
  configuredDays: string[];
  configuredTime: string;
  ordersFound: number;
  orderResults: Array<{
    orderId: string;
    status: 'sent' | 'skipped' | 'error';
    reason?: string;
  }>;
}

/**
 * Obtient l'heure actuelle en timezone Paris
 */
function getParisTime(): { day: string; time: string; hour: number; minute: number } {
  const now = new Date();
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
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
  const weekday = parts.find(p => p.type === 'weekday')?.value || '';

  const currentDay = DAY_MAP[weekday] || 'D';
  const currentTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  return { day: currentDay, time: currentTime, hour, minute };
}

/**
 * Vérifie si l'heure actuelle correspond EXACTEMENT au slot de 5 minutes configuré
 * Ex: si configuredTime = "07:00", match uniquement pour 07:00-07:04
 */
function isExactTimeSlot(configuredTime: string, currentHour: number, currentMinute: number): boolean {
  if (!configuredTime) return false;

  const [targetHour, targetMinute] = configuredTime.split(':').map(Number);
  if (isNaN(targetHour) || isNaN(targetMinute)) return false;

  // Le slot configuré doit correspondre exactement (on arrondit aux 5 min)
  const targetSlot = Math.floor(targetMinute / 5);
  const currentSlot = Math.floor(currentMinute / 5);

  return targetHour === currentHour && targetSlot === currentSlot;
}

/**
 * Génère une clé unique pour ce slot d'envoi (anti double-envoi)
 */
function generateAutoSentKey(supplierId: string, parisTime: { day: string; time: string }): string {
  const today = new Date();
  const formatter = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const dateStr = formatter.format(today); // YYYY-MM-DD format
  // Arrondir le temps au slot de 5 minutes
  const [hour, minute] = parisTime.time.split(':').map(Number);
  const roundedMinute = Math.floor(minute / 5) * 5;
  const slotTime = `${String(hour).padStart(2, '0')}:${String(roundedMinute).padStart(2, '0')}`;

  return `${supplierId}-${dateStr}-${slotTime}`;
}

Deno.serve(async (req) => {
  const logs: LogEntry[] = [];
  const startTime = Date.now();

  const log = (level: LogEntry['level'], message: string, data?: unknown) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(data !== undefined && { data })
    };
    logs.push(entry);
    const logFn = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log;
    logFn(`[${level}] ${message}`, data !== undefined ? JSON.stringify(data) : '');
  };

  try {
    // Parse query params pour les modes test
    const url = new URL(req.url);
    const dryRun = url.searchParams.get('dryRun') === '1';
    const forceSupplierId = url.searchParams.get('forceSupplierId');

    // Client service role pour l'automation
    const base44 = createClient({
      appId: Deno.env.get('BASE44_APP_ID'),
      serviceRoleKey: true
    });

    // Obtenir l'heure Paris
    const parisTime = getParisTime();
    log('INFO', 'Démarrage automation envoi commandes', {
      parisDay: parisTime.day,
      parisTime: parisTime.time,
      dryRun,
      forceSupplierId: forceSupplierId || null
    });

    // Récupérer tous les fournisseurs actifs
    const allSuppliers = await base44.entities.Supplier.filter({ is_active: true });
    log('INFO', `${allSuppliers.length} fournisseur(s) actif(s) trouvé(s)`);

    // Filtrer les fournisseurs éligibles selon leur config
    const suppliersToProcess = allSuppliers.filter(supplier => {
      // Si forceSupplierId est spécifié, traiter uniquement ce fournisseur
      if (forceSupplierId) {
        return supplier.id === forceSupplierId;
      }

      // Vérifier si le fournisseur a une config d'envoi automatique
      const sendDays = supplier.delivery_days || [];
      const sendTime = supplier.closing_time;

      if (!sendDays.length || !sendTime) {
        return false;
      }

      // Vérifier si le jour correspond
      const dayMatches = sendDays.includes(parisTime.day);

      // Vérifier si l'heure correspond (slot exact de 5 minutes)
      const timeMatches = isExactTimeSlot(sendTime, parisTime.hour, parisTime.minute);

      return dayMatches && timeMatches;
    });

    log('INFO', `${suppliersToProcess.length} fournisseur(s) éligible(s) pour ce slot`, {
      suppliers: suppliersToProcess.map(s => ({
        id: s.id,
        name: s.name,
        days: s.delivery_days,
        time: s.closing_time
      }))
    });

    const results: SupplierResult[] = [];

    // Traiter chaque fournisseur éligible
    for (const supplier of suppliersToProcess) {
      const supplierResult: SupplierResult = {
        supplierId: supplier.id,
        supplierName: supplier.name,
        slotMatch: true,
        configuredDays: supplier.delivery_days || [],
        configuredTime: supplier.closing_time || '',
        ordersFound: 0,
        orderResults: []
      };

      try {
        // Récupérer les commandes "en_cours" pour ce fournisseur
        const orders = await base44.entities.Order.filter({
          supplier_id: supplier.id,
          status: 'en_cours'
        });

        supplierResult.ordersFound = orders.length;
        log('INFO', `${orders.length} commande(s) en_cours pour ${supplier.name}`);

        if (orders.length === 0) {
          results.push(supplierResult);
          continue;
        }

        // Traiter chaque commande
        for (const order of orders) {
          const autoSentKey = generateAutoSentKey(supplier.id, parisTime);

          // Vérification idempotence: déjà envoyée?
          if (order.status === 'envoyee' || order.status === 'terminee') {
            supplierResult.orderResults.push({
              orderId: order.id,
              status: 'skipped',
              reason: `Commande déjà ${order.status}`
            });
            log('DEBUG', `Skip commande ${order.id}: déjà ${order.status}`);
            continue;
          }

          // Vérification idempotence: déjà traitée pour ce slot?
          if (order.auto_sent_key === autoSentKey) {
            supplierResult.orderResults.push({
              orderId: order.id,
              status: 'skipped',
              reason: `Déjà traitée pour ce slot (${autoSentKey})`
            });
            log('DEBUG', `Skip commande ${order.id}: déjà traitée pour slot ${autoSentKey}`);
            continue;
          }

          // Vérification: commande vide?
          if (!order.items || order.items.length === 0) {
            supplierResult.orderResults.push({
              orderId: order.id,
              status: 'skipped',
              reason: 'Commande sans articles'
            });
            log('WARN', `Skip commande ${order.id}: aucun article`);
            continue;
          }

          // Mode dryRun: ne pas envoyer réellement
          if (dryRun) {
            supplierResult.orderResults.push({
              orderId: order.id,
              status: 'skipped',
              reason: 'Mode dryRun - simulation'
            });
            log('INFO', `[DRYRUN] Commande ${order.id} serait envoyée à ${supplier.email}`);
            continue;
          }

          // Vérifier que le fournisseur a un email
          if (!supplier.email) {
            supplierResult.orderResults.push({
              orderId: order.id,
              status: 'error',
              reason: 'Email fournisseur non configuré'
            });
            log('ERROR', `Commande ${order.id}: email fournisseur manquant`);
            continue;
          }

          // Envoyer l'email via sendOrderEmail avec auth automation
          try {
            log('INFO', `Envoi commande ${order.id} à ${supplier.email}...`);

            // Construire l'URL de la fonction sendOrderEmail
            const functionUrl = `${Deno.env.get('BASE44_FUNCTIONS_URL') || ''}/sendOrderEmail`;

            const emailResponse = await fetch(functionUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-automation-key': AUTOMATION_SECRET_KEY || ''
              },
              body: JSON.stringify({ orderId: order.id })
            });

            const emailResult = await emailResponse.json();

            if (emailResponse.ok && emailResult.success) {
              // Mettre à jour la commande avec les infos d'envoi
              await base44.entities.Order.update(order.id, {
                status: 'envoyee',
                sent_at: new Date().toISOString(),
                sent_by: 'automation',
                auto_sent_key: autoSentKey,
                email_message_id: emailResult.emailId || null
              });

              supplierResult.orderResults.push({
                orderId: order.id,
                status: 'sent',
                reason: `Email envoyé à ${supplier.email}`
              });
              log('INFO', `✓ Commande ${order.id} envoyée avec succès`);

            } else {
              supplierResult.orderResults.push({
                orderId: order.id,
                status: 'error',
                reason: emailResult.error || 'Erreur inconnue'
              });
              log('ERROR', `✗ Échec envoi commande ${order.id}`, emailResult);
            }

          } catch (emailError) {
            supplierResult.orderResults.push({
              orderId: order.id,
              status: 'error',
              reason: emailError.message || 'Erreur d\'envoi'
            });
            log('ERROR', `✗ Exception envoi commande ${order.id}`, { error: emailError.message });
          }
        }

      } catch (supplierError) {
        log('ERROR', `Erreur traitement fournisseur ${supplier.name}`, { error: supplierError.message });
        supplierResult.orderResults.push({
          orderId: 'N/A',
          status: 'error',
          reason: supplierError.message
        });
      }

      results.push(supplierResult);
    }

    // Résumé
    const totalSent = results.reduce((sum, r) =>
      sum + r.orderResults.filter(o => o.status === 'sent').length, 0);
    const totalSkipped = results.reduce((sum, r) =>
      sum + r.orderResults.filter(o => o.status === 'skipped').length, 0);
    const totalErrors = results.reduce((sum, r) =>
      sum + r.orderResults.filter(o => o.status === 'error').length, 0);

    const duration = Date.now() - startTime;

    log('INFO', 'Automation terminée', {
      duration: `${duration}ms`,
      totalSuppliers: suppliersToProcess.length,
      totalSent,
      totalSkipped,
      totalErrors
    });

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      parisTime: parisTime.time,
      parisDay: parisTime.day,
      dryRun,
      forceSupplierId: forceSupplierId || null,
      duration: `${duration}ms`,
      summary: {
        suppliersProcessed: suppliersToProcess.length,
        ordersSent: totalSent,
        ordersSkipped: totalSkipped,
        ordersError: totalErrors
      },
      results,
      logs
    });

  } catch (error) {
    log('ERROR', 'Erreur globale automation', { error: error.message, stack: error.stack });

    return Response.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      logs
    }, { status: 500 });
  }
});
