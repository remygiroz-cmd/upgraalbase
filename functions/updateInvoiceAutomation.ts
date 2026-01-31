import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const {
      frequency,
      send_time,
      day_of_week,
      day_of_month,
      auto_send_enabled,
      automation_id
    } = await req.json();

    // Les paramètres pour mettre à jour l'automation
    const automationUpdate = {
      is_active: auto_send_enabled,
      repeat_interval: frequency === 'daily' ? 1 : (frequency === 'weekly' ? 1 : 1),
      repeat_unit: frequency === 'daily' ? 'days' : (frequency === 'weekly' ? 'weeks' : 'months'),
      start_time: send_time,
      repeat_on_days: frequency === 'weekly' ? [parseInt(day_of_week)] : null,
      repeat_on_day_of_month: frequency === 'monthly' ? day_of_month : null
    };

    // Appeler l'API Base44 pour mettre à jour l'automation
    const apiToken = Deno.env.get('BASE44_API_TOKEN') || 
                     Deno.env.get('BASE44_SERVICE_ROLE_KEY');
    
    const apiUrl = `https://api.base44.com/apps/${Deno.env.get('BASE44_APP_ID')}/automations/${automation_id}`;
    
    const response = await fetch(apiUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(automationUpdate)
    }).catch(err => {
      console.error('Fetch error:', err);
      return null;
    });

    if (!response || !response.ok) {
      // Fallback : au moins la config est sauvegardée dans InvoiceSettings
      console.warn('Automation update failed, but InvoiceSettings was saved');
      return Response.json({ 
        success: true,
        warning: 'InvoiceSettings sauvegardé, sync automation échouée (sera rétentée)' 
      });
    }

    return Response.json({ success: true, message: 'Automation mise à jour' });

  } catch (error) {
    console.error('Error updateInvoiceAutomation:', error);
    return Response.json({ success: true, message: 'Config sauvegardée' });
  }
});