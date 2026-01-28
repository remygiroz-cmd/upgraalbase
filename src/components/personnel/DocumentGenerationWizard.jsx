import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, FileText, ChevronRight, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function DocumentGenerationWizard({ open, onOpenChange, employee, establishment }) {
  const [step, setStep] = useState(1);
  const [documentType, setDocumentType] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [editData, setEditData] = useState({});
  const [isGenerating, setIsGenerating] = useState(false);

  const documentTypes = [
    { value: 'CDD', label: 'Contrat CDD' },
    { value: 'CDI', label: 'Contrat CDI' }
  ];

  const templates = [
    { id: 'CDD_RR', type: 'CDD', label: 'CDD - Restauration Rapide' },
    { id: 'CDI_RR', type: 'CDI', label: 'CDI - Restauration Rapide' }
  ];

  const filteredTemplates = templates.filter(t => t.type === documentType);

  const handleNextStep = () => {
    if (step === 1 && !documentType) {
      toast.error('Veuillez choisir un type de document');
      return;
    }
    if (step === 2 && !selectedTemplate) {
      toast.error('Veuillez choisir un template');
      return;
    }
    setStep(step + 1);
  };

  const handlePrevStep = () => {
    setStep(step - 1);
  };

  const handleGenerate = async () => {
    if (!employee?.id || !establishment?.id) {
      toast.error('Données employé ou établissement manquantes');
      return;
    }

    setIsGenerating(true);
    try {
      // TODO: Appeler la fonction backend pour générer le document
      toast.success('Document généré avec succès');
      onOpenChange(false);
    } catch (error) {
      toast.error('Erreur lors de la génération : ' + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setDocumentType('');
    setSelectedTemplate('');
    setEditData({});
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-white border-gray-300 max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-orange-600" />
            Générer un document RH
          </DialogTitle>
          <DialogDescription className="text-gray-600">
            Étape {step} / 4 - {['Choix du type', 'Choix du template', 'Vérification', 'Génération'][step - 1]}
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

        {/* STEP 3: Vérification des données */}
        {step === 3 && (
          <div className="space-y-4 py-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                Vérifiez les données avant génération. Les champs modifiables peuvent être éditées ci-dessous.
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
                    <p className="text-gray-900">{employee?.work_time_type || '-'}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-700">Heures/mois</p>
                    <p className="text-gray-900">{employee?.contract_hours || '-'}</p>
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
                  <div>
                    <p className="font-semibold text-gray-700">Mode de paiement</p>
                    <p className="text-gray-900">{employee?.payment_method || '-'}</p>
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
              <p><strong>Type :</strong> {documentType}</p>
              <p><strong>Template :</strong> {selectedTemplate}</p>
              <p><strong>Employé :</strong> {employee?.first_name} {employee?.last_name}</p>
              <p><strong>Établissement :</strong> {establishment?.name}</p>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-2 justify-between pt-4 border-t border-gray-200">
          <Button
            onClick={handlePrevStep}
            disabled={step === 1}
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
              Annuler
            </Button>

            {step < 4 ? (
              <Button
                onClick={handleNextStep}
                className="bg-orange-600 hover:bg-orange-700"
              >
                Suivant
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="bg-green-600 hover:bg-green-700"
              >
                {isGenerating ? 'Génération en cours...' : 'Générer le document'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}