import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const results = {
      entreprise: null,
      equipes: [],
      direction: null,
      errors: []
    };

    // Get all employees with linked accounts
    const allEmployees = await base44.asServiceRole.entities.Employee.list();
    const employeesWithAccounts = allEmployees.filter(emp => emp.user_id && emp.is_active !== false);

    // Get all existing conversations
    const existingConversations = await base44.asServiceRole.entities.Conversation.list();

    // 1) CONVERSATION ENTREPRISE
    const entrepriseConv = existingConversations.find(c => 
      c.title === "📢 Annonces entreprise" && c.type === "entreprise"
    );

    if (!entrepriseConv) {
      const adminEmployee = employeesWithAccounts.find(emp => emp.permission_level === 'admin');
      if (!adminEmployee) {
        results.errors.push("Aucun employé admin trouvé pour créer la conversation entreprise");
      } else {
        const now = new Date().toISOString();
        const newConv = await base44.asServiceRole.entities.Conversation.create({
          title: "📢 Annonces entreprise",
          type: "entreprise",
          participant_employee_ids: employeesWithAccounts.map(emp => emp.id),
          created_by_employee_id: adminEmployee.id,
          last_message_text: "Bienvenue dans les annonces de l'entreprise.",
          last_message_at: now
        });
        
        // Create welcome message
        await base44.asServiceRole.entities.Message.create({
          conversation_id: newConv.id,
          sender_employee_id: null,
          text: "Bienvenue dans les annonces de l'entreprise."
        });
        
        results.entreprise = { created: true, id: newConv.id };
      }
    } else {
      // Update participants if needed
      const currentParticipants = new Set(entrepriseConv.participant_employee_ids || []);
      const allEmployeeIds = employeesWithAccounts.map(emp => emp.id);
      const needsUpdate = allEmployeeIds.some(id => !currentParticipants.has(id));

      if (needsUpdate) {
        await base44.asServiceRole.entities.Conversation.update(entrepriseConv.id, {
          participant_employee_ids: allEmployeeIds
        });
        results.entreprise = { updated: true, id: entrepriseConv.id };
      } else {
        results.entreprise = { exists: true, id: entrepriseConv.id };
      }
    }

    // 2) CONVERSATIONS PAR ÉQUIPE
    const teams = [...new Set(employeesWithAccounts.map(emp => emp.team).filter(Boolean))];
    const adminEmployee = employeesWithAccounts.find(emp => emp.permission_level === 'admin') || employeesWithAccounts[0];

    for (const teamName of teams) {
      const teamTitle = `👥 Équipe ${teamName}`;
      const teamEmployees = employeesWithAccounts.filter(emp => emp.team === teamName);
      
      const existingTeamConv = existingConversations.find(c => 
        c.title === teamTitle && c.type === "equipe"
      );

      if (!existingTeamConv) {
        const now = new Date().toISOString();
        const welcomeText = `Bienvenue dans la conversation de l'équipe ${teamName}.`;
        const newConv = await base44.asServiceRole.entities.Conversation.create({
          title: teamTitle,
          type: "equipe",
          team_id: teamName,
          participant_employee_ids: teamEmployees.map(emp => emp.id),
          created_by_employee_id: adminEmployee.id,
          last_message_text: welcomeText,
          last_message_at: now
        });
        
        // Create welcome message
        await base44.asServiceRole.entities.Message.create({
          conversation_id: newConv.id,
          sender_employee_id: null,
          text: welcomeText
        });
        
        results.equipes.push({ team: teamName, created: true, id: newConv.id });
      } else {
        // Update participants
        const currentParticipants = new Set(existingTeamConv.participant_employee_ids || []);
        const teamEmployeeIds = teamEmployees.map(emp => emp.id);
        const needsUpdate = teamEmployeeIds.some(id => !currentParticipants.has(id)) ||
                           existingTeamConv.participant_employee_ids.some(id => !teamEmployeeIds.includes(id));

        if (needsUpdate) {
          await base44.asServiceRole.entities.Conversation.update(existingTeamConv.id, {
            participant_employee_ids: teamEmployeeIds
          });
          results.equipes.push({ team: teamName, updated: true, id: existingTeamConv.id });
        } else {
          results.equipes.push({ team: teamName, exists: true, id: existingTeamConv.id });
        }
      }
    }

    // 3) CONVERSATION DIRECTION
    const directionConv = existingConversations.find(c => 
      c.title === "🧠 Direction" && c.type === "equipe"
    );

    const directionEmployees = employeesWithAccounts.filter(emp => 
      emp.permission_level === 'admin' || emp.permission_level === 'manager'
    );

    if (directionEmployees.length > 0) {
      if (!directionConv) {
        const now = new Date().toISOString();
        const welcomeText = "Espace de discussion réservé à la direction.";
        const newConv = await base44.asServiceRole.entities.Conversation.create({
          title: "🧠 Direction",
          type: "equipe",
          participant_employee_ids: directionEmployees.map(emp => emp.id),
          created_by_employee_id: adminEmployee.id,
          last_message_text: welcomeText,
          last_message_at: now
        });
        
        // Create welcome message
        await base44.asServiceRole.entities.Message.create({
          conversation_id: newConv.id,
          sender_employee_id: null,
          text: welcomeText
        });
        
        results.direction = { created: true, id: newConv.id };
      } else {
        // Update participants
        const currentParticipants = new Set(directionConv.participant_employee_ids || []);
        const directionEmployeeIds = directionEmployees.map(emp => emp.id);
        const needsUpdate = directionEmployeeIds.some(id => !currentParticipants.has(id)) ||
                           directionConv.participant_employee_ids.some(id => !directionEmployeeIds.includes(id));

        if (needsUpdate) {
          await base44.asServiceRole.entities.Conversation.update(directionConv.id, {
            participant_employee_ids: directionEmployeeIds
          });
          results.direction = { updated: true, id: directionConv.id };
        } else {
          results.direction = { exists: true, id: directionConv.id };
        }
      }
    }

    return Response.json({
      success: true,
      results,
      summary: {
        employees_with_accounts: employeesWithAccounts.length,
        teams_found: teams.length,
        direction_members: directionEmployees.length
      }
    });

  } catch (error) {
    return Response.json({ 
      success: false, 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});