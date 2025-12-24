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
    const { email, first_name, last_name, role_id, team, notes, invited_by, invited_by_name } = body;

    // Check if user already exists
    const existingUsers = await base44.asServiceRole.entities.User.filter({ email });
    if (existingUsers.length > 0) {
      return Response.json({ error: 'Un utilisateur avec cet email existe déjà' }, { status: 400 });
    }

    // Generate unique token
    const token = crypto.randomUUID();
    
    // Set expiration to 7 days
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Create invitation
    const invitation = await base44.entities.Invitation.create({
      email,
      first_name,
      last_name,
      role_id,
      team,
      notes,
      token,
      expires_at: expiresAt.toISOString(),
      status: 'pending',
      invited_by,
      invited_by_name
    });

    // Send invitation email
    const appUrl = Deno.env.get('APP_URL') || 'https://your-app-url.com';
    const inviteUrl = `${appUrl}/invite?token=${token}`;

    await base44.integrations.Core.SendEmail({
      to: email,
      subject: `Invitation à rejoindre UpGraal`,
      body: `
Bonjour ${first_name},

Vous avez été invité(e) par ${invited_by_name} à rejoindre l'application UpGraal.

Pour activer votre compte, cliquez sur le lien ci-dessous :
${inviteUrl}

Ce lien est valide pendant 7 jours.

À bientôt !
L'équipe UpGraal
      `
    });

    return Response.json({ 
      success: true, 
      invitation,
      invite_url: inviteUrl 
    });

  } catch (error) {
    console.error('Error inviting user:', error);
    return Response.json({ 
      error: error.message || 'Erreur lors de l\'invitation' 
    }, { status: 500 });
  }
});