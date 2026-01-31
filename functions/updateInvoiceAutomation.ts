import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { manage_automation } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await req.json();
    const { frequency, send_time, day_of_week, day_of_month, auto_send_enabled } = payload;

    // Récupérer l'automation existante
    const automations = await base44.asServiceRole.entities.Automation.filter({ 
      function_name: 'executeAutoSendInvoices'
    });

    if (!automations[0]) {
      return Response.json({ error: 'Automation non trouvée' }, { status: 404 });
    }

    const automation = automations[0];

    // Préparer les données de mise à jour
    const updateData = {
      repeat_interval: frequency === 'daily' ? 1 : (frequency === 'weekly' ? 1 : 1),
      repeat_unit: frequency === 'daily' ? 'days' : (frequency === 'weekly' ? 'weeks' : 'months'),
      start_time: send_time,
      is_active: auto_send_enabled
    };

    if (frequency === 'weekly') {
      updateData.repeat_on_days = [parseInt(day_of_week)];
    } else if (frequency === 'monthly') {
      updateData.repeat_on_day_of_month = day_of_month;
    }

    // Mettre à jour l'automation
    await base44.asServiceRole.entities.Automation.update(automation.id, updateData);

    return Response.json({ 
      success: true, 
      message: 'Automation mise à jour'
    });
  } catch (error) {
    console.error('Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});