// Générateur dynamique de variables d'établissement
// Ce fichier lit automatiquement le schéma de l'entité Establishment
// et génère les variables disponibles pour les templates RH

import { base44 } from '@/api/base44Client';

// Mapping des noms de propriétés vers des labels lisibles
const PROPERTY_LABELS = {
  name: 'Nom de l\'établissement',
  postal_address: 'Adresse postale',
  postal_code: 'Code postal',
  city: 'Ville',
  delivery_address: 'Adresse de livraison',
  siret: 'Numéro SIRET',
  website: 'Site internet',
  contact_email: 'Email de contact',
  managers: 'Responsables'
};

// Mapping des propriétés vers des noms de variables cohérents
const PROPERTY_TO_VARIABLE = {
  name: 'etablissementNom',
  postal_address: 'etablissementAdresse',
  postal_code: 'codePostalEtablissement',
  city: 'villeEtablissement',
  delivery_address: 'etablissementAdresseLivraison',
  siret: 'etablissementSiret',
  website: 'etablissementSite',
  contact_email: 'etablissementEmail'
};

// Variables spéciales pour les responsables
const MANAGER_VARIABLES = [
  { var: '{{responsableNom}}', label: 'Nom du responsable' },
  { var: '{{responsableTel}}', label: 'Téléphone du responsable' },
  { var: '{{responsableEmail}}', label: 'Email du responsable' }
];

/**
 * Génère dynamiquement les variables d'établissement à partir du schéma
 * @returns {Promise<Array>} Liste des variables avec leurs labels
 */
export async function generateEstablishmentVariables() {
  try {
    // Récupérer le schéma de l'entité Establishment
    const schema = await base44.entities.Establishment.schema();
    
    const variables = [];
    
    // Parcourir toutes les propriétés du schéma
    if (schema && schema.properties) {
      Object.keys(schema.properties).forEach(propertyName => {
        // Ignorer les propriétés managers (gérées séparément)
        if (propertyName === 'managers') return;
        
        // Obtenir le nom de variable (mapping ou format automatique)
        const variableName = PROPERTY_TO_VARIABLE[propertyName] || 
                            `etablissement${propertyName.charAt(0).toUpperCase()}${propertyName.slice(1)}`;
        
        // Obtenir le label (mapping ou description du schéma)
        const label = PROPERTY_LABELS[propertyName] || 
                     schema.properties[propertyName].description || 
                     propertyName.replace(/_/g, ' ');
        
        variables.push({
          var: `{{${variableName}}}`,
          label: label,
          propertyName: propertyName
        });
      });
    }
    
    // Ajouter les variables spéciales pour les responsables
    variables.push(...MANAGER_VARIABLES);
    
    return variables;
  } catch (error) {
    console.error('Error generating establishment variables:', error);
    // Fallback sur les variables de base si erreur
    return [
      { var: '{{etablissementNom}}', label: 'Nom de l\'établissement' },
      { var: '{{etablissementSiret}}', label: 'SIRET' },
      { var: '{{etablissementEmail}}', label: 'Email de contact' },
      { var: '{{etablissementAdresse}}', label: 'Adresse' },
      { var: '{{codePostalEtablissement}}', label: 'Code postal' },
      { var: '{{villeEtablissement}}', label: 'Ville' },
      ...MANAGER_VARIABLES
    ];
  }
}

/**
 * Génère l'objet de variables avec les valeurs d'un établissement
 * @param {Object} establishment - L'objet établissement
 * @returns {Object} Objet clé-valeur des variables
 */
export function mapEstablishmentToVariables(establishment) {
  if (!establishment) return {};
  
  const variables = {};
  
  // Mapper toutes les propriétés de l'établissement
  Object.keys(establishment).forEach(key => {
    // Ignorer les métadonnées internes
    if (['id', 'created_date', 'updated_date', 'created_by'].includes(key)) return;
    
    // Ignorer managers (géré séparément)
    if (key === 'managers') return;
    
    const variableName = PROPERTY_TO_VARIABLE[key] || 
                        `etablissement${key.charAt(0).toUpperCase()}${key.slice(1)}`;
    
    variables[variableName] = establishment[key] || '';
  });
  
  // Gérer les responsables
  const mainManager = establishment.managers?.[0] || {};
  variables.responsableNom = mainManager.name || '';
  variables.responsableTel = mainManager.phone || '';
  variables.responsableEmail = mainManager.email || '';
  
  return variables;
}

/**
 * Retourne toutes les variables d'établissement (synchrone, pour usage immédiat)
 * Utilise une liste statique étendue
 */
export function getStaticEstablishmentVariables() {
  return [
    { var: '{{etablissementNom}}', label: 'Nom de l\'établissement' },
    { var: '{{etablissementSiret}}', label: 'SIRET' },
    { var: '{{etablissementEmail}}', label: 'Email de contact' },
    { var: '{{etablissementSite}}', label: 'Site internet' },
    { var: '{{etablissementAdresse}}', label: 'Adresse postale' },
    { var: '{{codePostalEtablissement}}', label: 'Code postal' },
    { var: '{{villeEtablissement}}', label: 'Ville' },
    { var: '{{etablissementAdresseLivraison}}', label: 'Adresse de livraison' },
    ...MANAGER_VARIABLES
  ];
}