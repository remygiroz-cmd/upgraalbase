import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import html2pdf from 'npm:html2pdf.js@0.10.1';

// Templates HTML mappés par templateCode
const HTML_TEMPLATES = {
  'CDD_TP_RESTAURATION_RAPIDE': 'CDD_TP',
  'CDD_TC_RESTAURATION_RAPIDE': 'CDD_TC',
  'CDI_TP_RESTAURATION_RAPIDE': 'CDI_TP',
  'CDI_TC_RESTAURATION_RAPIDE': 'CDI_TC'
};

const getTemplateHtml = (templateCode) => {
  const templateType = HTML_TEMPLATES[templateCode];
  if (!templateType) return null;
  
  // Vous devez charger le HTML depuis vos templates
  // Pour l'MVP, on peut les inclure comme strings ou les charger depuis une source externe
  // À implémenter avec le chemin réel de vos templates
  return null; // À remplir avec le contenu HTML
};

const formatDateFR = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

const hoursToText = (hours) => {
  if (!hours) return '0';
  const num = parseFloat(hours);
  return num.toFixed(2).replace('.', ',');
};

const calculateEssayEndDate = (startDate, essayDays = 7) => {
  const d = new Date(startDate);
  let workDays = 0;
  while (workDays < essayDays) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) workDays++;
  }
  return d.toISOString().split('T')[0];
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { templateId, employeeId, options = {} } = await req.json();

    if (!templateId || !employeeId) {
      return Response.json({ error: 'templateId and employeeId required' }, { status: 400 });
    }

    // Charger le template
    const templates = await base44.entities.TemplatesRH.filter({ id: templateId });
    if (!templates || templates.length === 0) {
      return Response.json({ error: 'Template not found' }, { status: 404 });
    }
    const template = templates[0];

    // Charger l'employé
    const employees = await base44.entities.Employee.filter({ id: employeeId });
    if (!employees || employees.length === 0) {
      return Response.json({ error: 'Employee not found' }, { status: 404 });
    }
    const employee = employees[0];

    // Charger l'établissement (par défaut le premier)
    const establishments = await base44.entities.Establishment.list();
    const establishment = establishments?.[0] || {};

    // Charger les tâches du poste (JobRoles)
    const jobRoles = await base44.entities.JobRoles.filter({ label: employee.position });
    const jobTasksText = jobRoles?.[0]?.tasksText || 'Tâches à définir';

    // Construire l'objet variables
    const variables = {
      prenom: employee.first_name || '',
      nom: employee.last_name || '',
      naissance: formatDateFR(employee.birth_date),
      lieuNaissance: employee.birth_place || '',
      adresse: employee.address || '',
      nationalite: employee.nationality || '',
      secu: employee.social_security_number || '',
      poste: employee.position || '',
      taches: jobTasksText,
      debut: formatDateFR(options.startDate || employee.start_date),
      fin: formatDateFR(options.endDate || employee.end_date),
      heures: options.contractHours || employee.contract_hours_weekly || '35',
      heuresTexte: hoursToText((parseFloat(options.contractHours || employee.contract_hours_weekly || 35) * 4.33).toFixed(2)),
      dureeEssai: options.essayDays || '7',
      finEssai: formatDateFR(calculateEssayEndDate(options.startDate || employee.start_date, options.essayDays || 7)),
      taux: (options.hourlyRate || employee.gross_hourly_rate || 0).toFixed(2),
      salaireBrut: (options.grossSalary || employee.gross_salary || 0).toFixed(2),
      signature: formatDateFR(new Date())
    };

    // Charger le HTML du template (à implémenter selon votre architecture)
    let htmlTemplate = getTemplateHtml(template.templateCode);
    if (!htmlTemplate) {
      // Fallback: retourner une erreur si le HTML n'est pas disponible
      return Response.json({ 
        error: 'Template HTML not found for: ' + template.templateCode 
      }, { status: 500 });
    }

    // Injecter les variables dans le HTML
    let htmlContent = htmlTemplate;
    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      htmlContent = htmlContent.split(placeholder).join(value);
    });

    // TODO: Générer le PDF depuis le HTML (html2pdf ou équivalent)
    // Pour l'MVP, retourner le payload et indiquer que la génération PDF est en attente
    
    // Créer l'enregistrement DocumentsRH
    const documentRecord = {
      employee_id: employeeId,
      establishment_id: establishment.id,
      template_id: templateId,
      templateName: template.name,
      templateVersion: template.version,
      typeDocument: template.typeDocument,
      titre: `${template.typeDocument}_${employee.last_name}_${employee.first_name}_${new Date().toISOString().split('T')[0]}`,
      payloadSnapshot: variables,
      statusSignature: 'non_signe',
      generatedAt: new Date().toISOString(),
      generatedBy: user.email,
      notes: options.notes || ''
    };

    const createdDocument = await base44.entities.DocumentsRH.create(documentRecord);

    return Response.json({
      success: true,
      documentId: createdDocument.id,
      message: 'Contract template generated. PDF conversion pending.',
      payload: variables
    });

  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});