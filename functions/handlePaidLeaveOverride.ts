import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Gestion automatique de la conversion réversible shift ↔ non-shift CP
 * 
 * Actions :
 * - create/update : convertit les shifts qui overlap en non-shift CP
 * - delete : restaure les shifts depuis leur snapshot original
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req).asServiceRole;
    const { event, data, old_data } = await req.json();

    console.log('═══════════════════════════════════════════════════');
    console.log('🔄 PAID LEAVE OVERRIDE AUTOMATION');
    console.log('═══════════════════════════════════════════════════');
    console.log('Event:', event);
    console.log('Leave Period ID:', data?.id || old_data?.id);
    console.log('Employee ID:', data?.employee_id || old_data?.employee_id);
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

      // CONVERSION : trouver les shifts qui overlap avec la période CP
      console.log('🔍 Recherche des shifts qui overlap...');
      console.log(`   Période CP : ${leavePeriod.start_date} → ${leavePeriod.end_date}`);

      // Récupérer tous les shifts de l'employé dans la plage
      const allShifts = await base44.entities.Shift.filter({
        employee_id: leavePeriod.employee_id
      });

      // Filtrer ceux qui overlap (shift.date >= start ET shift.date <= end)
      const overlappingShifts = allShifts.filter(shift => {
        // Exclure ceux déjà overridden par cette période (idempotence)
        if (shift.override?.byLeavePeriodId === leavePeriod.id) {
          return false;
        }
        
        // Exclure les non-shifts déjà existants
        if (shift.kind === 'nonShift') {
          return false;
        }

        const shiftDate = shift.date;
        return shiftDate >= leavePeriod.start_date && shiftDate <= leavePeriod.end_date;
      });

      console.log(`   Trouvé ${overlappingShifts.length} shift(s) à convertir en CP`);

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

          console.log(`   ✅ Shift ${shift.id} converti en CP (${shift.date} ${shift.start_time}-${shift.end_time})`);
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