import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * recomputeDepartureOrderIfNeeded
 * 
 * Recalcule automatiquement l'ordre de départ si changements significatifs.
 * Anti-spam via DepartureOrderRecomputeLock (60s).
 * 
 * Payload: {
 *   date: "2026-02-24",
 *   service: "Livraison" (optionnel — all services if not provided),
 *   reason: "shift_changed" | "recap_updated" | "settings_changed" | "manual_override",
 *   forceImmediate: false
 * }
 */
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  let body = {};
  try { body = await req.json(); } catch { /* no body */ }

  const b = base44.asServiceRole;

  const { date, service, reason = 'manual', forceImmediate = false } = body;

  if (!date) {
    return Response.json({ error: 'date requis' }, { status: 400 });
  }

  const lockKey = `${date}${service ? `_${service}` : ''}`;
  const lockDuration = 60 * 1000; // 60 secondes

  // Check lock (unless forceImmediate)
  if (!forceImmediate) {
    const locks = await b.entities.DepartureOrderRecomputeLock.filter({ lock_key: lockKey });
    if (locks.length > 0) {
      const lockAge = Date.now() - new Date(locks[0].created_at).getTime();
      if (lockAge < lockDuration) {
        return Response.json({
          success: false,
          reason: 'debounced',
          message: `Recalcul ignoré (lock actif depuis ${(lockAge / 1000).toFixed(1)}s)`
        });
      } else {
        // Lock expiré, le supprimer
        await b.entities.DepartureOrderRecomputeLock.delete(locks[0].id);
      }
    }
  }

  // Create lock
  const lockId = await b.entities.DepartureOrderRecomputeLock.create({
    lock_key: lockKey,
    expires_at: new Date(Date.now() + lockDuration).toISOString()
  });

  try {
    // Fetch optimization settings
    const settings = await b.entities.AppSettings.filter({ setting_key: 'optimisation_masse_salariale' });
    if (!settings.length || !settings[0].enabled) {
      return Response.json({ success: true, skipped: 'optimization disabled' });
    }

    const optimConfig = settings[0];
    const servicesToOptimize = optimConfig.services || [];
    const hoursType = optimConfig.hours_type || 'complementary';

    // Determine services to recalculate
    const targetServices = service ? [service] : servicesToOptimize;

    // Fetch today's shifts
    const todayShifts = await b.entities.Shift.filter({ date });
    
    // Fetch month key for persistence lookups
    const d = new Date(date);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    // Fetch persisted recaps for this month
    const persistedRecaps = await b.entities.MonthlyRecapPersisted.filter({ month_key: monthKey });
    const persistedMap = {};
    persistedRecaps.forEach(pr => {
      persistedMap[pr.employee_id] = pr;
    });

    // Fetch all active employees
    const employees = await b.entities.Employee.filter({ is_active: true });
    const employeeMap = {};
    employees.forEach(e => {
      employeeMap[e.id] = e;
    });

    // For each service, calculate and persist order
    const results = [];
    for (const svc of targetServices) {
      try {
        // Filter shifts for this service today
        const serviceShifts = todayShifts.filter(s => {
          const emp = employeeMap[s.employee_id];
          return emp && (emp.team === svc || (emp.position && emp.position === svc));
        });

        const now = new Date().toISOString();

        // Always create/update DepartureOrder record (even if empty)
        if (serviceShifts.length === 0) {
          const existing = await b.entities.DepartureOrder.filter({ date, service: svc });
          if (existing.length > 0) {
            await b.entities.DepartureOrder.update(existing[0].id, {
              employee_order: [],
              generated_at: now,
              last_auto_recompute_at: now,
              recompute_reason: reason,
              version: (existing[0].version || 0) + 1
            });
          } else {
            await b.entities.DepartureOrder.create({
              date,
              service: svc,
              employee_order: [],
              generated_at: now,
              last_auto_recompute_at: now,
              recompute_reason: reason,
              version: 1
            });
          }
          results.push({ service: svc, status: 'empty', count: 0, reason: 'no_shifts' });
          continue;
        }

        // Build scoring data
        const employeeScores = [];
        for (const shift of serviceShifts) {
          const emp = employeeMap[shift.employee_id];
          if (!emp) continue;

          const recap = persistedMap[emp.id];
          let score = 0;

          if (hoursType === 'complementary' || hoursType === 'both') {
            score += recap?.complementary_hours_ui || 0;
          }
          if (hoursType === 'overtime' || hoursType === 'both') {
            score += recap?.overtime_hours_ui || 0;
          }

          employeeScores.push({
            employee_id: emp.id,
            employee_name: `${emp.first_name} ${emp.last_name}`,
            score,
            order_index: employeeScores.length + 1
          });
        }

        // Sort by score descending, then by name ascending
        employeeScores.sort((a, b) => b.score - a.score || a.employee_name.localeCompare(b.employee_name));
        employeeScores.forEach((e, idx) => { e.order_index = idx + 1; });

        // Persist order
        const existing = await b.entities.DepartureOrder.filter({ date, service: svc });

        if (existing.length > 0) {
          await b.entities.DepartureOrder.update(existing[0].id, {
            employee_order: employeeScores,
            generated_at: now,
            last_auto_recompute_at: now,
            recompute_reason: reason,
            version: (existing[0].version || 0) + 1
          });
        } else {
          await b.entities.DepartureOrder.create({
            date,
            service: svc,
            employee_order: employeeScores,
            generated_at: now,
            last_auto_recompute_at: now,
            recompute_reason: reason,
            version: 1
          });
        }

        results.push({
          service: svc,
          status: 'success',
          count: employeeScores.length,
          debug: employeeScores.map(e => `${e.employee_name}=${e.score.toFixed(1)}h`).join(' | ')
        });
      } catch (err) {
        console.error(`[ERROR] Service ${svc}:`, err.message);
        results.push({ service: svc, status: 'error', error: err.message });
      }
    }

    return Response.json({
      success: true,
      date,
      reason,
      forceImmediate,
      results
    });
  } catch (error) {
    console.error('[ERROR] recomputeDepartureOrderIfNeeded:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  } finally {
    // Clean up lock after success
    if (lockId) {
      try {
        await b.entities.DepartureOrderRecomputeLock.delete(lockId);
      } catch {
        /* ignore */
      }
    }
  }
});