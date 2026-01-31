import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const {
      automation_id,
      frequency,
      send_time,
      day_of_week,
      day_of_month
    } = await req.json();

    if (!automation_id || !frequency || !send_time) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Synchroniser l'automation
    await base44.asServiceRole.manage_automation({
      automation_id,
      action: 'update',
      automation_name: 'Envoi automatique des factures',
      is_active: true,
      start_time: send_time,
      repeat_unit: frequency === 'daily' ? 'days' : (frequency === 'weekly' ? 'weeks' : 'months'),
      repeat_interval: 1,
      ...(frequency === 'weekly' && { repeat_on_days: [parseInt(day_of_week)] }),
      ...(frequency === 'monthly' && { repeat_on_day_of_month: day_of_month })
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error syncInvoiceAutomation:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});