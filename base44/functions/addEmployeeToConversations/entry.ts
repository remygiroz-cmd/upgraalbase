import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { employeeId } = await req.json();

    if (!employeeId) {
      return Response.json({ error: 'employeeId required' }, { status: 400 });
    }

    // Get employee
    const employees = await base44.asServiceRole.entities.Employee.filter({ id: employeeId });
    const employee = employees[0];

    if (!employee) {
      return Response.json({ error: 'Employee not found' }, { status: 404 });
    }

    const results = {
      added_to: [],
      already_in: [],
      errors: []
    };

    // Get all conversations
    const conversations = await base44.asServiceRole.entities.Conversation.list();

    // 1) Add to entreprise conversation
    const entrepriseConv = conversations.find(c => 
      c.title === "📢 Annonces entreprise" && c.type === "entreprise"
    );

    if (entrepriseConv) {
      const participants = entrepriseConv.participant_employee_ids || [];
      if (!participants.includes(employeeId)) {
        await base44.asServiceRole.entities.Conversation.update(entrepriseConv.id, {
          participant_employee_ids: [...participants, employeeId]
        });
        results.added_to.push("📢 Annonces entreprise");
      } else {
        results.already_in.push("📢 Annonces entreprise");
      }
    }

    // 2) Add to team conversation
    if (employee.team) {
      const teamTitle = `👥 Équipe ${employee.team}`;
      const teamConv = conversations.find(c => 
        c.title === teamTitle && c.type === "equipe"
      );

      if (teamConv) {
        const participants = teamConv.participant_employee_ids || [];
        if (!participants.includes(employeeId)) {
          await base44.asServiceRole.entities.Conversation.update(teamConv.id, {
            participant_employee_ids: [...participants, employeeId]
          });
          results.added_to.push(teamTitle);
        } else {
          results.already_in.push(teamTitle);
        }
      }
    }

    // 3) Add to direction if admin/manager
    if (employee.permission_level === 'admin' || employee.permission_level === 'manager') {
      const directionConv = conversations.find(c => 
        c.title === "🧠 Direction" && c.type === "equipe"
      );

      if (directionConv) {
        const participants = directionConv.participant_employee_ids || [];
        if (!participants.includes(employeeId)) {
          await base44.asServiceRole.entities.Conversation.update(directionConv.id, {
            participant_employee_ids: [...participants, employeeId]
          });
          results.added_to.push("🧠 Direction");
        } else {
          results.already_in.push("🧠 Direction");
        }
      }
    }

    return Response.json({
      success: true,
      employee: {
        id: employee.id,
        name: `${employee.first_name} ${employee.last_name}`,
        team: employee.team,
        permission_level: employee.permission_level
      },
      results
    });

  } catch (error) {
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});