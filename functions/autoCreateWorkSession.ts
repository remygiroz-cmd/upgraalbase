import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Only admin can call this function
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
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
      completed_at: new Date().toISOString()
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});