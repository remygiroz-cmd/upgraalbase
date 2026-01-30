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

// Variables disponibles - dynamiques selon la catégorie
// IMPORTANT : TOUTES les variables d'établissement sont toujours disponibles via COMMON
const getAvailableVariables = (categorieDocument) => {
  const common = VARIABLES_BY_CATEGORY.COMMON || [];
  
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
    'Données établissement & employé': common,
    'Données spécifiques du document': specific
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

  // Aperçu avec données mock
  const previewHtml = useMemo(() => {
    let html = formData.htmlContent;
    Object.entries(MOCK_DATA).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      html = html.replace(regex, `<strong class="text-orange-600">${value}</strong>`);
    });
    return html;
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

            <div className="bg-white border border-gray-300 rounded-lg p-8 max-h-[600px] overflow-auto shadow-inner">
              <div 
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
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
              validationResult.missing.length > 0
            }
            className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400"
          >
            <Save className="w-4 h-4 mr-2" />
            {updateMutation.isPending ? 'Sauvegarde...' : 
             validationResult.errors.length > 0 ? '⛔ Erreurs à corriger' :
             validationResult.missing.length > 0 ? '⚠️ Éléments manquants' :
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