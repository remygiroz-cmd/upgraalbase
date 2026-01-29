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

// Définir les templates comme chaînes séparées
const cddTemplate = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <style>${getBaseStyles()}</style>
</head>
<body>
  <div class="contract">
    <h1>CONTRAT DE TRAVAIL À DURÉE DÉTERMINÉE – {{TYPE_TRAVAIL}}</h1>
    <p class="block">CONFORME À LA CONVENTION COLLECTIVE DE LA RESTAURATION RAPIDE</p>

    <p class="block"><strong>ENTRE LES SOUSSIGNÉS :</strong></p>

    <p class="block"><strong>SARL FRENCHY SUSHI</strong><br>
    101 Quartier Souque Nègre – 13112 LA DESTROUSSE<br>
    SIRET : 795 143 676 00018 – Code NAF : 5610C<br>
    URSSAF : 20 Avenue Viton – 13299 MARSEILLE CEDEX 20<br>
    Représentée par Monsieur Rémy GIROZ, en qualité de Gérant,<br>
    Ci-après dénommée « l'Employeur »,</p>

    <p class="block"><strong>ET :</strong></p>

    <p class="block">{{prenom}} {{nom}}<br>
    Né(e) le {{naissance}} à {{lieuNaissance}},<br>
    Domicilié(e) : {{adresse}}<br>
    Nationalité : {{nationalite}}<br>
    N° de Sécurité Sociale : {{secu}}<br>
    Ci-après dénommé(e) « le Salarié »,</p>

    <hr>

    <div class="section">
      <div class="section-title">ARTICLE 1 – OBJET</div>
      <p>Le présent contrat est conclu à durée déterminée, du <strong>{{debut}}</strong> au <strong>{{fin}}</strong>, en vertu de l'article L.1242-2 du Code du travail et de la convention collective de la restauration rapide.</p>
    </div>

    <hr>

    <div class="section">
      <div class="section-title">ARTICLE 2 – MOTIF DU RECOURS AU CDD</div>
      <p>{{motifCDD}}</p>
    </div>

    <hr>

    <div class="section">
      <div class="section-title">ARTICLE 3 – EMPLOI ET QUALIFICATION</div>
      <p>Le Salarié est engagé en qualité de <strong>{{poste}}</strong>, niveau I, échelon 1, statut non cadre. Ses missions principales sont notamment :</p>
      <p>{{taches}}</p>
      <p>Cette liste est non exhaustive et pourra être modifiée par Monsieur Sébastien RODRIGO et/ou Monsieur Rémy GIROZ.</p>
    </div>

    <hr>

    <div class="section">
      <div class="section-title">ARTICLE 4 – LIEU DE TRAVAIL</div>
      <p>Le lieu principal d'exercice est fixé au siège de l'entreprise. L'Employeur se réserve la possibilité de muter le Salarié dans tout établissement situé dans un rayon de 20 km, sans modification substantielle du contrat.</p>
    </div>

    <hr>

    <div class="section">
      <div class="section-title">ARTICLE 5 – DURÉE ET HORAIRES DE TRAVAIL</div>
      <p>Le Salarié travaillera <strong>{{heures}}</strong> heures par semaine, soit un total de <strong>{{heuresTexte}}</strong> heures par mois, selon un planning communiqué 15 jours à l'avance, modulable en fonction des besoins du service. L'Employeur pourra modifier les horaires dans le respect d'un préavis de 7 jours, sauf urgence ou remplacement de dernière minute.</p>
    </div>

    <hr>

    <div class="section">
      <div class="section-title">ARTICLE 6 – HEURES COMPLÉMENTAIRES</div>
      <p>Le Salarié accepte d'effectuer des heures complémentaires dans la limite du tiers du contrat hebdomadaire, rémunérées conformément à la législation.</p>
    </div>

    <hr>

    <div class="section">
      <div class="section-title">ARTICLE 7 – PÉRIODE D'ESSAI</div>
      <p>Une période d'essai de {{periodeEssaiTexte}} est prévue, soit du {{debut}} au {{finEssai}}. Toute suspension prolonge d'autant cette période. La rupture de la période d'essai respecte les délais de prévenance légaux.</p>
    </div>

    <hr>

    <div class="section">
      <div class="section-title">ARTICLE 8 – RÉMUNÉRATION</div>
      <p>Le Salarié percevra un salaire brut mensuel de :</p>
      <p><em>(Heures par mois × Taux horaire)</em> = <strong>{{taux}} €</strong>/h × <strong>{{heuresTexte}}</strong></p>
      <p>Soit un salaire brut mensuel de <strong>{{salaireBrut}} €</strong>.</p>
    </div>

    <hr>

    <div class="section">
      <div class="section-title">ARTICLE 9 – FORMATION & CLAUSE DE REMBOURSEMENT</div>
      <p>En cas de formation spécifique prise en charge par l'Employeur, le Salarié s'engage à rembourser l'intégralité des frais engagés s'il quitte volontairement son poste sans respecter son préavis contractuel ou s'absente de manière injustifiée.</p>
    </div>

    <hr>

    <div class="section">
      <div class="section-title">ARTICLE 10 – CONGÉS PAYÉS</div>
      <p>Le Salarié bénéficiera de 2,5 jours ouvrables de congés par mois de travail effectif. Les dates seront déterminées par l'Employeur selon les nécessités du service.</p>
    </div>

    <hr>

    <div class="section">
      <div class="section-title">ARTICLE 11 – PROTECTION SOCIALE</div>
      <p>Le Salarié cotisera aux organismes suivants :</p>
      <p>– Retraite complémentaire : Malakoff Humanis</p>
      <p>– Prévoyance : AG2R La Mondiale</p>
    </div>

    <hr>

    <div class="section">
      <div class="section-title">ARTICLE 12 – OBLIGATIONS DU SALARIÉ</div>
      <p>Le Salarié s'engage à :</p>
      <p>- respecter les consignes, procédures, horaires et normes d'hygiène ;</p>
      <p>- respecter la confidentialité des informations de l'entreprise ;</p>
      <p>- signaler toute absence ou retard dans les meilleurs délais ;</p>
      <p>- mettre à jour ses informations administratives ;</p>
      <p>- respecter strictement le règlement intérieur fourni et signé en annexe</p>
    </div>

    <hr>

    <div class="section">
      <div class="section-title">ARTICLE 13 – CLAUSE DE NON-CONCURRENCE</div>
      <p>Aucune clause de non-concurrence n'est prévue dans ce contrat.</p>
    </div>

    <hr>

    <div class="section">
      <div class="section-title">ARTICLE 14 – RUPTURE ANTICIPÉE</div>
      <p>Le contrat pourra être rompu avant son terme uniquement selon les cas prévus par la loi.</p>
    </div>

    <hr>

    <div class="signature-block">
      <p>Fait à La Destrousse, le <strong>{{signature}}</strong>,</p>
      <p class="small-gap">En double exemplaire, dont un remis au Salarié.</p>

      <div class="signature-row">
        <div class="signature-col">
          <p><strong>Signature du Salarié</strong></p>
          <p class="small-gap">(précédée de la mention manuscrite « Lu et approuvé »)</p>
          <div class="signature-box"></div>
        </div>
        <div class="signature-col">
          <p><strong>Signature de l'Employeur</strong></p>
          <p class="small-gap">Monsieur Rémy GIROZ ou Monsieur Rodrigo</p>
          <div class="signature-box"></div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`;

const getCDDTPTemplate = () => cddTemplate.replace('{{TYPE_TRAVAIL}}', 'TEMPS PARTIEL');
const getCDDTCTemplate = () => cddTemplate.replace('{{TYPE_TRAVAIL}}', 'TEMPS COMPLET');

const cdiTemplate = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <style>${getBaseStyles()}</style>
</head>
<body>
  <div class="contract">
    <h1>CONTRAT DE TRAVAIL À DURÉE INDÉTERMINÉE – {{TYPE_TRAVAIL}}</h1>
    <p class="block">CONFORME À LA CONVENTION COLLECTIVE DE LA RESTAURATION RAPIDE</p>

    <p class="block"><strong>ENTRE LES SOUSSIGNÉS :</strong></p>

    <p class="block"><strong>SARL FRENCHY SUSHI</strong><br>
    101 Quartier Souque Nègre – 13112 LA DESTROUSSE<br>
    SIRET : 795 143 676 00018 – Code NAF : 5610C<br>
    URSSAF : 20 Avenue Viton – 13299 MARSEILLE CEDEX 20<br>
    Représentée par Monsieur Rémy GIROZ, en qualité de Gérant,<br>
    Ci-après dénommée « l'Employeur »,</p>

    <p class="block"><strong>ET :</strong></p>

    <p class="block">{{prenom}} {{nom}}<br>
    Né(e) le {{naissance}} à {{lieuNaissance}},<br>
    Domicilié(e) : {{adresse}}<br>
    Nationalité : {{nationalite}}<br>
    N° de Sécurité Sociale : {{secu}}<br>
    Ci-après dénommé(e) « le Salarié »,</p>

    <hr>

    <div class="section">
      <div class="section-title">ARTICLE 1 – OBJET</div>
      <p>Le présent contrat est conclu à durée indéterminée, à compter du <strong>{{debut}}</strong>, en vertu du Code du travail et de la convention collective de la restauration rapide.</p>
    </div>

    <hr>

    <div class="section">
      <div class="section-title">ARTICLE 2 – EMPLOI ET QUALIFICATION</div>
      <p>Le Salarié est engagé en qualité de <strong>{{poste}}</strong>, niveau I, échelon 1, statut non cadre. Ses missions principales sont notamment :</p>
      <p>{{taches}}</p>
      <p>Cette liste est non exhaustive et pourra être modifiée par Monsieur Sébastien RODRIGO et/ou Monsieur Rémy GIROZ.</p>
    </div>

    <hr>

    <div class="section">
      <div class="section-title">ARTICLE 3 – LIEU DE TRAVAIL</div>
      <p>Le lieu principal d'exercice est fixé au siège de l'entreprise. L'Employeur se réserve la possibilité de muter le Salarié dans tout établissement situé dans un rayon de 20 km, sans modification substantielle du contrat.</p>
    </div>

    <hr>

    <div class="section">
      <div class="section-title">ARTICLE 4 – DURÉE ET HORAIRES DE TRAVAIL</div>
      <p>Le Salarié travaillera <strong>{{heures}}</strong> heures par semaine, soit un total de <strong>{{heuresTexte}}</strong> heures par mois, selon un planning communiqué 15 jours à l'avance, modulable en fonction des besoins du service. L'Employeur pourra modifier les horaires dans le respect d'un préavis de 7 jours, sauf urgence ou remplacement de dernière minute.</p>
    </div>

    <hr>

    <div class="section">
      <div class="section-title">ARTICLE 5 – HEURES COMPLÉMENTAIRES</div>
      <p>Le Salarié accepte d'effectuer des heures complémentaires dans la limite du tiers du contrat hebdomadaire, rémunérées conformément à la législation.</p>
    </div>

    <hr>

    <div class="section">
      <div class="section-title">ARTICLE 6 – PÉRIODE D'ESSAI</div>
      <p>Une période d'essai de {{periodeEssaiTexte}} est prévue. Toute suspension prolonge d'autant cette période. La rupture de la période d'essai respecte les délais de prévenance légaux.</p>
    </div>

    <hr>

    <div class="section">
      <div class="section-title">ARTICLE 7 – RÉMUNÉRATION</div>
      <p>Le Salarié percevra un salaire brut mensuel de :</p>
      <p><em>(Heures par mois × Taux horaire)</em> = <strong>{{taux}} €</strong>/h × <strong>{{heuresTexte}}</strong></p>
      <p>Soit un salaire brut mensuel de <strong>{{salaireBrut}} €</strong>.</p>
    </div>

    <hr>

    <div class="section">
      <div class="section-title">ARTICLE 8 – FORMATION & CLAUSE DE REMBOURSEMENT</div>
      <p>En cas de formation spécifique prise en charge par l'Employeur, le Salarié s'engage à rembourser l'intégralité des frais engagés s'il quitte volontairement son poste sans respecter son préavis contractuel ou s'absente de manière injustifiée.</p>
    </div>

    <hr>

    <div class="section">
      <div class="section-title">ARTICLE 9 – CONGÉS PAYÉS</div>
      <p>Le Salarié bénéficiera de 2,5 jours ouvrables de congés par mois de travail effectif. Les dates seront déterminées par l'Employeur selon les nécessités du service.</p>
    </div>

    <hr>

    <div class="section">
      <div class="section-title">ARTICLE 10 – PROTECTION SOCIALE</div>
      <p>Le Salarié cotisera aux organismes suivants :</p>
      <p>– Retraite complémentaire : Malakoff Humanis</p>
      <p>– Prévoyance : AG2R La Mondiale</p>
    </div>

    <hr>

    <div class="section">
      <div class="section-title">ARTICLE 11 – OBLIGATIONS DU SALARIÉ</div>
      <p>Le Salarié s'engage à :</p>
      <p>- respecter les consignes, procédures, horaires et normes d'hygiène ;</p>
      <p>- respecter la confidentialité des informations de l'entreprise ;</p>
      <p>- signaler toute absence ou retard dans les meilleurs délais ;</p>
      <p>- mettre à jour ses informations administratives ;</p>
      <p>- respecter strictement le règlement intérieur fourni et signé en annexe</p>
    </div>

    <hr>

    <div class="section">
      <div class="section-title">ARTICLE 12 – CLAUSE DE NON-CONCURRENCE</div>
      <p>Aucune clause de non-concurrence n'est prévue dans ce contrat.</p>
    </div>

    <hr>

    <div class="section">
      <div class="section-title">ARTICLE 13 – RUPTURE ANTICIPÉE</div>
      <p>Le contrat pourra être rompu avant son terme selon les conditions prévues par la loi et la convention collective.</p>
    </div>

    <hr>

    <div class="signature-block">
      <p>Fait à La Destrousse, le <strong>{{signature}}</strong>,</p>
      <p class="small-gap">En double exemplaire, dont un remis au Salarié.</p>

      <div class="signature-row">
        <div class="signature-col">
          <p><strong>Signature du Salarié</strong></p>
          <p class="small-gap">(précédée de la mention manuscrite « Lu et approuvé »)</p>
          <div class="signature-box"></div>
        </div>
        <div class="signature-col">
          <p><strong>Signature de l'Employeur</strong></p>
          <p class="small-gap">Monsieur Rémy GIROZ ou Monsieur Rodrigo</p>
          <div class="signature-box"></div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`;

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

    // Vérifier que le template a un contenu HTML
    if (!template.htmlContent) {
      return Response.json({ 
        error: 'Template HTML content is missing. Please edit the template and add HTML content.' 
      }, { status: 400 });
    }

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
      motifCDD: motifCDD,
      signature: formatDateFR(new Date())
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