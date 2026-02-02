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
import { FileText, Save, AlertCircle, Plus, Eye, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

// Variables disponibles pour insertion
const VARIABLES = {
  'Identité du salarié': [
    { label: 'Prénom', value: '{{prenom}}' },
    { label: 'Nom', value: '{{nom}}' },
    { label: 'Date de naissance', value: '{{naissance}}' },
    { label: 'Lieu de naissance', value: '{{lieuNaissance}}' },
    { label: 'Adresse', value: '{{adresse}}' },
    { label: 'Nationalité', value: '{{nationalite}}' },
    { label: 'Numéro de sécurité sociale', value: '{{secu}}' },
  ],
  'Poste et missions': [
    { label: 'Intitulé du poste', value: '{{poste}}' },
    { label: 'Description des tâches', value: '{{taches}}' },
  ],
  'Durée du contrat': [
    { label: 'Date de début', value: '{{debut}}' },
    { label: 'Date de fin', value: '{{fin}}' },
    { label: 'Motif du CDD', value: '{{motifCDD}}' },
  ],
  'Horaires et rémunération': [
    { label: 'Nombre d\'heures hebdomadaires', value: '{{heures}}' },
    { label: 'Nombre d\'heures mensuelles (texte)', value: '{{heuresTexte}}' },
    { label: 'Taux horaire brut', value: '{{taux}}' },
    { label: 'Salaire brut mensuel', value: '{{salaireBrut}}' },
    { label: 'Heures totales du contrat CDD', value: '{{heuresTotalesCDD}}' },
    { label: 'Jours travaillés prévus (CDD)', value: '{{joursTravaillesCDD}}' },
  ],
  'Période d\'essai': [
    { label: 'Durée de la période d\'essai (texte)', value: '{{periodeEssaiTexte}}' },
    { label: 'Date de fin de période d\'essai', value: '{{finEssai}}' },
  ],
  'Autres': [
    { label: 'Date de signature', value: '{{signature}}' },
  ]
};

// Données mock pour l'aperçu
const MOCK_DATA = {
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

// Validation des incohérences juridiques
const validateTemplate = (content, typeDocument) => {
  const errors = [];
  const contentLower = content.toLowerCase();

  if (typeDocument === 'CDI') {
    if (contentLower.includes('{{fin}}') || content.includes('{{fin}}')) {
      errors.push('Un CDI ne peut pas contenir de date de fin de contrat');
    }
    if (contentLower.includes('{{motifcdd}}') || content.includes('{{motifCDD}}')) {
      errors.push('Un CDI ne peut pas contenir de motif de recours au CDD');
    }
    if (contentLower.includes('cdd') && !contentLower.includes('cdi')) {
      errors.push('Le contenu semble faire référence à un CDD alors que le type est CDI');
    }
  }

  if (typeDocument === 'CDD') {
    if (!contentLower.includes('{{fin}}') && !content.includes('{{fin}}')) {
      errors.push('Un CDD doit obligatoirement contenir une date de fin de contrat');
    }
    if (!contentLower.includes('{{motifcdd}}') && !content.includes('{{motifCDD}}')) {
      errors.push('Un CDD doit obligatoirement contenir le motif de recours');
    }
  }

  return errors;
};

export default function TemplateBuilderModal({ open, onOpenChange, template, onSuccess }) {
  const [formData, setFormData] = useState({
    name: '',
    typeDocument: 'CDD',
    sousType: '',
    description: '',
    version: '',
    htmlContent: '',
    isActive: true,
    notes: ''
  });

  const [showVariableMenu, setShowVariableMenu] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);
  const quillRef = React.useRef(null);

  useEffect(() => {
    if (template) {
      setFormData({
        name: template.name || '',
        typeDocument: template.typeDocument || 'CDD',
        sousType: template.sousType || '',
        description: template.description || '',
        version: template.version || '',
        htmlContent: template.htmlContent || '',
        isActive: template.isActive !== false,
        notes: template.notes || ''
      });
    } else {
      setFormData({
        name: '',
        typeDocument: 'CDD',
        sousType: '',
        description: '',
        version: 'v1.0',
        htmlContent: '',
        isActive: true,
        notes: ''
      });
    }
    setValidationErrors([]);
  }, [template, open]);

  // Validation en temps réel
  useEffect(() => {
    if (formData.htmlContent && formData.typeDocument) {
      const errors = validateTemplate(formData.htmlContent, formData.typeDocument);
      setValidationErrors(errors);
    }
  }, [formData.htmlContent, formData.typeDocument]);

  // Aperçu avec données mock
  const previewHtml = useMemo(() => {
    let html = formData.htmlContent;
    Object.entries(MOCK_DATA).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      html = html.replace(regex, `<strong>${value}</strong>`);
    });
    return html;
  }, [formData.htmlContent]);

  const updateMutation = useMutation({
    mutationFn: (data) => {
      if (template?.id) {
        return base44.entities.TemplatesRH.update(template.id, data);
      } else {
        return base44.entities.TemplatesRH.create(data);
      }
    },
    onSuccess: () => {
      toast.success(template?.id ? 'Template mis à jour' : 'Template créé');
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

    if (validationErrors.length > 0) {
      toast.error('Veuillez corriger les incohérences juridiques avant de sauvegarder');
      return;
    }

    updateMutation.mutate({
      name: formData.name,
      typeDocument: formData.typeDocument,
      sousType: formData.sousType,
      description: formData.description,
      version: formData.version,
      htmlContent: formData.htmlContent,
      isActive: formData.isActive,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white border-gray-300 max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900">
            <Sparkles className="w-5 h-5 text-orange-600" />
            {template?.id ? 'Modifier' : 'Créer'} un template (No-Code)
          </DialogTitle>
          <DialogDescription>
            Créez votre contrat comme dans Word - les données seront insérées automatiquement
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="infos" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="infos">Informations</TabsTrigger>
            <TabsTrigger value="contenu">Contenu du contrat</TabsTrigger>
            <TabsTrigger value="apercu">
              <Eye className="w-4 h-4 mr-2" />
              Aperçu temps réel
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-900 font-semibold">Type de contrat</Label>
                <Select value={formData.typeDocument} onValueChange={(value) => setFormData({ ...formData, typeDocument: value })}>
                  <SelectTrigger className="border-gray-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CDD">CDD (Contrat à Durée Déterminée)</SelectItem>
                    <SelectItem value="CDI">CDI (Contrat à Durée Indéterminée)</SelectItem>
                    <SelectItem value="AVENANT">AVENANT</SelectItem>
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

          {/* Onglet Contenu */}
          <TabsContent value="contenu" className="space-y-4 py-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-semibold">Rédigez comme dans Word</p>
                <p>Utilisez le bouton "Insérer une donnée" pour ajouter des informations du salarié, de l'établissement ou des calculs automatiques.</p>
              </div>
            </div>

            {/* Validation errors */}
            {validationErrors.length > 0 && (
              <div className="bg-red-50 border border-red-300 rounded-lg p-3">
                <div className="flex gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-red-900 text-sm mb-1">⚠️ Incohérences juridiques détectées :</p>
                    <ul className="text-sm text-red-800 space-y-1">
                      {validationErrors.map((error, idx) => (
                        <li key={idx}>• {error}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2 mb-2">
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

            {/* Menu de variables */}
            {showVariableMenu && (
              <div className="bg-white border border-gray-300 rounded-lg p-4 max-h-64 overflow-y-auto">
                {Object.entries(VARIABLES).map(([category, vars]) => (
                  <div key={category} className="mb-4">
                    <h4 className="font-semibold text-gray-700 text-xs uppercase mb-2">{category}</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {vars.map((v) => (
                        <button
                          key={v.value}
                          onClick={() => insertVariable(v.value)}
                          className="text-left px-3 py-2 text-sm bg-gray-50 hover:bg-orange-50 hover:text-orange-700 rounded border border-gray-200 hover:border-orange-300 transition-colors"
                        >
                          {v.label}
                        </button>
                      ))}
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
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
              <Eye className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-semibold">Aperçu avec données de test</p>
                <p>Les variables sont remplacées par des données fictives réalistes. Le PDF final aura ce rendu.</p>
              </div>
            </div>

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
            disabled={updateMutation.isPending || validationErrors.length > 0}
            className="bg-orange-600 hover:bg-orange-700"
          >
            <Save className="w-4 h-4 mr-2" />
            {updateMutation.isPending ? 'Sauvegarde...' : 'Sauvegarder'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}