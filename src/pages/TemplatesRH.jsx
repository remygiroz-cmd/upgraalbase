import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Plus, FileText, Edit, Trash2, Copy } from 'lucide-react';
import { toast } from 'sonner';
import TemplateEditorModal from '@/components/templates/TemplateEditorModal.js';
import { cn } from '@/lib/utils';

export default function TemplatesRH() {
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['templatesRH'],
    queryFn: () => base44.entities.TemplatesRH.list()
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.TemplatesRH.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templatesRH'] });
      toast.success('Template supprimé');
    }
  });

  const duplicateMutation = useMutation({
    mutationFn: async (template) => {
      const newTemplate = {
        ...template,
        name: `${template.name} (Copie)`,
        version: `${template.version}_copy`
      };
      delete newTemplate.id;
      delete newTemplate.created_date;
      delete newTemplate.updated_date;
      return await base44.entities.TemplatesRH.create(newTemplate);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templatesRH'] });
      toast.success('Template dupliqué');
    }
  });

  const handleEdit = (template) => {
    setSelectedTemplate(template);
    setShowEditor(true);
  };

  const handleClose = () => {
    setSelectedTemplate(null);
    setShowEditor(false);
  };

  const typeColors = {
    CDD: 'bg-blue-50 border-blue-200',
    CDI: 'bg-green-50 border-green-200',
    AVENANT: 'bg-orange-50 border-orange-200'
  };

  const typeBadges = {
    CDD: 'bg-blue-100 text-blue-800',
    CDI: 'bg-green-100 text-green-800',
    AVENANT: 'bg-orange-100 text-orange-800'
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Templates RH</h1>
          <p className="text-gray-600 mt-1">Gérez les templates de contrats et avenants</p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Chargement...</p>
        </div>
      ) : templates.length === 0 ? (
        <Card className="border-dashed border-2 p-12 text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Aucun template trouvé</p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {templates.map((template) => (
            <Card
              key={template.id}
              className={cn(
                'border p-6 transition-all hover:shadow-lg',
                typeColors[template.typeDocument]
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <FileText className="w-5 h-5 text-gray-600" />
                    <h3 className="font-bold text-gray-900">{template.name}</h3>
                    <span className={cn('text-xs px-2 py-1 rounded-full font-semibold', typeBadges[template.typeDocument])}>
                      {template.typeDocument}
                    </span>
                  </div>
                  {template.description && (
                    <p className="text-sm text-gray-600 mb-2">{template.description}</p>
                  )}
                  <div className="flex gap-4 text-xs text-gray-500">
                    <span>Version: {template.version}</span>
                    {template.sousType && <span>Type: {template.sousType}</span>}
                    <span className={template.isActive ? 'text-green-600 font-semibold' : 'text-red-600'}>
                      {template.isActive ? '✓ Actif' : '✗ Inactif'}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 ml-4">
                  <Button
                    onClick={() => handleEdit(template)}
                    variant="outline"
                    size="sm"
                    className="border-orange-300 text-orange-700 hover:bg-orange-50"
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Modifier
                  </Button>
                  <Button
                    onClick={() => duplicateMutation.mutate(template)}
                    variant="outline"
                    size="sm"
                    className="border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    <Copy className="w-4 h-4 mr-1" />
                    Dupliquer
                  </Button>
                  <Button
                    onClick={() => {
                      if (confirm('Êtes-vous sûr de vouloir supprimer ce template ?')) {
                        deleteMutation.mutate(template.id);
                      }
                    }}
                    variant="outline"
                    size="sm"
                    className="border-red-300 text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <TemplateEditorModal
        open={showEditor}
        onOpenChange={handleClose}
        template={selectedTemplate}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['templatesRH'] });
          handleClose();
        }}
      />
    </div>
  );
}