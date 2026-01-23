import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Only admin can call this function
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { automation_id } = await req.json();

    if (!automation_id) {
      return Response.json({ error: 'automation_id is required' }, { status: 400 });
    }

    // Enable the automation using Base44 management API
    const response = await fetch(`https://api.base44.com/v1/automations/${automation_id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('BASE44_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ is_active: true })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to enable automation: ${error}`);
    }

    return Response.json({ 
      message: 'Automation enabled successfully',
      automation_id 
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});