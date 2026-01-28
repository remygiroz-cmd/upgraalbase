import React, { useState, useEffect } from 'react';
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
import { FileText, Save, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function TemplateEditorModal({ open, onOpenChange, template, onSuccess }) {
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

  const [htmlPreview, setHtmlPreview] = useState(false);

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
        version: '',
        htmlContent: '',
        isActive: true,
        notes: ''
      });
    }
  }, [template, open]);

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
      toast.error('Le contenu HTML est requis');
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white border-gray-300 max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900">
            <FileText className="w-5 h-5 text-orange-600" />
            {template?.id ? 'Modifier' : 'Créer'} un template
          </DialogTitle>
          <DialogDescription>
            Éditez les détails et le contenu HTML du template de contrat
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="infos" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="infos">Informations</TabsTrigger>
            <TabsTrigger value="html">Contenu HTML</TabsTrigger>
            <TabsTrigger value="apercu">Aperçu</TabsTrigger>
          </TabsList>

          {/* Onglet Informations */}
          <TabsContent value="infos" className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-900 font-semibold">Nom du template</Label>
                <Input
                  placeholder="Ex: CDD_TC_RESTAURATION_RAPIDE"
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
                <Label className="text-gray-900 font-semibold">Type de document</Label>
                <Select value={formData.typeDocument} onValueChange={(value) => setFormData({ ...formData, typeDocument: value })}>
                  <SelectTrigger className="border-gray-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CDD">CDD</SelectItem>
                    <SelectItem value="CDI">CDI</SelectItem>
                    <SelectItem value="AVENANT">AVENANT</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-900 font-semibold">Sous-type (optionnel)</Label>
                <Input
                  placeholder="Ex: RESTAURATION_RAPIDE"
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

          {/* Onglet HTML */}
          <TabsContent value="html" className="space-y-4 py-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-semibold">Variables disponibles:</p>
                <p>{{prenom}}, {{nom}}, {{naissance}}, {{adresse}}, {{poste}}, {{debut}}, {{fin}}, {{heures}}, {{taux}}, {{salaireBrut}}, {{motifCDD}}, etc.</p>
              </div>
            </div>

            <Label className="text-gray-900 font-semibold block">Contenu HTML</Label>
            <textarea
              value={formData.htmlContent}
              onChange={(e) => setFormData({ ...formData, htmlContent: e.target.value })}
              className="w-full h-96 p-3 border border-gray-300 rounded-lg font-mono text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Collez votre HTML du template..."
            />
          </TabsContent>

          {/* Onglet Aperçu */}
          <TabsContent value="apercu" className="space-y-4 py-4">
            <div className="bg-gray-50 border border-gray-300 rounded-lg p-4 max-h-96 overflow-auto">
              {formData.htmlContent ? (
                <iframe
                  srcDoc={formData.htmlContent}
                  className="w-full h-96 border border-gray-300 rounded"
                  title="Aperçu du template"
                />
              ) : (
                <p className="text-gray-500 text-center py-12">Aucun contenu HTML à afficher</p>
              )}
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
            disabled={updateMutation.isPending}
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