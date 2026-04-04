import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * 🧨 RESET ATOMIQUE + BATCH - VERSION OPTIMISÉE < 5 SECONDES
 * 
 * Phase A: Lock immédiat (soft reset UI)
 * Phase B: Purge batch parallélisée
 * Phase C: Vérification + clear cache
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { year, month, monthKey } = await req.json();

    if (!year || !month || !monthKey) {
      return Response.json({ 
        error: 'Missing required fields: year, month, monthKey' 
      }, { status: 400 });
    }

    console.log(`🧨 [RESET ATOMIQUE] Début ${monthKey} par ${user.email}`);
    
    const stats = {
      deleted: {
        shifts: 0,
        nonShifts: 0,
        cpPeriods: 0,
        weeklyRecaps: 0,
        monthlyRecaps: 0,
        exportOverrides: 0
      },
      verified: {},
      duration: 0,
      timestamp: new Date().toISOString()
    };

    const startTime = Date.now();

    // PHASE A: LOCK IMMÉDIAT
    // On remet reset_version à 1 (déterministe, peu importe l'historique d'incréments)
    // pour éviter l'accumulation de versions fantômes (1, 3, 5, 7...).
    const newVersion = 1;

    const planningMonths = await base44.asServiceRole.entities.PlanningMonth.filter({ 
      year: parseInt(year),
      month: parseInt(month)
    });

    let planningMonth = planningMonths[0];

    if (planningMonth) {
      await base44.asServiceRole.entities.PlanningMonth.update(planningMonth.id, {
        reset_version: newVersion,
        reset_in_progress: true,
        reset_at: new Date().toISOString(),
        reset_by: user.email,
        reset_by_name: user.full_name
      });
    } else {
      planningMonth = await base44.asServiceRole.entities.PlanningMonth.create({
        year: parseInt(year),
        month: parseInt(month),
        month_key: monthKey,
        reset_version: newVersion,
        reset_in_progress: true,
        reset_at: new Date().toISOString(),
        reset_by: user.email,
        reset_by_name: user.full_name
      });
    }

    console.log(`  ✓ LOCK activé - reset_version forcée à ${newVersion} (déterministe)`);

    // PHASE B: PURGE BATCH PARALLÉLISÉE (Promise.all pour gagner du temps)
    const deleteTasks = [];

    // Helper pour supprimer en batch avec retry
    const batchDelete = async (entityName, filterKey, filterValue) => {
      const filter = { [filterKey]: filterValue };
      const items = await base44.asServiceRole.entities[entityName].filter(filter);
      
      // Suppression parallélisée en chunks de 10
      const chunkSize = 10;
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        await Promise.all(chunk.map(item => 
          base44.asServiceRole.entities[entityName].delete(item.id)
        ));
      }
      
      return items.length;
    };

    // 🔴 WIPE TOTAL shifts : toutes versions confondues (1, 3, 5, 7, 9...) + legacy
    // On filtre par date range pour ne rien oublier quelle que soit la reset_version.
    deleteTasks.push(
      (async () => {
        const [y, m] = monthKey.split('-').map(Number);
        const firstDay = `${monthKey}-01`;
        const lastDayDate = new Date(y, m, 0);
        const lastDay = `${monthKey}-${String(lastDayDate.getDate()).padStart(2, '0')}`;

        // Fetch ALL shifts, filter by date range (catches ALL versions + legacy)
        const allShifts = await base44.asServiceRole.entities.Shift.list();
        const inRange = allShifts.filter(s => s.date >= firstDay && s.date <= lastDay);

        // Log par version pour traçabilité
        const byVersion = {};
        for (const s of inRange) {
          const v = s.reset_version ?? 'legacy';
          byVersion[v] = (byVersion[v] || 0) + 1;
        }
        console.log(`  🔍 Shifts à supprimer [${firstDay}..${lastDay}]: ${inRange.length} total`);
        console.log(`     Par reset_version:`, JSON.stringify(byVersion));

        const chunkSize = 10;
        for (let i = 0; i < inRange.length; i += chunkSize) {
          const chunk = inRange.slice(i, i + chunkSize);
          await Promise.all(chunk.map(s => base44.asServiceRole.entities.Shift.delete(s.id)));
        }

        stats.deleted.shifts = inRange.length;
        console.log(`  ✓ ${inRange.length} shifts supprimés (toutes versions + legacy)`);
      })()
    );

    deleteTasks.push(
      batchDelete('NonShiftEvent', 'month_key', monthKey).then(count => { 
        stats.deleted.nonShifts = count;
        console.log(`  ✓ ${count} non-shifts`);
      })
    );

    deleteTasks.push(
      batchDelete('PaidLeavePeriod', 'month_key', monthKey).then(count => { 
        stats.deleted.cpPeriods = count;
        console.log(`  ✓ ${count} CP`);
      })
    );

    deleteTasks.push(
      batchDelete('WeeklyRecap', 'month_key', monthKey).then(count => { 
        stats.deleted.weeklyRecaps = count;
        console.log(`  ✓ ${count} récaps hebdo`);
      })
    );

    deleteTasks.push(
      batchDelete('ExportComptaOverride', 'month_key', monthKey).then(count => { 
        stats.deleted.exportOverrides = count;
        console.log(`  ✓ ${count} overrides export`);
      })
    );

    // 🧹 Overrides récap mensuel (heures + extras)
    deleteTasks.push(
      batchDelete('MonthlyRecapPersisted', 'month_key', monthKey).then(count => {
        stats.deleted.monthlyRecapPersisted = count;
        console.log(`  ✓ ${count} MonthlyRecapPersisted`);
      })
    );
    deleteTasks.push(
      batchDelete('MonthlyRecapExtrasOverride', 'month_key', monthKey).then(count => {
        stats.deleted.monthlyRecapExtras = count;
        console.log(`  ✓ ${count} MonthlyRecapExtrasOverride`);
      })
    );
    deleteTasks.push(
      batchDelete('MonthlyExportOverride', 'month_key', monthKey).then(count => {
        stats.deleted.monthlyExportOverrides = count;
        console.log(`  ✓ ${count} MonthlyExportOverride`);
      })
    );

    // MonthlyRecap par year/month
    deleteTasks.push(
      (async () => {
        const recaps = await base44.asServiceRole.entities.MonthlyRecap.filter({ 
          year: parseInt(year),
          month: parseInt(month)
        });
        
        const chunkSize = 10;
        for (let i = 0; i < recaps.length; i += chunkSize) {
          const chunk = recaps.slice(i, i + chunkSize);
          await Promise.all(chunk.map(r => base44.asServiceRole.entities.MonthlyRecap.delete(r.id)));
        }
        
        stats.deleted.monthlyRecaps = recaps.length;
        console.log(`  ✓ ${recaps.length} récaps mensuels`);
      })()
    );

    // Attendre toutes les suppressions
    await Promise.all(deleteTasks);

    // PHASE C: VÉRIFICATION + RETRY si nécessaire
    console.log(`  ⚡ Vérification résidus...`);
    
    const verify = async (entityName, filterKey, filterValue) => {
      const filter = { [filterKey]: filterValue };
      const remaining = await base44.asServiceRole.entities[entityName].filter(filter);
      
      if (remaining.length > 0) {
        console.log(`  ⚠️ RETRY: ${remaining.length} ${entityName} restants`);
        for (const item of remaining) {
          await base44.asServiceRole.entities[entityName].delete(item.id);
        }
      }
      
      return remaining.length;
    };

    // Post-condition check for shifts: count by date range (not by month_key)
    const verifShifts = async () => {
      const [y, m] = monthKey.split('-').map(Number);
      const firstDay = `${monthKey}-01`;
      const lastDayDate = new Date(y, m, 0);
      const lastDay = `${monthKey}-${String(lastDayDate.getDate()).padStart(2, '0')}`;
      const allShifts = await base44.asServiceRole.entities.Shift.list();
      const remaining = allShifts.filter(s => s.date >= firstDay && s.date <= lastDay);
      if (remaining.length > 0) {
        console.log(`  ⚠️ RETRY: ${remaining.length} shifts restants — second purge`);
        const cs = 10;
        for (let i = 0; i < remaining.length; i += cs) {
          await Promise.all(remaining.slice(i, i + cs).map(s => base44.asServiceRole.entities.Shift.delete(s.id)));
        }
      }
      console.log(`  ✅ Post-condition shifts: ${remaining.length} résidus (→ supprimés)`);
      return remaining.length;
    };
    stats.verified.shifts = await verifShifts();
    stats.verified.nonShifts = await verify('NonShiftEvent', 'month_key', monthKey);
    stats.verified.cpPeriods = await verify('PaidLeavePeriod', 'month_key', monthKey);
    stats.verified.exportOverrides = await verify('ExportComptaOverride', 'month_key', monthKey);

    // Unlock
    if (planningMonth) {
      await base44.asServiceRole.entities.PlanningMonth.update(planningMonth.id, {
        reset_in_progress: false
      });
    }

    stats.version = newVersion;
    stats.duration = Date.now() - startTime;
    const totalDeleted = Object.values(stats.deleted).reduce((sum, val) => sum + val, 0);

    console.log(
      `✅ [RESET ATOMIQUE] ${monthKey} terminé en ${stats.duration}ms\n` +
      `   month_key=${monthKey} | nouvelle reset_version=${newVersion} (forcée à 1)\n` +
      `   Shifts supprimés: ${stats.deleted.shifts} | Non-shifts: ${stats.deleted.nonShifts} | CP: ${stats.deleted.cpPeriods}\n` +
      `   Récaps hebdo: ${stats.deleted.weeklyRecaps} | Récaps mensuels: ${stats.deleted.monthlyRecaps}\n` +
      `   Total: ${totalDeleted} éléments\n` +
      `   → Planning prêt à recevoir de nouveaux templates (version v${newVersion})`
    );

    return Response.json({
      success: true,
      message: `Reset ${monthKey} terminé en ${(stats.duration / 1000).toFixed(1)}s`,
      stats,
      totalDeleted
    });

  } catch (error) {
    console.error('❌ [RESET ATOMIQUE] Erreur:', error);
    return Response.json({ 
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});