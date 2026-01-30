import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Fonction pour mapper automatiquement toutes les propriétés d'établissement
const mapEstablishmentToVariables = (establishment) => {
  if (!establishment) return {};
  
  const variables = {};
  
  // Mapper toutes les propriétés non-internes
  Object.keys(establishment).forEach(key => {
    // Ignorer les métadonnées internes
    if (['id', 'created_date', 'updated_date', 'created_by', 'managers'].includes(key)) return;
    
    // Mapping explicite pour les clés connues
    const keyMapping = {
      'name': 'etablissementNom',
      'siret': 'etablissementSiret',
      'contact_email': 'etablissementEmail',
      'website': 'etablissementSite',
      'postal_address': 'etablissementAdresse',
      'postal_code': 'codePostalEtablissement',
      'city': 'villeEtablissement',
      'delivery_address': 'etablissementAdresseLivraison'
    };
    
    const variableName = keyMapping[key] || 
                        `etablissement${key.charAt(0).toUpperCase()}${key.slice(1).replace(/_/g, '')}`;
    
    variables[variableName] = establishment[key] || '';
  });
  
  // Gérer les responsables
  const mainManager = establishment.managers?.[0] || {};
  variables.responsableNom = mainManager.name || '';
  variables.responsableTel = mainManager.phone || '';
  variables.responsableEmail = mainManager.email || '';
  
  return variables;
};

// Styles CSS professionnels harmonisés pour tous les documents RH
const getBaseStyles = () => `
  /* === CHARTE GRAPHIQUE RH === */
  @page {
    size: A4;
    margin: 2.5cm 2cm 2cm 2cm;
  }

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  /* === TYPOGRAPHIE GLOBALE === */
  body {
    font-family: 'Calibri', 'Arial', 'Helvetica', sans-serif;
    font-size: 11pt;
    line-height: 1.8;
    color: #1a1a1a;
    background: white;
    max-width: 21cm;
    margin: 0 auto;
    padding: 2.5cm 2cm;
  }

  /* === EN-TÊTE EMPLOYEUR === */
  .header-employer {
    border-bottom: 2px solid #2c3e50;
    padding-bottom: 15px;
    margin-bottom: 30px;
  }

  .header-employer .company-name {
    font-size: 14pt;
    font-weight: bold;
    color: #2c3e50;
    margin-bottom: 5px;
  }

  .header-employer .company-details {
    font-size: 9pt;
    color: #555;
    line-height: 1.4;
  }

  /* === TITRE PRINCIPAL === */
  h1 {
    font-size: 16pt;
    font-weight: bold;
    text-align: center;
    margin: 30px 0;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #2c3e50;
    border-top: 1px solid #ddd;
    border-bottom: 1px solid #ddd;
    padding: 15px 0;
  }

  /* === HIÉRARCHIE DES TITRES === */
  h2 {
    font-size: 13pt;
    font-weight: bold;
    margin: 30px 0 15px 0;
    color: #2c3e50;
    border-bottom: 2px solid #ecf0f1;
    padding-bottom: 5px;
  }

  h3 {
    font-size: 11.5pt;
    font-weight: bold;
    margin: 20px 0 12px 0;
    color: #34495e;
  }

  /* === SECTIONS === */
  .section {
    margin: 25px 0;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .section-title {
    font-weight: bold;
    text-decoration: underline;
    margin: 20px 0 10px 0;
    color: #2c3e50;
  }

  /* === PARAGRAPHES === */
  p {
    margin-bottom: 15px;
    text-align: justify;
    text-justify: inter-word;
  }

  /* === IDENTIFICATION SALARIÉ === */
  .employee-block {
    background: #f8f9fa;
    border-left: 4px solid #3498db;
    padding: 15px 20px;
    margin: 25px 0;
    break-inside: avoid;
  }

  /* === ÉLÉMENTS IMPORTANTS === */
  strong {
    font-weight: bold;
    color: #2c3e50;
  }

  em {
    font-style: italic;
  }

  /* === LISTES === */
  ul, ol {
    margin: 15px 0 15px 40px;
  }

  li {
    margin-bottom: 10px;
    line-height: 1.7;
  }

  /* === SÉPARATEURS === */
  hr {
    border: none;
    border-top: 1px solid #ddd;
    margin: 20px 0;
  }

  /* === BLOC SIGNATURE PROFESSIONNEL === */
  .signature-block {
    margin-top: 60px;
    padding-top: 30px;
    border-top: 1px solid #ddd;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .signature-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 30px;
    margin-top: 10px;
  }

  .signature-col {
    text-align: center;
    break-inside: avoid;
  }

  .signature-label {
    font-weight: bold;
    margin-bottom: 10px;
    color: #2c3e50;
  }

  .signature-date {
    font-size: 10pt;
    color: #666;
    margin-bottom: 15px;
  }

  .signature-box {
    border-top: 1px solid #000;
    height: 80px;
    margin-top: 40px;
    padding-top: 5px;
  }

  /* === TABLEAUX === */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 20px 0;
  }

  th, td {
    padding: 10px;
    border: 1px solid #ddd;
    text-align: left;
  }

  th {
    background: #f8f9fa;
    font-weight: bold;
    color: #2c3e50;
  }

  /* === IMPRESSION === */
  @media print {
    body {
      padding: 0;
    }

    @page {
      margin: 2.5cm 2cm 2cm 2cm;
      /* Suppression des en-têtes/pieds de page navigateur */
      margin-header: 0mm;
      margin-footer: 0mm;
    }

    /* Éviter les coupures malheureuses */
    h1, h2, h3, .section-title {
      break-after: avoid-page;
      page-break-after: avoid;
    }

    p, li {
      orphans: 3;
      widows: 3;
    }

    .signature-block, .signature-row, .signature-col, .employee-block {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    hr {
      break-after: avoid;
      page-break-after: avoid;
    }

    /* Masquer les éléments non imprimables */
    .no-print {
      display: none !important;
    }

    /* Couleurs exactes en impression */
    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      color-adjust: exact;
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

    // Construire l'objet variables - MAPPING DYNAMIQUE de TOUTES les propriétés d'établissement
    const establishmentVariables = mapEstablishmentToVariables(establishment);
    
    const variables = {
      // Variables d'établissement (TOUTES mappées automatiquement)
      ...establishmentVariables,
      
      // Variables employé de base
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
      motifSanction: options.motifSanction || '',
      dateIncident: options.dateIncident || formatDateFR(new Date()),
      dateNotification: formatDateFR(new Date()),
      dateConvocation: options.dateConvocation || '',
      lieuConvocation: options.lieuConvocation || establishment.postal_address || '',
      heureConvocation: options.heureConvocation || '',

      // Variables rupture (INTERDIT pour documents disciplinaires)
      dateRupture: options.dateRupture || formatDateFR(new Date()),
      motifRupture: template.categorieDocument === 'B_DISCIPLINAIRE' ? '' : (options.motifRupture || ''),
      dateFinContrat: options.dateFinContrat || formatDateFR(endDate),
      indemnitePreavis: options.indemnitePreavis || '0',
      indemniteRupture: options.indemniteRupture || '0',

      // Variables administratives
      dateDebutContrat: formatDateFR(startDate),
      fonctionOccupee: employee.position || '',
      periodeAttestation: options.periodeAttestation || `du ${formatDateFR(startDate)} à ce jour`,
      natureAttestation: options.natureAttestation || 'Attestation d\'emploi'
    };

    // Fusionner les données personnalisées du template (customData) - écrase les valeurs par défaut
    Object.keys(customData).forEach(key => {
      let value = customData[key];

      // Formater les dates au format français si c'est une date ISO
      if (value && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        value = formatDateFR(value);
      }

      variables[key] = value;
    });

    // Utiliser le HTML du template stocké dans la DB
    let htmlContent = template.htmlContent;
    
    // Injecter les variables dans le HTML
    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      htmlContent = htmlContent.split(placeholder).join(String(value));
    });

    // Structure HTML finale avec mise en page professionnelle automatique
    const structuredHtml = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${template.name} - ${employee.first_name} ${employee.last_name}</title>
  <style>${getBaseStyles()}</style>
</head>
<body>
  <!-- EN-TÊTE EMPLOYEUR AUTOMATIQUE -->
  <div class="header-employer">
    <div class="company-name">${variables.etablissementNom || 'Établissement'}</div>
    <div class="company-details">
      ${variables.etablissementAdresse || ''}<br>
      ${variables.etablissementSiret ? `SIRET : ${variables.etablissementSiret}` : ''}<br>
      ${variables.etablissementEmail ? `Email : ${variables.etablissementEmail}` : ''}
    </div>
  </div>
  
  <!-- CONTENU PRINCIPAL -->
  <div class="document-content">
    ${htmlContent}
  </div>
  
  <!-- BLOC SIGNATURE AUTOMATIQUE (si non présent) -->
  ${!htmlContent.includes('signature') ? `
  <div class="signature-block">
    <div class="signature-row">
      <div class="signature-col">
        <div class="signature-label">L'Employeur</div>
        <div class="signature-date">Fait le ${variables.signature || formatDateFR(new Date())}</div>
        <div class="signature-box"></div>
      </div>
      <div class="signature-col">
        <div class="signature-label">Le Salarié</div>
        <div class="signature-date">Fait le ${variables.signature || formatDateFR(new Date())}</div>
        <div class="signature-box">Lu et approuvé</div>
      </div>
    </div>
  </div>
  ` : ''}
</body>
</html>
    `.trim();
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
      html: structuredHtml,
      message: 'Contract HTML generated with professional layout. PDF generation on client-side.',
      payload: variables
    });

  } catch (error) {
    console.error('Error in generateContractPdf:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});