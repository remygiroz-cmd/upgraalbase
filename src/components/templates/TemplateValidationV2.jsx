// Validation RH V2 - Par catégorie de document

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
  // Variables communes à tous
  COMMON: [
    { var: '{{etablissementNom}}', label: 'Nom de l\'établissement' },
    { var: '{{etablissementAdresse}}', label: 'Adresse de l\'établissement' },
    { var: '{{responsableNom}}', label: 'Nom du responsable' },
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
        'Qualification/poste occupé',
        'Date de début et date de fin du contrat',
        'Motif précis du recours au CDD (article L.1242-2)',
        'Horaires de travail et durée hebdomadaire',
        'Rémunération (taux horaire ou salaire mensuel)',
        'Période d\'essai (1 jour ouvré par semaine, max 21 jours pour CDD)',
        'Convention collective applicable'
      ],
      legalNotes: [
        'Le motif du CDD doit être conforme à l\'article L.1242-2 du Code du travail',
        'La durée maximale d\'un CDD est de 18 mois renouvellements inclus',
        'La période d\'essai ne peut excéder 21 jours ouvrés'
      ]
    },
    CDI: {
      title: '📋 Guide de création d\'un CDI',
      checklist: [
        'Identité complète du salarié',
        'Qualification/poste',
        'Date de début',
        'Horaires et durée de travail',
        'Rémunération',
        'Période d\'essai (2 mois pour employés, 3 mois pour agents de maîtrise)',
        'Convention collective applicable'
      ],
      legalNotes: [
        'Pas de date de fin pour un CDI',
        'La période d\'essai peut être renouvelée une fois si la convention collective le prévoit'
      ]
    },
    AVENANT: {
      title: '📋 Guide de création d\'un Avenant',
      checklist: [
        'Référence au contrat initial',
        'Date d\'effet de la modification',
        'Nature précise de la modification (poste, salaire, horaires)',
        'Ancienne valeur et nouvelle valeur',
        'Motif de la modification',
        'Signatures des deux parties'
      ],
      legalNotes: [
        'Un avenant modifie un élément essentiel du contrat',
        'Il nécessite l\'accord des deux parties',
        'Conservez une copie signée par les deux parties'
      ]
    },
    AVERTISSEMENT: {
      title: '⚠️ Guide de création d\'un Avertissement',
      checklist: [
        'Date et description précise des faits reprochés',
        'Rappel des règles non respectées',
        'Avertissement sur les conséquences en cas de récidive',
        'Date de remise au salarié'
      ],
      legalNotes: [
        'L\'avertissement ne nécessite pas d\'entretien préalable',
        'Il doit être notifié dans les 2 mois suivant les faits',
        'Conservez une preuve de remise (signature ou AR)'
      ]
    },
    ATTESTATION: {
      title: '📄 Guide de création d\'une Attestation',
      checklist: [
        'Nature de l\'attestation (emploi, salaire, présence...)',
        'Identité du salarié',
        'Période couverte',
        'Informations attestées',
        'Signature et cachet de l\'employeur'
      ],
      legalNotes: [
        'Une attestation doit être factuelle et exacte',
        'Ne pas inclure d\'informations confidentielles'
      ]
    }
  };

  return guides[typeDocument] || {
    title: `📋 Document ${typeDocument}`,
    checklist: ['Vérifiez les informations du salarié', 'Relisez attentivement le contenu'],
    legalNotes: ['Assurez-vous de la conformité légale du document']
  };
}