import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Shield, Plus, Pencil, Trash2, Copy } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
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

export default function GestionRoles() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => base44.entities.Role.list('name')
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Role.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] })
  });

  const handleEdit = (role) => {
    setEditingRole(role);
    setShowModal(true);
  };

  const handleDuplicate = (role) => {
    setEditingRole({
      ...role,
      id: null,
      name: `${role.name} (copie)`
    });
    setShowModal(true);
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        icon={Shield}
        title="Gestion des rôles"
        subtitle="Définir les accès par module pour chaque rôle"
        actions={
          <Button
            onClick={() => {
              setEditingRole(null);
              setShowModal(true);
            }}
            className="bg-orange-600 hover:bg-orange-700 min-h-[44px]"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nouveau rôle
          </Button>
        }
      />

      <div className="grid gap-3 sm:gap-4">
        {roles.map((role) => (
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
              <div className="flex items-center gap-1 w-full sm:w-auto justify-end">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleDuplicate(role)}
                  className="border-gray-300 hover:bg-gray-50 min-h-[44px] min-w-[44px]"
                  title="Dupliquer"
                >
                  <Copy className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleEdit(role)}
                  className="border-gray-300 hover:bg-gray-50 min-h-[44px] min-w-[44px]"
                  title="Modifier"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
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
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5 sm:gap-2">
              {MODULES.map((module) => (
                <div
                  key={module.key}
                  className={cn(
                    "text-[10px] sm:text-xs px-2 py-1.5 rounded-lg font-medium text-center break-words",
                    role.permissions?.[module.key]
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  )}
                >
                  {module.label}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <RoleFormModal
        open={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingRole(null);
        }}
        role={editingRole}
      />

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
      setForm({
        name: role.name || '',
        description: role.description || '',
        permissions: role.permissions || MODULES.reduce((acc, m) => ({ ...acc, [m.key]: false }), {}),
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
      onClose();
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
      <DialogContent className="bg-slate-800 border-slate-700 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{role?.id ? 'Modifier le rôle' : 'Nouveau rôle'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label htmlFor="name">Nom du rôle *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="bg-slate-700 border-slate-600 mt-1"
              placeholder="Ex: Chef de partie"
              required
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="bg-slate-700 border-slate-600 mt-1"
              placeholder="Description du rôle..."
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <Label>Permissions par module</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => toggleAll(true)}
                  className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700 text-xs"
                >
                  Tout cocher
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => toggleAll(false)}
                  className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700 text-xs"
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
                      ? "bg-orange-500/10 border-orange-500"
                      : "bg-slate-700/50 border-slate-600 hover:border-slate-500"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={form.permissions[module.key] || false}
                    onChange={() => togglePermission(module.key)}
                    className="w-5 h-5 rounded border-slate-600 bg-slate-700 text-orange-600 focus:ring-orange-500"
                  />
                  <span className="text-sm font-medium">{module.label}</span>
                </label>
              ))}
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