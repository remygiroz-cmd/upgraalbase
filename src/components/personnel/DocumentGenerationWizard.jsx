import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { AlertCircle, FileText, ChevronRight, ChevronLeft, CheckCircle, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import PDFDownloadModal from './PDFDownloadModal';
import { detectManualVariables } from './VariableDetector';
import AIWritingAssistant from './AIWritingAssistant';

export default function DocumentGenerationWizard({ open, onOpenChange, employee, establishment }) {
  const [step, setStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [selectedTemplateData, setSelectedTemplateData] = useState(null);
  const [detectedFields, setDetectedFields] = useState([]);
  const [customFieldsData, setCustomFieldsData] = useState({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedDocument, setGeneratedDocument] = useState(null);
  const [showPDFDownload, setShowPDFDownload] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  // Charger tous les templates actifs
  const { data: allTemplates = [] } = useQuery({
    queryKey: ['templatesRH'],
    queryFn: () => base44.entities.TemplatesRH.filter({ isActive: true })
  });

  // Grouper les templates par catégorie
  const templatesByCategory = React.useMemo(() => {
    const categories = {
      'A_CONTRACTUEL': { label: '📝 Documents contractuels', icon: '🔒', templates: [] },
      'B_DISCIPLINAIRE': { label: '⚠️ Documents disciplinaires', icon: '⚖️', templates: [] },
      'C_RUPTURE': { label: '🔚 Rupture / Fin de contrat', icon: '✂️', templates: [] },
      'D_ADMINISTRATIF': { label: '📋 Documents administratifs', icon: '📄', templates: [] },
      'E_LIBRE': { label: '✍️ Documents libres', icon: '📝', templates: [] }
    };

    allTemplates.forEach(template => {
      const cat = template.categorieDocument || 'E_LIBRE';
      if (categories[cat]) {
        categories[cat].templates.push(template);
      }
    });

    // Retourner uniquement les catégories qui ont des templates
    return Object.entries(categories)
      .filter(([_, data]) => data.templates.length > 0)
      .map(([key, data]) => ({ key, ...data }));
  }, [allTemplates]);

  const handleNextStep = async () => {
    // Validation template sélectionné
    if (step === 1 && !selectedTemplate) {
      toast.error('Veuillez choisir un document');
      return;
    }
    
    // Charger les détails du template sélectionné
    if (step === 1 && selectedTemplate) {
      const template = allTemplates.find(t => t.id === selectedTemplate);
      setSelectedTemplateData(template);
      
      // Détecter TOUTES les variables manuelles avec forçage des champs obligatoires
      const fields = detectManualVariables(
        template?.htmlContent, 
        template?.customFields || [],
        template?.categorieDocument,
        template?.typeDocument
      );
      
      setDetectedFields(fields);
      
      // Si pas de champs à saisir, passer directement à la vérification
      if (fields.length === 0) {
        setStep(3); // Aller à la vérification
        return;
      }
      
      // Initialiser les valeurs par défaut
      const defaults = {};
      fields.forEach(field => {
        if (field.defaultValue) {
          defaults[field.key] = field.defaultValue;
        } else if (field.type === 'date' && (field.key === 'dateNotification' || field.key.toLowerCase().includes('date'))) {
          defaults[field.key] = new Date().toISOString().split('T')[0];
        }
      });
      setCustomFieldsData(defaults);
    }
    
    // Validation des champs personnalisés avant d'aller à la vérification
    if (step === 2 && detectedFields.length > 0) {
      // Vérifier TOUS les champs obligatoires
      const missingFields = [];
      
      for (const field of detectedFields) {
        if (field.required && (!customFieldsData[field.key] || !customFieldsData[field.key].toString().trim())) {
          missingFields.push(field);
        }
      }
      
      if (missingFields.length > 0) {
        const fieldsList = missingFields.map(f => `• ${f.label}`).join('\n');
        toast.error(
          `⛔ ${missingFields.length} champ${missingFields.length > 1 ? 's' : ''} obligatoire${missingFields.length > 1 ? 's' : ''} manquant${missingFields.length > 1 ? 's' : ''}\n\n${fieldsList}\n\n` +
          (selectedTemplateData?.categorieDocument === 'B_DISCIPLINAIRE' 
            ? '⚖️ Ces informations sont juridiquement obligatoires pour un document disciplinaire.' 
            : 'Ces informations sont requises pour générer le document.'),
          { duration: 6000 }
        );
        return;
      }
      
      // Validation juridique stricte pour documents disciplinaires (contrôle supplémentaire)
      const isDisciplinary = selectedTemplateData?.categorieDocument === 'B_DISCIPLINAIRE';
      if (isDisciplinary) {
        // Vérifier que descriptionFaits et motifSanction sont bien présents et non vides
        if (!customFieldsData.descriptionFaits?.trim() || !customFieldsData.motifSanction?.trim()) {
          toast.error('⚖️ BLOCAGE JURIDIQUE\n\nUne sanction disciplinaire doit OBLIGATOIREMENT contenir :\n• La description factuelle des faits reprochés\n• Le motif juridique de la sanction\n\nCes éléments protègent juridiquement l\'employeur et le salarié.', {
            duration: 7000
          });
          return;
        }
        
        // Interdire motifRupture dans les documents disciplinaires
        if (customFieldsData.motifRupture) {
          toast.error('❌ ERREUR JURIDIQUE\n\nUn document disciplinaire ne peut pas contenir de "motif de rupture".\n\nUtilisez "motif de la sanction" à la place.', {
            duration: 6000
          });
          return;
        }
      }
      
      // Validation juridique stricte pour avenants
      const isAvenant = selectedTemplateData?.typeDocument === 'AVENANT';
      if (isAvenant) {
        const requiredAvenantFields = ['motifModification', 'ancienneValeur', 'nouvelleValeur', 'dateEffet'];
        const missingAvenant = requiredAvenantFields.filter(key => !customFieldsData[key]?.toString().trim());
        
        if (missingAvenant.length > 0) {
          toast.error('📝 AVENANT INCOMPLET\n\nUn avenant doit obligatoirement préciser :\n• La modification contractuelle\n• L\'ancienne valeur\n• La nouvelle valeur\n• La date d\'effet\n\nÉléments manquants : ' + missingAvenant.join(', '), {
            duration: 6000
          });
          return;
        }
      }
    }
    
    setStep(step + 1);
  };

  const handlePrevStep = () => {
    setStep(step - 1);
  };

  const handleGenerate = async () => {
    if (!employee?.id) {
      toast.error('Données employé manquantes');
      return;
    }

    setIsGenerating(true);
    try {
      const templateId = selectedTemplate;

      const response = await base44.functions.invoke('generateContractPdf', {
        templateId: templateId,
        employeeId: employee.id,
        customData: customFieldsData
      });

      if (response.data.success) {
        setGeneratedDocument({
          id: response.data.documentId,
          html: response.data.html,
          contractType: selectedTemplateData?.typeDocument || 'DOCUMENT',
          employeeName: `${employee.last_name}_${employee.first_name}`
        });
        setStep(5);
        toast.success('Document généré avec succès');
      } else {
        toast.error('Erreur lors de la génération');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error(error.response?.data?.error || 'Erreur lors de la génération');
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadPdf = async () => {
    if (!generatedDocument?.html) {
      toast.error('HTML non disponible');
      return;
    }

    setIsDownloadingPdf(true);

    try {
      // Créer un blob du HTML
      const blob = new Blob([generatedDocument.html], { type: 'text/html' });
      const file = new File([blob], `document_${Date.now()}.html`, { type: 'text/html' });

      // Upload automatique du fichier
      const uploadResponse = await base44.integrations.Core.UploadFile({ file });
      const fileUrl = uploadResponse.file_url;

      if (!fileUrl) {
        throw new Error('URL du fichier non disponible');
      }

      // Mapper la catégorie de document vers une catégorie employé
      const categoryMapping = {
        'A_CONTRACTUEL': 'Contrats',
        'B_DISCIPLINAIRE': 'Disciplinaire',
        'C_RUPTURE': 'Rupture',
        'D_ADMINISTRATIF': 'Administratif',
        'E_LIBRE': 'Courriers RH'
      };

      const documentCategory = categoryMapping[selectedTemplateData?.categorieDocument] || 'Documents RH';

      // Construire le nouvel objet document
      const newDocument = {
        name: `${selectedTemplateData?.name || 'Document'}_${new Date().toISOString().split('T')[0]}`,
        url: fileUrl,
        category: documentCategory,
        tags: [
          selectedTemplateData?.typeDocument,
          selectedTemplateData?.categorieDocument,
          'généré_automatiquement'
        ],
        uploaded_at: new Date().toISOString(),
        metadata: {
          documentRhId: generatedDocument.id,
          templateId: selectedTemplate,
          templateName: selectedTemplateData?.name,
          typeDocument: selectedTemplateData?.typeDocument,
          categorieDocument: selectedTemplateData?.categorieDocument,
          generatedBy: employee?.email || 'system'
        }
      };

      // Récupérer les documents existants de l'employé
      const existingDocuments = employee?.documents || [];

      // Mettre à jour l'employé avec le nouveau document
      await base44.entities.Employee.update(employee.id, {
        documents: [...existingDocuments, newDocument]
      });

      toast.success('✅ Document enregistré automatiquement dans la fiche employé');

      // Ouvrir la fenêtre d'impression
      const printWindow = window.open('', '', 'width=900,height=700');
      
      const fullHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; }
    body {
      font-family: 'Calibri', 'Arial', sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #000;
      background: #f5f5f5;
    }
    .print-container {
      width: 210mm;
      height: 297mm;
      margin: 0 auto;
      background: white;
      box-shadow: 0 0 10px rgba(0,0,0,0.1);
    }
    
    /* === GESTION STRICTE DES COUPURES DE PAGE === */
    .no-break, .block, .section, .article, .article-content,
    .signature-block, .signature-row, .signature-col,
    .employee-block, .employer-block,
    .identification-parties, .entre-et-block, .preambule,
    .clauses-block {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    
    @media print {
      @page { 
        size: A4; 
        margin: 2.5cm 2cm 2cm 2cm; 
      }
      body { margin: 0; padding: 0; background: white; }
      .print-container { width: 100%; height: auto; margin: 0; box-shadow: none; padding: 0; }
      .no-print { display: none !important; }
      
      /* Titres: toujours avec contenu qui suit */
      h1, h2, h3, h4, h5, h6 { 
        break-after: avoid; 
        page-break-after: avoid;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      
      /* Paragraphes: orphelines et veuves */
      p { orphans: 3; widows: 3; }
      
      /* Blocs logiques: JAMAIS de coupure */
      .no-break, .block, .section, .article, .article-content,
      .signature-block, .signature-row, .signature-col,
      .employee-block, .employer-block,
      .identification-parties, .entre-et-block, .preambule,
      .clauses-block {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      
      /* Tableaux */
      table, tr { 
        break-inside: avoid; 
        page-break-inside: avoid; 
      }
      thead { 
        break-after: avoid; 
        page-break-after: avoid; 
      }
      
      /* Signatures: toujours ensemble */
      .signature-block {
        margin-top: 40px;
        min-height: 120px;
      }
      
      /* Couleurs exactes */
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <div class="print-container">${generatedDocument.html}</div>
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 250);
    };
  </script>
</body>
</html>`;
      
      printWindow.document.write(fullHtml);
      printWindow.document.close();
      
      setTimeout(() => {
        toast.success('📋 Fenêtre d\'impression ouverte\n\nConseils :\n• Décochez "En-têtes et pieds de page"\n• Format : A4 Portrait\n• Enregistrer en PDF', { duration: 4000 });
      }, 500);

    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de l\'enregistrement automatique : ' + error.message);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setSelectedTemplate('');
    setSelectedTemplateData(null);
    setDetectedFields([]);
    setCustomFieldsData({});
    setGeneratedDocument(null);
    setShowPDFDownload(false);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="bg-white border-gray-300 max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-gray-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-orange-600" />
              Créer un document RH
            </DialogTitle>
            <DialogDescription className="text-gray-600">
              Étape {step} / 5 - {['Choix du document', 'Données spécifiques', 'Vérification', 'Génération', 'Téléchargement'][step - 1]}
            </DialogDescription>
          </DialogHeader>

          {/* STEP 1: Choix du document (template) */}
          {step === 1 && (
            <div className="space-y-6 py-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2">
                <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  Sélectionnez le type de document RH à générer
                </div>
              </div>

              {templatesByCategory.map(category => (
                <div key={category.key} className="space-y-3">
                  <h4 className="font-semibold text-gray-700 text-sm flex items-center gap-2 px-2">
                    <span className="text-base">{category.icon}</span>
                    {category.label}
                  </h4>
                  <div className="grid grid-cols-1 gap-2">
                    {category.templates.map(template => (
                      <button
                        key={template.id}
                        onClick={() => setSelectedTemplate(template.id)}
                        className={`p-4 border-2 rounded-lg text-left transition-all hover:shadow-sm ${
                          selectedTemplate === template.id
                            ? 'border-orange-600 bg-orange-50'
                            : 'border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="font-semibold text-gray-900">{template.name}</p>
                            {template.description && (
                              <p className="text-xs text-gray-600 mt-1">{template.description}</p>
                            )}
                          </div>
                          {template.isOfficial && (
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                              Officiel
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {templatesByCategory.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <p className="mb-2">Aucun template disponible</p>
                  <p className="text-sm">Créez vos premiers templates RH dans la section Templates</p>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Données spécifiques du document */}
          {step === 2 && detectedFields.length > 0 && (
            <div className="space-y-4 py-4">
              {selectedTemplateData?.categorieDocument === 'B_DISCIPLINAIRE' ? (
                <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 flex gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-red-900">
                    <p className="font-bold mb-2">⚖️ DOCUMENT DISCIPLINAIRE - Exigences juridiques</p>
                    <p className="text-red-800 mb-2">
                      Les champs marqués d'un <span className="text-red-600 font-bold">*</span> sont <strong>OBLIGATOIRES</strong> pour la validité juridique du document.
                    </p>
                    <p className="text-red-700 text-xs">
                      Tout document disciplinaire incomplet peut être contesté devant les Prud'hommes. Assurez-vous de remplir tous les champs requis.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex gap-3">
                  <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-orange-900">
                    <p className="font-semibold mb-1">📝 Informations à compléter manuellement</p>
                    <p className="text-orange-800">
                      Les champs marqués d'un <span className="text-red-600 font-bold">*</span> sont obligatoires 
                      et doivent être remplis avant de générer le document.
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-5">
                {detectedFields.map((field) => (
                  <div key={field.key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-gray-900 font-semibold">
                        {field.label}
                        {field.required && <span className="text-red-600 ml-1">*</span>}
                      </Label>
                      {(field.type === 'textarea' || field.type === 'text') && (
                        <AIWritingAssistant
                          fieldKey={field.key}
                          fieldLabel={field.label}
                          onInsert={(text) => setCustomFieldsData({...customFieldsData, [field.key]: text})}
                        />
                      )}
                    </div>

                    {field.type === 'text' && (
                      <Input
                        placeholder={field.placeholder || ''}
                        value={customFieldsData[field.key] || ''}
                        onChange={(e) => setCustomFieldsData({...customFieldsData, [field.key]: e.target.value})}
                        className="border-gray-300"
                        required={field.required}
                      />
                    )}

                    {field.type === 'textarea' && (
                      <div className="space-y-2">
                        <textarea
                          placeholder={field.placeholder || ''}
                          value={customFieldsData[field.key] || ''}
                          onChange={(e) => setCustomFieldsData({...customFieldsData, [field.key]: e.target.value})}
                          className="w-full min-h-[150px] p-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 font-mono text-sm"
                          required={field.required}
                          maxLength={field.maxLength || 2000}
                        />
                        {field.helpText && (
                          <div className="bg-yellow-50 border border-yellow-200 rounded p-2 text-xs text-yellow-900">
                            {field.helpText}
                          </div>
                        )}
                        <div className="flex justify-end items-center text-xs">
                          {field.maxLength && (
                            <span className="text-gray-500">
                              {(customFieldsData[field.key] || '').length} / {field.maxLength} caractères
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {field.type === 'date' && (
                      <Input
                        type="date"
                        value={customFieldsData[field.key] || ''}
                        onChange={(e) => setCustomFieldsData({...customFieldsData, [field.key]: e.target.value})}
                        className="border-gray-300"
                        required={field.required}
                      />
                    )}
                    
                    {field.type === 'number' && (
                      <Input
                        type="number"
                        placeholder={field.placeholder || ''}
                        value={customFieldsData[field.key] || ''}
                        onChange={(e) => setCustomFieldsData({...customFieldsData, [field.key]: e.target.value})}
                        className="border-gray-300"
                        required={field.required}
                      />
                    )}
                    
                    {field.type === 'select' && field.options && (
                      <Select 
                        value={customFieldsData[field.key] || ''} 
                        onValueChange={(value) => setCustomFieldsData({...customFieldsData, [field.key]: value})}
                      >
                        <SelectTrigger className="border-gray-300">
                          <SelectValue placeholder={field.placeholder || 'Sélectionner...'} />
                        </SelectTrigger>
                        <SelectContent>
                          {field.options.map(opt => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 3: Vérification des données */}
          {step === 3 && (
            <div className="space-y-4 py-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-green-800">
                  Toutes les informations sont prêtes. Vérifiez le récapitulatif avant de générer le document.
                </div>
              </div>

              {/* Afficher les données saisies */}
              {detectedFields.length > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
                  <h4 className="font-semibold text-gray-900 text-sm">Données saisies :</h4>
                  {detectedFields.map(field => (
                    <div key={field.key} className="border-b border-gray-200 pb-2 last:border-b-0 last:pb-0">
                      <p className="text-xs text-gray-600 mb-1">{field.label}</p>
                      <p className="text-sm text-gray-900 font-medium whitespace-pre-wrap">
                        {customFieldsData[field.key] || <span className="text-gray-400 italic">Non renseigné</span>}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <Tabs defaultValue="employee" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="employee">Employé</TabsTrigger>
                  <TabsTrigger value="contract">Contrat</TabsTrigger>
                  <TabsTrigger value="remuneration">Rémunération</TabsTrigger>
                </TabsList>

                <TabsContent value="employee" className="space-y-3 mt-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="font-semibold text-gray-700">Nom</p>
                      <p className="text-gray-900">{employee?.last_name || '-'}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-700">Prénom</p>
                      <p className="text-gray-900">{employee?.first_name || '-'}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-700">Date de naissance</p>
                      <p className="text-gray-900">{employee?.birth_date || '-'}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-700">Nationalité</p>
                      <p className="text-gray-900">{employee?.nationality || '-'}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="font-semibold text-gray-700">Adresse</p>
                      <p className="text-gray-900">{employee?.address || '-'}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-700">Email</p>
                      <p className="text-gray-900">{employee?.email || '-'}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-700">Téléphone</p>
                      <p className="text-gray-900">{employee?.phone || '-'}</p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="contract" className="space-y-3 mt-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="font-semibold text-gray-700">Poste</p>
                      <p className="text-gray-900">{employee?.position || '-'}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-700">Type de document</p>
                      <p className="text-gray-900">{selectedTemplateData?.name || '-'}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-700">Date d'embauche</p>
                      <p className="text-gray-900">{employee?.start_date || '-'}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-700">Temps de travail</p>
                      <p className="text-gray-900">{employee?.work_time_type === 'full_time' ? 'Temps complet' : 'Temps partiel'}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-700">Heures/semaine</p>
                      <p className="text-gray-900">{employee?.contract_hours_weekly || '-'}</p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="remuneration" className="space-y-3 mt-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="font-semibold text-gray-700">Taux horaire brut</p>
                      <p className="text-gray-900">{employee?.gross_hourly_rate ? `${employee.gross_hourly_rate}€` : '-'}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-700">Salaire brut mensuel</p>
                      <p className="text-gray-900">{employee?.gross_salary ? `${employee.gross_salary}€` : '-'}</p>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {/* STEP 4: Résumé & Génération */}
          {step === 4 && (
            <div className="space-y-4 py-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm text-green-800">
                  ✓ Tous les éléments sont prêts. Cliquez sur "Générer" pour créer le document.
                </p>
              </div>
              <div className="text-sm space-y-1 text-gray-700">
                <p><strong>Document :</strong> {selectedTemplateData?.name}</p>
                <p><strong>Employé :</strong> {employee?.first_name} {employee?.last_name}</p>
              </div>
            </div>
          )}

          {/* STEP 5: Téléchargement */}
          {step === 5 && generatedDocument && (
            <div className="space-y-4 py-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-green-800">Contrat généré avec succès</p>
                  <p className="text-sm text-green-700 mt-1">
                    Le contrat est prêt à être téléchargé en PDF. Format A4 portrait avec marges fixes.
                  </p>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <strong>Document ID:</strong> {generatedDocument.id}
                </p>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-2 justify-between pt-4 border-t border-gray-200">
            <Button
              onClick={handlePrevStep}
              disabled={step === 1 || step === 5}
              variant="outline"
              className="border-gray-300"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Retour
            </Button>

            <div className="flex gap-2">
              <Button
                onClick={handleClose}
                variant="outline"
                className="border-gray-300"
              >
                {step === 5 ? 'Fermer' : 'Annuler'}
              </Button>

              {step < 4 ? (
                <Button
                  onClick={handleNextStep}
                  disabled={
                    step === 2 && 
                    detectedFields.some(f => f.required && (!customFieldsData[f.key] || !customFieldsData[f.key].toString().trim()))
                  }
                  className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {step === 2 && detectedFields.some(f => f.required && (!customFieldsData[f.key] || !customFieldsData[f.key].toString().trim())) ? (
                    <>
                      <AlertCircle className="w-4 h-4 mr-1" />
                      Champs obligatoires manquants
                    </>
                  ) : (
                    <>
                      Suivant
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </>
                  )}
                </Button>
              ) : step === 4 ? (
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      Génération...
                    </>
                  ) : (
                    'Générer'
                  )}
                </Button>
              ) : (
                <Button
                  onClick={downloadPdf}
                  disabled={isDownloadingPdf}
                  className="bg-blue-600 hover:bg-blue-700 gap-2"
                >
                  {isDownloadingPdf ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Génération PDF...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Télécharger en PDF
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PDFDownloadModal
        open={showPDFDownload}
        onOpenChange={setShowPDFDownload}
        documentId={generatedDocument?.id}
        html={generatedDocument?.html}
        contractType={generatedDocument?.contractType}
        employeeName={generatedDocument?.employeeName}
      />
    </>
  );
}