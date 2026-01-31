import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

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
    } = await req.json();

    // Récupérer ou créer les settings
    const settings = await base44.entities.InvoiceSettings.filter({ setting_key: 'auto_send_config' });
    
    const data = {
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
    };

    if (settings[0]) {
      await base44.entities.InvoiceSettings.update(settings[0].id, data);
    } else {
      await base44.entities.InvoiceSettings.create({
        setting_key: 'auto_send_config',
        ...data
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});