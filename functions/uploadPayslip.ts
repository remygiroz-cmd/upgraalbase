import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { crypto } from 'https://deno.land/std@0.208.0/crypto/mod.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await req.json();
    const { file_base64, file_name, employee_id, month } = data;

    if (!file_base64 || !employee_id || !month) {
      return Response.json(
        { error: 'Missing file_base64, employee_id or month' },
        { status: 400 }
      );
    }

    // Vérifier que l'employé existe
    const employee = await base44.entities.Employee.filter({ id: employee_id });
    if (employee.length === 0) {
      return Response.json({ error: 'Employee not found' }, { status: 404 });
    }

    const emp = employee[0];

    // Décoder le fichier
    const binaryString = atob(file_base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Calculer le hash SHA256 du fichier
    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const file_hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Vérifier les doublons
    const existingPayslips = await base44.entities.Payslip.filter({
      employee_id,
      month,
      file_hash
    });

    if (existingPayslips.length > 0) {
      return Response.json(
        { error: 'Duplicate payslip for this employee and month' },
        { status: 409 }
      );
    }

    // Uploader le fichier
    const uploadedFile = await base44.integrations.Core.UploadFile({
      file: file_base64
    });

    // Créer l'enregistrement Payslip
    const yearMonth = month.split('-');
    const storagePath = `/payslips/${employee_id}/${yearMonth[0]}/${yearMonth[1]}/fiche.pdf`;

    const payslip = await base44.entities.Payslip.create({
      employee_id,
      employee_name: `${emp.first_name} ${emp.last_name}`,
      month,
      pdf_url: uploadedFile.file_url,
      storage_path: storagePath,
      file_hash,
      status_extraction: 'pending'
    });

    // Lancer l'extraction IA en arrière-plan via une fonction
    try {
      await base44.functions.invoke('extractPayslipData', {
        payslip_id: payslip.id,
        pdf_url: uploadedFile.file_url,
        employee_id,
        month
      });
    } catch (err) {
      console.error('Error triggering extraction:', err.message);
    }

    return Response.json({
      success: true,
      payslip_id: payslip.id,
      employee_name: `${emp.first_name} ${emp.last_name}`,
      month,
      status: 'pending'
    });

  } catch (error) {
    console.error('Upload payslip error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});