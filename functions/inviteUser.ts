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

    // Generate invitation URL
    const appUrl = `https://${req.headers.get('host')}`;
    const inviteUrl = `${appUrl}/invite?token=${token}`;

    // Try to send email via EmailJS
    try {
      await base44.functions.invoke('sendInvitationEmail', {
        to_email: email,
        to_name: `${first_name} ${last_name}`,
        invite_url: inviteUrl,
        invited_by_name: invited_by_name
      });
      
      return Response.json({ 
        success: true, 
        invitation,
        invite_url: inviteUrl,
        email_sent: true,
        message: 'Invitation créée et email envoyé avec succès'
      });
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Return success but indicate email wasn't sent
      return Response.json({ 
        success: true, 
        invitation,
        invite_url: inviteUrl,
        email_sent: false,
        message: 'Invitation créée mais email non envoyé. Copiez le lien pour l\'envoyer manuellement.'
      });
    }

  } catch (error) {
    console.error('Error inviting user:', error);
    return Response.json({ 
      error: error.message || 'Erreur lors de l\'invitation' 
    }, { status: 500 });
  }
});