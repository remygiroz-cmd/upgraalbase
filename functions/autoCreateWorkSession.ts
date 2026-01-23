import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Get automation settings
    const settings = await base44.asServiceRole.entities.AppSettings.filter({ 
      setting_key: 'auto_complete_session' 
    });

    if (!settings[0] || !settings[0].auto_enabled) {
      return Response.json({ 
        message: 'Automation is disabled',
        enabled: false
      });
    }

    const completionTimes = settings[0].completion_times || [];
    if (completionTimes.length === 0) {
      return Response.json({ 
        message: 'No completion times configured'
      });
    }

    // Get current time in HH:mm format (Paris timezone)
    const now = new Date();
    const parisTime = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(now);

    // Check if we should complete now (within 15 minutes window)
    const shouldComplete = completionTimes.some(targetTime => {
      const [targetHour, targetMin] = targetTime.split(':').map(Number);
      const [currentHour, currentMin] = parisTime.split(':').map(Number);
      
      const targetMinutes = targetHour * 60 + targetMin;
      const currentMinutes = currentHour * 60 + currentMin;
      
      // Within 15 minutes window after the target time
      return currentMinutes >= targetMinutes && currentMinutes < targetMinutes + 15;
    });

    if (!shouldComplete) {
      return Response.json({ 
        message: 'Not within completion time window',
        currentTime: parisTime,
        completionTimes
      });
    }

    // Get today's date
    const today = new Date().toISOString().split('T')[0];

    // Find active session for today
    const activeSessions = await base44.asServiceRole.entities.WorkSession.filter({ 
      date: today,
      status: 'active'
    });

    if (activeSessions.length === 0) {
      return Response.json({ 
        message: 'No active session to complete for today'
      });
    }

    const activeSession = activeSessions[0];

    // Complete the session
    await base44.asServiceRole.entities.WorkSession.update(activeSession.id, {
      status: 'completed',
      completed_at: new Date().toISOString()
    });

    return Response.json({ 
      message: 'Work session completed successfully',
      session: activeSession,
      completed_at: new Date().toISOString(),
      completedAtTime: parisTime
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});