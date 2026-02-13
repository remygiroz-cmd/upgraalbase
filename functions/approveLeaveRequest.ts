import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      console.error('❌ [APPROVE] Unauthorized - no user');
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { requestId } = await req.json();

    // Log environment info
    const appId = Deno.env.get('BASE44_APP_ID');
    const appUrl = Deno.env.get('BASE44_APP_URL');
    const deploymentMode = Deno.env.get('DENO_DEPLOYMENT_ID') ? 'PUBLISHED' : 'PREVIEW';

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔷 [APPROVE START] Request received');
    console.log('📍 ENVIRONMENT:', {
      deploymentMode,
      appId,
      appUrl,
      denoDeploymentId: Deno.env.get('DENO_DEPLOYMENT_ID')?.substring(0, 8) || 'none'
    });
    console.log('👤 USER:', {
      requestId,
      currentUserEmail: user.email,
      currentUserId: user.id,
      currentUserRole: user.role
    });
    console.log('⏰ TIMESTAMP:', new Date().toISOString());

    // Fetch the leave request
    const requests = await base44.asServiceRole.entities.LeaveRequest.filter({ id: requestId });
    if (requests.length === 0) {
      console.error('❌ [APPROVE] Request not found:', requestId);
      return Response.json({ error: 'Request not found' }, { status: 404 });
    }

    const request = requests[0];

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

    // Validation: dates coherence
    const startDate = new Date(request.start_cp);
    const endDate = new Date(request.end_cp);
    const returnDate = new Date(request.first_work_day_after);

    if (endDate < startDate) {
      console.error('❌ [APPROVE] Invalid dates: end before start', { startDate, endDate });
      return Response.json({ 
        error: 'Dates invalides: la date de fin est avant la date de début' 
      }, { status: 400 });
    }

    // Determine all affected months
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

    console.log('🔷 [APPROVE] Affected months:', affectedMonths);

    // Process each month
    const createdPeriods = [];
    
    for (const monthKey of affectedMonths) {
      const [year, monthNum] = monthKey.split('-').map(Number);
      
      console.log(`🔷 [APPROVE] Processing month: ${monthKey}`);
      
      // Get or create planning month with service role
      let planningMonths = await base44.asServiceRole.entities.PlanningMonth.filter({ month_key: monthKey });
      let resetVersion = 0;
      
      if (planningMonths.length === 0) {
        console.log(`🔷 [APPROVE] Creating new PlanningMonth for ${monthKey}`);
        const newPlanningMonth = await base44.asServiceRole.entities.PlanningMonth.create({
          year: year,
          month: monthNum - 1,
          month_key: monthKey,
          reset_version: 0
        });
        resetVersion = 0;
        console.log(`✅ [APPROVE] PlanningMonth created: ${newPlanningMonth.id}`);
      } else {
        resetVersion = planningMonths[0].reset_version || 0;
        console.log(`🔷 [APPROVE] Using existing PlanningMonth for ${monthKey}, reset_version: ${resetVersion}`);
      }

      // Determine the period boundaries for this specific month
      const monthStart = new Date(year, monthNum - 1, 1);
      const monthEnd = new Date(year, monthNum, 0);
      
      const periodStart = startDate > monthStart ? startDate : monthStart;
      const periodEnd = endDate < monthEnd ? endDate : monthEnd;

      // Create CP period for this month with service role
      const periodData = {
        employee_id: request.employee_id,
        employee_name: request.employee_name,
        last_work_day: request.last_work_day,
        first_work_day_after: request.first_work_day_after,
        start_cp: periodStart.toISOString().split('T')[0],
        end_cp: periodEnd.toISOString().split('T')[0],
        cp_days_auto: request.cp_days_computed,
        cp_days_manual: request.manual_override_days || null,
        notes: request.notes || `Demande acceptée le ${new Date().toLocaleDateString('fr-FR')}`,
        month_key: monthKey,
        reset_version: resetVersion
      };

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🔐 [APPROVE] USING SERVICE ROLE: true`);
      console.log(`📦 [APPROVE] PaidLeavePeriod CREATE payload for ${monthKey}:`);
      console.log(JSON.stringify(periodData, null, 2));
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      try {
        console.log(`⏳ [APPROVE] Calling PaidLeavePeriod.create()...`);
        const period = await base44.asServiceRole.entities.PaidLeavePeriod.create(periodData);
        console.log(`✅ [APPROVE] PaidLeavePeriod.create() SUCCESS!`);
        
        console.log(`✅ [APPROVE] PaidLeavePeriod.create() returned:`, {
          id: period.id,
          employee_id: period.employee_id,
          employee_name: period.employee_name,
          start: period.start_cp,
          end: period.end_cp,
          monthKey: period.month_key,
          resetVersion: period.reset_version,
          cpDaysAuto: period.cp_days_auto
        });

        // IMMEDIATE VERIFICATION: Re-fetch to prove it exists in DB
        console.log(`🔷 [APPROVE] Verifying creation by re-fetching ID: ${period.id}`);
        const verification = await base44.asServiceRole.entities.PaidLeavePeriod.filter({ id: period.id });
        
        if (verification.length > 0) {
          console.log(`✅ [APPROVE] VERIFICATION SUCCESS - Record FOUND in DB:`, {
            id: verification[0].id,
            employee_id: verification[0].employee_id,
            start_cp: verification[0].start_cp,
            end_cp: verification[0].end_cp
          });
        } else {
          console.error(`❌ [APPROVE] VERIFICATION FAILED - Record NOT FOUND after create!`);
          throw new Error(`Création réussie mais record introuvable (ID: ${period.id})`);
        }

        createdPeriods.push(period);
      } catch (createError) {
        console.error(`❌ [APPROVE] Failed to create PaidLeavePeriod for ${monthKey}:`, {
          error: createError.message,
          stack: createError.stack,
          periodData
        });
        throw new Error(`Échec création CP sur ${monthKey}: ${createError.message}`);
      }
    }

    console.log(`✅ [APPROVE] All periods created successfully (${createdPeriods.length} periods)`);

    // Update request status ONLY if all periods created successfully
    console.log('🔷 [APPROVE] Updating request status to APPROVED');
    
    await base44.asServiceRole.entities.LeaveRequest.update(requestId, {
      status: 'APPROVED',
      decision_by_user_id: user.id,
      decision_by_user_email: user.email,
      decision_at: new Date().toISOString(),
      created_period_id: createdPeriods[0].id
    });

    console.log('✅ [APPROVE] Request updated to APPROVED');

    // Send notification to requester
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
        console.log('✅ [APPROVE] Email notification sent to requester');
      } catch (emailError) {
        console.error('⚠️ [APPROVE] Failed to send email notification:', emailError.message);
      }
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

    console.log('📤 [APPROVE] Returning response:', JSON.stringify(responsePayload, null, 2));

    return Response.json(responsePayload);

  } catch (error) {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ [APPROVE ERROR] Approval failed:', {
      error: error.message,
      stack: error.stack,
      name: error.name
    });
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    return Response.json({ 
      ok: false,
      success: false,
      error: error.message || 'Erreur lors de l\'approbation',
      stack: error.stack,
      details: error.toString()
    }, { status: 500 });
  }
});