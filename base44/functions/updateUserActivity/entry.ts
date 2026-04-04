import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Update user's last activity and online status
    await base44.asServiceRole.entities.User.update(user.id, {
      last_active_at: new Date().toISOString(),
      is_online: true
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error updating user activity:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});