import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Récupérer les configurations actives
    const configs = await base44.asServiceRole.entities.InvoiceAutomationConfig.filter({ enabled: true });

    if (configs.length === 0) {
      return Response.json({
        has_automation: false,
        configs: []
      });
    }

    // Calculer le prochain envoi pour chaque config
    const configsWithNextRun = configs.map(config => {
      const nextRun = calculateNextRun(config.send_day, config.send_time);
      
      return {
        id: config.id,
        name: config.name,
        recipient_email: config.recipient_email,
        send_day: config.send_day,
        send_time: config.send_time,
        next_run_at: nextRun,
        last_run_at: config.last_run_at,
        last_run_status: config.last_run_status,
        status_filter: config.status_filter
      };
    });

    return Response.json({
      has_automation: true,
      configs: configsWithNextRun
    });

  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function calculateNextRun(sendDay, sendTime) {
  const now = new Date();
  const dayMap = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0 };
  const targetDay = dayMap[sendDay];
  
  const [hours, minutes] = sendTime.split(':').map(Number);
  
  let nextRun = new Date(now);
  nextRun.setHours(hours, minutes, 0, 0);
  
  // Trouver le prochain jour de la semaine
  const dayDiff = (targetDay - nextRun.getDay() + 7) % 7;
  if (dayDiff === 0 && nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 7);
  } else if (dayDiff > 0) {
    nextRun.setDate(nextRun.getDate() + dayDiff);
  }
  
  return nextRun.toISOString();
}