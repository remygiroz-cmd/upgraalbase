import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Plus, Edit, Trash2, Briefcase, FileText, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import TemplateBuilderModalV15 from '@/components/templates/TemplateBuilderModalV15';

export default function GestionPostes() {
  const [activeTab, setActiveTab] = useState('postes');
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showEditor, setShowEditor] = useState(false);

  const { data: jobRoles = [], isLoading: loadingRoles } = useQuery({
    queryKey: ['jobRoles'],
    queryFn: () => base44.entities.JobRoles.list('ordre'),
    enabled: activeTab === 'postes'
  });

  const { data: templates = [], isLoading: loadingTemplates } = useQuery({
    queryKey: ['templatesRH'],
    queryFn: () => base44.entities.TemplatesRH.list(),
    enabled: activeTab === 'templates'
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.JobRoles.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobRoles'] });
      toast.success('Poste créé');
      handleClose();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.JobRoles.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobRoles'] });
      toast.success('Poste modifié');
      handleClose();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.JobRoles.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobRoles'] });
      toast.success('Poste supprimé');
    }
  });

  const handleClose = () => {
    setShowForm(false);
    setEditingRole(null);
  };

  const handleEdit = (role) => {
    setEditingRole(role);
    setShowForm(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gestion des Postes</h1>
          <p className="text-gray-600 mt-1">Définissez les postes et leurs tâches pour les contrats</p>
        </div>
        <Button
          onClick={() => setShowForm(true)}
          className="bg-orange-600 hover:bg-orange-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nouveau poste
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Chargement...</p>
        </div>
      ) : jobRoles.length === 0 ? (
        <Card className="border-dashed border-2 p-12 text-center">
          <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Aucun poste défini</p>
          <p className="text-sm text-gray-400 mt-1">Créez des postes avec leurs tâches associées</p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {jobRoles.filter(r => r.isActive).map((role) => (
            <Card key={role.id} className="border p-6 hover:shadow-lg transition-all">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <Briefcase className="w-5 h-5 text-orange-600" />
                    <h3 className="font-bold text-gray-900 text-lg">{role.label}</h3>
                  </div>
                  
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <p className="text-sm font-semibold text-gray-700 mb-2">Tâches associées :</p>
                    <div className="text-sm text-gray-800 whitespace-pre-wrap">
                      {role.tasksText}
                    </div>
                  </div>

                  {role.posteAlias && role.posteAlias.length > 0 && (
                    <div className="mt-3 flex gap-2 flex-wrap">
                      {role.posteAlias.map((alias, idx) => (
                        <span key={idx} className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded-full">
                          {alias}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 ml-4">
                  <Button
                    onClick={() => handleEdit(role)}
                    variant="outline"
                    size="sm"
                    className="border-gray-300"
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Modifier
                  </Button>
                  <Button
                    onClick={() => setConfirmDelete(role)}
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

      <PosteFormModal
        open={showForm}
        onClose={handleClose}
        role={editingRole}
        onSubmit={(data) => {
          if (editingRole) {
            updateMutation.mutate({ id: editingRole.id, data });
          } else {
            createMutation.mutate(data);
          }
        }}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={() => setConfirmDelete(null)}
        title="Supprimer le poste"
        description={`Êtes-vous sûr de vouloir supprimer le poste "${confirmDelete?.label}" ?`}
        onConfirm={() => {
          deleteMutation.mutate(confirmDelete.id);
          setConfirmDelete(null);
        }}
        variant="danger"
        confirmText="Supprimer"
      />
    </div>
  );
}

function PosteFormModal({ open, onClose, role, onSubmit }) {
  const [formData, setFormData] = React.useState({
    label: '',
    tasksText: '',
    posteAlias: [],
    ordre: 0,
    isActive: true
  });

  React.useEffect(() => {
    if (role) {
      setFormData({
        label: role.label || '',
        tasksText: role.tasksText || '',
        posteAlias: role.posteAlias || [],
        ordre: role.ordre || 0,
        isActive: role.isActive !== false
      });
    } else {
      setFormData({
        label: '',
        tasksText: '',
        posteAlias: [],
        ordre: 0,
        isActive: true
      });
    }
  }, [role, open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.label.trim()) {
      toast.error('Le nom du poste est requis');
      return;
    }
    if (!formData.tasksText.trim()) {
      toast.error('La description des tâches est requise');
      return;
    }
    onSubmit(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white border-gray-300 max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-gray-900">
            {role ? 'Modifier le poste' : 'Créer un nouveau poste'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="text-gray-900">Nom du poste *</Label>
            <Input
              value={formData.label}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              placeholder="Ex: Employé polyvalent, Chef de cuisine..."
              className="bg-white border-gray-300 text-gray-900 mt-1"
              autoFocus
            />
          </div>

          <div>
            <Label className="text-gray-900">Description des tâches *</Label>
            <Textarea
              value={formData.tasksText}
              onChange={(e) => setFormData({ ...formData, tasksText: e.target.value })}
              placeholder="Ex: Accueil client, préparation des commandes, service en salle, entretien des locaux..."
              className="bg-white border-gray-300 text-gray-900 mt-1 min-h-[120px]"
            />
            <p className="text-xs text-gray-500 mt-1">
              💡 Cette description sera automatiquement insérée dans les contrats via la variable {`{{taches}}`}
            </p>
          </div>

          <div>
            <Label className="text-gray-900">Alias du poste (optionnel)</Label>
            <Input
              value={formData.posteAlias.join(', ')}
              onChange={(e) => setFormData({ 
                ...formData, 
                posteAlias: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
              })}
              placeholder="Ex: Plongeur, Aide-cuisine (séparés par des virgules)"
              className="bg-white border-gray-300 text-gray-900 mt-1"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              onClick={onClose}
              variant="outline"
              className="flex-1 border-gray-300"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-orange-600 hover:bg-orange-700"
            >
              {role ? 'Modifier' : 'Créer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}