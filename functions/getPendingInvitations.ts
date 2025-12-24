import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verify admin
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Get pending invitations with service role
    const invitations = await base44.asServiceRole.entities.Invitation.filter({ 
      status: 'pending' 
    });

    return Response.json({ 
      success: true,
      invitations
    });

  } catch (error) {
    console.error('Error fetching invitations:', error);
    return Response.json({ 
      error: error.message || 'Erreur lors de la récupération' 
    }, { status: 500 });
  }
});