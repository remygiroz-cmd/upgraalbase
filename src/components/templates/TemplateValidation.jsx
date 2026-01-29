// Système de validation juridique des templates

export const REQUIRED_VARIABLES_BY_TYPE = {
  CDD: [
    { var: '{{debut}}', label: 'Date de début du contrat' },
    { var: '{{fin}}', label: 'Date de fin du contrat' },
    { var: '{{motifCDD}}', label: 'Motif de recours au CDD' },
    { var: '{{prenom}}', label: 'Prénom du salarié' },
    { var: '{{nom}}', label: 'Nom du salarié' },
    { var: '{{poste}}', label: 'Intitulé du poste' },
    { var: '{{heures}}', label: 'Nombre d\'heures' },
    { var: '{{taux}}', label: 'Taux horaire' },
  ],
  CDI: [
    { var: '{{debut}}', label: 'Date de début du contrat' },
    { var: '{{prenom}}', label: 'Prénom du salarié' },
    { var: '{{nom}}', label: 'Nom du salarié' },
    { var: '{{poste}}', label: 'Intitulé du poste' },
    { var: '{{heures}}', label: 'Nombre d\'heures' },
    { var: '{{taux}}', label: 'Taux horaire' },
  ],
  AVENANT: [
    { var: '{{prenom}}', label: 'Prénom du salarié' },
    { var: '{{nom}}', label: 'Nom du salarié' },
  ]
};

export const FORBIDDEN_VARIABLES_BY_TYPE = {
  CDI: [
    { var: '{{fin}}', label: 'Date de fin de contrat', reason: 'Un CDI n\'a pas de date de fin' },
    { var: '{{motifCDD}}', label: 'Motif de recours au CDD', reason: 'Un CDI n\'a pas de motif de recours' },
  ],
  CDD: [],
  AVENANT: []
};

export const RECOMMENDED_VARIABLES = {
  CDD: [
    { var: '{{periodeEssaiTexte}}', label: 'Durée de la période d\'essai' },
    { var: '{{salaireBrut}}', label: 'Salaire brut mensuel' },
    { var: '{{adresse}}', label: 'Adresse du salarié' },
    { var: '{{naissance}}', label: 'Date de naissance' },
  ],
  CDI: [
    { var: '{{periodeEssaiTexte}}', label: 'Durée de la période d\'essai' },
    { var: '{{salaireBrut}}', label: 'Salaire brut mensuel' },
    { var: '{{adresse}}', label: 'Adresse du salarié' },
    { var: '{{naissance}}', label: 'Date de naissance' },
  ],
  AVENANT: []
};

export const validateTemplate = (content, typeDocument) => {
  const errors = [];
  const warnings = [];
  const missing = [];

  if (!content || !typeDocument) {
    return { errors: ['Le contenu et le type de contrat sont requis'], warnings: [], missing: [] };
  }

  const contentLower = content.toLowerCase();

  // Vérification des variables interdites
  const forbidden = FORBIDDEN_VARIABLES_BY_TYPE[typeDocument] || [];
  forbidden.forEach(({ var: variable, label, reason }) => {
    if (content.includes(variable) || contentLower.includes(variable.toLowerCase())) {
      errors.push(`❌ ${label} : ${reason}`);
    }
  });

  // Vérification des variables obligatoires
  const required = REQUIRED_VARIABLES_BY_TYPE[typeDocument] || [];
  required.forEach(({ var: variable, label }) => {
    if (!content.includes(variable)) {
      missing.push(`⚠️ ${label} est obligatoire pour un ${typeDocument}`);
    }
  });

  // Vérification des variables recommandées
  const recommended = RECOMMENDED_VARIABLES[typeDocument] || [];
  recommended.forEach(({ var: variable, label }) => {
    if (!content.includes(variable)) {
      warnings.push(`💡 ${label} est recommandé mais optionnel`);
    }
  });

  // Vérifications spécifiques CDD
  if (typeDocument === 'CDD') {
    if (!contentLower.includes('durée déterminée') && !contentLower.includes('cdd')) {
      warnings.push('Le contrat ne mentionne pas explicitement "CDD" ou "durée déterminée"');
    }
  }

  // Vérifications spécifiques CDI
  if (typeDocument === 'CDI') {
    if (!contentLower.includes('durée indéterminée') && !contentLower.includes('cdi')) {
      warnings.push('Le contrat ne mentionne pas explicitement "CDI" ou "durée indéterminée"');
    }
  }

  // Vérification longueur minimale
  if (content.replace(/<[^>]*>/g, '').trim().length < 200) {
    warnings.push('Le contrat semble très court, vérifiez qu\'il contient tous les articles nécessaires');
  }

  return { errors, warnings, missing };
};

export const getCreationGuide = (typeDocument) => {
  const guides = {
    CDD: {
      title: 'Guide de création CDD',
      checklist: [
        'Identité complète du salarié et de l\'employeur',
        'Date de début et date de fin du contrat',
        'Motif précis de recours au CDD',
        'Description du poste et des missions',
        'Durée du travail (heures hebdomadaires)',
        'Rémunération (taux horaire et/ou salaire brut)',
        'Période d\'essai (1 jour ouvré par semaine de contrat, max 2 semaines pour CDD < 6 mois)',
        'Clause de renouvellement si applicable',
        'Lieu de travail',
        'Convention collective applicable'
      ],
      legalNotes: [
        'Un CDD doit avoir une durée déterminée (date de début + date de fin)',
        'Le motif de recours doit être conforme à l\'article L.1242-2 du Code du travail',
        'La période d\'essai est calculée à raison de 1 jour ouvré par semaine'
      ]
    },
    CDI: {
      title: 'Guide de création CDI',
      checklist: [
        'Identité complète du salarié et de l\'employeur',
        'Date de début du contrat (pas de date de fin)',
        'Description du poste et des missions',
        'Durée du travail (heures hebdomadaires)',
        'Rémunération (taux horaire et/ou salaire brut)',
        'Période d\'essai (2 mois pour employé, 3 mois pour agent de maîtrise, 4 mois pour cadre)',
        'Lieu de travail',
        'Convention collective applicable'
      ],
      legalNotes: [
        'Un CDI n\'a pas de date de fin',
        'La période d\'essai dépend de la qualification du poste',
        'Le CDI peut être à temps plein ou temps partiel'
      ]
    },
    AVENANT: {
      title: 'Guide de création AVENANT',
      checklist: [
        'Référence au contrat initial',
        'Objet de l\'avenant (modification de poste, salaire, horaires...)',
        'Nouvelle clause ou modification',
        'Date d\'effet de l\'avenant'
      ],
      legalNotes: [
        'Un avenant modifie un élément du contrat existant',
        'Il nécessite l\'accord des deux parties'
      ]
    }
  };

  return guides[typeDocument] || guides.CDD;
};