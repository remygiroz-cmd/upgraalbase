import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { requestId } = await req.json();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔷 [APPROVE START] Request received', {
      requestId,
      approvedBy: user.email,
      timestamp: new Date().toISOString()
    });

    // Fetch the leave request
    const requests = await base44.asServiceRole.entities.LeaveRequest.filter({ id: requestId });
    if (requests.length === 0) {
      console.error('❌ [APPROVE] Request not found:', requestId);
      return Response.json({ error: 'Request not found' }, { status: 404 });
    }

    const request = requests[0];

    console.log('🔷 [APPROVE] Request details:', {
      requestId: request.id,
      employeeId: request.employee_id,
      employeeName: request.employee_name,
      lastWorkDay: request.last_work_day,
      firstWorkDayAfter: request.first_work_day_after,
      startCP: request.start_cp,
      endCP: request.end_cp,
      cpDaysComputed: request.cp_days_computed,
      manualOverride: request.manual_override_days
    });

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

      console.log(`🔷 [APPROVE] Creating PaidLeavePeriod with data:`, periodData);

      try {
        const period = await base44.asServiceRole.entities.PaidLeavePeriod.create(periodData);
        console.log(`✅ [APPROVE] PaidLeavePeriod created for ${monthKey}:`, {
          id: period.id,
          employee_id: period.employee_id,
          employee_name: period.employee_name,
          start: period.start_cp,
          end: period.end_cp,
          monthKey: period.month_key,
          resetVersion: period.reset_version,
          cpDaysAuto: period.cp_days_auto
        });
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
    console.log('✅ [APPROVE END] Success', {
      requestId,
      periodsCreated: createdPeriods.length,
      periodIds: createdPeriods.map(p => p.id),
      affectedMonths
    });
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return Response.json({
      success: true,
      periods: createdPeriods,
      affectedMonths
    });

  } catch (error) {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ [APPROVE ERROR] Approval failed:', {
      error: error.message,
      stack: error.stack
    });
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    return Response.json({ 
      error: error.message || 'Erreur lors de l\'approbation',
      details: error.stack
    }, { status: 500 });
  }
});