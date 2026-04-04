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
  // Calculer le décalage UTC de Paris pour cette date
  const now = new Date();
  const testDate = new Date(now);
  testDate.setUTCHours(12, 0, 0, 0);
  
  const parisFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  
  const parts = parisFormatter.formatToParts(testDate);
  const parisHour = parseInt(parts.find(p => p.type === 'hour').value);
  const offsetHours = parisHour - 12;
  
  // Convertir l'heure actuelle en Paris
  const parisNowFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  const nowParts = parisNowFormatter.formatToParts(now);
  const parisYear = parseInt(nowParts.find(p => p.type === 'year').value);
  const parisMonth = parseInt(nowParts.find(p => p.type === 'month').value) - 1;
  const parisDay = parseInt(nowParts.find(p => p.type === 'day').value);
  const parisHours = parseInt(nowParts.find(p => p.type === 'hour').value);
  const parisMinutes = parseInt(nowParts.find(p => p.type === 'minute').value);
  
  // Créer une Date correspondant à l'heure Paris actuelle, puis la convertir en UTC
  const parisAsUTC = new Date(Date.UTC(parisYear, parisMonth, parisDay, parisHours - offsetHours, parisMinutes, 0));
  
  const dayMap = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0 };
  const targetDay = dayMap[sendDay];
  
  const [hours, minutes] = sendTime.split(':').map(Number);
  
  // Créer la date du prochain envoi en UTC (convertir depuis Paris)
  let nextRunInParis = new Date(Date.UTC(parisYear, parisMonth, parisDay, hours - offsetHours, minutes, 0));
  
  // Trouver le prochain jour de la semaine
  const currentParisDayOfWeek = parisAsUTC.getUTCDay();
  const dayDiff = (targetDay - currentParisDayOfWeek + 7) % 7;
  
  if (dayDiff === 0 && nextRunInParis <= parisAsUTC) {
    nextRunInParis.setUTCDate(nextRunInParis.getUTCDate() + 7);
  } else if (dayDiff > 0) {
    nextRunInParis.setUTCDate(nextRunInParis.getUTCDate() + dayDiff);
  }
  
  return nextRunInParis.toISOString();
}