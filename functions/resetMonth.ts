import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * 🧨 RESET TOTAL D'UN MOIS - VERSION SERVEUR OPTIMISÉE
 * 
 * Suppression groupée ultra-rapide pour éviter les timeouts frontend
 * Supprime TOUTES les données liées à un mois spécifique
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Vérifier l'authentification
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

    console.log(`🧨 [RESET SERVER] Début reset ${monthKey} par ${user.email}`);
    
    const stats = {
      deleted: {
        shifts: 0,
        nonShifts: 0,
        cpPeriods: 0,
        weeklyRecaps: 0,
        monthlyRecaps: 0,
        exportOverrides: 0
      },
      duration: 0,
      timestamp: new Date().toISOString()
    };

    const startTime = Date.now();

    // 1) SHIFTS - Suppression groupée
    const shifts = await base44.asServiceRole.entities.Shift.filter({ month_key: monthKey });
    for (const shift of shifts) {
      await base44.asServiceRole.entities.Shift.delete(shift.id);
      stats.deleted.shifts++;
    }
    console.log(`  ✓ ${stats.deleted.shifts} shifts supprimés`);

    // 2) NON-SHIFTS - Suppression groupée
    const nonShifts = await base44.asServiceRole.entities.NonShiftEvent.filter({ month_key: monthKey });
    for (const ns of nonShifts) {
      await base44.asServiceRole.entities.NonShiftEvent.delete(ns.id);
      stats.deleted.nonShifts++;
    }
    console.log(`  ✓ ${stats.deleted.nonShifts} non-shifts supprimés`);

    // 3) PÉRIODES CP - Suppression groupée
    const cpPeriods = await base44.asServiceRole.entities.PaidLeavePeriod.filter({ month_key: monthKey });
    for (const cp of cpPeriods) {
      await base44.asServiceRole.entities.PaidLeavePeriod.delete(cp.id);
      stats.deleted.cpPeriods++;
    }
    console.log(`  ✓ ${stats.deleted.cpPeriods} périodes CP supprimées`);

    // 4) RÉCAPS HEBDOMADAIRES - Suppression groupée
    const weeklyRecaps = await base44.asServiceRole.entities.WeeklyRecap.filter({ month_key: monthKey });
    for (const recap of weeklyRecaps) {
      await base44.asServiceRole.entities.WeeklyRecap.delete(recap.id);
      stats.deleted.weeklyRecaps++;
    }
    console.log(`  ✓ ${stats.deleted.weeklyRecaps} récaps hebdo supprimés`);

    // 5) RÉCAPS MENSUELS - Par year/month
    const monthlyRecaps = await base44.asServiceRole.entities.MonthlyRecap.filter({ 
      year: parseInt(year),
      month: parseInt(month)
    });
    for (const recap of monthlyRecaps) {
      await base44.asServiceRole.entities.MonthlyRecap.delete(recap.id);
      stats.deleted.monthlyRecaps++;
    }
    console.log(`  ✓ ${stats.deleted.monthlyRecaps} récaps mensuels supprimés`);

    // 6) OVERRIDES EXPORT COMPTA - Suppression groupée
    const exportOverrides = await base44.asServiceRole.entities.ExportComptaOverride.filter({ 
      month_key: monthKey 
    });
    for (const override of exportOverrides) {
      await base44.asServiceRole.entities.ExportComptaOverride.delete(override.id);
      stats.deleted.exportOverrides++;
    }
    console.log(`  ✓ ${stats.deleted.exportOverrides} overrides export supprimés`);

    // 7) METTRE À JOUR LE PLANNING MONTH (versioning)
    const planningMonths = await base44.asServiceRole.entities.PlanningMonth.filter({ 
      year: parseInt(year),
      month: parseInt(month)
    });

    let planningMonth = planningMonths[0];

    if (planningMonth) {
      const newVersion = (planningMonth.reset_version || 0) + 1;
      await base44.asServiceRole.entities.PlanningMonth.update(planningMonth.id, {
        reset_version: newVersion,
        reset_at: new Date().toISOString(),
        reset_by: user.email,
        reset_by_name: user.full_name
      });
      stats.version = newVersion;
    } else {
      const newMonth = await base44.asServiceRole.entities.PlanningMonth.create({
        year: parseInt(year),
        month: parseInt(month),
        month_key: monthKey,
        reset_version: 1,
        reset_at: new Date().toISOString(),
        reset_by: user.email,
        reset_by_name: user.full_name
      });
      stats.version = 1;
    }

    stats.duration = Date.now() - startTime;
    const totalDeleted = Object.values(stats.deleted).reduce((sum, val) => sum + val, 0);

    console.log(`✅ [RESET SERVER] ${monthKey} terminé en ${stats.duration}ms - ${totalDeleted} éléments supprimés`);

    return Response.json({
      success: true,
      message: `Mois ${monthKey} réinitialisé avec succès`,
      stats,
      totalDeleted
    });

  } catch (error) {
    console.error('❌ [RESET SERVER] Erreur:', error);
    return Response.json({ 
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});