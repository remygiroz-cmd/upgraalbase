import React, { useState, useEffect, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { FileText, Save, AlertCircle, Plus, Eye, Sparkles, Lock, Copy, CheckCircle, Info, Shield } from 'lucide-react';
import { toast } from 'sonner';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { validateTemplateV2, getCreationGuideV2, REQUIRED_VARIABLES_BY_TYPE, FORBIDDEN_VARIABLES_BY_TYPE, CATEGORIES, VARIABLES_BY_CATEGORY } from './TemplateValidationV2';
import AITemplateGenerator from './AITemplateGenerator';
import { getStaticEstablishmentVariables } from './EstablishmentVariablesGenerator';

// Fonction pour générer dynamiquement toutes les variables employé depuis le schéma
const getEmployeeIdentityVariables = () => {
  return [
    { var: '{{prenom}}', label: 'Prénom', category: 'identity' },
    { var: '{{nom}}', label: 'Nom', category: 'identity' },
    { var: '{{naissance}}', label: 'Date de naissance', category: 'identity' },
    { var: '{{lieuNaissance}}', label: 'Lieu de naissance', category: 'identity' },
    { var: '{{adresse}}', label: 'Adresse personnelle', category: 'identity' },
    { var: '{{nationalite}}', label: 'Nationalité', category: 'identity' },
    { var: '{{secu}}', label: 'Numéro de sécurité sociale', category: 'identity' },
    { var: '{{email}}', label: 'Email', category: 'identity' },
    { var: '{{telephone}}', label: 'Téléphone', category: 'identity' }
  ];
};

const getEmployeeContractVariables = () => {
  return [
    { var: '{{poste}}', label: 'Poste / Fonction', category: 'contract' },
    { var: '{{taches}}', label: 'Description des tâches', category: 'contract' },
    { var: '{{debut}}', label: 'Date de début', category: 'contract' },
    { var: '{{fin}}', label: 'Date de fin', category: 'contract' },
    { var: '{{heures}}', label: 'Heures par semaine', category: 'contract' },
    { var: '{{heuresTexte}}', label: 'Heures mensuelles (texte)', category: 'contract' },
    { var: '{{taux}}', label: 'Taux horaire', category: 'contract' },
    { var: '{{salaireBrut}}', label: 'Salaire brut mensuel', category: 'contract' },
    { var: '{{heuresTotalesCDD}}', label: 'Heures totales du contrat CDD', category: 'contract' },
    { var: '{{joursTravaillesCDD}}', label: 'Jours travaillés prévus (CDD)', category: 'contract' },
    { var: '{{periodeEssaiTexte}}', label: 'Période d\'essai (texte)', category: 'contract' },
    { var: '{{finEssai}}', label: 'Date de fin d\'essai', category: 'contract' },
    { var: '{{motifCDD}}', label: 'Motif du CDD', category: 'contract' }
  ];
};

// Variables disponibles - TOUTES les variables établissement + employé sont TOUJOURS disponibles
const getAvailableVariables = (categorieDocument) => {
  const establishment = getStaticEstablishmentVariables();
  const employeeIdentity = getEmployeeIdentityVariables();
  const employeeContract = getEmployeeContractVariables();
  
  let specific = [];
  if (categorieDocument === 'A_CONTRACTUEL') {
    specific = [...(VARIABLES_BY_CATEGORY.CONTRACTUEL || []), ...(VARIABLES_BY_CATEGORY.AVENANT || [])];
  } else if (categorieDocument === 'B_DISCIPLINAIRE') {
    specific = VARIABLES_BY_CATEGORY.DISCIPLINAIRE || [];
  } else if (categorieDocument === 'C_RUPTURE') {
    specific = VARIABLES_BY_CATEGORY.RUPTURE || [];
  } else if (categorieDocument === 'D_ADMINISTRATIF') {
    specific = VARIABLES_BY_CATEGORY.ADMINISTRATIF || [];
  }
  
  return {
    '🏢 ÉTABLISSEMENT (toujours disponible)': establishment,
    '👤 EMPLOYÉ – Identité (toujours disponible)': employeeIdentity,
    '📋 EMPLOYÉ – Contrat & Rémunération (toujours disponible)': employeeContract,
    '📄 Spécifique au document': specific
  };
};

// Données mock pour l'aperçu
const MOCK_DATA = {
  etablissementNom: 'Frenchy Sushi',
  etablissementSiret: '79514367600034',
  etablissementEmail: 'contact@frenchysushi.fr',
  etablissementSite: 'www.frenchysushi.fr',
  etablissementAdresse: 'Quartier Souque Nègre, Centre Commercial LIDL, 13112 La Destrousse',
  etablissementAdresseLivraison: 'Quartier Souque Nègre, Centre Commercial LIDL, 13112 La Destrousse',
  responsableNom: 'Giroz Rémy',
  responsableTel: '06 46 77 14 35',
  responsableEmail: 'remy.giroz@gmail.com',
  prenom: 'Jean',
  nom: 'DUPONT',
  naissance: '15/06/1995',
  lieuNaissance: 'Lyon',
  adresse: '42 rue de la Paix, 75001 Paris',
  nationalite: 'Française',
  secu: '1950615123456789',
  poste: 'Employé polyvalent',
  taches: 'Accueil client, préparation des commandes, service en salle, entretien des locaux',
  debut: '01/02/2026',
  fin: '30/06/2026',
  heures: '35',
  heuresTexte: '151,67',
  taux: '12,50',
  salaireBrut: '1 875,00',
  heuresTotalesCDD: '80',
  joursTravaillesCDD: '10',
  periodeEssaiTexte: '2 mois',
  finEssai: '31/03/2026',
  motifCDD: 'Accroissement temporaire d\'activité durant la période estivale',
  signature: '29/01/2026'
};

export default function TemplateBuilderModalV15({ open, onOpenChange, template, onSuccess }) {
  const [formData, setFormData] = useState({
    name: '',
    typeDocument: 'CDD',
    categorieDocument: 'A_CONTRACTUEL',
    sousType: '',
    description: '',
    version: '',
    htmlContent: '',
    isActive: true,
    isOfficial: false,
    parentTemplateId: null,
    notes: ''
  });

  const [showVariableMenu, setShowVariableMenu] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showAIGenerator, setShowAIGenerator] = useState(false);
  const [validationResult, setValidationResult] = useState({ errors: [], warnings: [], missing: [] });
  const [isDuplicating, setIsDuplicating] = useState(false);
  const quillRef = React.useRef(null);

  useEffect(() => {
    if (template) {
      // Si le template est officiel, forcer la duplication
      if (template.isOfficial && !isDuplicating) {
        setIsDuplicating(true);
        setFormData({
          name: `${template.name} (Copie)`,
          typeDocument: template.typeDocument || 'CDD',
          categorieDocument: template.categorieDocument || 'A_CONTRACTUEL',
          sousType: template.sousType || '',
          description: template.description || '',
          version: `${template.version}_copie`,
          htmlContent: template.htmlContent || '',
          isActive: true,
          isOfficial: false,
          parentTemplateId: template.id,
          notes: `Copie du template officiel: ${template.name}`
        });
      } else {
        setFormData({
          name: template.name || '',
          typeDocument: template.typeDocument || 'CDD',
          categorieDocument: template.categorieDocument || 'A_CONTRACTUEL',
          sousType: template.sousType || '',
          description: template.description || '',
          version: template.version || '',
          htmlContent: template.htmlContent || '',
          isActive: template.isActive !== false,
          isOfficial: template.isOfficial || false,
          parentTemplateId: template.parentTemplateId || null,
          notes: template.notes || ''
        });
      }
    } else {
      setFormData({
        name: '',
        typeDocument: 'CDD',
        categorieDocument: 'A_CONTRACTUEL',
        sousType: '',
        description: '',
        version: 'v1.0',
        htmlContent: '',
        isActive: true,
        isOfficial: false,
        parentTemplateId: null,
        notes: ''
      });
      setIsDuplicating(false);
    }
  }, [template, open]);

  // Validation en temps réel
  useEffect(() => {
    if (formData.htmlContent && formData.typeDocument && formData.categorieDocument) {
      const result = validateTemplateV2(formData.htmlContent, formData.typeDocument, formData.categorieDocument);
      setValidationResult(result);
    }
  }, [formData.htmlContent, formData.typeDocument, formData.categorieDocument]);

  // Aperçu avec données mock enrichies
  const ENHANCED_MOCK_DATA = useMemo(() => ({
    ...MOCK_DATA,
    email: 'jean.dupont@email.fr',
    telephone: '06 12 34 56 78',
    codePostalEtablissement: '13112',
    villeEtablissement: 'La Destrousse'
  }), []);

  const previewHtml = useMemo(() => {
    let html = formData.htmlContent;
    Object.entries(ENHANCED_MOCK_DATA).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      html = html.replace(regex, `<strong class="text-orange-600">${value}</strong>`);
    });
    return html;
  }, [formData.htmlContent, ENHANCED_MOCK_DATA]);

  // Détection des variables non résolues dans l'aperçu
  const unresolvedVariables = useMemo(() => {
    // Variables manuelles autorisées (saisie libre lors de la génération - NE DOIVENT PAS BLOQUER le template)
    const MANUAL_VARIABLES = new Set([
      // Disciplinaires
      'dateFaits', 'descriptionFaits', 'motifSanction', 'typeSanction', 'dateIncident',
      'dateNotification', 'dateConvocation', 'heureConvocation', 'lieuConvocation',
      // Avenants
      'motifModification', 'ancienneValeur', 'nouvelleValeur', 'dateEffet',
      // Ruptures
      'dateRupture', 'motifRupture', 'dateFinContrat', 'indemnitePreavis', 'indemniteRupture',
      // Administratifs
      'periodeAttestation', 'natureAttestation', 'objetCourrier', 'contenuCourrier',
      // Autres variables contextuelles
      'remarques', 'observations', 'clauseParticuliere', 'mentionSpeciale'
    ]);

    const regex = /{{([^}]+)}}/g;
    const matches = [];
    let match;
    
    while ((match = regex.exec(previewHtml)) !== null) {
      const varName = match[1];
      // IGNORER les variables manuelles attendues (saisie libre lors de la génération)
      if (!MANUAL_VARIABLES.has(varName)) {
        matches.push(varName);
      }
    }
    
    return [...new Set(matches)]; // Déduplique les variables
  }, [previewHtml]);

  // Détection des artefacts HTML techniques (BLOQUANTS)
  const htmlArtifacts = useMemo(() => {
    const artifacts = [];
    const content = formData.htmlContent.toLowerCase();
    
    // Détection des balises HTML structure interdites
    if (content.includes('<!doctype') || content.includes('<!DOCTYPE')) {
      artifacts.push({ type: 'DOCTYPE', message: 'Balise <!DOCTYPE> détectée' });
    }
    if (content.includes('<html')) {
      artifacts.push({ type: 'HTML', message: 'Balise <html> détectée' });
    }
    if (content.includes('<head')) {
      artifacts.push({ type: 'HEAD', message: 'Balise <head> détectée' });
    }
    if (content.includes('<body')) {
      artifacts.push({ type: 'BODY', message: 'Balise <body> détectée' });
    }
    if (content.includes('about:blank')) {
      artifacts.push({ type: 'ABOUT_BLANK', message: 'Texte "about:blank" détecté' });
    }
    
    // Détection de styles inline (style="...")
    if (content.includes('style="') || content.includes("style='")) {
      artifacts.push({ type: 'INLINE_STYLE', message: 'Styles CSS inline détectés (style="...")' });
    }
    
    // Détection de balises <style>
    if (content.includes('<style')) {
      artifacts.push({ type: 'STYLE_TAG', message: 'Balise <style> détectée' });
    }
    
    return artifacts;
  }, [formData.htmlContent]);

  const updateMutation = useMutation({
    mutationFn: (data) => {
      if (template?.id && !isDuplicating) {
        return base44.entities.TemplatesRH.update(template.id, data);
      } else {
        return base44.entities.TemplatesRH.create(data);
      }
    },
    onSuccess: () => {
      toast.success(isDuplicating ? 'Template dupliqué' : template?.id ? 'Template mis à jour' : 'Template créé');
      onSuccess?.();
    },
    onError: (error) => {
      toast.error('Erreur: ' + (error.response?.data?.error || error.message));
    }
  });

  const handleSave = () => {
    if (!formData.name.trim()) {
      toast.error('Le nom du template est requis');
      return;
    }
    if (!formData.version.trim()) {
      toast.error('La version est requise');
      return;
    }
    if (!formData.htmlContent.trim()) {
      toast.error('Le contenu du template est requis');
      return;
    }

    // Blocage si erreurs critiques
    if (validationResult.errors.length > 0) {
      toast.error('⛔ Impossible de sauvegarder : des erreurs juridiques critiques ont été détectées');
      return;
    }

    // Blocage si éléments obligatoires manquants
    if (validationResult.missing.length > 0) {
      toast.error('⛔ Impossible de sauvegarder : des éléments obligatoires sont manquants');
      return;
    }

    // Blocage si variables AUTOMATIQUES non résolues dans l'aperçu
    // Note : les variables manuelles (saisie libre) sont autorisées
    if (unresolvedVariables.length > 0) {
      toast.error(
        `⛔ Variables automatiques non configurées\n\n` +
        `${unresolvedVariables.length} variable${unresolvedVariables.length > 1 ? 's' : ''} automatique${unresolvedVariables.length > 1 ? 's' : ''} (employé/établissement) non résolue${unresolvedVariables.length > 1 ? 's' : ''} :\n\n` +
        `${unresolvedVariables.map(v => `• {{${v}}}`).join('\n')}\n\n` +
        `💡 Ces variables doivent avoir des valeurs de test dans l'aperçu.\n` +
        `Les variables de saisie libre (ex: descriptionFaits, motifSanction) sont autorisées.`,
        { duration: 7000 }
      );
      return;
    }

    // Blocage si artefacts HTML techniques détectés
    if (htmlArtifacts.length > 0) {
      toast.error(
        `⛔ Impossible de sauvegarder : Artefacts HTML techniques détectés\n\n` +
        `Le template contient des éléments interdits :\n${htmlArtifacts.map(a => `• ${a.message}`).join('\n')}\n\n` +
        `👉 Ces éléments doivent être supprimés. La mise en page est appliquée automatiquement par le système.`,
        { duration: 8000 }
      );
      return;
    }

    // Warning pour les éléments recommandés
    if (validationResult.warnings.length > 0) {
      const proceed = confirm(
        `💡 Votre contrat ${formData.typeDocument} peut être amélioré\n\n` +
        `Ces ${validationResult.warnings.length} éléments sont optionnels mais recommandés :\n\n` +
        `${validationResult.warnings.map((w, i) => `${i + 1}. ${w}`).join('\n')}\n\n` +
        `Voulez-vous sauvegarder malgré tout ?`
      );
      if (!proceed) return;
    }

    updateMutation.mutate({
      name: formData.name,
      typeDocument: formData.typeDocument,
      categorieDocument: formData.categorieDocument,
      sousType: formData.sousType,
      description: formData.description,
      version: formData.version,
      htmlContent: formData.htmlContent,
      isActive: formData.isActive,
      isOfficial: formData.isOfficial,
      parentTemplateId: formData.parentTemplateId,
      notes: formData.notes
    });
  };

  const insertVariable = (variable) => {
    const quill = quillRef.current?.getEditor();
    if (quill) {
      const range = quill.getSelection();
      const position = range ? range.index : quill.getLength();
      quill.insertText(position, variable);
      quill.setSelection(position + variable.length);
    }
    setShowVariableMenu(false);
  };

  const modules = {
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'align': [] }],
      ['clean']
    ]
  };

  const guide = getCreationGuideV2(formData.typeDocument, formData.categorieDocument);
  const availableVariables = getAvailableVariables(formData.categorieDocument);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white border-gray-300 max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900">
            {template?.isOfficial ? (
              <>
                <Copy className="w-5 h-5 text-orange-600" />
                Duplication d'un template officiel
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 text-orange-600" />
                {template?.id && !isDuplicating ? 'Modifier' : 'Créer'} un template
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {template?.isOfficial 
              ? '⚠️ Les templates officiels ne peuvent pas être modifiés. Une copie personnalisée va être créée.'
              : 'Créez votre contrat de manière guidée et sécurisée juridiquement'
            }
          </DialogDescription>
        </DialogHeader>

        {template?.isOfficial && (
          <Card className="bg-amber-50 border-amber-300 p-4">
            <div className="flex gap-3">
              <Shield className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-900">Template officiel validé juridiquement</p>
                <p className="text-sm text-amber-800 mt-1">
                  Ce template a été validé par un professionnel. Vous allez créer une copie que vous pourrez personnaliser librement.
                </p>
              </div>
            </div>
          </Card>
        )}

        <Tabs defaultValue="infos" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="infos">Informations</TabsTrigger>
            <TabsTrigger value="guide">
              <Info className="w-4 h-4 mr-2" />
              Guide
            </TabsTrigger>
            <TabsTrigger value="contenu">Contenu</TabsTrigger>
            <TabsTrigger value="apercu">
              <Eye className="w-4 h-4 mr-2" />
              Aperçu
            </TabsTrigger>
          </TabsList>

          {/* Onglet Informations */}
          <TabsContent value="infos" className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-900 font-semibold">Nom du template</Label>
                <Input
                  placeholder="Ex: CDD Temps Partiel"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="border-gray-300"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-gray-900 font-semibold">Version</Label>
                <Input
                  placeholder="Ex: v1.0"
                  value={formData.version}
                  onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                  className="border-gray-300"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-900 font-semibold">Catégorie de document RH</Label>
              <Select 
                value={formData.categorieDocument} 
                onValueChange={(value) => {
                  // Auto-sélection du type selon la catégorie
                  let defaultType = 'CDD';
                  if (value === 'A_CONTRACTUEL') defaultType = 'CDD';
                  else if (value === 'B_DISCIPLINAIRE') defaultType = 'AVERTISSEMENT';
                  else if (value === 'C_RUPTURE') defaultType = 'LICENCIEMENT';
                  else if (value === 'D_ADMINISTRATIF') defaultType = 'ATTESTATION';
                  else if (value === 'E_LIBRE') defaultType = 'LETTRE_LIBRE';
                  
                  setFormData({ ...formData, categorieDocument: value, typeDocument: defaultType });
                }}
              >
                <SelectTrigger className="border-gray-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORIES).map(([key, cat]) => (
                    <SelectItem key={key} value={key}>
                      {cat.icon} {cat.label} - {cat.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-900 font-semibold">Type de document</Label>
                <Select value={formData.typeDocument} onValueChange={(value) => setFormData({ ...formData, typeDocument: value })}>
                  <SelectTrigger className="border-gray-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {formData.categorieDocument === 'A_CONTRACTUEL' && (
                      <>
                        <SelectItem value="CDD">CDD</SelectItem>
                        <SelectItem value="CDI">CDI</SelectItem>
                        <SelectItem value="AVENANT">Avenant</SelectItem>
                      </>
                    )}
                    {formData.categorieDocument === 'B_DISCIPLINAIRE' && (
                      <>
                        <SelectItem value="AVERTISSEMENT">Avertissement</SelectItem>
                        <SelectItem value="CONVOCATION">Convocation</SelectItem>
                        <SelectItem value="SANCTION">Sanction</SelectItem>
                      </>
                    )}
                    {formData.categorieDocument === 'C_RUPTURE' && (
                      <>
                        <SelectItem value="LICENCIEMENT">Licenciement</SelectItem>
                        <SelectItem value="FIN_CDD">Fin de CDD</SelectItem>
                        <SelectItem value="RUPTURE_ESSAI">Rupture période d'essai</SelectItem>
                      </>
                    )}
                    {formData.categorieDocument === 'D_ADMINISTRATIF' && (
                      <>
                        <SelectItem value="ATTESTATION">Attestation</SelectItem>
                        <SelectItem value="COURRIER_RH">Courrier RH</SelectItem>
                      </>
                    )}
                    {formData.categorieDocument === 'E_LIBRE' && (
                      <>
                        <SelectItem value="LETTRE_LIBRE">Lettre libre</SelectItem>
                        <SelectItem value="NOTE_INTERNE">Note interne</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-900 font-semibold">Sous-type (optionnel)</Label>
                <Input
                  placeholder="Ex: Temps Partiel"
                  value={formData.sousType}
                  onChange={(e) => setFormData({ ...formData, sousType: e.target.value })}
                  className="border-gray-300"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-900 font-semibold">Description</Label>
              <Textarea
                placeholder="Description du template"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="border-gray-300 h-20"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-900 font-semibold">Notes internes</Label>
              <Textarea
                placeholder="Notes pour votre équipe"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="border-gray-300 h-20"
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-300">
              <Label className="text-gray-900 font-semibold cursor-pointer">Template actif</Label>
              <Switch
                checked={formData.isActive}
                onCheckedChange={(value) => setFormData({ ...formData, isActive: value })}
              />
            </div>
          </TabsContent>

          {/* Onglet Guide */}
          <TabsContent value="guide" className="space-y-4 py-4">
            <Card className="bg-blue-50 border-blue-200 p-4">
              <h3 className="font-bold text-blue-900 mb-3">{guide.title}</h3>
              
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-blue-800 mb-2">✅ Checklist obligatoire</h4>
                  <ul className="space-y-1">
                    {guide.checklist.map((item, idx) => (
                      <li key={idx} className="text-sm text-blue-800 flex items-start gap-2">
                        <span className="text-blue-600">•</span>
                        <span>{String(item || '')}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-blue-800 mb-2">⚖️ Points juridiques importants</h4>
                  <ul className="space-y-1">
                    {guide.legalNotes.map((note, idx) => (
                      <li key={idx} className="text-sm text-blue-800 flex items-start gap-2">
                        <span className="text-blue-600">⚠️</span>
                        <span>{String(note || '')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>

            {/* Variables obligatoires pour ce type */}
            <Card className="bg-green-50 border-green-200 p-4">
              <h4 className="font-semibold text-green-800 mb-2">📋 Variables obligatoires pour ce type de contrat</h4>
              <div className="grid grid-cols-2 gap-2">
                {(REQUIRED_VARIABLES_BY_TYPE[formData.typeDocument] || []).map((item, idx) => (
                  <div key={idx} className="text-sm text-green-800 flex items-center gap-2">
                    <CheckCircle className="w-3 h-3 text-green-600" />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Variables interdites */}
            {(FORBIDDEN_VARIABLES_BY_TYPE[formData.typeDocument] || []).length > 0 && (
              <Card className="bg-red-50 border-red-200 p-4">
                <h4 className="font-semibold text-red-800 mb-2">🚫 Variables interdites pour ce type de contrat</h4>
                <div className="space-y-1">
                  {(FORBIDDEN_VARIABLES_BY_TYPE[formData.typeDocument] || []).map((item, idx) => (
                    <div key={idx} className="text-sm text-red-800">
                      <span className="font-medium">{item.label}</span> : {item.reason}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </TabsContent>

          {/* Onglet Contenu */}
          <TabsContent value="contenu" className="space-y-4 py-4">
            {/* Alerte artefacts HTML en tête */}
            {htmlArtifacts.length > 0 && (
              <Card className="bg-red-50 border-red-300 p-4">
                <div className="flex gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold text-red-900 mb-2">
                      ⛔ Artefacts HTML techniques détectés
                    </p>
                    <p className="text-sm text-red-800 mb-2">
                      {htmlArtifacts.length} élément{htmlArtifacts.length > 1 ? 's' : ''} interdit{htmlArtifacts.length > 1 ? 's' : ''} :
                    </p>
                    <ul className="text-sm text-red-800 space-y-1 ml-4">
                      {htmlArtifacts.map((artifact, idx) => (
                        <li key={idx} className="list-disc">{artifact.message}</li>
                      ))}
                    </ul>
                    <p className="text-sm text-red-800 mt-3">
                      👉 Supprimez ces éléments. La mise en page sera appliquée automatiquement.
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {/* Validation errors */}
            {validationResult.errors.length > 0 && (
              <Card className="bg-red-50 border-red-300 p-4">
                <div className="flex gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold text-red-900 mb-2">
                      ⛔ Impossible de sauvegarder : {validationResult.errors.length} {validationResult.errors.length > 1 ? 'erreurs critiques détectées' : 'erreur critique détectée'}
                    </p>
                    <p className="text-sm text-red-800 mb-2">
                      Votre contrat de type <strong>{formData.typeDocument}</strong> contient des éléments incompatibles :
                    </p>
                    <ul className="text-sm text-red-800 space-y-1 ml-4">
                      {validationResult.errors.map((error, idx) => (
                        <li key={idx} className="list-disc">{error}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Card>
            )}

            {validationResult.missing.length > 0 && (
              <Card className="bg-orange-50 border-orange-300 p-4">
                <div className="flex gap-2">
                  <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold text-orange-900 mb-2">
                      ⚠️ Il vous manque encore {validationResult.missing.length} {validationResult.missing.length > 1 ? 'informations' : 'information'} pour finaliser ce contrat {formData.typeDocument}
                    </p>
                    <p className="text-sm text-orange-800 mb-2">
                      Pour qu'un contrat {formData.typeDocument} soit valide juridiquement, vous devez ajouter :
                    </p>
                    <ul className="text-sm text-orange-800 space-y-1 ml-4">
                      {validationResult.missing.map((missing, idx) => (
                        <li key={idx} className="list-disc">{missing}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Card>
            )}

            {validationResult.warnings.length > 0 && validationResult.errors.length === 0 && validationResult.missing.length === 0 && (
              <Card className="bg-blue-50 border-blue-200 p-4">
                <div className="flex gap-2">
                  <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold text-blue-900 mb-2">
                      💡 Votre contrat {formData.typeDocument} peut être amélioré
                    </p>
                    <p className="text-sm text-blue-800 mb-2">
                      Ces éléments sont optionnels mais recommandés pour un contrat complet :
                    </p>
                    <ul className="text-sm text-blue-800 space-y-1 ml-4">
                      {validationResult.warnings.map((warning, idx) => (
                        <li key={idx} className="list-disc">{warning}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Card>
            )}

            <div className="flex gap-2 mb-2">
              <Button
                type="button"
                onClick={() => setShowAIGenerator(true)}
                className="bg-violet-600 hover:bg-violet-700"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Générer le contenu avec l'IA
              </Button>
              <Button
                type="button"
                onClick={() => setShowVariableMenu(!showVariableMenu)}
                variant="outline"
                className="border-orange-300 text-orange-700 hover:bg-orange-50"
              >
                <Plus className="w-4 h-4 mr-2" />
                Insérer une donnée
              </Button>
            </div>

            {/* Menu de variables avec conditionnement */}
            {showVariableMenu && (
              <div className="bg-white border border-gray-300 rounded-lg p-4 max-h-64 overflow-y-auto">
                {Object.entries(availableVariables).map(([category, vars]) => (
                  <div key={category} className="mb-4">
                    <h4 className="font-semibold text-gray-700 text-xs uppercase mb-2">{category}</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {vars.map((v) => {
                        const isForbidden = (FORBIDDEN_VARIABLES_BY_TYPE[formData.typeDocument] || [])
                          .some(f => f.var === v.var);
                        
                        return (
                          <button
                            key={v.var}
                            onClick={() => !isForbidden && insertVariable(v.var)}
                            disabled={isForbidden}
                            className={`text-left px-3 py-2 text-sm rounded border transition-colors ${
                              isForbidden 
                                ? 'bg-red-50 text-red-400 border-red-200 cursor-not-allowed' 
                                : 'bg-gray-50 hover:bg-orange-50 hover:text-orange-700 border-gray-200 hover:border-orange-300'
                            }`}
                            title={isForbidden ? `Interdit pour les ${formData.typeDocument}` : ''}
                          >
                            {v.label}
                            {isForbidden && <span className="ml-2">🚫</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="border border-gray-300 rounded-lg overflow-hidden">
              <ReactQuill
                ref={quillRef}
                theme="snow"
                value={formData.htmlContent}
                onChange={(content) => setFormData({ ...formData, htmlContent: content })}
                modules={modules}
                className="bg-white"
                style={{ minHeight: '400px' }}
              />
            </div>
          </TabsContent>

          {/* Onglet Aperçu */}
          <TabsContent value="apercu" className="space-y-4 py-4">
            <Card className="bg-amber-50 border-amber-200 p-3">
              <div className="flex gap-2">
                <Eye className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <p className="font-semibold">Aperçu avec données de test</p>
                  <p>Les variables sont remplacées par des données fictives réalistes. Le PDF final aura ce rendu.</p>
                </div>
              </div>
            </Card>

            {/* Alerte variables automatiques non résolues */}
            {unresolvedVariables.length > 0 && (
              <Card className="bg-red-50 border-red-300 p-4">
                <div className="flex gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold text-red-900 mb-2">
                      ⛔ Variables automatiques non configurées
                    </p>
                    <p className="text-sm text-red-800 mb-2">
                      {unresolvedVariables.length} variable{unresolvedVariables.length > 1 ? 's' : ''} automatique{unresolvedVariables.length > 1 ? 's' : ''} (employé/établissement) non résolue{unresolvedVariables.length > 1 ? 's' : ''} :
                    </p>
                    <ul className="text-sm text-red-800 space-y-1 ml-4 mb-3">
                      {unresolvedVariables.map((variable, idx) => (
                        <li key={idx} className="list-disc font-mono">
                          {`{{${variable}}}`}
                        </li>
                      ))}
                    </ul>
                    <div className="text-sm text-red-800 space-y-2 border-t border-red-200 pt-3">
                      <p className="font-semibold">💡 Distinction importante :</p>
                      <ul className="ml-4 space-y-1">
                        <li>• <strong>Variables automatiques</strong> (employé, établissement) : doivent être résolues dans l&apos;aperçu</li>
                        <li>• <strong>Variables manuelles</strong> (descriptionFaits, motifSanction, etc.) : saisie libre lors de la génération ✅</li>
                      </ul>
                      <p className="font-semibold mt-3">✅ Solution :</p>
                      <ul className="ml-4 space-y-1">
                        <li>• Vérifiez que ces variables correspondent à des métadonnées employé/établissement</li>
                        <li>• Utilisez les variables disponibles dans &quot;Insérer une donnée&quot;</li>
                        <li>• Corrigez l&apos;orthographe si nécessaire</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Alerte artefacts HTML */}
            {htmlArtifacts.length > 0 && (
              <Card className="bg-red-50 border-red-300 p-4">
                <div className="flex gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold text-red-900 mb-2">
                      ⛔ Artefacts HTML techniques détectés
                    </p>
                    <p className="text-sm text-red-800 mb-2">
                      Le template contient des éléments interdits qui empêchent la génération professionnelle :
                    </p>
                    <ul className="text-sm text-red-800 space-y-1 ml-4 mb-3">
                      {htmlArtifacts.map((artifact, idx) => (
                        <li key={idx} className="list-disc">
                          {artifact.message}
                        </li>
                      ))}
                    </ul>
                    <div className="text-sm text-red-800 space-y-2 border-t border-red-200 pt-3">
                      <p className="font-semibold">📌 Règles importantes :</p>
                      <ul className="ml-4 space-y-1">
                        <li>• Le contenu doit être pur (pas de balises HTML structure)</li>
                        <li>• La mise en page est appliquée AUTOMATIQUEMENT par le système</li>
                        <li>• Utilisez uniquement les balises sémantiques : &lt;h1&gt;, &lt;h2&gt;, &lt;h3&gt;, &lt;p&gt;, &lt;strong&gt;</li>
                      </ul>
                      <p className="font-semibold mt-3">✅ Solution :</p>
                      <ul className="ml-4 space-y-1">
                        <li>• Supprimez les balises &lt;html&gt;, &lt;body&gt;, &lt;head&gt;, &lt;!DOCTYPE&gt;</li>
                        <li>• Supprimez tous les styles CSS inline ou en bloc</li>
                        <li>• Commencez directement par votre titre principal (&lt;h1&gt;...&lt;/h1&gt;)</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {unresolvedVariables.length === 0 && htmlArtifacts.length === 0 && (
              <Card className="bg-green-50 border-green-200 p-3">
                <div className="flex gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-green-800">
                    <p className="font-semibold">✓ Template valide et prêt à l&apos;emploi</p>
                    <p>Toutes les variables sont configurées et aucun artefact technique n&apos;a été détecté. Le layout professionnel sera appliqué automatiquement.</p>
                  </div>
                </div>
              </Card>
            )}

            <div className="bg-white border border-gray-300 rounded-lg overflow-auto shadow-inner max-h-[600px]">
              {/* Simulation de la mise en page RH professionnelle */}
              <div style={{
                fontFamily: "'Calibri', 'Arial', 'Helvetica', sans-serif",
                fontSize: '11pt',
                lineHeight: '1.8',
                color: '#1a1a1a',
                padding: '2.5cm 2cm',
                maxWidth: '21cm',
                margin: '0 auto',
                background: 'white'
              }}>
                {/* En-tête employeur */}
                <div style={{
                  borderBottom: '2px solid #2c3e50',
                  paddingBottom: '15px',
                  marginBottom: '30px'
                }}>
                  <div style={{ fontSize: '14pt', fontWeight: 'bold', color: '#2c3e50', marginBottom: '5px' }}>
                    {ENHANCED_MOCK_DATA.etablissementNom}
                  </div>
                  <div style={{ fontSize: '9pt', color: '#555', lineHeight: '1.4' }}>
                    {ENHANCED_MOCK_DATA.etablissementAdresse}<br/>
                    SIRET : {ENHANCED_MOCK_DATA.etablissementSiret}<br/>
                    Email : {ENHANCED_MOCK_DATA.etablissementEmail}
                  </div>
                </div>
                
                {/* Contenu principal avec styles harmonisés */}
                <div 
                  className="document-preview-content"
                  style={{
                    textAlign: 'justify'
                  }}
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
                
                {/* Bloc signature si non présent */}
                {!previewHtml.includes('signature') && (
                  <div style={{
                    marginTop: '60px',
                    paddingTop: '30px',
                    borderTop: '1px solid #ddd',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '30px'
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '10px', color: '#2c3e50' }}>L&apos;Employeur</div>
                      <div style={{ fontSize: '10pt', color: '#666', marginBottom: '15px' }}>
                        Fait le {ENHANCED_MOCK_DATA.signature}
                      </div>
                      <div style={{ marginTop: '40px', borderBottom: '1px solid #000', paddingTop: '5px' }}></div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '10px', color: '#2c3e50' }}>Le Salarié</div>
                      <div style={{ fontSize: '10pt', color: '#666', marginBottom: '15px' }}>
                        Fait le {ENHANCED_MOCK_DATA.signature}
                      </div>
                      <div style={{ marginTop: '40px', borderBottom: '1px solid #000', paddingTop: '5px' }}>Lu et approuvé</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-4 border-t border-gray-200">
          <Button
            onClick={() => onOpenChange(false)}
            variant="outline"
            className="border-gray-300"
          >
            Annuler
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              updateMutation.isPending || 
              validationResult.errors.length > 0 || 
              validationResult.missing.length > 0 ||
              unresolvedVariables.length > 0 ||
              htmlArtifacts.length > 0
            }
            className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400"
          >
            <Save className="w-4 h-4 mr-2" />
            {updateMutation.isPending ? 'Sauvegarde...' : 
             validationResult.errors.length > 0 ? '⛔ Erreurs à corriger' :
             validationResult.missing.length > 0 ? '⚠️ Éléments manquants' :
             unresolvedVariables.length > 0 ? '⛔ Variables non résolues' :
             htmlArtifacts.length > 0 ? '⛔ Artefacts HTML détectés' :
             'Sauvegarder'}
          </Button>
        </div>

        {/* AI Template Generator */}
        <AITemplateGenerator
          open={showAIGenerator}
          onOpenChange={setShowAIGenerator}
          templateType={formData.typeDocument}
          categorieDocument={formData.categorieDocument}
          onInsertContent={(content) => {
            setFormData({ ...formData, htmlContent: content });
            setShowAIGenerator(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}