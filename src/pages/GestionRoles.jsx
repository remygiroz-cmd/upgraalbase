import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Shield, Trash2, Save } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const MODULES = [
  { key: 'home', label: 'Accueil' },
  { key: 'travail_du_jour', label: 'Travail du jour' },
  { key: 'mise_en_place', label: 'Mise en place' },
  { key: 'temperatures', label: 'Températures' },
  { key: 'recettes', label: 'Recettes' },
  { key: 'historique', label: 'Historique' },
  { key: 'equipe', label: 'Équipe & Shifts' },
  { key: 'planning_modify', label: 'Modifier le planning', special: true },
  { key: 'pertes', label: 'Invendus & Pertes' },
  { key: 'stocks', label: 'Inventaires' },
  { key: 'parametres', label: 'Paramètres' },
  { key: 'messages_urgents', label: 'Messages urgents' }
];

export default function GestionRoles() {
  const queryClient = useQueryClient();
  const [editingPermissions, setEditingPermissions] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null);

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => base44.entities.Role.list('name')
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Role.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] })
  });

  const savePermissionsMutation = useMutation({
    mutationFn: async ({ roleId, permissions }) => {
      return base44.entities.Role.update(roleId, { permissions });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success('Permissions mises à jour');
      setEditingPermissions({});
    },
    onError: () => {
      toast.error('Erreur lors de la sauvegarde');
    }
  });

  const togglePermission = (roleId, permissionKey) => {
    const key = `${roleId}_${permissionKey}`;
    const currentPerms = editingPermissions[roleId] || roles.find(r => r.id === roleId)?.permissions || {};
    
    setEditingPermissions(prev => ({
      ...prev,
      [roleId]: {
        ...currentPerms,
        [permissionKey]: !currentPerms[permissionKey]
      }
    }));
  };

  const handleSaveAll = () => {
    Object.entries(editingPermissions).forEach(([roleId, permissions]) => {
      if (Object.keys(permissions).length > 0) {
        savePermissionsMutation.mutate({ roleId, permissions });
      }
    });
  };

  const hasChanges = Object.keys(editingPermissions).length > 0;

  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        icon={Shield}
        title="Gestion des rôles"
        subtitle="Cliquez sur les permissions pour les modifier"
      />

      <div className="grid gap-3 sm:gap-4">
        {roles.map((role) => {
          const currentPerms = editingPermissions[role.id] || role.permissions || {};
          
          return (
            <div
              key={role.id}
              className="bg-white rounded-lg sm:rounded-xl border-2 border-gray-200 p-3 sm:p-6"
            >
              <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
                <div className="flex-1 min-w-0 w-full sm:w-auto">
                  <h3 className="text-base sm:text-lg font-bold text-gray-900 break-words">{role.name}</h3>
                  {role.description && (
                    <p className="text-xs sm:text-sm text-gray-600 mt-1 break-words">{role.description}</p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setConfirmDelete(role)}
                  className="border-red-300 hover:bg-red-50 text-red-600 min-h-[44px] min-w-[44px]"
                  title="Supprimer"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5 sm:gap-2">
                {MODULES.map((module) => {
                  const isEnabled = currentPerms[module.key] || false;
                  
                  return (
                    <button
                      key={module.key}
                      onClick={() => togglePermission(role.id, module.key)}
                      className={cn(
                        "text-[10px] sm:text-xs px-2 py-1.5 rounded-lg font-medium text-center break-words transition-all cursor-pointer hover:opacity-80",
                        isEnabled
                          ? module.special ? "bg-blue-500 text-white" : "bg-green-500 text-white"
                          : "bg-gray-300 text-gray-600"
                      )}
                      title={module.special ? "Permission spéciale pour modifier le planning" : ""}
                    >
                      {module.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Save Button */}
      {hasChanges && (
        <div className="fixed bottom-6 right-6 z-50">
          <Button
            onClick={handleSaveAll}
            disabled={savePermissionsMutation.isPending}
            className="bg-orange-600 hover:bg-orange-700 shadow-lg min-h-[48px] px-6"
          >
            <Save className="w-4 h-4 mr-2" />
            Enregistrer les paramètres
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title="Supprimer le rôle"
        description={`Êtes-vous sûr de vouloir supprimer le rôle "${confirmDelete?.name}" ?`}
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

function RoleFormModal({ open, onClose, role }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    description: '',
    permissions: MODULES.reduce((acc, m) => ({ ...acc, [m.key]: false }), {}),
    is_active: true
  });

  React.useEffect(() => {
    if (role) {
      // Merge existing permissions with all possible modules
      const allModules = MODULES.reduce((acc, m) => ({ ...acc, [m.key]: false }), {});
      const mergedPermissions = { ...allModules, ...(role.permissions || {}) };
      
      setForm({
        name: role.name || '',
        description: role.description || '',
        permissions: mergedPermissions,
        is_active: role.is_active !== false
      });
    } else {
      setForm({
        name: '',
        description: '',
        permissions: MODULES.reduce((acc, m) => ({ ...acc, [m.key]: m.key === 'home' }), {}),
        is_active: true
      });
    }
  }, [role, open]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (role?.id) {
        return base44.entities.Role.update(role.id, data);
      }
      return base44.entities.Role.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success(role?.id ? 'Rôle mis à jour avec succès' : 'Rôle créé avec succès');
      onClose();
    },
    onError: (error) => {
      toast.error('Erreur: ' + (error?.message || 'Impossible de sauvegarder'));
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate(form);
  };

  const togglePermission = (key) => {
    setForm(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: !prev.permissions[key]
      }
    }));
  };

  const toggleAll = (value) => {
    setForm(prev => ({
      ...prev,
      permissions: MODULES.reduce((acc, m) => ({ ...acc, [m.key]: value }), {})
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white border-gray-300 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gray-900">{role?.id ? 'Modifier le rôle' : 'Nouveau rôle'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label htmlFor="name" className="text-gray-900">Nom du rôle *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="bg-white border-gray-300 text-gray-900 mt-1"
              placeholder="Ex: Chef de partie"
              required
            />
          </div>

          <div>
            <Label htmlFor="description" className="text-gray-900">Description</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="bg-white border-gray-300 text-gray-900 mt-1"
              placeholder="Description du rôle..."
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <Label className="text-gray-900">Permissions par module</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => toggleAll(true)}
                  className="border-gray-300 text-gray-700 hover:bg-gray-50 text-xs"
                >
                  Tout cocher
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => toggleAll(false)}
                  className="border-gray-300 text-gray-700 hover:bg-gray-50 text-xs"
                >
                  Tout décocher
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {MODULES.map((module) => (
                <label
                  key={module.key}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all",
                    form.permissions[module.key]
                      ? module.special ? "bg-blue-50 border-blue-500" : "bg-green-50 border-green-500"
                      : "bg-gray-50 border-gray-300 hover:border-gray-400"
                  )}
                  title={module.special ? "Permet aux utilisateurs de modifier le planning" : ""}
                >
                  <input
                    type="checkbox"
                    checked={form.permissions[module.key] || false}
                    onChange={() => togglePermission(module.key)}
                    className={cn(
                      "w-5 h-5 rounded border-gray-300 focus:ring-2",
                      module.special ? "text-blue-600 focus:ring-blue-500" : "text-green-600 focus:ring-green-500"
                    )}
                  />
                  <span className="text-sm font-medium text-gray-900">{module.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={saveMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {role?.id ? 'Mettre à jour' : 'Créer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}