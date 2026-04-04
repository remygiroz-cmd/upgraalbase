import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Set user as offline
    await base44.asServiceRole.entities.User.update(user.id, {
      is_online: false,
      last_active_at: new Date().toISOString()
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error setting user offline:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});