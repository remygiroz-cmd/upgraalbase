import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { token } = body;

    if (!token) {
      return Response.json({ error: 'Token requis' }, { status: 400 });
    }

    // Find invitation using service role (public access)
    const invitations = await base44.asServiceRole.entities.Invitation.filter({ 
      token, 
      status: 'pending' 
    });

    if (invitations.length === 0) {
      return Response.json({ invitation: null });
    }

    return Response.json({ 
      invitation: invitations[0]
    });

  } catch (error) {
    console.error('Error fetching invitation:', error);
    return Response.json({ 
      error: error.message || 'Erreur lors de la récupération de l\'invitation' 
    }, { status: 500 });
  }
});