import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verify admin
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json();
    const { invitationId } = body;

    // Get invitation
    const invitations = await base44.asServiceRole.entities.Invitation.filter({ 
      id: invitationId 
    });

    if (invitations.length === 0) {
      return Response.json({ error: 'Invitation non trouvée' }, { status: 404 });
    }

    const invitation = invitations[0];

    // Generate new token and expiration
    const newToken = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Update invitation
    await base44.asServiceRole.entities.Invitation.update(invitation.id, {
      token: newToken,
      expires_at: expiresAt.toISOString(),
      status: 'pending'
    });

    // Send email
    const appUrl = Deno.env.get('APP_URL') || 'https://your-app-url.com';
    const inviteUrl = `${appUrl}/invite?token=${newToken}`;

    await base44.integrations.Core.SendEmail({
      to: invitation.email,
      subject: `Nouvelle invitation à rejoindre UpGraal`,
      body: `
Bonjour ${invitation.first_name},

Voici une nouvelle invitation à rejoindre l'application UpGraal.

Pour activer votre compte, cliquez sur le lien ci-dessous :
${inviteUrl}

Ce lien est valide pendant 7 jours.

À bientôt !
L'équipe UpGraal
      `
    });

    return Response.json({ 
      success: true,
      message: 'Invitation renvoyée avec succès'
    });

  } catch (error) {
    console.error('Error resending invitation:', error);
    return Response.json({ 
      error: error.message || 'Erreur lors du renvoi de l\'invitation' 
    }, { status: 500 });
  }
});