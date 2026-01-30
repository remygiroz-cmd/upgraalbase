// Variables obligatoires par catégorie de document
const REQUIRED_FIELDS_BY_CATEGORY = {
  'B_DISCIPLINAIRE': [
    { key: 'dateFaits', label: 'Date des faits reprochés', type: 'date', required: true, helpText: 'Date précise à laquelle les faits se sont produits' },
    { key: 'descriptionFaits', label: 'Description factuelle des faits', type: 'textarea', required: true, helpText: '⚖️ Description objective et précise des faits reprochés (obligatoire juridiquement)', maxLength: 2000 },
    { key: 'motifSanction', label: 'Motif juridique de la sanction', type: 'textarea', required: true, helpText: '⚖️ Qualification juridique du manquement justifiant la sanction (obligatoire)', maxLength: 1000 },
    { key: 'dateNotification', label: 'Date de notification', type: 'date', required: false }
  ],
  'B_DISCIPLINAIRE_CONVOCATION': [
    { key: 'dateFaits', label: 'Date des faits reprochés', type: 'date', required: true, helpText: 'Date précise des faits ayant motivé la convocation' },
    { key: 'descriptionFaits', label: 'Description factuelle des faits', type: 'textarea', required: true, helpText: '⚖️ Description objective et précise (obligatoire)', maxLength: 2000 },
    { key: 'dateConvocation', label: 'Date de la convocation', type: 'date', required: true, helpText: 'Date de l\'entretien préalable' },
    { key: 'heureConvocation', label: 'Heure de la convocation', type: 'text', required: true, placeholder: 'Ex: 14h00', helpText: 'Heure précise de l\'entretien' },
    { key: 'lieuConvocation', label: 'Lieu de la convocation', type: 'text', required: true, placeholder: 'Ex: Bureau du directeur', helpText: 'Lieu exact de l\'entretien' }
  ],
  'A_CONTRACTUEL': [
    { key: 'dateEffet', label: 'Date d\'effet', type: 'date', required: false }
  ],
  'C_RUPTURE': [
    { key: 'dateRupture', label: 'Date de rupture', type: 'date', required: true },
    { key: 'motifRupture', label: 'Motif de rupture', type: 'textarea', required: true, maxLength: 1500 },
    { key: 'dateFinContrat', label: 'Date de fin de contrat', type: 'date', required: false }
  ]
};

// Variables automatiques (remplies par le système - NE PAS exposer dans le wizard)
const AUTO_VARIABLES = new Set([
  'prenom', 'nom', 'naissance', 'lieuNaissance', 'adresse', 'nationalite', 'secu',
  'poste', 'taches', 'debut', 'fin', 'heures', 'heuresTexte', 'taux', 'salaireBrut',
  'periodeEssaiTexte', 'finEssai', 'motifCDD', 'signature',
  'etablissementNom', 'etablissementSiret', 'etablissementEmail', 'etablissementSite',
  'etablissementAdresse', 'etablissementAdresseLivraison',
  'responsableNom', 'responsableTel', 'responsableEmail',
  'dateDebutContrat', 'fonctionOccupee', 'email', 'telephone',
  'codePostalEtablissement', 'villeEtablissement'
]);

/**
 * Détecte toutes les variables manuelles d'un template
 * et force l'ajout des champs obligatoires selon la catégorie
 */
export const detectManualVariables = (htmlContent, existingCustomFields = [], categorieDocument = null, typeDocument = null) => {
  if (!htmlContent) return [];
  
  // 1. EXTRAIRE TOUTES LES VARIABLES du template
  const variableRegex = /{{(\w+)}}/g;
  const matches = htmlContent.matchAll(variableRegex);
  const detectedVariables = new Set();
  
  for (const match of matches) {
    const varName = match[1];
    if (!AUTO_VARIABLES.has(varName)) {
      detectedVariables.add(varName);
    }
  }
  
  // 2. FORCER les champs obligatoires selon la catégorie
  let requiredFields = [];
  
  if (categorieDocument === 'B_DISCIPLINAIRE') {
    // Cas spécial : Convocation préalable
    if (typeDocument === 'CONVOCATION' || htmlContent.includes('{{dateConvocation}}') || htmlContent.includes('{{heureConvocation}}')) {
      requiredFields = [...REQUIRED_FIELDS_BY_CATEGORY['B_DISCIPLINAIRE_CONVOCATION']];
    } else {
      // Avertissement, Sanction, etc.
      requiredFields = [...REQUIRED_FIELDS_BY_CATEGORY['B_DISCIPLINAIRE']];
    }
  } else if (categorieDocument && REQUIRED_FIELDS_BY_CATEGORY[categorieDocument]) {
    requiredFields = [...REQUIRED_FIELDS_BY_CATEGORY[categorieDocument]];
  }
  
  // 3. FUSIONNER : Champs obligatoires + Variables détectées + CustomFields existants
  const fieldMap = new Map();
  
  // Ajouter les champs obligatoires EN PRIORITÉ
  requiredFields.forEach(field => {
    fieldMap.set(field.key, field);
    detectedVariables.delete(field.key); // Éviter les doublons
  });
  
  // Utiliser les customFields existants s'ils sont définis (override des champs générés)
  if (existingCustomFields && existingCustomFields.length > 0) {
    existingCustomFields.forEach(field => {
      if (!fieldMap.has(field.key)) {
        fieldMap.set(field.key, field);
        detectedVariables.delete(field.key);
      }
    });
  }
  
  // Générer des champs pour les variables restantes
  detectedVariables.forEach(varName => {
    if (!fieldMap.has(varName)) {
      fieldMap.set(varName, inferVariableType(varName));
    }
  });
  
  return Array.from(fieldMap.values());
};

/**
 * Inférer automatiquement le type de champ à partir du nom de variable
 */
function inferVariableType(variableName) {
  const name = variableName.toLowerCase();
  
  // Mapping des labels connus
  const knownLabels = {
    'dateFaits': 'Date des faits reprochés',
    'descriptionFaits': 'Description détaillée des faits reprochés',
    'motifSanction': 'Motif juridique de la sanction',
    'dateNotification': 'Date de notification',
    'dateConvocation': 'Date de convocation',
    'lieuConvocation': 'Lieu de convocation',
    'heureConvocation': 'Heure de convocation',
    'dateIncident': 'Date de l\'incident',
    'motifModification': 'Motif de la modification',
    'ancienneValeur': 'Ancienne valeur',
    'nouvelleValeur': 'Nouvelle valeur',
    'dateEffet': 'Date d\'effet',
    'dateRupture': 'Date de rupture',
    'motifRupture': 'Motif de rupture',
    'dateFinContrat': 'Date de fin de contrat',
    'indemnitePreavis': 'Indemnité de préavis (€)',
    'indemniteRupture': 'Indemnité de rupture (€)',
    'periodeAttestation': 'Période concernée',
    'natureAttestation': 'Nature de l\'attestation'
  };
  
  const label = knownLabels[variableName] || 
                variableName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
  
  // Détection date
  if (name.includes('date')) {
    return {
      key: variableName,
      label,
      type: 'date',
      required: true,
      placeholder: 'JJ/MM/AAAA'
    };
  }
  
  // Détection heure
  if (name.includes('heure') || name.includes('time')) {
    return {
      key: variableName,
      label,
      type: 'text',
      required: false,
      placeholder: '14h00'
    };
  }
  
  // Détection motif sanction (spécifique disciplinaire)
  if (variableName === 'motifSanction') {
    return {
      key: variableName,
      label: 'Motif juridique de la sanction',
      type: 'textarea',
      required: true,
      placeholder: 'Qualification juridique du manquement (ex: manquement à l\'obligation de ponctualité)',
      helpText: '⚖️ Qualifier juridiquement le manquement justifiant la sanction, sans décrire les faits',
      maxLength: 1000
    };
  }
  
  // Détection description/faits
  if (name.includes('description') || name.includes('faits')) {
    return {
      key: variableName,
      label,
      type: 'textarea',
      required: true,
      placeholder: 'Détaillez de manière factuelle, avec dates et lieux précis...',
      helpText: '⚠️ Restez factuel : dates, lieux, témoins, faits observables',
      maxLength: 2000
    };
  }
  
  // Détection motif général
  if (name.includes('motif')) {
    return {
      key: variableName,
      label,
      type: 'textarea',
      required: true,
      placeholder: 'Détaillez le motif...',
      helpText: '⚠️ Soyez précis et factuel',
      maxLength: 1000
    };
  }
  
  // Détection montant/indemnité
  if (name.includes('montant') || name.includes('indemn') || name.includes('salaire')) {
    return {
      key: variableName,
      label,
      type: 'number',
      required: false,
      placeholder: '0.00'
    };
  }
  
  // Détection lieu
  if (name.includes('lieu')) {
    return {
      key: variableName,
      label,
      type: 'text',
      required: false,
      placeholder: 'Adresse ou lieu'
    };
  }
  
  // Par défaut : text
  return {
    key: variableName,
    label,
    type: 'text',
    required: false,
    placeholder: ''
  };
}