import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Récupérer tous les employés et utilisateurs
    const employees = await base44.asServiceRole.entities.Employee.list();
    const users = await base44.asServiceRole.entities.User.list();

    let linked = 0;
    let unlinked = 0;

    // Pour chaque employé, chercher un utilisateur avec le même email
    for (const employee of employees) {
      if (!employee.email) continue;

      const matchingUser = users.find(u => 
        u.email?.toLowerCase() === employee.email.toLowerCase()
      );

      if (matchingUser && employee.user_id !== matchingUser.id) {
        // Lier l'employé à l'utilisateur
        await base44.asServiceRole.entities.Employee.update(employee.id, {
          user_id: matchingUser.id
        });
        linked++;
      } else if (!matchingUser && employee.user_id) {
        // Délier si l'utilisateur n'existe plus
        await base44.asServiceRole.entities.Employee.update(employee.id, {
          user_id: null
        });
        unlinked++;
      }
    }

    return Response.json({ 
      success: true, 
      linked,
      unlinked,
      message: `${linked} employés liés, ${unlinked} employés déliés`
    });
  } catch (error) {
    console.error('Error syncing employee-user links:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});