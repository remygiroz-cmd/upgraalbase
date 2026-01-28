import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const MODULES = [
  { key: 'home', label: 'Accueil' },
  { key: 'travail_du_jour', label: 'Travail du jour' },
  { key: 'mise_en_place', label: 'Mise en place' },
  { key: 'temperatures', label: 'Températures' },
  { key: 'recettes', label: 'Recettes' },
  { key: 'historique', label: 'Historique' },
  { key: 'equipe', label: 'Équipe & Shifts' },
  { key: 'pertes', label: 'Invendus & Pertes' },
  { key: 'stocks', label: 'Inventaires' },
  { key: 'parametres', label: 'Paramètres' }
];

export default function UserPermissionsModal({ open, onClose, user, roles }) {
  const queryClient = useQueryClient();
  const [selectedRoleId, setSelectedRoleId] = useState('');

  useEffect(() => {
    if (user) {
      setSelectedRoleId(user.role_id || '');
    }
  }, [user, open]);

  const updateUserMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.functions.invoke('updateUser', { userId: user.id, data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      onClose();
    }
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Update role if changed
    if (selectedRoleId !== user.role_id) {
      updateUserMutation.mutate({ role_id: selectedRoleId });
    } else {
      onClose();
    }
  };

  const getEffectivePermission = (moduleKey) => {
    // Si l'utilisateur est désactivé, toutes les permissions sont à false
    if (user?.status === 'disabled') {
      return false;
    }
    const selectedRole = roles.find(r => r.id === selectedRoleId);
    return selectedRole?.permissions?.[moduleKey] || false;
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white border-gray-300 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Permissions - {user.full_name}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {user?.status === 'disabled' && (
            <div className="bg-red-50 border border-red-300 rounded-lg p-4">
              <p className="text-sm text-red-700">
                ⚠️ Cet utilisateur est désactivé. Toutes les permissions sont automatiquement bloquées. 
                Réactivez le compte pour restaurer les permissions.
              </p>
            </div>
          )}

          <div>
            <Label htmlFor="role" className="text-gray-900">Rôle</Label>
            <Select
              value={selectedRoleId}
              onValueChange={setSelectedRoleId}
              disabled={user?.status === 'disabled'}
            >
              <SelectTrigger className="bg-white border-gray-300 text-gray-900 mt-1">
                <SelectValue placeholder="Sélectionner un rôle..." />
              </SelectTrigger>
              <SelectContent className="bg-white border-gray-200">
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-3 block text-gray-900">
              Permissions du rôle
              <span className="text-xs text-gray-500 block font-normal mt-1">
                Les permissions sont définies par le rôle sélectionné
              </span>
            </Label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {MODULES.map((module) => {
                const isActive = getEffectivePermission(module.key);

                return (
                  <div
                    key={module.key}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border-2",
                      isActive
                        ? "bg-green-50 border-green-500"
                        : "bg-gray-50 border-gray-300"
                    )}
                  >
                    <span className="text-sm font-medium text-gray-900">{module.label}</span>
                  </div>
                );
              })}
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
              disabled={updateUserMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {updateUserMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Enregistrer
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}