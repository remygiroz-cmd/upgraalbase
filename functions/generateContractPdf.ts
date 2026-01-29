import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const getBaseStyles = () => `
  :root {
    --font: Arial, Helvetica, sans-serif;
    --text: 11pt;
    --lh: 1.3;
  }

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: var(--font);
    font-size: var(--text);
    line-height: var(--lh);
    color: #000;
    background: #fff;
  }

  h1 {
    font-size: 14pt;
    font-weight: 700;
    margin: 0 0 10px 0;
  }

  h2 {
    font-size: 11.5pt;
    font-weight: 700;
    margin: 14px 0 6px 0;
  }

  .section-title {
    font-weight: 700;
    text-transform: uppercase;
    margin: 14px 0 6px 0;
  }

  hr {
    border: none;
    border-top: 1px solid #333;
    margin: 10px 0 12px;
  }

  p {
    margin: 0 0 8px 0;
  }

  .small-gap {
    margin-top: 6px;
  }

  .block {
    margin-top: 10px;
  }

  .section {
    margin: 12px 0;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .signature-block {
    margin-top: 18px;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .signature-row {
    display: flex;
    gap: 24px;
    margin-top: 10px;
  }

  .signature-col {
    flex: 1;
    break-inside: avoid;
  }

  .signature-box {
    border-top: 1px solid #000;
    height: 90px;
    margin-top: 10px;
  }

  strong {
    font-weight: bold;
  }

  em {
    font-style: italic;
  }

  @media print {
    @page {
      size: A4;
      margin: 18mm 16mm 18mm 16mm;
    }

    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    h1, h2, .section-title {
      break-after: avoid-page;
    }

    p, li {
      orphans: 3;
      widows: 3;
    }

    .signature-block, .signature-row, .signature-col {
      break-inside: avoid;
    }

    hr {
      break-after: avoid;
    }

    .no-print {
      display: none !important;
    }
  }
`;

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

// Calcul période d'essai CDD : 1 jour ouvré par semaine, max 21 jours
const calculateCDDEssayDays = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end - start;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const weeks = Math.ceil(diffDays / 7);
  return Math.min(weeks, 21);
};

const calculateEssayEndDate = (startDate, essayDays) => {
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

    const { templateId, employeeId, options = {}, customData = {} } = await req.json();

    if (!templateId || !employeeId) {
      return Response.json({ error: 'templateId and employeeId required' }, { status: 400 });
    }

    // Charger le template
    const templates = await base44.asServiceRole.entities.TemplatesRH.filter({ id: templateId });
    if (!templates || templates.length === 0) {
      return Response.json({ error: 'Template not found' }, { status: 404 });
    }
    const template = templates[0];

    // Vérifier que le template a un contenu HTML
    if (!template.htmlContent) {
      return Response.json({ 
        error: 'Template HTML content is missing. Please edit the template and add HTML content.' 
      }, { status: 400 });
    }

    // Charger l'employé
    const employees = await base44.asServiceRole.entities.Employee.filter({ id: employeeId });
    if (!employees || employees.length === 0) {
      return Response.json({ error: 'Employee not found' }, { status: 404 });
    }
    const employee = employees[0];

    // Charger l'établissement (par défaut le premier)
    const establishments = await base44.asServiceRole.entities.Establishment.list();
    const establishment = establishments?.[0] || {};

    // Vérifications établissement (données critiques)
    if (!establishment.name) {
      return Response.json({ 
        error: 'Données établissement manquantes. Veuillez configurer votre établissement dans Paramètres > Établissement.' 
      }, { status: 400 });
    }
    if (!establishment.siret) {
      return Response.json({ 
        error: 'Numéro SIRET manquant. Veuillez le renseigner dans Paramètres > Établissement.' 
      }, { status: 400 });
    }

    // Charger les tâches du poste (JobRoles)
    const jobRoles = await base44.asServiceRole.entities.JobRoles.filter({ label: employee.position });
    const jobTasksText = jobRoles?.[0]?.tasksText || 'Tâches à définir';

    // Déterminer le type de contrat
    const typeDocument = template.typeDocument; // 'CDD' ou 'CDI'

    // Récupérer les dates
    const startDate = options.startDate || employee.start_date;
    const endDate = options.endDate || employee.end_date;

    // Calcul de la période d'essai
    let essayDays, periodeEssaiTexte, finEssaiDate;

    if (typeDocument === 'CDD') {
      // CDD : 1 jour ouvré par semaine, max 21 jours
      essayDays = calculateCDDEssayDays(startDate, endDate);
      periodeEssaiTexte = `${essayDays} jour${essayDays > 1 ? 's' : ''} ouvré${essayDays > 1 ? 's' : ''}`;
      finEssaiDate = calculateEssayEndDate(startDate, essayDays);
    } else {
      // CDI : fixe à 2 mois
      essayDays = 60; // ~2 mois (approximation)
      periodeEssaiTexte = '2 mois';
      const startD = new Date(startDate);
      startD.setMonth(startD.getMonth() + 2);
      finEssaiDate = startD.toISOString().split('T')[0];
    }

    // Construire le motif du CDD
    let motifCDD = '';
    if (typeDocument === 'CDD') {
      const cddReason = employee.cdd_reason || 'replacement';
      const reasonLabels = {
        'replacement': 'Remplacement d\'un salarié absent',
        'temporary_activity': 'Accroissement temporaire d\'activité',
        'seasonal': 'Emploi saisonnier',
        'apprenticeship': 'Contrat d\'apprentissage ou de professionnalisation',
        'cascade_replacement': 'Remplacement en cascade'
      };
      
      let reasonText = reasonLabels[cddReason] || 'Remplacement d\'un salarié absent';
      
      // Ajouter les détails si présents
      if (cddReason === 'replacement' && employee.cdd_replacement_employee) {
        const absenceReasonLabel = {
          'sick_leave': 'arrêt maladie',
          'maternity_leave': 'congé maternité',
          'paternity_leave': 'congé paternité',
          'paid_leave': 'congé payé',
          'training': 'formation'
        };
        const absenceReason = absenceReasonLabel[employee.cdd_replacement_reason] || 'absence';
        reasonText = `Remplacement du salarié ${employee.cdd_replacement_employee} en ${absenceReason}`;
      } else if (cddReason === 'cascade_replacement' && employee.cdd_custom_reason) {
        reasonText = employee.cdd_custom_reason;
      }
      
      motifCDD = `Le présent CDD est conclu en vertu de l'article L.1242-2 du Code du travail pour le motif suivant : <strong>${reasonText}</strong>. Ce motif justifie le recours à un contrat à durée déterminée conformément à la convention collective de la restauration rapide.`;
    }

    // Récupérer le responsable principal (premier de la liste)
    const mainManager = establishment.managers?.[0] || {};

    // Récupérer les tâches du poste depuis JobRoles
    let finalJobTasksText = employee.position || '';
    if (employee.position) {
      const jobRoles = await base44.asServiceRole.entities.JobRoles.filter({ 
        label: employee.position,
        isActive: true 
      });

      // Si pas de correspondance exacte, chercher dans les alias
      if (!jobRoles || jobRoles.length === 0) {
        const allRoles = await base44.asServiceRole.entities.JobRoles.filter({ isActive: true });
        const matchedRole = allRoles.find(role => 
          role.posteAlias && role.posteAlias.includes(employee.position)
        );
        if (matchedRole) {
          finalJobTasksText = matchedRole.tasksText || employee.position;
        }
      } else {
        finalJobTasksText = jobRoles[0].tasksText || employee.position;
      }
    }

    // Injecter les données personnalisées du template (customData)
    const customVariables = {};
    Object.keys(customData).forEach(key => {
      customVariables[key] = customData[key];
    });

    // Construire l'objet variables (communes + spécifiques selon type + customData)
    const variables = {
      ...customVariables,
      // Variables communes
      etablissementNom: establishment.name || '',
      etablissementSiret: establishment.siret || '',
      etablissementEmail: establishment.contact_email || '',
      etablissementSite: establishment.website || '',
      etablissementAdresse: establishment.postal_address || '',
      etablissementAdresseLivraison: establishment.delivery_address || establishment.postal_address || '',
      responsableNom: mainManager.name || '',
      responsableTel: mainManager.phone || '',
      responsableEmail: mainManager.email || '',
      prenom: employee.first_name || '',
      nom: employee.last_name || '',
      signature: formatDateFR(new Date()),

      // Variables contractuelles
      naissance: formatDateFR(employee.birth_date),
      lieuNaissance: employee.birth_place || '',
      adresse: employee.address || '',
      nationalite: employee.nationality || '',
      secu: employee.social_security_number || '',
      poste: employee.position || '',
      taches: finalJobTasksText,
      debut: formatDateFR(startDate),
      fin: formatDateFR(endDate),
      heures: options.contractHours || employee.contract_hours_weekly || '35',
      heuresTexte: hoursToText((parseFloat(options.contractHours || employee.contract_hours_weekly || 35) * 4.33).toFixed(2)),
      periodeEssaiTexte: periodeEssaiTexte || '',
      finEssai: formatDateFR(finEssaiDate),
      taux: (options.hourlyRate || employee.gross_hourly_rate || 0).toFixed(2),
      salaireBrut: (options.grossSalary || employee.gross_salary || 0).toFixed(2),
      motifCDD: motifCDD,

      // Variables avenants
      dateEffet: options.dateEffet || formatDateFR(new Date()),
      ancienneValeur: options.ancienneValeur || '',
      nouvelleValeur: options.nouvelleValeur || '',
      motifModification: options.motifModification || '',

      // Variables disciplinaires
      dateFaits: options.dateFaits || formatDateFR(new Date()),
      descriptionFaits: options.descriptionFaits || '',
      dateIncident: options.dateIncident || formatDateFR(new Date()),
      dateNotification: formatDateFR(new Date()),
      dateConvocation: options.dateConvocation || '',
      lieuConvocation: options.lieuConvocation || establishment.postal_address || '',
      heureConvocation: options.heureConvocation || '',

      // Variables rupture
      dateRupture: options.dateRupture || formatDateFR(new Date()),
      motifRupture: options.motifRupture || '',
      dateFinContrat: options.dateFinContrat || formatDateFR(endDate),
      indemnitePreavis: options.indemnitePreavis || '0',
      indemniteRupture: options.indemniteRupture || '0',

      // Variables administratives
      dateDebutContrat: formatDateFR(startDate),
      fonctionOccupee: employee.position || '',
      periodeAttestation: options.periodeAttestation || `du ${formatDateFR(startDate)} à ce jour`,
      natureAttestation: options.natureAttestation || 'Attestation d\'emploi'
    };

    // Utiliser le HTML du template stocké dans la DB
    let htmlContent = template.htmlContent;
    
    // Injecter les styles si nécessaire (si le template contient le placeholder)
    if (htmlContent.includes('{{STYLES}}')) {
      htmlContent = htmlContent.replace('{{STYLES}}', getBaseStyles());
    }
    
    // Injecter les variables dans le HTML
    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      htmlContent = htmlContent.split(placeholder).join(String(value));
    });

    // Retourner le HTML pour que le client génère le PDF côté client
    // via html2pdf.js ou une autre solution
    const documentRecord = {
      employee_id: employeeId,
      establishment_id: establishment.id,
      template_id: templateId,
      templateName: template.name,
      templateVersion: template.version,
      typeDocument: template.typeDocument,
      categorieDocument: template.categorieDocument || 'A_CONTRACTUEL',
      titre: `${template.typeDocument}_${employee.last_name}_${employee.first_name}_${new Date().toISOString().split('T')[0]}`,
      payloadSnapshot: variables,
      customData: customData,
      statusSignature: 'non_signe',
      generatedAt: new Date().toISOString(),
      generatedBy: user.email,
      notes: options.notes || ''
    };

    const createdDocument = await base44.asServiceRole.entities.DocumentsRH.create(documentRecord);

    return Response.json({
      success: true,
      documentId: createdDocument.id,
      html: htmlContent,
      message: 'Contract HTML generated. PDF generation on client-side.',
      payload: variables
    });

  } catch (error) {
    console.error('Error in generateContractPdf:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});