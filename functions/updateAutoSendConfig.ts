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

    // Créer/Mettre à jour l'automation
    const API_URL = Deno.env.get('BASE44_APP_URL') || 'https://api.base44.com';
    const APP_ID = Deno.env.get('BASE44_APP_ID');
    
    // Récupérer les automations existantes pour cette fonction
    const automations = await base44.asServiceRole.entities.Automation?.filter?.({ 
      function_name: 'executeAutoSendInvoices'
    }).catch(() => []);

    const automationData = {
      automation_type: 'scheduled',
      name: 'Auto-envoi des factures',
      function_name: 'executeAutoSendInvoices',
      schedule_type: 'simple',
      repeat_interval: frequency === 'daily' ? 1 : (frequency === 'weekly' ? 1 : 1),
      repeat_unit: frequency === 'daily' ? 'days' : (frequency === 'weekly' ? 'weeks' : 'months'),
      start_time: send_time,
      is_active: auto_send_enabled
    };

    if (frequency === 'weekly') {
      automationData.repeat_on_days = [parseInt(day_of_week)];
    } else if (frequency === 'monthly') {
      automationData.repeat_on_day_of_month = day_of_month;
    }

    try {
      if (automations && automations[0]) {
        // Mettre à jour via API REST
        const updateRes = await fetch(
          `${API_URL}/v1/apps/${APP_ID}/automations/${automations[0].id}`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${user.id}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(automationData)
          }
        );
        
        if (!updateRes.ok) {
          console.error('Erreur PATCH automation:', await updateRes.text());
        }
      } else {
        // Créer via API REST
        const createRes = await fetch(
          `${API_URL}/v1/apps/${APP_ID}/automations`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${user.id}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(automationData)
          }
        );
        
        if (!createRes.ok) {
          console.error('Erreur POST automation:', await createRes.text());
        }
      }
    } catch (err) {
      console.error('Erreur sync automation:', err);
    }

    return Response.json({ 
      success: true, 
      message: 'Configuration mise à jour'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});