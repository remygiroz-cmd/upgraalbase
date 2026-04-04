import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * Daily auto-assignment of delivery vehicles to present delivery drivers.
 * Priority: SOCIETE vehicles first, then LOA sorted by km_restants DESC.
 * DIRECTION vehicles are NEVER auto-assigned.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Allow unauthenticated calls from scheduler but validate shared secret
    const url = new URL(req.url);
    const secret = url.searchParams.get('secret') || req.headers.get('x-scheduler-secret');
    const expectedSecret = Deno.env.get('SCHEDULER_SECRET');
    
    // If called with auth header, verify admin
    let isSchedulerCall = false;
    if (expectedSecret && secret === expectedSecret) {
      isSchedulerCall = true;
    } else {
      const user = await base44.auth.me();
      if (!user || (user.role !== 'admin' && user.role !== 'manager')) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const today = body.date || new Date().toISOString().split('T')[0];

    // Load data using service role
    const client = base44.asServiceRole;

    const [vehicles, employees, shifts, existingAssignments, fleetSettings] = await Promise.all([
      client.entities.Vehicle.list(),
      client.entities.Employee.filter({ is_active: true }),
      client.entities.Shift.filter({ date: today }),
      client.entities.VehicleAssignment.filter({ date: today }),
      client.entities.FleetSettings.filter({ setting_key: 'fleet_main' })
    ]);

    const settings = fleetSettings[0] || {};

    // Check if today is an auto-assign day
    const dayMap = { 1: 'MON', 2: 'TUE', 3: 'WED', 4: 'THU', 5: 'FRI', 6: 'SAT', 0: 'SUN' };
    const todayDow = dayMap[new Date(today + 'T12:00:00').getDay()];
    const autoDays = settings.auto_assign_days || ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    
    if (isSchedulerCall && !autoDays.includes(todayDow)) {
      return Response.json({ message: `Auto-assign not scheduled for ${todayDow}` });
    }

    // Present employee IDs from shifts (not absent/leave)
    const presentEmployeeIds = new Set(
      shifts
        .filter(s => s.status !== 'absent' && s.status !== 'leave')
        .map(s => s.employee_id)
    );

    // Filter delivery drivers who are present
    const livreurs = employees.filter(e => {
      if (!presentEmployeeIds.has(e.id)) return false;
      const team = (e.team || '').toLowerCase();
      const pos = (e.position || '').toLowerCase();
      return team.includes('livraison') || pos.includes('livreur') || pos.includes('livreuse');
    });

    if (livreurs.length === 0) {
      return Response.json({ message: 'No delivery drivers present today', date: today, assigned: 0 });
    }

    // Auto-assignable vehicles: ACTIF + LIVRAISON only (never DIRECTION)
    const deliveryVehicles = vehicles.filter(v => v.statut === 'ACTIF' && v.type_usage === 'LIVRAISON');

    if (deliveryVehicles.length === 0) {
      return Response.json({ message: 'No active delivery vehicles available', date: today, assigned: 0 });
    }

    // Keep MANUEL and locked assignments, delete AUTO non-locked
    const toDelete = existingAssignments.filter(a => a.source === 'AUTO' && !a.locked);
    await Promise.all(toDelete.map(a => client.entities.VehicleAssignment.delete(a.id)));

    const kept = existingAssignments.filter(a => a.source === 'MANUEL' || a.locked);
    const keptVehicleIds = new Set(kept.map(a => a.vehicule_id));
    const keptEmployeeIds = new Set(kept.map(a => a.employe_id));

    const availableVehicles = deliveryVehicles.filter(v => !keptVehicleIds.has(v.id));
    const availableLivreurs = livreurs.filter(e => !keptEmployeeIds.has(e.id));

    // Priority assignment: match vehicles with priority drivers first
    const toCreate = [];
    const assignedVehicles = new Set();
    const assignedDrivers = new Set();

    // Phase 1: Assign priority vehicles to their priority drivers (if present)
    for (const vehicle of availableVehicles) {
      if (vehicle.priority_driver_id) {
        const priorityDriver = availableLivreurs.find(e => e.id === vehicle.priority_driver_id);
        if (priorityDriver && !assignedDrivers.has(priorityDriver.id)) {
          toCreate.push({
            date: today,
            vehicule_id: vehicle.id,
            employe_id: priorityDriver.id,
            employe_name: `${priorityDriver.first_name} ${priorityDriver.last_name}`,
            source: 'AUTO',
            locked: false,
            statut: 'ASSIGNE'
          });
          assignedVehicles.add(vehicle.id);
          assignedDrivers.add(priorityDriver.id);
        }
      }
    }

    // Phase 2: Sort remaining vehicles and assign to remaining drivers
    const remainingVehicles = availableVehicles.filter(v => !assignedVehicles.has(v.id));
    const remainingDrivers = availableLivreurs.filter(e => !assignedDrivers.has(e.id));

    // Sort: SOCIETE first (km_actuel ASC), then LOA (km_restants DESC)
    const societeSorted = remainingVehicles
      .filter(v => v.propriete === 'SOCIETE')
      .sort((a, b) => (a.km_actuel || 0) - (b.km_actuel || 0));

    const loaSorted = remainingVehicles
      .filter(v => v.propriete === 'LOA')
      .map(v => {
        const kmConsumed = (v.km_actuel || 0) - (v.km_initial || 0);
        const kmRestants = (v.loa_km_total_autorises || 0) - kmConsumed;
        return { ...v, _kmRestants: kmRestants };
      })
      .sort((a, b) => b._kmRestants - a._kmRestants);

    const sortedRemainingVehicles = [...societeSorted, ...loaSorted];
    const count = Math.min(sortedRemainingVehicles.length, remainingDrivers.length);

    for (let i = 0; i < count; i++) {
      toCreate.push({
        date: today,
        vehicule_id: sortedRemainingVehicles[i].id,
        employe_id: remainingDrivers[i].id,
        employe_name: `${remainingDrivers[i].first_name} ${remainingDrivers[i].last_name}`,
        source: 'AUTO',
        locked: false,
        statut: 'ASSIGNE'
      });
    }

    if (toCreate.length > 0) {
      await client.entities.VehicleAssignment.bulkCreate(toCreate);
    }

    return Response.json({
      success: true,
      date: today,
      assigned: toCreate.length,
      priority_assigned: assignedDrivers.size,
      livreurs_present: livreurs.length,
      vehicles_available: deliveryVehicles.length,
      without_vehicle: Math.max(0, livreurs.length - toCreate.length)
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});