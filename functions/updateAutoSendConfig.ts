import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const payload = await req.json();
    const {
      auto_send_enabled,
      frequency,
      send_time,
      day_of_week,
      day_of_month,
      include_non_envoyee,
      include_a_verifier,
      include_envoyee,
      group_in_one_email,
      recipients
    } = payload;

    // Mettre à jour les settings dans InvoiceSettings
    const settings = await base44.entities.InvoiceSettings.filter({ setting_key: 'auto_send_config' });
    
    if (settings[0]) {
      await base44.entities.InvoiceSettings.update(settings[0].id, {
        auto_send_enabled,
        frequency,
        send_time,
        day_of_week: frequency === 'weekly' ? day_of_week : null,
        day_of_month: frequency === 'monthly' ? day_of_month : null,
        include_non_envoyee,
        include_a_verifier,
        include_envoyee,
        group_in_one_email,
        recipients
      });
    } else {
      await base44.entities.InvoiceSettings.create({
        setting_key: 'auto_send_config',
        auto_send_enabled,
        frequency,
        send_time,
        day_of_week: frequency === 'weekly' ? day_of_week : null,
        day_of_month: frequency === 'monthly' ? day_of_month : null,
        include_non_envoyee,
        include_a_verifier,
        include_envoyee,
        group_in_one_email,
        recipients
      });
    }

    // Mettre à jour l'automation elle-même
    const automations = await base44.asServiceRole.entities.Automation.filter({ 
      function_name: 'executeAutoSendInvoices'
    });

    if (automations[0]) {
      const automation = automations[0];
      const updateData = {
        repeat_interval: frequency === 'daily' ? 1 : (frequency === 'weekly' ? 1 : 1),
        repeat_unit: frequency === 'daily' ? 'days' : (frequency === 'weekly' ? 'weeks' : 'months'),
        start_time: send_time,
        is_active: auto_send_enabled
      };

      if (frequency === 'weekly') {
        updateData.repeat_on_days = [day_of_week];
      } else if (frequency === 'monthly') {
        updateData.repeat_on_day_of_month = day_of_month;
      }

      await base44.asServiceRole.entities.Automation.update(automation.id, updateData);
    }

    return Response.json({ 
      success: true, 
      message: 'Configuration mise à jour'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});