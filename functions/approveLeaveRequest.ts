import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  // Generate traceId FIRST
  const traceId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  
  // Log environment info FIRST
  const appId = Deno.env.get('BASE44_APP_ID');
  const appUrl = Deno.env.get('BASE44_APP_URL');
  const deploymentMode = Deno.env.get('DENO_DEPLOYMENT_ID') ? 'PUBLISHED' : 'PREVIEW';
  
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🔷 [${traceId}] APPROVE START`);
    console.log('📍 ENVIRONMENT:', {
      deploymentMode,
      appId,
      appUrl,
      denoDeploymentId: Deno.env.get('DENO_DEPLOYMENT_ID')?.substring(0, 8) || 'none'
    });
    
    const base44 = createClientFromRequest(req);
    console.log(`✓ [${traceId}] STEP 0: base44 client created`);
    
    const user = await base44.auth.me();
    if (!user) {
      console.error(`❌ [${traceId}] Unauthorized - no user`);
      return Response.json({ 
        ok: false, 
        error: 'Unauthorized',
        errorMessage: 'No authenticated user',
        traceId 
      }, { status: 401 });
    }
    
    console.log(`✓ [${traceId}] STEP 0.5: User authenticated:`, user.email);

    const { requestId } = await req.json();

    console.log('👤 USER:', {
      requestId,
      currentUserEmail: user.email,
      currentUserId: user.id,
      currentUserRole: user.role,
      traceId
    });
    console.log('⏰ TIMESTAMP:', new Date().toISOString());

    // STEP 1: Fetch the leave request
    console.log(`⏳ [${traceId}] STEP 1: Fetching LeaveRequest ${requestId}...`);
    const requests = await base44.asServiceRole.entities.LeaveRequest.filter({ id: requestId });
    if (requests.length === 0) {
      console.error(`❌ [${traceId}] STEP 1 FAILED: LeaveRequest not found`);
      return Response.json({ 
        ok: false,
        error: 'Request not found',
        traceId
      }, { status: 404 });
    }

    const request = requests[0];
    console.log(`✅ [${traceId}] STEP 1 OK: LeaveRequest loaded`);
    console.log(`   - Employee: ${request.employee_name} (${request.employee_id})`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 [APPROVE] REQUEST DETAILS:');
    console.log('  requestId:', request.id);
    console.log('  status:', request.status);
    console.log('  employeeId:', request.employee_id);
    console.log('  employeeName:', request.employee_name);
    console.log('  requestedByUserId:', request.requested_by_user_id);
    console.log('  requestedByUserEmail:', request.requested_by_user_email);
    console.log('  lastWorkDay:', request.last_work_day);
    console.log('  firstWorkDayAfter:', request.first_work_day_after);
    console.log('  startCP:', request.start_cp);
    console.log('  endCP:', request.end_cp);
    console.log('  cpDaysComputed:', request.cp_days_computed);
    console.log('  manualOverride:', request.manual_override_days);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // STEP 2: Validation dates coherence
    console.log(`⏳ [${traceId}] STEP 2: Validating dates...`);
    const startDate = new Date(request.start_cp);
    const endDate = new Date(request.end_cp);
    const returnDate = new Date(request.first_work_day_after);

    console.log(`   - start_cp: ${request.start_cp} → ${startDate}`);
    console.log(`   - end_cp: ${request.end_cp} → ${endDate}`);
    console.log(`   - return: ${request.first_work_day_after} → ${returnDate}`);

    if (endDate < startDate) {
      console.error(`❌ [${traceId}] STEP 2 FAILED: end_cp < start_cp`);
      return Response.json({ 
        ok: false,
        error: 'Dates invalides: la date de fin est avant la date de début',
        traceId
      }, { status: 400 });
    }
    
    console.log(`✅ [${traceId}] STEP 2 OK: Dates validated`);

    // STEP 3: Determine all affected months
    console.log(`⏳ [${traceId}] STEP 3: Computing affected months...`);
    const affectedMonths = [];
    let currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
      if (!affectedMonths.includes(monthKey)) {
        affectedMonths.push(monthKey);
      }
      currentDate.setMonth(currentDate.getMonth() + 1);
      currentDate.setDate(1);
    }

    console.log(`✅ [${traceId}] STEP 3 OK: Affected months:`, affectedMonths);

    // STEP 4: Check service role availability
    console.log(`⏳ [${traceId}] STEP 4: Checking service role client...`);
    const usingServiceRole = !!base44.asServiceRole;
    console.log(`   - usingServiceRole: ${usingServiceRole}`);
    
    if (!usingServiceRole) {
      console.error(`❌ [${traceId}] STEP 4 FAILED: asServiceRole not available!`);
      throw new Error('Service role client non disponible - impossible de créer des PaidLeavePeriod');
    }
    
    console.log(`✅ [${traceId}] STEP 4 OK: Service role available`);

    // ============================================================
    // STEP 5: Fetch CP non-shift type (needed for shift conversion)
    // ============================================================
    console.log(`\n🔍 [${traceId}] STEP 5: Fetching CP non-shift type...`);
    const nonShiftTypes = await base44.asServiceRole.entities.NonShiftType.filter({ is_active: true });
    const cpNonShiftType = nonShiftTypes.find(t => t.key === 'conges_payes' || t.code === 'CP');

    if (!cpNonShiftType) {
      console.error(`❌ [${traceId}] STEP 5 FAILED: CP non-shift type not found`);
      return Response.json({
        ok: false,
        error: 'CP non-shift type not found. Configure a type with key="conges_payes" or code="CP".',
        traceId
      }, { status: 500 });
    }

    console.log(`✅ [${traceId}] STEP 5 OK: CP type found:`, {
      id: cpNonShiftType.id,
      label: cpNonShiftType.label,
      code: cpNonShiftType.code
    });

    // ============================================================
    // STEP 6: Process each month (create period + convert shifts)
    // ============================================================
    const createdPeriods = [];
    let totalShiftsDeleted = 0;
    let totalNonShiftsCreated = 0;
    
    for (const monthKey of affectedMonths) {
      const [year, monthNum] = monthKey.split('-').map(Number);
      
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📆 [${traceId}] PROCESSING MONTH: ${monthKey}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      
      // Get or create planning month
      console.log(`🔍 [${traceId}] Fetching PlanningMonth for ${monthKey}...`);
      let planningMonths = await base44.asServiceRole.entities.PlanningMonth.filter({ month_key: monthKey });
      let resetVersion = 0;
      
      if (planningMonths.length === 0) {
        console.log(`   - Creating new PlanningMonth for ${monthKey}`);
        const newPlanningMonth = await base44.asServiceRole.entities.PlanningMonth.create({
          year: year,
          month: monthNum - 1,
          month_key: monthKey,
          reset_version: 0
        });
        resetVersion = 0;
        console.log(`   - Created PlanningMonth ID: ${newPlanningMonth.id}`);
      } else {
        resetVersion = planningMonths[0].reset_version || 0;
        console.log(`   - Found PlanningMonth ID: ${planningMonths[0].id}, reset_version: ${resetVersion}`);
      }

      // Calculate period boundaries for this month
      const monthStart = new Date(year, monthNum - 1, 1);
      const monthEnd = new Date(year, monthNum, 0);
      
      const periodStart = startDate > monthStart ? startDate : monthStart;
      const periodEnd = endDate < monthEnd ? endDate : monthEnd;

      const startCPStr = periodStart.toISOString().split('T')[0];
      const endCPStr = periodEnd.toISOString().split('T')[0];

      console.log(`📊 [${traceId}] Period boundaries for ${monthKey}:`, {
        monthStart: monthStart.toISOString().split('T')[0],
        monthEnd: monthEnd.toISOString().split('T')[0],
        periodStart: startCPStr,
        periodEnd: endCPStr
      });

      // Create PaidLeavePeriod
      const periodData = {
        employee_id: request.employee_id,
        employee_name: request.employee_name,
        cp_start_date: request.start_cp,
        return_date: request.first_work_day_after,
        start_cp: startCPStr,
        end_cp: endCPStr,
        cp_days_auto: request.cp_days_computed,
        cp_days_manual: request.manual_override_days || null,
        notes: request.notes || `Demande acceptée le ${new Date().toLocaleDateString('fr-FR')}`,
        month_key: monthKey,
        reset_version: resetVersion
      };

      console.log(`\n📝 [${traceId}] Creating PaidLeavePeriod...`);
      const period = await base44.asServiceRole.entities.PaidLeavePeriod.create(periodData);
      createdPeriods.push(period);
      console.log(`✓ [${traceId}] PaidLeavePeriod created: ${period.id}`);

      // ============================================================
      // CONVERT SHIFTS TO CP NON-SHIFTS (same logic as AddCPGlobalModal)
      // ============================================================
      console.log(`\n🔄 [${traceId}] CONVERTING SHIFTS TO CP...`);
      
      // Fetch ALL shifts for employee in this month
      const allShifts = await base44.asServiceRole.entities.Shift.filter({
        employee_id: request.employee_id,
        reset_version: resetVersion
      });
      
      console.log(`   Total shifts for employee: ${allShifts.length}`);
      
      // Filter shifts in CP period
      const shiftsInPeriod = allShifts.filter(shift => 
        shift.date >= startCPStr && shift.date <= endCPStr
      );
      
      console.log(`   Shifts in CP period: ${shiftsInPeriod.length}`);
      if (shiftsInPeriod.length > 0) {
        console.log(`   Dates: ${shiftsInPeriod.map(s => s.date).join(', ')}`);
      }

      // Extract impacted days
      const impactedDays = [...new Set(shiftsInPeriod.map(s => s.date))].sort();
      console.log(`   Impacted days: ${impactedDays.length}`);

      if (impactedDays.length === 0) {
        console.log(`⚠️ [${traceId}] No shifts found in period (expected if no work scheduled)`);
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
        console.error(`❌ [${traceId}] Deletion failures: ${deleteFailed.length}`);
        deleteFailed.forEach((f, idx) => {
          console.error(`   Failure ${idx + 1}:`, f.reason);
        });
        throw new Error(`Failed to delete ${deleteFailed.length} shift(s)`);
      }

      console.log(`✓ [${traceId}] Deleted ${deleted} shifts`);
      totalShiftsDeleted += deleted;

      // Check existing CP non-shifts (idempotence)
      console.log(`\n🔎 [${traceId}] Checking existing CP non-shifts...`);
      const existingNonShifts = await base44.asServiceRole.entities.NonShiftEvent.filter({
        employee_id: request.employee_id,
        non_shift_type_id: cpNonShiftType.id,
        month_key: monthKey,
        reset_version: resetVersion
      });
      
      const existingCPDates = new Set(existingNonShifts.map(ns => ns.date));
      console.log(`   Existing CP non-shifts: ${existingCPDates.size}`);

      // Create CP non-shifts for impacted days
      const nonShiftsToCreate = impactedDays.filter(date => !existingCPDates.has(date));
      console.log(`\n➕ [${traceId}] Creating CP non-shifts...`);
      console.log(`   Days to create: ${nonShiftsToCreate.length} / ${impactedDays.length}`);

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
              month_key: monthKey,
              reset_version: resetVersion
            };
            return base44.asServiceRole.entities.NonShiftEvent.create(cpData);
          })
        );

        created = createResults.filter(r => r.status === 'fulfilled').length;
        const createFailed = createResults.filter(r => r.status === 'rejected');

        if (createFailed.length > 0) {
          console.error(`❌ [${traceId}] Creation failures: ${createFailed.length}`);
          createFailed.forEach((f, idx) => {
            console.error(`   Failure ${idx + 1}:`, f.reason);
          });
          throw new Error(`Failed to create ${createFailed.length} CP non-shift(s)`);
        }

        console.log(`✓ [${traceId}] Created ${created} CP non-shifts`);
      } else {
        console.log(`✓ [${traceId}] All CP non-shifts already exist`);
      }

      totalNonShiftsCreated += created;

      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`✅ [${traceId}] MONTH ${monthKey} COMPLETED`);
      console.log(`   Period ID: ${period.id}`);
      console.log(`   Shifts deleted: ${deleted}`);
      console.log(`   CP non-shifts created: ${created}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    }

    console.log(`✅ [${traceId}] All periods created successfully (${createdPeriods.length} periods)`);

    // STEP 8: Update request status ONLY if all periods created successfully
    console.log(`⏳ [${traceId}] STEP 8: Updating LeaveRequest to APPROVED...`);
    
    await base44.asServiceRole.entities.LeaveRequest.update(requestId, {
      status: 'APPROVED',
      decision_by_user_id: user.id,
      decision_by_user_email: user.email,
      decision_at: new Date().toISOString(),
      created_period_id: createdPeriods[0].id
    });

    console.log(`✅ [${traceId}] STEP 8 OK: LeaveRequest updated to APPROVED`);

    // STEP 9: Send notification to requester
    console.log(`⏳ [${traceId}] STEP 9: Sending email notification...`);
    if (request.requested_by_user_email) {
      try {
        await base44.integrations.Core.SendEmail({
          to: request.requested_by_user_email,
          subject: '✅ Votre demande de CP a été acceptée',
          body: `
            <h2>Votre demande de congés payés a été acceptée</h2>
            <p><strong>Période:</strong> Du ${new Date(request.last_work_day).toLocaleDateString('fr-FR')} au ${new Date(request.first_work_day_after).toLocaleDateString('fr-FR')}</p>
            <p><strong>Jours décomptés:</strong> ${request.cp_days_computed} jours</p>
            <p><strong>Date de décision:</strong> ${new Date().toLocaleDateString('fr-FR')}</p>
            <p>Cette période a été ajoutée à votre planning.</p>
          `
        });
        console.log(`✅ [${traceId}] STEP 9 OK: Email sent to ${request.requested_by_user_email}`);
      } catch (emailError) {
        console.error(`⚠️ [${traceId}] STEP 9 WARNING: Email failed:`, emailError.message);
      }
    } else {
      console.log(`⚠️ [${traceId}] STEP 9 SKIPPED: No email address for requester`);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅✅✅ [APPROVE END] SUCCESS ✅✅✅');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 FINAL RESULT:');
    console.log('  requestId:', requestId);
    console.log('  employeeId:', request.employee_id);
    console.log('  employeeName:', request.employee_name);
    console.log('  periodsCreated:', createdPeriods.length);
    console.log('  createdPaidLeavePeriodIds:', createdPeriods.map(p => p.id));
    console.log('  affectedMonths:', affectedMonths);
    console.log('  startCP:', request.start_cp);
    console.log('  endCP:', request.end_cp);
    console.log('  appId:', appId);
    console.log('  deploymentMode:', deploymentMode);
    console.log('  timestamp:', new Date().toISOString());
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const responsePayload = {
      ok: true,
      success: true,
      traceId,
      createdPaidLeavePeriodIds: createdPeriods.map(p => p.id),
      month_keys: affectedMonths,
      employee_id: request.employee_id,
      employee_name: request.employee_name,
      start_cp: request.start_cp,
      end_cp: request.end_cp,
      appId,
      deploymentMode,
      periods: createdPeriods,
      affectedMonths
    };

    console.log(`📤 [${traceId}] Returning SUCCESS response:`, JSON.stringify(responsePayload, null, 2));

    return Response.json(responsePayload);

  } catch (error) {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error(`❌❌❌ [${traceId}] APPROVE FAILED ❌❌❌`);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error(`[${traceId}] Error details:`, {
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack
    });
    console.error(`[${traceId}] Context:`, {
      deploymentMode,
      appId,
      appUrl,
      timestamp: new Date().toISOString()
    });
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const errorResponse = { 
      ok: false,
      success: false,
      traceId,
      errorMessage: error.message || 'Erreur lors de l\'approbation',
      errorName: error.name || 'Error',
      stack: error.stack || '',
      context: {
        deploymentMode,
        appId,
        timestamp: new Date().toISOString()
      }
    };
    
    console.error(`📤 [${traceId}] Returning ERROR response (200 OK with ok:false):`, JSON.stringify(errorResponse, null, 2));
    
    // Return 200 with ok:false instead of 500 so frontend can read the JSON
    return Response.json(errorResponse, { status: 200 });
  }
});