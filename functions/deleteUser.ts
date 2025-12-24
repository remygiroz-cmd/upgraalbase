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
    const { userId } = body;

    if (!userId) {
      return Response.json({ error: 'userId is required' }, { status: 400 });
    }

    // Cannot delete yourself
    if (userId === user.id) {
      return Response.json({ error: 'Vous ne pouvez pas supprimer votre propre compte' }, { status: 400 });
    }

    // Delete user using service role
    await base44.asServiceRole.entities.User.delete(userId);

    return Response.json({ 
      success: true,
      message: 'Utilisateur supprimé avec succès'
    });

  } catch (error) {
    console.error('Error deleting user:', error);
    return Response.json({ 
      error: error.message || 'Erreur lors de la suppression de l\'utilisateur' 
    }, { status: 500 });
  }
});