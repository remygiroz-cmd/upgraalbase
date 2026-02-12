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
    mutationFn: async () => {
      for (const [roleId, changedPerms] of Object.entries(editingPermissions)) {
        const role = roles.find(r => r.id === roleId);
        const fullPermissions = { ...role?.permissions || {}, ...changedPerms };
        await base44.entities.Role.update(roleId, { permissions: fullPermissions });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success('Permissions mises à jour avec succès');
      setEditingPermissions({});
    },
    onError: (error) => {
      toast.error('Erreur lors de la sauvegarde des permissions');
      console.error(error);
    }
  });

    const togglePermission = (roleId, permissionKey) => {
    const role = roles.find(r => r.id === roleId);
    const currentPerms = editingPermissions[roleId] || role?.permissions || {};
    
    setEditingPermissions(prev => ({
      ...prev,
      [roleId]: {
        ...currentPerms,
        [permissionKey]: !currentPerms[permissionKey]
      }
    }));
  };

  const handleSaveAll = async () => {
    for (const [roleId, changedPerms] of Object.entries(editingPermissions)) {
      const role = roles.find(r => r.id === roleId);
      const fullPermissions = { ...role?.permissions || {}, ...changedPerms };
      
      await base44.entities.Role.update(roleId, { permissions: fullPermissions });
    }
    
    queryClient.invalidateQueries({ queryKey: ['roles'] });
    toast.success('Permissions mises à jour');
    setEditingPermissions({});
  };

  const hasChanges = Object.keys(editingPermissions).length > 0;

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="relative pb-24">
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
       <div className="fixed bottom-6 right-6 z-40">
         <Button
           onClick={handleSaveAll}
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