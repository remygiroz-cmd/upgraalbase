import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    console.log('=== DIAGNOSTIC ENVOI AUTOMATIQUE FACTURES ===');

    // 1. Vérifier l'heure actuelle en Paris
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
    const parisHour = parseInt(parts.find(p => p.type === 'hour').value);
    const parisMinute = parseInt(parts.find(p => p.type === 'minute').value);
    const parisWeekday = parts.find(p => p.type === 'weekday').value;
    const currentTime = `${String(parisHour).padStart(2, '0')}:${String(parisMinute).padStart(2, '0')}`;

    console.log(`[DIAGNOSTIC] Heure actuelle à Paris: ${currentTime} (${parisWeekday})`);

    // 2. Récupérer les configurations
    const configs = await base44.asServiceRole.entities.InvoiceAutomationConfig.list('-created_date', 100);
    console.log(`[DIAGNOSTIC] Nombre de configurations: ${configs.length}`);

    const diagnostics = {
      timestamp: now.toISOString(),
      parisTime: currentTime,
      parisWeekday,
      configurations: [],
      invoices: {
        total: 0,
        by_status: {},
        with_file: 0,
        without_file: 0,
        sample_invoices: []
      },
      issues: []
    };

    // 3. Analyser chaque configuration
    for (const config of configs) {
      console.log(`\n[DIAGNOSTIC] Configuration: ${config.name}`);
      console.log(`  - Actif: ${config.enabled}`);
      console.log(`  - Email: ${config.recipient_email}`);
      console.log(`  - Jour: ${config.send_day}`);
      console.log(`  - Heure: ${config.send_time}`);
      console.log(`  - Statuts à envoyer: ${config.status_filter?.join(', ') || 'AUCUN'}`);

      const dayMap = {
        'dim.': 'sunday',
        'lun.': 'monday',
        'mar.': 'tuesday',
        'mer.': 'wednesday',
        'jeu.': 'thursday',
        'ven.': 'friday',
        'sam.': 'saturday'
      };
      
      const currentDay = dayMap[parisWeekday] || 'sunday';
      const isRightDay = config.send_day === currentDay;
      const isWithinWindow = (() => {
        if (!config.send_time) return false;
        const [targetHour, targetMinute] = config.send_time.split(':').map(Number);
        const targetTimeInMinutes = targetHour * 60 + targetMinute;
        const currentTimeInMinutes = parisHour * 60 + parisMinute;
        const diff = currentTimeInMinutes - targetTimeInMinutes;
        return diff >= 0 && diff < 5;
      })();

      console.log(`  - Bon jour? ${isRightDay} (config: ${config.send_day}, actuel: ${currentDay})`);
      console.log(`  - Dans fenêtre 5min? ${isWithinWindow} (heure: ${config.send_time})`);

      diagnostics.configurations.push({
        id: config.id,
        name: config.name,
        enabled: config.enabled,
        recipient_email: config.recipient_email,
        send_day: config.send_day,
        send_time: config.send_time,
        status_filter: config.status_filter,
        would_run: config.enabled && isRightDay && isWithinWindow,
        issues: {
          not_enabled: !config.enabled,
          wrong_day: !isRightDay,
          not_in_window: !isWithinWindow,
          no_status_filter: !config.status_filter || config.status_filter.length === 0
        }
      });

      if (!config.enabled) {
        diagnostics.issues.push(`Configuration "${config.name}" est DÉSACTIVÉE`);
      }
      if (!config.status_filter || config.status_filter.length === 0) {
        diagnostics.issues.push(`Configuration "${config.name}" n'a PAS de filtre de statut`);
      }
    }

    // 4. Récupérer les factures
    const allInvoices = await base44.asServiceRole.entities.Invoice.list('-created_date', 1000);
    console.log(`\n[DIAGNOSTIC] Total factures: ${allInvoices.length}`);

    diagnostics.invoices.total = allInvoices.length;

    // Compter par statut
    const statusCount = {};
    for (const inv of allInvoices) {
      statusCount[inv.status] = (statusCount[inv.status] || 0) + 1;
    }
    diagnostics.invoices.by_status = statusCount;
    console.log(`[DIAGNOSTIC] Par statut:`, statusCount);

    // Vérifier fichiers
    for (const inv of allInvoices) {
      if (inv.file_url) {
        diagnostics.invoices.with_file++;
      } else {
        diagnostics.invoices.without_file++;
      }
    }

    console.log(`[DIAGNOSTIC] Avec fichier: ${diagnostics.invoices.with_file}`);
    console.log(`[DIAGNOSTIC] Sans fichier: ${diagnostics.invoices.without_file}`);

    // Lister quelques factures "non_envoyee"
    const nonSendInvoices = allInvoices.filter(inv => inv.status === 'non_envoyee').slice(0, 5);
    diagnostics.invoices.sample_invoices = nonSendInvoices.map(inv => ({
      id: inv.id,
      supplier: inv.supplier,
      date: inv.invoice_date,
      amount_ttc: inv.amount_ttc,
      has_file: !!inv.file_url,
      file_bucket: inv.file_bucket,
      file_path: inv.file_path,
      last_sent_at: inv.last_sent_at
    }));

    console.log(`\n[DIAGNOSTIC] Exemples de factures "non_envoyee":`, diagnostics.invoices.sample_invoices);

    // 5. Résumé
    console.log('\n=== RÉSUMÉ ===');
    if (diagnostics.issues.length === 0) {
      console.log('✓ Aucun problème détecté');
    } else {
      console.log('⚠ Problèmes détectés:');
      diagnostics.issues.forEach(issue => console.log(`  - ${issue}`));
    }

    const activeConfigs = diagnostics.configurations.filter(c => c.would_run);
    console.log(`Configurations qui s'exécuteraient maintenant: ${activeConfigs.length}`);
    if (activeConfigs.length > 0) {
      activeConfigs.forEach(c => console.log(`  - ${c.name}`));
    }

    return Response.json(diagnostics, { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[DIAGNOSTIC] Erreur:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});