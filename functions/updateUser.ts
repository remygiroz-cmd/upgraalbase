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
    const { userId, data } = body;

    if (!userId || !data) {
      return Response.json({ error: 'userId and data are required' }, { status: 400 });
    }

    // Récupérer l'email de l'utilisateur
    const userToUpdate = await base44.asServiceRole.entities.User.filter({ id: userId });
    const userEmail = userToUpdate[0]?.email;

    // Update user with service role
    const updatedUser = await base44.asServiceRole.entities.User.update(userId, data);

    // Si on désactive l'utilisateur, supprimer toutes ses surcharges de permissions
    if (data.status === 'disabled' && userEmail) {
      const overrides = await base44.asServiceRole.entities.UserPermissionOverride.filter({ user_email: userEmail });
      for (const override of overrides) {
        await base44.asServiceRole.entities.UserPermissionOverride.delete(override.id);
      }
    }

    // Si on réactive l'utilisateur, supprimer aussi les surcharges pour repartir proprement
    if (data.status === 'active' && userEmail) {
      const overrides = await base44.asServiceRole.entities.UserPermissionOverride.filter({ user_email: userEmail });
      for (const override of overrides) {
        await base44.asServiceRole.entities.UserPermissionOverride.delete(override.id);
      }
    }

    return Response.json({ 
      success: true,
      user: updatedUser
    });

  } catch (error) {
    console.error('Error updating user:', error);
    return Response.json({ 
      error: error.message || 'Erreur lors de la mise à jour' 
    }, { status: 500 });
  }
});