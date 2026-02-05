import { createClient } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClient({
      appId: Deno.env.get('BASE44_APP_ID'),
      serviceRoleKey: true
    });

    const { userEmail } = await req.json();

    if (!userEmail) {
      return Response.json({ error: 'Email requis' }, { status: 400 });
    }

    // Récupérer tous les utilisateurs
    const users = await base44.entities.User.list();
    const targetUser = users.find(u => u.email === userEmail);

    if (!targetUser) {
      return Response.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    }

    // Mettre à jour le rôle en admin
    await base44.entities.User.update(targetUser.id, {
      role: 'admin'
    });

    console.log(`Utilisateur ${userEmail} promu admin`);

    return Response.json({
      success: true,
      message: `${userEmail} est maintenant administrateur`,
      user: {
        id: targetUser.id,
        email: targetUser.email,
        role: 'admin'
      }
    });

  } catch (error) {
    console.error('Erreur:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});