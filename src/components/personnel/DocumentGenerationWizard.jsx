import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { AlertCircle, FileText, ChevronRight, ChevronLeft, CheckCircle, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import PDFDownloadModal from './PDFDownloadModal';

export default function DocumentGenerationWizard({ open, onOpenChange, employee, establishment }) {
  const [step, setStep] = useState(1);
  const [documentType, setDocumentType] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [selectedTemplateData, setSelectedTemplateData] = useState(null);
  const [customFieldsData, setCustomFieldsData] = useState({});
  const [editData, setEditData] = useState({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedDocument, setGeneratedDocument] = useState(null);
  const [showPDFDownload, setShowPDFDownload] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  // Charger tous les templates actifs
  const { data: allTemplates = [] } = useQuery({
    queryKey: ['templatesRH'],
    queryFn: () => base44.entities.TemplatesRH.filter({ isActive: true })
  });

  const documentTypes = [
    { category: 'A_CONTRACTUEL', value: 'CDD', label: '🔒 Contrat CDD' },
    { category: 'A_CONTRACTUEL', value: 'CDI', label: '🔒 Contrat CDI' },
    { category: 'A_CONTRACTUEL', value: 'AVENANT', label: '🔒 Avenant contractuel' },
    { category: 'B_DISCIPLINAIRE', value: 'AVERTISSEMENT', label: '⚠️ Lettre d\'avertissement' },
    { category: 'D_ADMINISTRATIF', value: 'ATTESTATION', label: '📄 Attestation employeur' }
  ];

  // Filtrer les templates en fonction du type de document sélectionné
  const getAvailableTemplates = () => {
    if (!documentType) return [];
    
    return allTemplates
      .filter(template => template.typeDocument === documentType)
      .map(template => ({
        id: template.id,
        name: template.name,
        type: template.typeDocument,
        label: template.name
      }));
  };

  const filteredTemplates = getAvailableTemplates();

  const handleNextStep = async () => {
    if (step === 1 && !documentType) {
      toast.error('Veuillez choisir un type de document');
      return;
    }
    if (step === 2 && !selectedTemplate) {
      toast.error('Veuillez choisir un template');
      return;
    }
    
    // Charger les détails du template sélectionné pour step 3
    if (step === 2 && selectedTemplate) {
      const template = allTemplates.find(t => t.id === selectedTemplate);
      setSelectedTemplateData(template);
      
      // Initialiser les valeurs par défaut des custom fields
      if (template?.customFields) {
        const defaults = {};
        template.customFields.forEach(field => {
          if (field.defaultValue) {
            defaults[field.key] = field.defaultValue;
          } else if (field.type === 'date' && field.key === 'dateNotification') {
            defaults[field.key] = new Date().toISOString().split('T')[0];
          }
        });
        setCustomFieldsData(defaults);
      }
    }
    
    // Validation des champs personnalisés avant d'aller à step 4
    if (step === 3 && selectedTemplateData?.customFields) {
      for (const field of selectedTemplateData.customFields) {
        if (field.required && !customFieldsData[field.key]) {
          toast.error(`Le champ "${field.label}" est obligatoire`);
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
          contractType: documentType,
          employeeName: `${employee.last_name}_${employee.first_name}`
        });
        setStep(6);
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

  const downloadPdf = () => {
    if (!generatedDocument?.html) {
      toast.error('HTML non disponible');
      return;
    }

    try {
      // Ouvrir une nouvelle fenêtre
      const printWindow = window.open('', '', 'width=900,height=700');
      
      // Injecter le HTML avec CSS print optimisé
      const fullHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    html, body {
      width: 100%;
      height: 100%;
    }
    
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
    
    @media print {
      @page {
        size: A4;
        margin: 18mm 16mm 18mm 16mm;
      }
      
      body {
        margin: 0;
        padding: 0;
        background: white;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
      
      .print-container {
        width: 100%;
        height: auto;
        margin: 0;
        box-shadow: none;
        page-break-after: always;
      }
      
      .no-print {
        display: none !important;
      }
      
      h1, h2, h3, h4 {
        break-after: avoid;
        page-break-after: avoid;
      }
      
      p {
        orphans: 3;
        widows: 3;
      }
      
      .article {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      
      .signature-section {
        break-inside: avoid;
        page-break-inside: avoid;
        margin-top: 2em;
      }
      
      .signature-block {
        break-inside: avoid;
        page-break-inside: avoid;
        margin-top: 1.5em;
      }
      
      hr {
        border: none;
        border-top: 1px solid #666;
        margin: 1em 0;
        page-break-after: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="print-container">
    ${generatedDocument.html}
  </div>
  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 250);
    };
  </script>
</body>
</html>`;
      
      printWindow.document.write(fullHtml);
      printWindow.document.close();
      
      // Attendre que le document soit chargé avant d'afficher le message
      printWindow.onload = function() {
        setTimeout(() => {
          toast.success('Fenêtre d\'impression ouverte.\n\n📋 Conseils :\n1. Décochez "En-têtes et pieds de page"\n2. Format : A4 Portrait\n3. Marges : défaut du navigateur\n4. Cliquez "Enregistrer en PDF"');
        }, 100);
      };
      
      // Fallback si onload ne se déclenche pas
      setTimeout(() => {
        toast.success('Fenêtre d\'impression ouverte.\n\n📋 Conseils :\n1. Décochez "En-têtes et pieds de page"\n2. Format : A4 Portrait\n3. Marges : défaut du navigateur\n4. Cliquez "Enregistrer en PDF"');
      }, 500);
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de l\'ouverture de la fenêtre d\'impression');
    }
  };

  const handleClose = () => {
    setStep(1);
    setDocumentType('');
    setSelectedTemplate('');
    setSelectedTemplateData(null);
    setCustomFieldsData({});
    setEditData({});
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
              Étape {step} / 6 - {['Type de document', 'Choix du template', 'Données spécifiques', 'Vérification', 'Génération', 'Téléchargement'][step - 1]}
            </DialogDescription>
          </DialogHeader>

          {/* STEP 1: Choix du type */}
          {step === 1 && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 gap-3">
                {documentTypes.map(type => (
                  <button
                    key={type.value}
                    onClick={() => setDocumentType(type.value)}
                    className={`p-4 border-2 rounded-lg text-left transition-all ${
                      documentType === type.value
                        ? 'border-orange-600 bg-orange-50'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <p className="font-semibold text-gray-900">{type.label}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* STEP 2: Choix du template */}
          {step === 2 && (
            <div className="space-y-4 py-4">
              <div>
                <Label className="text-gray-900 mb-2 block">Choisir un template</Label>
                <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                  <SelectTrigger className="border-gray-300">
                    <SelectValue placeholder="Sélectionner un template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredTemplates.map(template => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* STEP 3: Données spécifiques du document */}
          {step === 3 && selectedTemplateData?.customFields && selectedTemplateData.customFields.length > 0 && (
            <div className="space-y-4 py-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2">
                <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  Remplissez les informations spécifiques à ce document.
                </div>
              </div>

              <div className="space-y-4">
                {selectedTemplateData.customFields.map((field) => (
                  <div key={field.key} className="space-y-2">
                    <Label className="text-gray-900 font-semibold">
                      {field.label}
                      {field.required && <span className="text-red-600 ml-1">*</span>}
                    </Label>
                    
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
                          className="w-full min-h-[120px] p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                          required={field.required}
                          maxLength={field.maxLength || 2000}
                        />
                        {field.helpText && (
                          <p className="text-xs text-gray-600">{field.helpText}</p>
                        )}
                        {field.maxLength && (
                          <p className="text-xs text-gray-500 text-right">
                            {(customFieldsData[field.key] || '').length} / {field.maxLength} caractères
                          </p>
                        )}
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

          {/* STEP 4: Vérification des données */}
          {step === 4 && (
            <div className="space-y-4 py-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2">
                <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  Vérifiez les données avant génération.
                </div>
              </div>

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
                      <p className="font-semibold text-gray-700">Type de contrat</p>
                      <p className="text-gray-900">{documentType || '-'}</p>
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

          {/* STEP 5: Résumé & Génération */}
          {step === 5 && (
            <div className="space-y-4 py-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm text-green-800">
                  ✓ Tous les éléments sont prêts. Cliquez sur "Générer" pour créer le document.
                </p>
              </div>
              <div className="text-sm space-y-1 text-gray-700">
                <p><strong>Type :</strong> {documentType}</p>
                <p><strong>Employé :</strong> {employee?.first_name} {employee?.last_name}</p>
              </div>
            </div>
          )}

          {/* STEP 6: Téléchargement */}
          {step === 6 && generatedDocument && (
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
              disabled={step === 1 || step === 6}
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
                {step === 6 ? 'Fermer' : 'Annuler'}
              </Button>

              {step < 5 ? (
                <Button
                  onClick={handleNextStep}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  Suivant
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : step === 5 ? (
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