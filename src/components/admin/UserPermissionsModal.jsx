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
  const [overrides, setOverrides] = useState({});

  const { data: existingOverride } = useQuery({
    queryKey: ['userPermissionOverride', user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      const results = await base44.entities.UserPermissionOverride.filter({ user_email: user.email });
      return results[0] || null;
    },
    enabled: !!user?.email && open
  });

  useEffect(() => {
    if (user) {
      setSelectedRoleId(user.role_id || '');
      setOverrides(existingOverride?.permissions_override || {});
    }
  }, [user, existingOverride, open]);

  const updateUserMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.functions.invoke('updateUser', { userId: user.id, data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    }
  });

  const saveOverrideMutation = useMutation({
    mutationFn: async (data) => {
      if (existingOverride) {
        return await base44.entities.UserPermissionOverride.update(existingOverride.id, data);
      }
      return await base44.entities.UserPermissionOverride.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userPermissionOverride'] });
      onClose();
    }
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Update role if changed
    if (selectedRoleId !== user.role_id) {
      await updateUserMutation.mutateAsync({ role_id: selectedRoleId });
    }

    // Save overrides if any
    const hasOverrides = Object.keys(overrides).length > 0;
    if (hasOverrides) {
      saveOverrideMutation.mutate({
        user_email: user.email,
        permissions_override: overrides
      });
    } else {
      onClose();
    }
  };

  const toggleOverride = (moduleKey) => {
    // Empêcher la modification si l'utilisateur est désactivé
    if (user?.status === 'disabled') {
      return;
    }
    setOverrides(prev => {
      const newOverrides = { ...prev };
      if (moduleKey in newOverrides) {
        delete newOverrides[moduleKey];
      } else {
        const selectedRole = roles.find(r => r.id === selectedRoleId);
        const rolePermission = selectedRole?.permissions?.[moduleKey] || false;
        newOverrides[moduleKey] = !rolePermission;
      }
      return newOverrides;
    });
  };

  const getEffectivePermission = (moduleKey) => {
    // Si l'utilisateur est désactivé, toutes les permissions sont à false
    if (user?.status === 'disabled') {
      return false;
    }
    if (moduleKey in overrides) {
      return overrides[moduleKey];
    }
    const selectedRole = roles.find(r => r.id === selectedRoleId);
    return selectedRole?.permissions?.[moduleKey] || false;
  };

  const hasOverride = (moduleKey) => moduleKey in overrides;

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Permissions - {user.full_name}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {user?.status === 'disabled' && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4">
              <p className="text-sm text-red-400">
                ⚠️ Cet utilisateur est désactivé. Toutes les permissions sont automatiquement bloquées. 
                Réactivez le compte pour restaurer les permissions.
              </p>
            </div>
          )}

          <div>
            <Label htmlFor="role">Rôle de base</Label>
            <Select
              value={selectedRoleId}
              onValueChange={setSelectedRoleId}
              disabled={user?.status === 'disabled'}
            >
              <SelectTrigger className="bg-slate-700 border-slate-600 mt-1">
                <SelectValue placeholder="Sélectionner un rôle..." />
              </SelectTrigger>
              <SelectContent className="bg-slate-700 border-slate-600">
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-3 block">
              Surcharges individuelles
              <span className="text-xs text-slate-400 block font-normal mt-1">
                Cliquez sur un module pour surcharger la permission du rôle
              </span>
            </Label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {MODULES.map((module) => {
                const isActive = getEffectivePermission(module.key);
                const isOverridden = hasOverride(module.key);

                return (
                  <button
                    key={module.key}
                    type="button"
                    onClick={() => toggleOverride(module.key)}
                    disabled={user?.status === 'disabled'}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border-2 transition-all text-left",
                      isActive
                        ? "bg-green-500/10 border-green-500"
                        : "bg-slate-700/50 border-slate-600",
                      isOverridden && "ring-2 ring-orange-500",
                      user?.status === 'disabled' && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <span className="text-sm font-medium">{module.label}</span>
                    {isOverridden && (
                      <span className="text-xs text-orange-400 font-semibold">
                        SURCHARGÉ
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={saveOverrideMutation.isPending || updateUserMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {(saveOverrideMutation.isPending || updateUserMutation.isPending) && (
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