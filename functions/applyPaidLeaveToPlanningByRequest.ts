import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Apply Paid Leave to Planning (from LeaveRequest approval)
 * Creates PaidLeavePeriod records AND replaces shifts with CP non-shift events
 * Multi-month support with split logic
 */
Deno.serve(async (req) => {
  const traceId = Math.random().toString(36).substring(7);
  
  try {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎯 [${traceId}] APPLY CP TO PLANNING - START`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const base44 = createClientFromRequest(req);
    
    // Authenticate user
    const user = await base44.auth.me();
    if (!user) {
      console.error(`❌ [${traceId}] Unauthorized: No user authenticated`);
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    
    console.log(`✓ [${traceId}] Authenticated user: ${user.email} (role: ${user.role})`);

    // Parse payload
    const payload = await req.json();
    const { leaveRequestId } = payload;

    if (!leaveRequestId) {
      console.error(`❌ [${traceId}] Missing leaveRequestId`);
      return Response.json({ 
        ok: false, 
        error: 'Missing leaveRequestId',
        traceId 
      }, { status: 400 });
    }

    console.log(`\n📥 [${traceId}] Payload:`, { leaveRequestId });

    // Fetch leave request
    console.log(`\n🔍 [${traceId}] Fetching LeaveRequest...`);
    const leaveRequests = await base44.entities.LeaveRequest.filter({ id: leaveRequestId });
    const request = leaveRequests[0];

    if (!request) {
      console.error(`❌ [${traceId}] LeaveRequest not found: ${leaveRequestId}`);
      return Response.json({ 
        ok: false, 
        error: 'LeaveRequest not found',
        traceId 
      }, { status: 404 });
    }

    console.log(`✓ [${traceId}] LeaveRequest found:`, {
      id: request.id,
      employee_id: request.employee_id,
      employee_name: request.employee_name,
      start_cp: request.start_cp,
      end_cp: request.end_cp,
      first_work_day_after: request.first_work_day_after,
      cp_days_computed: request.cp_days_computed
    });

    // CRITICAL: Validate required fields
    if (!request.start_cp || !request.first_work_day_after) {
      console.error(`❌ [${traceId}] Missing required fields:`, {
        start_cp: request.start_cp,
        first_work_day_after: request.first_work_day_after
      });
      return Response.json({
        ok: false,
        error: 'Missing start_cp or first_work_day_after in LeaveRequest',
        traceId
      }, { status: 400 });
    }

    // Parse dates
    const startDate = new Date(request.start_cp);
    const endDate = new Date(request.end_cp);

    console.log(`\n📅 [${traceId}] CP Period:`, {
      start_cp: request.start_cp,
      end_cp: request.end_cp,
      days: request.cp_days_computed
    });

    // Fetch CP non-shift type
    console.log(`\n🔍 [${traceId}] Fetching CP non-shift type...`);
    const nonShiftTypes = await base44.asServiceRole.entities.NonShiftType.filter({ is_active: true });
    const cpNonShiftType = nonShiftTypes.find(t => t.key === 'conges_payes' || t.code === 'CP');

    if (!cpNonShiftType) {
      console.error(`❌ [${traceId}] CP non-shift type not found`);
      return Response.json({
        ok: false,
        error: 'CP non-shift type not found. Please configure a type with key="conges_payes" or code="CP".',
        traceId
      }, { status: 500 });
    }

    console.log(`✓ [${traceId}] CP non-shift type found:`, {
      id: cpNonShiftType.id,
      label: cpNonShiftType.label,
      code: cpNonShiftType.code
    });

    // Multi-month handling: split period by month
    console.log(`\n🗓️ [${traceId}] Calculating month splits...`);
    const monthsToProcess = [];
    let currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      const year = currentDate.getFullYear();
      const monthNum = currentDate.getMonth() + 1;
      const monthKey = `${year}-${String(monthNum).padStart(2, '0')}`;
      
      if (!monthsToProcess.some(m => m.month_key === monthKey)) {
        monthsToProcess.push({ year, monthNum, month_key: monthKey });
      }
      
      currentDate.setMonth(currentDate.getMonth() + 1);
      currentDate.setDate(1);
    }

    console.log(`✓ [${traceId}] Months to process: ${monthsToProcess.length}`, 
      monthsToProcess.map(m => m.month_key));

    // Process each month
    const createdPaidLeavePeriodIds = [];
    const deletedShiftsCount = [];
    const createdNonShiftsCount = [];

    for (const { year, monthNum, month_key } of monthsToProcess) {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📆 [${traceId}] PROCESSING MONTH: ${month_key}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

      // Get reset version for this month
      console.log(`🔍 [${traceId}] Fetching PlanningMonth for ${month_key}...`);
      const planningMonths = await base44.asServiceRole.entities.PlanningMonth.filter({ month_key });
      const planningMonth = planningMonths[0];
      
      if (!planningMonth) {
        console.log(`⚠️ [${traceId}] PlanningMonth not found, creating with default reset_version=0`);
      }
      
      const resetVersion = planningMonth?.reset_version ?? 0;
      console.log(`✓ [${traceId}] Reset version: ${resetVersion}`);

      // Calculate period boundaries for this month
      const monthStart = new Date(year, monthNum - 1, 1);
      const monthEnd = new Date(year, monthNum, 0);
      
      const periodStart = startDate > monthStart ? startDate : monthStart;
      const periodEnd = endDate < monthEnd ? endDate : monthEnd;

      console.log(`📊 [${traceId}] Month boundaries:`, {
        monthStart: monthStart.toISOString().split('T')[0],
        monthEnd: monthEnd.toISOString().split('T')[0],
        periodStart: periodStart.toISOString().split('T')[0],
        periodEnd: periodEnd.toISOString().split('T')[0]
      });

      // Create PaidLeavePeriod for this month
      const periodData = {
        employee_id: request.employee_id,
        employee_name: request.employee_name,
        
        // REQUIRED FIELDS
        cp_start_date: request.start_cp,
        return_date: request.first_work_day_after,
        
        // OPTIONAL FIELDS
        start_cp: periodStart.toISOString().split('T')[0],
        end_cp: periodEnd.toISOString().split('T')[0],
        cp_days_auto: request.cp_days_computed,
        cp_days_manual: request.manual_override_days || null,
        notes: request.notes || `Demande acceptée le ${new Date().toLocaleDateString('fr-FR')}`,
        month_key,
        reset_version: resetVersion
      };

      console.log(`\n📝 [${traceId}] Creating PaidLeavePeriod for ${month_key}...`);
      console.log('Period data:', periodData);

      const createdPeriod = await base44.asServiceRole.entities.PaidLeavePeriod.create(periodData);
      createdPaidLeavePeriodIds.push(createdPeriod.id);
      
      console.log(`✓ [${traceId}] PaidLeavePeriod created: ${createdPeriod.id}`);

      // APPLY CP TO PLANNING: Replace shifts with CP non-shift events
      console.log(`\n🔄 [${traceId}] APPLYING CP TO PLANNING for ${month_key}...`);
      
      // Fetch ALL shifts for employee with this reset_version
      const startCPStr = periodStart.toISOString().split('T')[0];
      const endCPStr = periodEnd.toISOString().split('T')[0];
      
      console.log(`🔍 [${traceId}] Fetching shifts for employee ${request.employee_id}...`);
      const allShifts = await base44.asServiceRole.entities.Shift.filter({
        employee_id: request.employee_id,
        reset_version: resetVersion
      });
      
      console.log(`   Total shifts for employee in month: ${allShifts.length}`);
      
      // Filter shifts in CP period
      const shiftsInPeriod = allShifts.filter(shift => 
        shift.date >= startCPStr && shift.date <= endCPStr
      );
      
      console.log(`   Shifts in CP period (${startCPStr} → ${endCPStr}): ${shiftsInPeriod.length}`);
      if (shiftsInPeriod.length > 0) {
        console.log(`   Shift dates:`, shiftsInPeriod.map(s => s.date).join(', '));
      }

      // Extract impacted days
      const impactedDays = [...new Set(shiftsInPeriod.map(s => s.date))].sort();
      console.log(`   Impacted days: ${impactedDays.length} (${impactedDays.join(', ') || 'none'})`);

      if (impactedDays.length === 0) {
        console.log(`⚠️ [${traceId}] No shifts found in CP period for ${month_key}`);
        console.log(`   → No conversion needed (expected if employee has no shifts during CP)`);
        deletedShiftsCount.push(0);
        createdNonShiftsCount.push(0);
        continue;
      }

      // Delete all shifts in period
      console.log(`\n🗑️ [${traceId}] Deleting ${shiftsInPeriod.length} shifts...`);
      const deleteResults = await Promise.allSettled(
        shiftsInPeriod.map(shift => {
          console.log(`   → Deleting shift ${shift.id} on ${shift.date}`);
          return base44.asServiceRole.entities.Shift.delete(shift.id);
        })
      );

      const deleted = deleteResults.filter(r => r.status === 'fulfilled').length;
      const deleteFailed = deleteResults.filter(r => r.status === 'rejected');

      if (deleteFailed.length > 0) {
        console.error(`❌ [${traceId}] DELETION FAILURES: ${deleteFailed.length} shifts`);
        deleteFailed.forEach((f, idx) => {
          console.error(`   Failure ${idx + 1}:`, f.reason);
        });
        throw new Error(`Failed to delete ${deleteFailed.length} shift(s). Check permissions.`);
      }

      console.log(`✓ [${traceId}] Deleted ${deleted} shifts`);
      deletedShiftsCount.push(deleted);

      // Check existing CP non-shifts (idempotence)
      console.log(`\n🔎 [${traceId}] Checking existing CP non-shifts...`);
      const existingNonShifts = await base44.asServiceRole.entities.NonShiftEvent.filter({
        employee_id: request.employee_id,
        non_shift_type_id: cpNonShiftType.id,
        month_key,
        reset_version: resetVersion
      });
      
      const existingCPDates = new Set(existingNonShifts.map(ns => ns.date));
      console.log(`   Existing CP non-shifts: ${existingCPDates.size}`);
      if (existingCPDates.size > 0) {
        console.log(`   Dates: ${Array.from(existingCPDates).join(', ')}`);
      }

      // Create CP non-shifts for impacted days
      const nonShiftsToCreate = impactedDays.filter(date => !existingCPDates.has(date));
      console.log(`\n➕ [${traceId}] Creating CP non-shifts...`);
      console.log(`   Days needing creation: ${nonShiftsToCreate.length} / ${impactedDays.length}`);
      console.log(`   Days to create: ${nonShiftsToCreate.join(', ') || 'none (already exist)'}`);

      let created = 0;

      if (nonShiftsToCreate.length > 0) {
        const createResults = await Promise.allSettled(
          nonShiftsToCreate.map(date => {
            const cpData = {
              employee_id: request.employee_id,
              employee_name: request.employee_name,
              date,
              non_shift_type_id: cpNonShiftType.id,
              non_shift_type_label: cpNonShiftType.label,
              notes: `CP (période du ${request.start_cp} au ${request.end_cp})`,
              month_key,
              reset_version: resetVersion
            };
            console.log(`   → Creating CP non-shift for ${date}:`, cpData);
            return base44.asServiceRole.entities.NonShiftEvent.create(cpData);
          })
        );

        created = createResults.filter(r => r.status === 'fulfilled').length;
        const createFailed = createResults.filter(r => r.status === 'rejected');

        if (createFailed.length > 0) {
          console.error(`❌ [${traceId}] CREATION FAILURES: ${createFailed.length} non-shifts`);
          createFailed.forEach((f, idx) => {
            console.error(`   Failure ${idx + 1}:`, f.reason);
          });
          throw new Error(`Failed to create ${createFailed.length} CP non-shift(s). Check permissions or fields.`);
        }

        console.log(`✓ [${traceId}] Created ${created} CP non-shifts`);
      } else {
        console.log(`✓ [${traceId}] All CP non-shifts already exist (idempotent)`);
      }

      createdNonShiftsCount.push(created);

      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`✅ [${traceId}] MONTH ${month_key} COMPLETED`);
      console.log(`   Periods created: 1`);
      console.log(`   Shifts deleted: ${deleted}`);
      console.log(`   CP non-shifts created: ${created}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    }

    // Final summary
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ [${traceId}] APPLY CP TO PLANNING - COMPLETE`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Employee: ${request.employee_name} (${request.employee_id})`);
    console.log(`Period: ${request.start_cp} → ${request.end_cp}`);
    console.log(`Months processed: ${monthsToProcess.length}`);
    console.log(`PaidLeavePeriods created: ${createdPaidLeavePeriodIds.length}`);
    console.log(`Total shifts deleted: ${deletedShiftsCount.reduce((a, b) => a + b, 0)}`);
    console.log(`Total CP non-shifts created: ${createdNonShiftsCount.reduce((a, b) => a + b, 0)}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    return Response.json({
      ok: true,
      traceId,
      createdPaidLeavePeriodIds,
      totalShiftsDeleted: deletedShiftsCount.reduce((a, b) => a + b, 0),
      totalNonShiftsCreated: createdNonShiftsCount.reduce((a, b) => a + b, 0),
      monthsProcessed: monthsToProcess.length,
      summary: {
        employee_name: request.employee_name,
        start_cp: request.start_cp,
        end_cp: request.end_cp,
        cp_days: request.cp_days_computed
      }
    });

  } catch (error) {
    console.error(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.error(`❌ [${traceId}] ERROR:`, error.message);
    console.error(`Stack:`, error.stack);
    console.error(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    return Response.json({
      ok: false,
      error: error.message,
      errorName: error.name,
      stack: error.stack,
      traceId
    }, { status: 500 });
  }
});