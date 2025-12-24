import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { token, password } = body;

    if (!token || !password) {
      return Response.json({ error: 'Token et mot de passe requis' }, { status: 400 });
    }

    // Find invitation (no auth required for this endpoint)
    const invitations = await base44.entities.Invitation.filter({ 
      token, 
      status: 'pending' 
    });

    if (invitations.length === 0) {
      return Response.json({ error: 'Invitation invalide ou déjà utilisée' }, { status: 404 });
    }

    const invitation = invitations[0];

    // Check expiration
    const now = new Date();
    const expiresAt = new Date(invitation.expires_at);
    if (now > expiresAt) {
      await base44.entities.Invitation.update(invitation.id, { 
        status: 'expired' 
      });
      return Response.json({ error: 'Invitation expirée' }, { status: 400 });
    }

    // Check if user already exists
    const existingUsers = await base44.entities.User.filter({ 
      email: invitation.email 
    });

    let userId;
    if (existingUsers.length > 0) {
      // Update existing user
      userId = existingUsers[0].id;
      await base44.entities.User.update(userId, {
        full_name: `${invitation.first_name} ${invitation.last_name}`,
        role_id: invitation.role_id,
        team: invitation.team,
        status: 'active'
      });
    } else {
      // This would typically create the user via your auth system
      // Since Base44 handles user creation through invites, 
      // we assume the user record is created automatically
      return Response.json({ 
        error: 'La création de compte doit se faire via le système d\'authentification Base44' 
      }, { status: 400 });
    }

    // Mark invitation as accepted
    await base44.entities.Invitation.update(invitation.id, {
      status: 'accepted',
      accepted_at: new Date().toISOString()
    });

    return Response.json({ 
      success: true,
      message: 'Compte activé avec succès'
    });

  } catch (error) {
    console.error('Error accepting invitation:', error);
    return Response.json({ 
      error: error.message || 'Erreur lors de l\'activation' 
    }, { status: 500 });
  }
});