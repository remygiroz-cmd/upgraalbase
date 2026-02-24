import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * debugDepartureOrderState
 * 
 * Diagnostic complet de l'état de l'ordre de départ.
 * Aide à identifier pourquoi aucun ordre n'est affiché.
 * 
 * Payload: { date: "2026-02-24" }
 */
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  let body = {};
  try { body = await req.json(); } catch { /* no body */ }

  const b = base44.asServiceRole;
  const { date } = body;

  if (!date) {
    return Response.json({ error: 'date requis' }, { status: 400 });
  }

  const d = new Date(date);
  const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

  const diagnostic = {
    date,
    monthKey,
    timestamp: new Date().toISOString(),
    settings: null,
    shiftsToday: [],
    departureOrders: [],
    locks: [],
    issues: []
  };

  try {
    // Fetch optimization settings
    const settings = await b.entities.AppSettings.filter({ setting_key: 'optimisation_masse_salariale' });
    diagnostic.settings = settings[0] || {
      enabled: false,
      services: [],
      hours_type: 'complementary'
    };

    if (!diagnostic.settings.enabled) {
      diagnostic.issues.push('Optimisation DÉSACTIVÉE');
      return Response.json(diagnostic);
    }

    // Fetch shifts for today
    const shiftsToday = await b.entities.Shift.filter({ date });
    diagnostic.shiftsToday = shiftsToday.map(s => ({
      id: s.id,
      employee_id: s.employee_id,
      employee_name: s.employee_name,
      team: s.team,
      position: s.position,
      start_time: s.start_time,
      end_time: s.end_time
    }));

    // Group shifts by service
    const shiftsByService = {};
    shiftsToday.forEach(s => {
      const service = s.team || s.position || 'unknown';
      if (!shiftsByService[service]) {
        shiftsByService[service] = [];
      }
      shiftsByService[service].push(s.employee_id);
    });

    // Check configured services
    const configuredServices = diagnostic.settings.services || [];
    if (configuredServices.length === 0) {
      diagnostic.issues.push('Aucun service configuré pour optimisation');
    }

    // Fetch all DepartureOrder records for today
    const allOrders = await b.entities.DepartureOrder.filter({ date });
    diagnostic.departureOrders = allOrders.map(o => ({
      id: o.id,
      service: o.service,
      version: o.version,
      generated_at: o.generated_at,
      last_auto_recompute_at: o.last_auto_recompute_at,
      recompute_reason: o.recompute_reason,
      employee_count: o.employee_order?.length || 0,
      employee_order: o.employee_order
    }));

    // Check each configured service
    configuredServices.forEach(service => {
      const shiftsCount = shiftsByService[service]?.length || 0;
      const hasOrder = allOrders.some(o => o.service === service);

      if (shiftsCount === 0) {
        diagnostic.issues.push(`Service "${service}": AUCUN SHIFT prévu aujourd'hui`);
      } else if (!hasOrder) {
        diagnostic.issues.push(`Service "${service}": ${shiftsCount} shift(s) mais NO DepartureOrder trouvé en DB`);
      }
    });

    // Fetch locks
    const locks = await b.entities.DepartureOrderRecomputeLock.list();
    diagnostic.locks = locks
      .filter(l => l.lock_key.startsWith(date))
      .map(l => ({
        lock_key: l.lock_key,
        created_at: l.created_at,
        expires_at: l.expires_at,
        isExpired: new Date(l.expires_at) < new Date()
      }));

    if (diagnostic.locks.some(l => !l.isExpired)) {
      diagnostic.issues.push(`LOCK ACTIF: recompute debouncé (+ 60s)`);
    }

    // Summary
    if (diagnostic.issues.length === 0) {
      diagnostic.summary = '✅ État cohérent';
    } else {
      diagnostic.summary = `⚠️ ${diagnostic.issues.length} problème(s) détecté(s)`;
    }
  } catch (error) {
    diagnostic.issues.push(`ERREUR: ${error.message}`);
  }

  return Response.json(diagnostic);
});