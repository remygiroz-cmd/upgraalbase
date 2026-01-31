import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const {
      setting_id,
      automation_id,
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

    // 1. Mettre à jour InvoiceSettings
    const settingsData = {
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

    if (setting_id) {
      await base44.asServiceRole.entities.InvoiceSettings.update(setting_id, settingsData);
    } else {
      await base44.asServiceRole.entities.InvoiceSettings.create({
        setting_key: 'auto_send_config',
        ...settingsData
      });
    }

    // 2. Gérer l'automation
    if (automation_id) {
      if (auto_send_enabled) {
        // Convertir send_time (HH:mm) en minutes
        const [hours, minutes] = send_time.split(':').map(Number);
        const totalMinutes = hours * 60 + minutes;
        
        // Déterminer repeat_on_days pour weekly
        let repeat_on_days = null;
        if (frequency === 'weekly' && day_of_week !== null) {
          repeat_on_days = [parseInt(day_of_week)];
        }

        // Mettre à jour l'automation
        await base44.asServiceRole.manage_automation({
          automation_id,
          action: 'update',
          automation_name: 'Envoi automatique des factures',
          is_active: true,
          start_time: send_time,
          repeat_unit: frequency === 'daily' ? 'days' : (frequency === 'weekly' ? 'weeks' : 'months'),
          repeat_interval: 1,
          repeat_on_days,
          repeat_on_day_of_month: frequency === 'monthly' ? day_of_month : null
        });
      } else {
        // Désactiver l'automation si envoi est désactivé
        await base44.asServiceRole.manage_automation({
          automation_id,
          action: 'toggle',
          automation_name: 'Envoi automatique des factures'
        });
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error updateAutoSendInvoicesAutomation:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});