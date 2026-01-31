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

    return Response.json({ 
      success: true, 
      message: 'Configuration mise à jour'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});