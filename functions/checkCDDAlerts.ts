import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Get all employees with CDD contracts
    const employees = await base44.asServiceRole.entities.Employee.list();
    const cddEmployees = employees.filter(emp => emp.contract_type === 'cdd' && emp.end_date && emp.is_active);

    // Get establishment info for email
    const establishments = await base44.asServiceRole.entities.Establishment.list();
    const establishment = establishments[0];

    if (!establishment?.contact_email) {
      return Response.json({ error: 'No establishment email configured' }, { status: 400 });
    }

    // Check for employees ending contract in ~30 days
    const today = new Date();
    const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const twoWeeksBefore = new Date(today.getTime() + 27 * 24 * 60 * 60 * 1000); // 3 days before 30-day mark

    const alertEmployees = cddEmployees.filter(emp => {
      const endDate = new Date(emp.end_date);
      return endDate >= twoWeeksBefore && endDate <= thirtyDaysFromNow;
    });

    if (alertEmployees.length === 0) {
      return Response.json({ message: 'No CDD alerts to send', count: 0 });
    }

    // Send email for each alert employee
    const emailPromises = alertEmployees.map(emp => {
      const endDate = new Date(emp.end_date);
      const formattedDate = endDate.toLocaleDateString('fr-FR');
      const fullName = `${emp.first_name} ${emp.last_name}`;

      return base44.functions.invoke('sendEmailWithResend', {
        to: establishment.contact_email,
        subject: `Alerte fin de contrat CDD "${fullName}"`,
        body: `Attention, ${fullName} arrive en fin de CDD le ${formattedDate}.`,
        from_name: establishment.name || 'UpGraal'
      });
    });

    await Promise.all(emailPromises);

    return Response.json({ 
      message: 'CDD alerts sent successfully',
      count: alertEmployees.length,
      employees: alertEmployees.map(e => ({ name: `${e.first_name} ${e.last_name}`, endDate: e.end_date }))
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});