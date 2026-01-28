import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const getTemplateHtml = (templateCode) => {
  const templates = {
    'CDD_TP_RESTAURATION_RAPIDE': getCDDTPTemplate(),
    'CDD_TC_RESTAURATION_RAPIDE': getCDDTCTemplate(),
    'CDI_TP_RESTAURATION_RAPIDE': getCDITPTemplate(),
    'CDI_TC_RESTAURATION_RAPIDE': getCDITCTemplate()
  };
  return templates[templateCode] || null;
};

const getBaseStyles = () => `
  @page {
    size: A4 portrait;
    margin: 20mm;
  }
  
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  
  body {
    font-family: 'Calibri', 'Arial', sans-serif;
    font-size: 11pt;
    line-height: 1.5;
    color: #000;
    background: #fff;
  }
  
  .header {
    text-align: left;
    margin-bottom: 1.5em;
  }
  
  h2 {
    font-size: 13pt;
    font-weight: bold;
    margin: 0 0 0.3em 0;
  }
  
  .subtitle {
    font-size: 10pt;
    margin: 0.3em 0 1em 0;
  }
  
  .company-info {
    font-size: 10pt;
    line-height: 1.4;
    margin: 1em 0;
  }
  
  p {
    margin: 0.4em 0;
    orphans: 3;
    widows: 3;
  }
  
  .article {
    margin: 1.2em 0;
    break-inside: avoid;
  }
  
  .article-title {
    font-weight: bold;
    margin-bottom: 0.4em;
    text-decoration: underline;
  }
  
  hr {
    border: none;
    border-top: 1px solid #666;
    margin: 1em 0;
  }
  
  .signature-section {
    margin-top: 2em;
    page-break-inside: avoid;
  }
  
  .signature-block {
    margin-top: 1.5em;
    page-break-inside: avoid;
  }
  
  .section-title {
    font-weight: bold;
    margin-top: 1em;
    margin-bottom: 0.5em;
  }
  
  strong {
    font-weight: bold;
  }
  
  em {
    font-style: italic;
  }
`;

// Définir les templates comme chaînes séparées
const cddTemplate = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <style>${getBaseStyles()}</style>
</head>
<body>
  <div class="header">
    <h2>CONTRAT DE TRAVAIL À DURÉE DÉTERMINÉE – {{TYPE_TRAVAIL}}</h2>
    <p class="subtitle">CONFORME À LA CONVENTION COLLECTIVE DE LA RESTAURATION RAPIDE</p>
  </div>
  
  <p style="margin-top: 1.5em; margin-bottom: 0.5em;"><strong>ENTRE LES SOUSSIGNÉS :</strong></p>
  
  <div class="company-info">
    <p><strong>SARL FRENCHY SUSHI</strong></p>
    <p>101 Quartier Souque Nègre – 13112 LA DESTROUSSE</p>
    <p>SIRET : 795 143 676 00018 – Code NAF : 5610C</p>
    <p>URSSAF : 20 Avenue Viton – 13299 MARSEILLE CEDEX 20</p>
    <p>Représentée par Monsieur Rémy GIROZ, en qualité de Gérant,</p>
    <p>Ci-après dénommée « l'Employeur »,</p>
  </div>
  
  <p style="margin-top: 1em; margin-bottom: 0.5em;"><strong>ET :</strong></p>
  
  <p>{{prenom}} {{nom}}</p>
  <p>Né(e) le {{naissance}} à {{lieuNaissance}},</p>
  <p>Domicilié(e) : {{adresse}}</p>
  <p>Nationalité : {{nationalite}}</p>
  <p>N° de Sécurité Sociale : {{secu}}</p>
  <p>Ci-après dénommé(e) « le Salarié »,</p>
  
  <hr>
  
  <div class="article">
    <div class="article-title">ARTICLE 1 – OBJET</div>
    <p>Le présent contrat est conclu à durée déterminée, du <strong>{{debut}}</strong> au <strong>{{fin}}</strong>, en vertu de l'article L.1242-2 du Code du travail et de la convention collective de la restauration rapide.</p>
  </div>
  
  <hr>
  
  <div class="article">
    <div class="article-title">ARTICLE 2 – EMPLOI ET QUALIFICATION</div>
    <p>Le Salarié est engagé en qualité de <strong>{{poste}}</strong>, niveau I, échelon 1, statut non cadre. Ses missions principales sont notamment :</p>
    <p>{{taches}}</p>
    <p>Cette liste est non exhaustive et pourra être modifiée par Monsieur Sébastien RODRIGO et/ou Monsieur Rémy GIROZ.</p>
  </div>
  
  <hr>
  
  <div class="article">
    <div class="article-title">ARTICLE 3 – LIEU DE TRAVAIL</div>
    <p>Le lieu principal d'exercice est fixé au siège de l'entreprise. L'Employeur se réserve la possibilité de muter le Salarié dans tout établissement situé dans un rayon de 20 km, sans modification substantielle du contrat.</p>
  </div>
  
  <hr>
  
  <div class="article">
    <div class="article-title">ARTICLE 4 – DURÉE ET HORAIRES DE TRAVAIL</div>
    <p>Le Salarié travaillera <strong>{{heures}}</strong> heures par semaine, soit un total de <strong>{{heuresTexte}}</strong> heures par mois, selon un planning communiqué 15 jours à l'avance, modulable en fonction des besoins du service. L'Employeur pourra modifier les horaires dans le respect d'un préavis de 7 jours, sauf urgence ou remplacement de dernière minute.</p>
  </div>
  
  <hr>
  
  <div class="article">
    <div class="article-title">ARTICLE 5 – HEURES COMPLÉMENTAIRES</div>
    <p>Le Salarié accepte d'effectuer des heures complémentaires dans la limite du tiers du contrat hebdomadaire, rémunérées conformément à la législation.</p>
  </div>
  
  <hr>
  
  <div class="article">
    <div class="article-title">ARTICLE 6 – PÉRIODE D'ESSAI</div>
    <p>Une période d'essai de {{periodeEssaiTexte}} est prévue, soit du {{debut}} au {{finEssai}}. Toute suspension prolonge d'autant cette période. La rupture de la période d'essai respecte les délais de prévenance légaux.</p>
  </div>
  
  <hr>
  
  <div class="article">
    <div class="article-title">ARTICLE 7 – RÉMUNÉRATION</div>
    <p>Le Salarié percevra un salaire brut mensuel de :</p>
    <p><em>(Heures par mois × Taux horaire)</em> = <strong>{{taux}} €</strong>/h × <strong>{{heuresTexte}}</strong></p>
    <p>Soit un salaire brut mensuel de <strong>{{salaireBrut}} €</strong>.</p>
  </div>
  
  <hr>
  
  <div class="article">
    <div class="article-title">ARTICLE 8 – FORMATION & CLAUSE DE REMBOURSEMENT</div>
    <p>En cas de formation spécifique prise en charge par l'Employeur, le Salarié s'engage à rembourser l'intégralité des frais engagés s'il quitte volontairement son poste sans respecter son préavis contractuel ou s'absente de manière injustifiée.</p>
  </div>
  
  <hr>
  
  <div class="article">
    <div class="article-title">ARTICLE 9 – CONGÉS PAYÉS</div>
    <p>Le Salarié bénéficiera de 2,5 jours ouvrables de congés par mois de travail effectif. Les dates seront déterminées par l'Employeur selon les nécessités du service.</p>
  </div>
  
  <hr>
  
  <div class="article">
    <div class="article-title">ARTICLE 10 – PROTECTION SOCIALE</div>
    <p>Le Salarié cotisera aux organismes suivants :</p>
    <p>– Retraite complémentaire : Malakoff Humanis</p>
    <p>– Prévoyance : AG2R La Mondiale</p>
  </div>
  
  <hr>
  
  <div class="article">
    <div class="article-title">ARTICLE 11 – OBLIGATIONS DU SALARIÉ</div>
    <p>Le Salarié s'engage à :</p>
    <p>- respecter les consignes, procédures, horaires et normes d'hygiène ;</p>
    <p>- respecter la confidentialité des informations de l'entreprise ;</p>
    <p>- signaler toute absence ou retard dans les meilleurs délais ;</p>
    <p>- mettre à jour ses informations administratives ;</p>
    <p>- respecter strictement le règlement intérieur fourni et signé en annexe</p>
  </div>
  
  <hr>
  
  <div class="article">
    <div class="article-title">ARTICLE 12 – CLAUSE DE NON-CONCURRENCE</div>
    <p>Aucune clause de non-concurrence n'est prévue dans ce contrat.</p>
  </div>
  
  <hr>
  
  <div class="article">
    <div class="article-title">ARTICLE 13 – RUPTURE ANTICIPÉE</div>
    <p>Le contrat pourra être rompu avant son terme uniquement selon les cas prévus par la loi.</p>
  </div>
  
  <hr>
  
  <div class="signature-section">
    <p>Fait à La Destrousse, le <strong>{{signature}}</strong>,</p>
    <p>En double exemplaire, dont un remis au Salarié.</p>
    
    <div class="signature-block">
      <p><strong>Signature du Salarié</strong></p>
      <p>(précédée de la mention manuscrite « Lu et approuvé »)</p>
    </div>
    
    <div class="signature-block">
      <p><strong>Signature de l'Employeur</strong></p>
      <p>Monsieur Rémy GIROZ ou Monsieur Rodrigo</p>
      <p>(précédée de la mention manuscrite « Lu et approuvé »)</p>
    </div>
  </div>
</body>
</html>
`;

const getCDDTPTemplate = () => cddTemplate.replace('{{TYPE_TRAVAIL}}', 'TEMPS PARTIEL');
const getCDDTCTemplate = () => cddTemplate.replace('{{TYPE_TRAVAIL}}', 'TEMPS COMPLET');

const cdiTemplate = cddTemplate
  .replace('À DURÉE DÉTERMINÉE – {{TYPE_TRAVAIL}}', 'À DURÉE INDÉTERMINÉE – {{TYPE_TRAVAIL}}')
  .replace('du <strong>{{debut}}</strong> au <strong>{{fin}}</strong>, en vertu de l\'article L.1242-2 du Code du travail et de', 'à compter du <strong>{{debut}}</strong>, en vertu du Code du travail et de')
  .replace('Une période d\'essai de {{periodeEssaiTexte}} est prévue, soit du {{debut}} au {{finEssai}}.', 'Une période d\'essai de {{periodeEssaiTexte}} est prévue.');

const getCDITPTemplate = () => cdiTemplate.replace('{{TYPE_TRAVAIL}}', 'TEMPS PARTIEL');
const getCDITCTemplate = () => cdiTemplate.replace('{{TYPE_TRAVAIL}}', 'TEMPS COMPLET');

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
      debut: formatDateFR(startDate),
      fin: formatDateFR(endDate),
      heures: options.contractHours || employee.contract_hours_weekly || '35',
      heuresTexte: hoursToText((parseFloat(options.contractHours || employee.contract_hours_weekly || 35) * 4.33).toFixed(2)),
      periodeEssaiTexte: periodeEssaiTexte,
      finEssai: formatDateFR(finEssaiDate),
      taux: (options.hourlyRate || employee.gross_hourly_rate || 0).toFixed(2),
      salaireBrut: (options.grossSalary || employee.gross_salary || 0).toFixed(2),
      signature: formatDateFR(new Date())
    };

    // Charger et injecter le HTML du template
    let htmlTemplate = getTemplateHtml(template.templateCode);
    if (!htmlTemplate) {
      return Response.json({ 
        error: 'Template HTML not found for: ' + template.templateCode 
      }, { status: 500 });
    }

    // Injecter les variables dans le HTML
    let htmlContent = htmlTemplate;
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
      html: htmlContent,
      message: 'Contract HTML generated. PDF generation on client-side.',
      payload: variables
    });

  } catch (error) {
    console.error('Error in generateContractPdf:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});