import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { employeeId } = await req.json();

    // Fetch the employee
    const employees = await base44.entities.Employee.filter({ id: employeeId });
    if (!employees || employees.length === 0) {
      return Response.json({ error: 'Employee not found' }, { status: 404 });
    }

    const employee = employees[0];

    // Check if already registered
    const existing = await base44.entities.PersonnelRegistry.filter({ employee_id: employeeId });
    
    if (existing && existing.length > 0) {
      // Update existing registry entry
      const registryEntry = existing[0];
      await base44.entities.PersonnelRegistry.update(registryEntry.id, {
        last_name: employee.last_name,
        first_name: employee.first_name,
        birth_date: employee.birth_date,
        birth_place: employee.birth_place,
        nationality: employee.nationality,
        gender: employee.gender,
        address: employee.address,
        social_security_number: employee.social_security_number,
        position: employee.position,
        start_date: employee.start_date,
        contract_type: employee.contract_type,
        exit_date: employee.exit_date,
        last_updated_at: new Date().toISOString()
      });
      return Response.json({ success: true, message: 'Registry entry updated' });
    }

    // Get the highest entry_order
    const allEntries = await base44.entities.PersonnelRegistry.list('-entry_order', 1);
    const nextOrder = (allEntries[0]?.entry_order || 0) + 1;

    // Create new registry entry
    await base44.entities.PersonnelRegistry.create({
      employee_id: employeeId,
      last_name: employee.last_name,
      first_name: employee.first_name,
      birth_date: employee.birth_date,
      birth_place: employee.birth_place,
      nationality: employee.nationality,
      gender: employee.gender,
      address: employee.address,
      social_security_number: employee.social_security_number,
      position: employee.position,
      start_date: employee.start_date,
      contract_type: employee.contract_type,
      exit_date: employee.exit_date,
      entry_order: nextOrder,
      registered_by: user.email,
      registered_at: new Date().toISOString(),
      last_updated_at: new Date().toISOString()
    });

    return Response.json({ success: true, message: 'Employee registered to personnel registry' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});