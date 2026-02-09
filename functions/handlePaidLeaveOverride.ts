import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Gestion automatique de la conversion réversible shift ↔ non-shift CP
 * 
 * Actions :
 * - create/update : convertit les shifts qui overlap en non-shift CP
 * - delete : restaure les shifts depuis leur snapshot original
 */

Deno.serve(async (req) => {
  const startTime = new Date().toISOString();
  console.log('\n\n🚀🚀🚀 START handlePaidLeaveOverride 🚀🚀🚀');
  console.log('Timestamp:', startTime);
  
  try {
    const base44 = createClientFromRequest(req).asServiceRole;
    const { event, data, old_data } = await req.json();

    console.log('═══════════════════════════════════════════════════');
    console.log('🔄 PAID LEAVE OVERRIDE AUTOMATION');
    console.log('═══════════════════════════════════════════════════');
    console.log('Event Type:', event);
    console.log('CP Period ID:', data?.id || old_data?.id);
    console.log('Employee ID:', data?.employee_id || old_data?.employee_id);
    console.log('Now ISO:', startTime);
    console.log('═══════════════════════════════════════════════════\n');

    if (event === 'delete') {
      // RESTAURATION : rollback tous les shifts overridden par cette période CP
      const leavePeriodId = old_data.id;
      
      console.log('🔙 ROLLBACK - Restauration des shifts...');
      
      // Trouver tous les shifts overridden par cette période
      const overriddenShifts = await base44.entities.Shift.filter({
        'override.byLeavePeriodId': leavePeriodId
      });

      console.log(`   Trouvé ${overriddenShifts.length} shift(s) à restaurer`);

      let restored = 0;
      let errors = 0;

      for (const shift of overriddenShifts) {
        try {
          const original = shift.override?.originalSnapshot;
          
          if (!original) {
            console.warn(`   ⚠️ Shift ${shift.id} n'a pas de snapshot, skip`);
            continue;
          }

          // Restaurer TOUS les champs depuis le snapshot
          const restoredData = {
            ...original,
            override: undefined // Nettoyer le champ override
          };

          await base44.entities.Shift.update(shift.id, restoredData);
          
          console.log(`   ✅ Shift ${shift.id} restauré (${original.date} ${original.start_time}-${original.end_time})`);
          restored++;
        } catch (error) {
          console.error(`   ❌ Erreur restauration shift ${shift.id}:`, error.message);
          errors++;
        }
      }

      console.log(`\n📊 Résultat : ${restored} restauré(s), ${errors} erreur(s)`);

      return Response.json({
        success: true,
        action: 'rollback',
        restored,
        errors
      });
    }

    if (event === 'create' || event === 'update') {
      const leavePeriod = data;
      
      // Vérifier que c'est bien un CP (pas RTT/Maladie/etc)
      if (!leavePeriod.type || leavePeriod.type !== 'CP') {
        console.log('⏭️ Type de congé non-CP, skip');
        return Response.json({ success: true, skipped: true, reason: 'Not a CP leave' });
      }

      // Si update, d'abord rollback les anciens overrides
      if (event === 'update' && old_data) {
        console.log('🔄 UPDATE détecté - Rollback des anciens overrides...');
        
        const oldOverriddenShifts = await base44.entities.Shift.filter({
          'override.byLeavePeriodId': leavePeriod.id
        });

        for (const shift of oldOverriddenShifts) {
          if (shift.override?.originalSnapshot) {
            await base44.entities.Shift.update(shift.id, {
              ...shift.override.originalSnapshot,
              override: undefined
            });
            console.log(`   ↩️ Rollback shift ${shift.id}`);
          }
        }
      }

      // CONVERSION : calculer les bornes CP effectives
      console.log('\n📋 CHAMPS CP BRUTS:');
      console.log('   lastWorkedDayRaw:', leavePeriod.last_work_day);
      console.log('   returnDateRaw:', leavePeriod.first_work_day_after);
      console.log('   start_cp (legacy):', leavePeriod.start_cp);
      console.log('   end_cp (legacy):', leavePeriod.end_cp);
      
      // cpStart = startOfDay(lastWorkedDate + 1 day)
      // cpEnd = startOfDay(returnDate) EXCLUSIVE
      
      const lastWorkedDate = new Date(leavePeriod.last_work_day + 'T00:00:00.000Z');
      const returnDate = new Date(leavePeriod.first_work_day_after + 'T00:00:00.000Z');
      
      const cpStart = new Date(lastWorkedDate);
      cpStart.setUTCDate(cpStart.getUTCDate() + 1); // lendemain du dernier jour travaillé
      
      const cpEnd = returnDate; // jour de reprise, EXCLUSIVE

      console.log('\n🔍 Recherche des shifts qui overlap...');
      console.log(`   Employee ID: ${leavePeriod.employee_id}`);
      console.log(`   Dernier jour travaillé: ${leavePeriod.last_work_day}`);
      console.log(`   Jour de reprise: ${leavePeriod.first_work_day_after}`);
      console.log(`   computedCpStartISO: ${cpStart.toISOString()}`);
      console.log(`   computedCpEndISO: ${cpEnd.toISOString()} (EXCLUSIVE)`);
      console.log(`   timezoneUsed: UTC`);

      // Récupérer tous les shifts de l'employé (ÉLARGI: -7j à +7j pour debug)
      const queryRangeStart = new Date(cpStart);
      queryRangeStart.setUTCDate(queryRangeStart.getUTCDate() - 7);
      
      const queryRangeEnd = new Date(cpEnd);
      queryRangeEnd.setUTCDate(queryRangeEnd.getUTCDate() + 7);

      console.log('\n📊 REQUÊTE SHIFTS:');
      console.log(`   shiftQueryRangeStartISO: ${queryRangeStart.toISOString()}`);
      console.log(`   shiftQueryRangeEndISO: ${queryRangeEnd.toISOString()}`);
      console.log(`   employeeId: ${leavePeriod.employee_id}`);

      const allShifts = await base44.entities.Shift.filter({
        employee_id: leavePeriod.employee_id
      });

      console.log(`   countShiftsFetched: ${allShifts.length}`);
      
      console.log('\n📋 LISTE DES SHIFTS FETCHÉS:');
      for (const s of allShifts) {
        const sStart = new Date(`${s.date}T${s.start_time}:00.000Z`);
        const sEnd = new Date(`${s.date}T${s.end_time}:00.000Z`);
        console.log(`   - Shift ${s.id}: ${s.date} ${s.start_time}-${s.end_time} (${sStart.toISOString()} → ${sEnd.toISOString()}) kind=${s.kind || 'shift'}`);
      }

      // Filtrer ceux qui overlap avec test datetime précis
      console.log('\n🔍 TEST OVERLAP POUR CHAQUE SHIFT:');
      const overlappingShifts = [];
      
      for (const shift of allShifts) {
        console.log(`\n   Shift ${shift.id} (${shift.date} ${shift.start_time}-${shift.end_time}):`);
        
        // Exclure ceux déjà overridden par cette période (idempotence)
        if (shift.override?.byLeavePeriodId === leavePeriod.id) {
          console.log(`      ⏭️ SKIP: déjà overridden par cette période`);
          continue;
        }
        
        // Exclure les non-shifts déjà existants
        if (shift.kind === 'nonShift') {
          console.log(`      ⏭️ SKIP: déjà non-shift (kind=${shift.kind})`);
          continue;
        }

        // Construire les datetime du shift en UTC
        const shiftStart = new Date(`${shift.date}T${shift.start_time}:00.000Z`);
        const shiftEnd = new Date(`${shift.date}T${shift.end_time}:00.000Z`);

        // Test overlap: shift.start < cpEnd && shift.end > cpStart
        const overlaps = shiftStart < cpEnd && shiftEnd > cpStart;

        console.log(`      shiftStart: ${shiftStart.toISOString()}`);
        console.log(`      shiftEnd: ${shiftEnd.toISOString()}`);
        console.log(`      cpStart: ${cpStart.toISOString()}`);
        console.log(`      cpEnd: ${cpEnd.toISOString()}`);
        console.log(`      Test: ${shiftStart.toISOString()} < ${cpEnd.toISOString()} && ${shiftEnd.toISOString()} > ${cpStart.toISOString()}`);
        console.log(`      overlap=${overlaps ? '✅ TRUE' : '❌ FALSE'}`);

        if (overlaps) {
          overlappingShifts.push(shift);
        }
      }

      console.log(`\n📊 RÉSULTAT FILTRAGE: ${overlappingShifts.length} shift(s) à convertir en CP`);

      let converted = 0;
      let errors = 0;

      for (const shift of overlappingShifts) {
        try {
          // Créer un snapshot COMPLET du shift original
          const originalSnapshot = {
            employee_id: shift.employee_id,
            employee_name: shift.employee_name,
            date: shift.date,
            start_time: shift.start_time,
            end_time: shift.end_time,
            break_minutes: shift.break_minutes,
            base_hours_override: shift.base_hours_override,
            position: shift.position,
            team: shift.team,
            status: shift.status,
            notes: shift.notes,
            holiday_id: shift.holiday_id,
            holiday_flag: shift.holiday_flag,
            holiday_pay_multiplier: shift.holiday_pay_multiplier,
            holiday_comp_minutes: shift.holiday_comp_minutes,
            manager_override: shift.manager_override,
            explicit_employee_consent: shift.explicit_employee_consent,
            consent_date: shift.consent_date,
            kind: shift.kind || 'shift'
          };

          // Convertir en non-shift CP
          console.log(`\n   🔄 UPDATING SHIFT ${shift.id} → CP`);
          console.log(`      Payload: kind=nonShift, nonShiftType=CP, source=leaveOverride`);
          
          await base44.entities.Shift.update(shift.id, {
            kind: 'nonShift',
            nonShiftType: 'CP',
            source: 'leaveOverride',
            override: {
              isOverridden: true,
              byLeavePeriodId: leavePeriod.id,
              overriddenAt: new Date().toISOString(),
              originalSnapshot
            }
          });

          // RE-FETCH pour confirmer l'écriture
          const updatedShift = await base44.entities.Shift.filter({ id: shift.id });
          if (updatedShift[0]) {
            console.log(`   ✅ Shift ${shift.id} converti en CP - CONFIRMÉ`);
            console.log(`      kind=${updatedShift[0].kind}`);
            console.log(`      nonShiftType=${updatedShift[0].nonShiftType}`);
            console.log(`      override.byLeavePeriodId=${updatedShift[0].override?.byLeavePeriodId}`);
          } else {
            console.log(`   ⚠️ Re-fetch échoué pour shift ${shift.id}`);
          }
          
          converted++;
        } catch (error) {
          console.error(`   ❌ Erreur conversion shift ${shift.id}:`, error.message);
          errors++;
        }
      }

      console.log(`\n📊 Résultat : ${converted} converti(s), ${errors} erreur(s)`);

      return Response.json({
        success: true,
        action: event,
        converted,
        errors,
        leave_period_id: leavePeriod.id
      });
    }

    return Response.json({ success: true, skipped: true });

  } catch (error) {
    console.error('❌ ERREUR AUTOMATION:', error);
    return Response.json({ 
      success: false, 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});