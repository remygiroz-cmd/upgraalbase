// Validation RH V2 - Par catégorie de document
import { getStaticEstablishmentVariables } from './EstablishmentVariablesGenerator';

// Catégories et leurs règles de validation
export const CATEGORIES = {
  A_CONTRACTUEL: {
    label: 'Documents contractuels',
    description: 'CDD, CDI, Avenants - Validation maximale',
    validationLevel: 'BLOQUANT',
    icon: '🔒'
  },
  B_DISCIPLINAIRE: {
    label: 'Documents disciplinaires',
    description: 'Avertissement, Convocation, Sanction',
    validationLevel: 'GUIDÉ',
    icon: '⚠️'
  },
  C_RUPTURE: {
    label: 'Rupture / Fin de contrat',
    description: 'Licenciement, Fin CDD, Rupture période d\'essai',
    validationLevel: 'GUIDÉ',
    icon: '📋'
  },
  D_ADMINISTRATIF: {
    label: 'Documents administratifs',
    description: 'Attestations, Courriers RH',
    validationLevel: 'SOUPLE',
    icon: '📄'
  },
  E_LIBRE: {
    label: 'Documents libres',
    description: 'Lettre libre, Note interne',
    validationLevel: 'MINIMAL',
    icon: '✍️'
  }
};

// Variables par catégorie
export const VARIABLES_BY_CATEGORY = {
  // Variables communes à tous - INCLUANT TOUTES les variables d'établissement dynamiquement
  COMMON: [
    ...getStaticEstablishmentVariables(), // Toutes les variables d'établissement
    { var: '{{prenom}}', label: 'Prénom du salarié' },
    { var: '{{nom}}', label: 'Nom du salarié' },
    { var: '{{signature}}', label: 'Date de signature' }
  ],

  // Variables contractuelles (A)
  CONTRACTUEL: [
    { var: '{{poste}}', label: 'Intitulé du poste' },
    { var: '{{taches}}', label: 'Description des tâches' },
    { var: '{{debut}}', label: 'Date de début' },
    { var: '{{fin}}', label: 'Date de fin (CDD)' },
    { var: '{{motifCDD}}', label: 'Motif du CDD' },
    { var: '{{heures}}', label: 'Heures hebdomadaires' },
    { var: '{{taux}}', label: 'Taux horaire' },
    { var: '{{salaireBrut}}', label: 'Salaire brut' },
    { var: '{{periodeEssaiTexte}}', label: 'Période d\'essai' },
    { var: '{{secu}}', label: 'Numéro de sécurité sociale' }
  ],

  // Variables pour avenants
  AVENANT: [
    { var: '{{dateEffet}}', label: 'Date d\'effet de la modification' },
    { var: '{{ancienneValeur}}', label: 'Ancienne valeur' },
    { var: '{{nouvelleValeur}}', label: 'Nouvelle valeur' },
    { var: '{{motifModification}}', label: 'Motif de la modification' }
  ],

  // Variables disciplinaires (B)
  DISCIPLINAIRE: [
    { var: '{{dateFaits}}', label: 'Date des faits' },
    { var: '{{descriptionFaits}}', label: 'Description des faits' },
    { var: '{{dateIncident}}', label: 'Date de l\'incident' },
    { var: '{{dateNotification}}', label: 'Date de notification' },
    { var: '{{dateConvocation}}', label: 'Date de convocation' },
    { var: '{{lieuConvocation}}', label: 'Lieu de convocation' },
    { var: '{{heureConvocation}}', label: 'Heure de convocation' }
  ],

  // Variables rupture (C)
  RUPTURE: [
    { var: '{{dateRupture}}', label: 'Date de rupture' },
    { var: '{{motifRupture}}', label: 'Motif de rupture' },
    { var: '{{dateFinContrat}}', label: 'Date de fin de contrat' },
    { var: '{{indemnitePreavis}}', label: 'Indemnité de préavis' },
    { var: '{{indemniteRupture}}', label: 'Indemnité de rupture' }
  ],

  // Variables administratives (D)
  ADMINISTRATIF: [
    { var: '{{dateDebutContrat}}', label: 'Date de début de contrat' },
    { var: '{{dateFinContrat}}', label: 'Date de fin de contrat' },
    { var: '{{fonctionOccupee}}', label: 'Fonction occupée' },
    { var: '{{periodeAttestation}}', label: 'Période couverte' },
    { var: '{{natureAttestation}}', label: 'Nature de l\'attestation' }
  ]
};

// Variables obligatoires par type de document
export const REQUIRED_VARIABLES_BY_TYPE = {
  // Catégorie A - Validation maximale
  CDD: [
    { var: '{{etablissementNom}}', label: 'Nom de l\'établissement' },
    { var: '{{etablissementSiret}}', label: 'SIRET' },
    { var: '{{prenom}}', label: 'Prénom' },
    { var: '{{nom}}', label: 'Nom' },
    { var: '{{naissance}}', label: 'Date de naissance' },
    { var: '{{adresse}}', label: 'Adresse' },
    { var: '{{poste}}', label: 'Poste' },
    { var: '{{debut}}', label: 'Date de début' },
    { var: '{{fin}}', label: 'Date de fin' },
    { var: '{{motifCDD}}', label: 'Motif du CDD' },
    { var: '{{heures}}', label: 'Heures hebdomadaires' },
    { var: '{{taux}}', label: 'Taux horaire' }
  ],
  CDI: [
    { var: '{{etablissementNom}}', label: 'Nom de l\'établissement' },
    { var: '{{etablissementSiret}}', label: 'SIRET' },
    { var: '{{prenom}}', label: 'Prénom' },
    { var: '{{nom}}', label: 'Nom' },
    { var: '{{naissance}}', label: 'Date de naissance' },
    { var: '{{adresse}}', label: 'Adresse' },
    { var: '{{poste}}', label: 'Poste' },
    { var: '{{debut}}', label: 'Date de début' },
    { var: '{{heures}}', label: 'Heures hebdomadaires' },
    { var: '{{taux}}', label: 'Taux horaire' }
  ],
  AVENANT: [
    { var: '{{prenom}}', label: 'Prénom' },
    { var: '{{nom}}', label: 'Nom' },
    { var: '{{dateEffet}}', label: 'Date d\'effet' },
    { var: '{{motifModification}}', label: 'Motif de modification' }
  ],

  // Catégorie B - Validation guidée
  AVERTISSEMENT: [
    { var: '{{prenom}}', label: 'Prénom' },
    { var: '{{nom}}', label: 'Nom' },
    { var: '{{dateFaits}}', label: 'Date des faits' },
    { var: '{{descriptionFaits}}', label: 'Description des faits' }
  ],
  CONVOCATION: [
    { var: '{{prenom}}', label: 'Prénom' },
    { var: '{{nom}}', label: 'Nom' },
    { var: '{{dateConvocation}}', label: 'Date de convocation' },
    { var: '{{lieuConvocation}}', label: 'Lieu' },
    { var: '{{heureConvocation}}', label: 'Heure' }
  ],

  // Catégorie C - Validation guidée
  LICENCIEMENT: [
    { var: '{{prenom}}', label: 'Prénom' },
    { var: '{{nom}}', label: 'Nom' },
    { var: '{{dateRupture}}', label: 'Date de rupture' },
    { var: '{{motifRupture}}', label: 'Motif' }
  ],

  // Catégorie D - Validation souple
  ATTESTATION: [
    { var: '{{prenom}}', label: 'Prénom' },
    { var: '{{nom}}', label: 'Nom' },
    { var: '{{natureAttestation}}', label: 'Nature de l\'attestation' }
  ],

  // Catégorie E - Validation minimale
  LETTRE_LIBRE: [],
  NOTE_INTERNE: []
};

// Variables interdites (par type de document)
export const FORBIDDEN_VARIABLES_BY_TYPE = {
  CDI: [
    { var: '{{fin}}', label: 'Date de fin', reason: 'Un CDI n\'a pas de date de fin' },
    { var: '{{motifCDD}}', label: 'Motif du CDD', reason: 'Ne concerne que les CDD' }
  ],
  CDD: [],
  AVENANT: [
    { var: '{{motifCDD}}', label: 'Motif du CDD', reason: 'Un avenant ne redéfinit pas le motif initial' }
  ],
  AVERTISSEMENT: [
    { var: '{{taux}}', label: 'Taux horaire', reason: 'Information non pertinente dans un avertissement' },
    { var: '{{salaireBrut}}', label: 'Salaire', reason: 'Information non pertinente dans un avertissement' }
  ],
  ATTESTATION: [],
  LETTRE_LIBRE: [],
  NOTE_INTERNE: []
};

// Fonction de validation V2 - Par catégorie
export function validateTemplateV2(htmlContent, typeDocument, categorieDocument) {
  const errors = [];
  const warnings = [];
  const missing = [];

  if (!htmlContent) {
    errors.push('Le contenu du template est vide');
    return { errors, warnings, missing };
  }

  // Récupérer le niveau de validation selon la catégorie
  const category = CATEGORIES[categorieDocument];
  const validationLevel = category?.validationLevel || 'MINIMAL';

  // Validation selon le niveau
  if (validationLevel === 'BLOQUANT') {
    // Catégorie A : Validation maximale (comme avant pour contrats)
    const required = REQUIRED_VARIABLES_BY_TYPE[typeDocument] || [];
    required.forEach(item => {
      if (!htmlContent.includes(item.var)) {
        missing.push(`${item.label} (${item.var}) - OBLIGATOIRE pour un ${typeDocument}`);
      }
    });

    const forbidden = FORBIDDEN_VARIABLES_BY_TYPE[typeDocument] || [];
    forbidden.forEach(item => {
      if (htmlContent.includes(item.var)) {
        errors.push(`${item.label} (${item.var}) - ${item.reason}`);
      }
    });

    // Vérification de longueur minimale
    const textContent = htmlContent.replace(/<[^>]*>/g, '').trim();
    if (textContent.length < 200) {
      errors.push('Le contenu est trop court pour un document contractuel (minimum 200 caractères)');
    }

  } else if (validationLevel === 'GUIDÉ') {
    // Catégorie B, C : Validation souple, avertissements uniquement
    const required = REQUIRED_VARIABLES_BY_TYPE[typeDocument] || [];
    required.forEach(item => {
      if (!htmlContent.includes(item.var)) {
        warnings.push(`${item.label} (${item.var}) - Recommandé pour un ${typeDocument}`);
      }
    });

    // Vérification de longueur minimale (warning)
    const textContent = htmlContent.replace(/<[^>]*>/g, '').trim();
    if (textContent.length < 100) {
      warnings.push('Le document est court. Assurez-vous d\'inclure toutes les informations nécessaires.');
    }

  } else if (validationLevel === 'SOUPLE') {
    // Catégorie D : Validation très souple
    const textContent = htmlContent.replace(/<[^>]*>/g, '').trim();
    if (textContent.length < 50) {
      warnings.push('Le document semble incomplet.');
    }

  } else if (validationLevel === 'MINIMAL') {
    // Catégorie E : Validation minimale
    const textContent = htmlContent.replace(/<[^>]*>/g, '').trim();
    if (textContent.length < 10) {
      errors.push('Le document doit contenir du texte.');
    }
  }

  return { errors, warnings, missing };
}

// Guides de création par catégorie
export function getCreationGuideV2(typeDocument, categorieDocument) {
  const category = CATEGORIES[categorieDocument];

  const guides = {
    CDD: {
      title: '📋 Guide de création d\'un CDD',
      checklist: [
        'Identité complète du salarié (nom, prénom, date et lieu de naissance)',
        'Qualification/poste occupé avec description précise des tâches',
        'Date de début et date de fin du contrat',
        'Motif précis et juridiquement valable du recours au CDD (article L.1242-2)',
        'Horaires de travail et durée hebdomadaire ou mensuelle',
        'Rémunération détaillée (taux horaire brut et/ou salaire mensuel brut)',
        'Période d\'essai calculée (1 jour ouvré par semaine de contrat, maximum 21 jours)',
        'Convention collective applicable (restauration rapide, hôtellerie...)',
        'Coordonnées complètes de l\'établissement (SIRET, adresse)',
        'Lieu de travail précis'
      ],
      legalNotes: [
        '⚖️ Le motif du CDD doit être conforme à l\'article L.1242-2 du Code du travail (remplacement, accroissement d\'activité, emploi saisonnier...)',
        '📅 La durée maximale d\'un CDD est de 18 mois renouvellements inclus (sauf cas particuliers)',
        '⏱️ La période d\'essai CDD : 1 jour ouvré par semaine de contrat (max 21 jours pour un contrat > 21 semaines)',
        '🔁 Le renouvellement du CDD nécessite un avenant signé avant la fin du contrat initial',
        '💶 La rémunération ne peut être inférieure au SMIC ni au minimum conventionnel pour le poste',
        '📋 Le CDD doit être remis au salarié au plus tard dans les 2 jours ouvrables suivant l\'embauche'
      ]
    },
    CDI: {
      title: '📋 Guide de création d\'un CDI',
      checklist: [
        'Identité complète du salarié (état civil, date et lieu de naissance)',
        'Qualification précise et intitulé du poste occupé',
        'Description détaillée des tâches et responsabilités',
        'Date de début d\'exécution du contrat',
        'Horaires de travail et durée hebdomadaire/mensuelle',
        'Rémunération (taux horaire brut et/ou salaire mensuel brut)',
        'Période d\'essai applicable selon la qualification (2 à 4 mois selon convention)',
        'Convention collective applicable',
        'Lieu de travail principal',
        'Coordonnées complètes de l\'établissement (SIRET, adresse)'
      ],
      legalNotes: [
        '✅ Le CDI est la forme normale et générale de la relation de travail',
        '⏱️ Période d\'essai CDI : 2 mois (employé), 3 mois (agent de maîtrise), 4 mois (cadre)',
        '🔁 La période d\'essai peut être renouvelée UNE FOIS si la convention collective le prévoit',
        '❌ Pas de date de fin : un CDI n\'a pas de terme prévu',
        '📝 Le contrat peut être écrit ou verbal, mais l\'écrit est vivement recommandé',
        '💶 La rémunération doit respecter le SMIC et les minimas conventionnels',
        '🔒 La rupture du CDI obéit à des règles strictes (démission, licenciement, rupture conventionnelle)'
      ]
    },
    AVENANT: {
      title: '📋 Guide de création d\'un Avenant',
      checklist: [
        'Référence claire au contrat de travail initial (date de signature)',
        'Date d\'effet précise de la modification contractuelle',
        'Nature exacte de la modification (poste, salaire, horaires, lieu, durée...)',
        'Ancienne disposition contractuelle (clause actuelle)',
        'Nouvelle disposition contractuelle (clause modifiée)',
        'Motif détaillé et contexte de la modification',
        'Maintien explicite des autres clauses du contrat initial',
        'Espace pour signatures des deux parties (employeur + salarié)',
        'Date de signature de l\'avenant'
      ],
      legalNotes: [
        '⚖️ Un avenant modifie un élément ESSENTIEL du contrat de travail',
        '✍️ Il nécessite OBLIGATOIREMENT l\'accord écrit et signé des DEUX parties',
        '🔒 Sans accord du salarié, l\'employeur ne peut pas imposer la modification',
        '📋 Éléments essentiels nécessitant avenant : rémunération, qualification, durée du travail, lieu de travail',
        '⚠️ Un refus du salarié ne constitue pas une faute et ne justifie pas un licenciement pour cause réelle et sérieuse',
        '📅 L\'avenant doit être daté et signé AVANT la date d\'effet de la modification',
        '💼 Conservez toujours un exemplaire original signé par les deux parties'
      ]
    },
    AVERTISSEMENT: {
      title: '⚠️ Guide de création d\'un Avertissement',
      checklist: [
        'Date précise et circonstanciée des faits reprochés',
        'Description factuelle, objective et détaillée des manquements',
        'Qualification juridique du manquement (retard, absence, insubordination...)',
        'Rappel des règles, obligations ou procédures non respectées',
        'Mention explicite qu\'il s\'agit d\'un avertissement (sanction disciplinaire)',
        'Mise en garde sur les conséquences en cas de récidive',
        'Date de notification au salarié',
        'Espace pour émargement ou signature du salarié (accusé de réception)'
      ],
      legalNotes: [
        '⚖️ L\'avertissement est une sanction disciplinaire mineure inscrite au dossier',
        '⏱️ Il doit être notifié dans les 2 MOIS suivant la connaissance des faits par l\'employeur',
        '❌ Pas d\'entretien préalable obligatoire pour un simple avertissement',
        '📝 Restez FACTUEL : dates, heures, lieux, témoins, faits observables uniquement',
        '🔒 Interdiction de sanctionner deux fois les mêmes faits',
        '⚠️ Ne JAMAIS mélanger avertissement et motif de rupture de contrat',
        '📋 Conservez une preuve de remise (signature, recommandé AR, remise en main propre contre décharge)',
        '💼 L\'avertissement peut être contesté par le salarié devant le conseil de prud\'hommes'
      ]
    },
    CONVOCATION: {
      title: '📩 Guide de création d\'une Convocation à entretien préalable',
      checklist: [
        'Identité complète du salarié convoqué',
        'Date, heure et lieu précis de l\'entretien',
        'Objet de la convocation (entretien préalable à sanction ou licenciement)',
        'Mention du droit d\'être assisté (par une personne de l\'entreprise ou conseiller extérieur)',
        'Coordonnées du conseiller du salarié si nécessaire (liste disponible en mairie/inspection du travail)',
        'Délai de convocation respecté (minimum 5 jours ouvrables)',
        'Mode de notification (recommandé AR ou remise en main propre)',
        'Signature de l\'employeur ou du responsable'
      ],
      legalNotes: [
        '⚖️ Obligation légale avant toute sanction lourde (mise à pied, rétrogradation) ou licenciement',
        '📅 Délai minimum de convocation : 5 jours ouvrables entre la réception et la date de l\'entretien',
        '👤 Le salarié a le DROIT d\'être assisté par une personne de son choix appartenant à l\'entreprise',
        '🏢 En l\'absence de représentants du personnel, le salarié peut se faire assister par un conseiller extérieur',
        '📋 La convocation doit préciser l\'OBJET de l\'entretien (sanction disciplinaire ou licenciement)',
        '❌ L\'absence de convocation ou le non-respect du délai rend la procédure irrégulière',
        '⚠️ Ne PAS indiquer les faits reprochés dans la convocation, uniquement l\'objet',
        '💼 Mode de notification recommandé : lettre recommandée avec accusé de réception'
      ]
    },
    SANCTION: {
      title: '⚠️ Guide de création d\'une Lettre de sanction disciplinaire',
      checklist: [
        'Référence à l\'entretien préalable (date et compte-rendu)',
        'Description précise et factuelle des faits reprochés',
        'Qualification juridique du manquement (faute, manquement aux obligations...)',
        'Nature et étendue de la sanction prononcée (mise à pied, rétrogradation...)',
        'Durée de la sanction (si applicable, ex : mise à pied de X jours)',
        'Date d\'effet de la sanction',
        'Mention du droit de recours et voies de contestation',
        'Signature de l\'employeur'
      ],
      legalNotes: [
        '⚖️ La sanction doit être proportionnée à la gravité des faits',
        '⏱️ La notification doit intervenir dans un délai de 1 MOIS après l\'entretien préalable',
        '❌ Délai de prescription : 2 mois maximum entre la connaissance des faits et l\'entretien préalable',
        '📋 Sanctions possibles : blâme, mise à pied disciplinaire, rétrogradation, mutation, licenciement',
        '🔒 Les sanctions pécuniaires (amendes) sont INTERDITES',
        '⚠️ Ne PAS sanctionner deux fois les mêmes faits (principe « non bis in idem »)',
        '💼 La sanction doit être motivée et précise, avec référence aux faits concrets',
        '📝 Le salarié peut contester la sanction devant le conseil de prud\'hommes sous 2 ans'
      ]
    },
    LICENCIEMENT: {
      title: '📋 Guide de création d\'une Lettre de licenciement',
      checklist: [
        'Référence à l\'entretien préalable (date et compte-rendu)',
        'Motif précis, détaillé et circonstancié du licenciement',
        'Qualification juridique (faute grave, cause réelle et sérieuse, motif économique...)',
        'Date de notification et date de fin du contrat',
        'Préavis applicable ou dispense (avec maintien ou non de la rémunération)',
        'Indemnités dues : indemnité de licenciement, compensatrice de congés payés...',
        'Documents remis (certificat de travail, attestation Pôle Emploi, solde de tout compte)',
        'Modalités de restitution (clés, badge, matériel...)',
        'Signature de l\'employeur'
      ],
      legalNotes: [
        '⚖️ Le licenciement doit reposer sur une cause réelle et sérieuse (faits précis, vérifiables, suffisamment graves)',
        '⏱️ Délai de notification : minimum 2 jours ouvrables après l\'entretien (employé/ouvrier) ou 15 jours (cadre)',
        '📝 La lettre de licenciement FIXE les limites du litige : impossible d\'ajouter des motifs ultérieurement',
        '💶 Indemnité légale de licenciement : 1/4 de mois par année (< 10 ans), puis 1/3 (≥ 10 ans)',
        '⏳ Préavis légal : 1 mois (< 2 ans d\'ancienneté), 2 mois (≥ 2 ans) - peut être plus selon convention',
        '❌ Faute grave = pas d\'indemnité de licenciement ni de préavis',
        '🔒 Motifs interdits : état de santé, grossesse, exercice d\'un droit (grève, représentation...)',
        '📋 Documents obligatoires à remettre : certificat de travail, attestation Pôle Emploi, reçu pour solde de tout compte'
      ]
    },
    FIN_CDD: {
      title: '📋 Guide de création d\'une Notification de fin de CDD',
      checklist: [
        'Référence au contrat CDD initial (date de signature)',
        'Rappel de la date de fin prévue au contrat',
        'Confirmation de la non-reconduction du contrat',
        'Date effective de fin de la relation de travail',
        'Indemnité de précarité due (10% de la rémunération brute totale)',
        'Indemnité compensatrice de congés payés si applicable',
        'Documents remis (certificat de travail, attestation Pôle Emploi, solde de tout compte)',
        'Modalités de restitution du matériel et équipements',
        'Remerciements pour la collaboration (optionnel mais recommandé)'
      ],
      legalNotes: [
        '⚖️ À l\'arrivée du terme, le CDD prend fin AUTOMATIQUEMENT, sans formalité particulière',
        '💶 Indemnité de fin de contrat (précarité) : 10% de la rémunération brute totale (sauf CDD saisonnier ou jeune en formation)',
        '📅 Pas de préavis en fin de CDD, sauf accord des parties ou rupture anticipée',
        '❌ L\'employeur ne peut pas rompre le CDD avant son terme (sauf faute grave, force majeure, accord des parties)',
        '🔁 Proposer un CDI après le CDD évite le paiement de l\'indemnité de précarité',
        '📋 Documents obligatoires à remettre : certificat de travail, attestation Pôle Emploi, solde de tout compte',
        '⚠️ Délai de carence avant nouveau CDD sur le même poste : durée du contrat / 2 (sauf exceptions)',
        '💼 Le non-respect du terme peut requalifier le CDD en CDI'
      ]
    },
    RUPTURE_ESSAI: {
      title: '📋 Guide de création d\'une Notification de rupture période d\'essai',
      checklist: [
        'Référence au contrat de travail et à la période d\'essai',
        'Date de notification de la rupture',
        'Date effective de fin de la période d\'essai',
        'Délai de prévenance respecté (selon ancienneté)',
        'Motif succinct de la rupture (optionnel mais recommandé)',
        'Éléments de rémunération dus jusqu\'à la date de fin',
        'Documents remis (certificat de travail, attestation Pôle Emploi)',
        'Modalités de restitution (matériel, badge, clés...)',
        'Signature de l\'employeur'
      ],
      legalNotes: [
        '⚖️ Pendant la période d\'essai, chaque partie peut rompre LIBREMENT le contrat',
        '⏱️ Délai de prévenance employeur : 24h (< 8 jours), 48h (8j-1mois), 2 sem (> 1 mois), 1 mois (> 3 mois)',
        '⏳ Délai de prévenance salarié : 24h (< 8 jours), 48h (après 8 jours de présence)',
        '❌ La rupture ne doit PAS être abusive (discrimination, harcèlement) ni liée à l\'état de santé ou grossesse',
        '💶 Aucune indemnité due (ni licenciement, ni précarité), sauf salaire et congés prorata',
        '📝 Aucune obligation de motiver la rupture, mais un motif succinct évite les contestations',
        '📋 Documents à remettre : certificat de travail, attestation Pôle Emploi (si > 4 mois d\'ancienneté)',
        '⚠️ Le non-respect du délai de prévenance = indemnité compensatrice due au salarié'
      ]
    },
    ATTESTATION: {
      title: '📄 Guide de création d\'une Attestation',
      checklist: [
        'Nature précise de l\'attestation (emploi, salaire, présence, formation...)',
        'Identité complète du salarié concerné',
        'Période couverte par l\'attestation (du... au...)',
        'Informations attestées de manière factuelle et vérifiable',
        'Fonction occupée et caractéristiques du poste',
        'Établissement émetteur (nom, SIRET, adresse)',
        'Date de délivrance de l\'attestation',
        'Signature et cachet de l\'employeur ou du responsable RH',
        'Mention "délivrée pour valoir ce que de droit" (si applicable)'
      ],
      legalNotes: [
        '✅ Une attestation doit être strictement FACTUELLE et EXACTE',
        '📝 Ne jamais inclure d\'appréciations subjectives, opinions ou jugements de valeur',
        '🔒 Respectez la confidentialité : pas de données sensibles (santé, opinions, données bancaires complètes)',
        '⚖️ L\'employeur est légalement tenu de fournir certaines attestations (certificat de travail, attestation Pôle Emploi)',
        '💼 L\'attestation engage la responsabilité de l\'employeur : en cas de fausse attestation, sanctions pénales possibles',
        '📋 Finalités courantes : démarches administratives, dossiers bancaires, recherche de logement, constitution de dossier',
        '⚠️ Refuser une attestation demandée peut constituer un délit d\'entrave si elle est légalement due',
        '🖊️ Toujours dater, signer et apposer le cachet de l\'entreprise pour validation'
      ]
    },
    COURRIER_RH: {
      title: '📨 Guide de création d\'un Courrier RH',
      checklist: [
        'Objet clair et précis du courrier',
        'Identité du destinataire (salarié, organisme...)',
        'Contexte et motif du courrier',
        'Informations détaillées selon l\'objet',
        'Actions attendues ou démarches à effectuer',
        'Délai de réponse ou d\'action (si applicable)',
        'Coordonnées de contact pour toute question',
        'Signature et cachet de l\'établissement'
      ],
      legalNotes: [
        '📝 Restez professionnel, courtois et factuel dans la rédaction',
        '📋 Conservez une copie de tout courrier envoyé pour traçabilité',
        '⚖️ Certains courriers ont une valeur juridique : respectez les formes et délais légaux',
        '💼 Pour les courriers importants, privilégiez l\'envoi en recommandé avec AR'
      ]
    },
    DEMISSION: {
      title: '📝 Guide de création d\'une Lettre de démission',
      checklist: [
        'Identité et coordonnées du salarié démissionnaire',
        'Date de rédaction de la lettre',
        'Destinataire (employeur, responsable RH)',
        'Mention claire et non équivoque de la démission',
        'Date de départ souhaitée (après respect du préavis)',
        'Durée du préavis applicable selon le contrat ou la convention',
        'Motif de la démission (facultatif, mais peut être apprécié)',
        'Demande éventuelle de dispense de préavis',
        'Formule de politesse',
        'Signature manuscrite du salarié'
      ],
      legalNotes: [
        '✍️ La démission est un acte UNILATÉRAL du salarié : il n\'a pas besoin de l\'accord de l\'employeur',
        '⚖️ Elle doit être CLAIRE, NON ÉQUIVOQUE et résulter d\'une volonté LIBRE et éclairée',
        '⏱️ Préavis légal variable selon ancienneté et convention collective (généralement 1 à 3 mois)',
        '🔒 Le préavis démarre à la réception de la lettre par l\'employeur (date de l\'AR recommandé)',
        '❌ L\'employeur PEUT refuser la dispense de préavis (négociation entre les parties)',
        '💶 Pas d\'indemnité de licenciement ni d\'allocation chômage (sauf cas particuliers : démission légitime)',
        '📋 Le salarié doit respecter son préavis ou payer une indemnité compensatrice',
        '📝 La démission peut être rétractée AVANT la fin du préavis si l\'employeur accepte',
        '⚠️ Une démission "forcée" peut être requalifiée en licenciement sans cause par les prud\'hommes'
      ]
    },
    LETTRE_LIBRE: {
      title: '✍️ Guide de création d\'une Lettre libre',
      checklist: [
        'Objet ou contexte de la lettre',
        'Destinataire identifié',
        'Contenu structuré et cohérent',
        'Ton adapté au contexte (formel, informel, neutre...)',
        'Informations complètes et claires',
        'Signature de l\'émetteur'
      ],
      legalNotes: [
        '📝 Une lettre libre n\'a pas de cadre juridique strict',
        '💼 Adaptez le ton et le formalisme selon le destinataire et l\'objectif',
        '⚠️ Même libre, restez professionnel et respectueux'
      ]
    },
    NOTE_INTERNE: {
      title: '📌 Guide de création d\'une Note interne',
      checklist: [
        'Objet clair de la note (information, directive, rappel...)',
        'Destinataires ciblés (équipe, service, tous les salariés...)',
        'Date de diffusion',
        'Contenu précis et structuré',
        'Actions attendues (si applicable)',
        'Personne référente ou contact pour questions',
        'Signature du responsable ou direction'
      ],
      legalNotes: [
        '📋 Une note interne sert à communiquer des informations, directives ou rappels au sein de l\'entreprise',
        '💼 Elle peut avoir une valeur contraignante si elle modifie les conditions de travail (dans ce cas, respecter la procédure légale)',
        '⚖️ Les notes de service doivent être portées à la connaissance des salariés (affichage, diffusion)',
        '⚠️ Une note interne ne peut pas modifier unilatéralement un élément essentiel du contrat de travail sans accord'
      ]
    }
  };

  return guides[typeDocument] || {
    title: `📋 Document ${typeDocument}`,
    checklist: ['Vérifiez les informations du salarié', 'Relisez attentivement le contenu'],
    legalNotes: ['Assurez-vous de la conformité légale du document']
  };
}