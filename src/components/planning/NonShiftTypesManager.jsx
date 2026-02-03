import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Calendar, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const DEFAULT_TYPES = [
  { key: 'conges_payes', label: 'Congés payés', icon: '🏖️', color: '#22c55e' },
  { key: 'maladie', label: 'Maladie', icon: '🤒', color: '#ef4444' },
  { key: 'absence_injustifiee', label: 'Absence injustifiée', icon: '❌', color: '#991b1b' },
  { key: 'jour_ferie', label: 'Jour férié', icon: '🎉', color: '#8b5cf6' },
  { key: 'formation', label: 'Formation', icon: '📚', color: '#3b82f6' },
  { key: 'repos', label: 'Repos / Récupération', icon: '💤', color: '#6b7280' },
  { key: 'echange', label: 'Échange', icon: '🔄', color: '#f59e0b' },
  { key: 'conge_impose', label: 'Congé imposé', icon: '📌', color: '#ec4899' }
];

const PRESET_COLORS = [
  '#22c55e', '#ef4444', '#3b82f6', '#8b5cf6', '#f59e0b', 
  '#ec4899', '#06b6d4', '#10b981', '#f97316', '#6b7280'
];

export default function NonShiftTypesManager({ open, onOpenChange, embeddedMode = false }) {
  const [editingType, setEditingType] = useState(null);
  const [formData, setFormData] = useState({
    label: '',
    key: '',
    color: '#6b7280',
    icon: '📅',
    generates_work_hours: false,
    impacts_payroll: false,
    is_paid: false,
    counts_as_work_time: false,
    impacts_paid_leave: false,
    blocks_shifts: false,
    visible_in_recap: false
  });
  const queryClient = useQueryClient();

  const { data: types = [] } = useQuery({
    queryKey: ['nonShiftTypes'],
    queryFn: async () => {
      const allTypes = await base44.entities.NonShiftType.filter({ is_active: true });
      return allTypes.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
  });

  const createTypeMutation = useMutation({
    mutationFn: (data) => base44.entities.NonShiftType.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nonShiftTypes'] });
      toast.success('Type créé');
      resetForm();
    }
  });

  const updateTypeMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.NonShiftType.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nonShiftTypes'] });
      toast.success('Type mis à jour');
      resetForm();
    }
  });

  const deleteTypeMutation = useMutation({
    mutationFn: (id) => base44.entities.NonShiftType.update(id, { is_active: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nonShiftTypes'] });
      toast.success('Type supprimé');
    }
  });

  const initializeDefaultTypes = async () => {
    try {
      const typesToCreate = DEFAULT_TYPES.map((type, index) => ({
        ...type,
        order: index
      }));
      await base44.entities.NonShiftType.bulkCreate(typesToCreate);
      queryClient.invalidateQueries({ queryKey: ['nonShiftTypes'] });
      toast.success('Types par défaut créés');
    } catch (error) {
      toast.error('Erreur : ' + error.message);
    }
  };

  const resetForm = () => {
    setFormData({
      label: '',
      key: '',
      color: '#6b7280',
      icon: '📅',
      generates_work_hours: false,
      impacts_payroll: false,
      is_paid: false,
      counts_as_work_time: false,
      impacts_paid_leave: false,
      blocks_shifts: false,
      visible_in_recap: false
    });
    setEditingType(null);
  };

  const handleEdit = (type) => {
    setEditingType(type);
    setFormData({
      label: type.label,
      key: type.key,
      color: type.color || '#6b7280',
      icon: type.icon || '📅',
      generates_work_hours: type.generates_work_hours || false,
      impacts_payroll: type.impacts_payroll || false,
      is_paid: type.is_paid || false,
      counts_as_work_time: type.counts_as_work_time || false,
      impacts_paid_leave: type.impacts_paid_leave || false,
      blocks_shifts: type.blocks_shifts || false,
      visible_in_recap: type.visible_in_recap || false
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.label.trim()) {
      toast.error('Le libellé est requis');
      return;
    }

    const dataToSave = {
      ...formData,
      key: formData.key || formData.label.toLowerCase().replace(/\s+/g, '_')
    };

    if (editingType) {
      updateTypeMutation.mutate({ id: editingType.id, data: dataToSave });
    } else {
      createTypeMutation.mutate({ ...dataToSave, order: types.length });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-orange-600">
            <Calendar className="w-6 h-6" />
            Gestion des statuts / non-shifts
          </DialogTitle>
          <p className="text-sm text-gray-600">
            Configurez les types d'absences et événements du planning
          </p>
        </DialogHeader>

        {types.length === 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
            <p className="text-sm text-blue-900 mb-3">
              Aucun type de non-shift configuré. Voulez-vous créer les types par défaut ?
            </p>
            <Button onClick={initializeDefaultTypes} className="bg-blue-600 hover:bg-blue-700">
              Créer les types par défaut
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Liste des types */}
          <div>
            <h3 className="font-semibold mb-3 text-gray-900">Types existants</h3>
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {types.map((type) => (
                <div
                  key={type.id}
                  className="border-2 rounded-lg p-3 hover:border-gray-400 transition-colors"
                  style={{ borderColor: type.color + '40' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-2xl">{type.icon}</span>
                      <div>
                        <p className="font-semibold text-gray-900">{type.label}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {type.is_paid && <span className="text-[10px] bg-green-100 text-green-800 px-2 py-0.5 rounded">Payé</span>}
                          {type.generates_work_hours && <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Génère heures</span>}
                          {type.blocks_shifts && <span className="text-[10px] bg-red-100 text-red-800 px-2 py-0.5 rounded">Bloque shifts</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleEdit(type)}
                        className="h-8 w-8"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (window.confirm('Supprimer ce type ?')) {
                            deleteTypeMutation.mutate(type.id);
                          }
                        }}
                        className="h-8 w-8 text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Formulaire */}
          <div>
            <h3 className="font-semibold mb-3 text-gray-900">
              {editingType ? 'Modifier le type' : 'Créer un type'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Libellé *</Label>
                <Input
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  placeholder="Ex: Congés payés"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Icône</Label>
                  <Input
                    value={formData.icon}
                    onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                    placeholder="Ex: 🏖️"
                  />
                </div>
                <div>
                  <Label>Couleur</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      className="h-10 w-16"
                    />
                    <div className="flex flex-wrap gap-1">
                      {PRESET_COLORS.slice(0, 5).map(color => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setFormData({ ...formData, color })}
                          className="w-6 h-6 rounded border-2 border-gray-300 hover:scale-110 transition-transform"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4 space-y-3">
                <p className="text-xs font-semibold text-gray-700 uppercase">Paramètres RH & Paie</p>
                
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Génère des heures de travail</Label>
                  <Switch
                    checked={formData.generates_work_hours}
                    onCheckedChange={(checked) => setFormData({ ...formData, generates_work_hours: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-sm">Impacte la fiche de paie</Label>
                  <Switch
                    checked={formData.impacts_payroll}
                    onCheckedChange={(checked) => setFormData({ ...formData, impacts_payroll: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-sm">Payé</Label>
                  <Switch
                    checked={formData.is_paid}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_paid: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-sm">Compte dans le temps de travail</Label>
                  <Switch
                    checked={formData.counts_as_work_time}
                    onCheckedChange={(checked) => setFormData({ ...formData, counts_as_work_time: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-sm">Impacte les congés payés</Label>
                  <Switch
                    checked={formData.impacts_paid_leave}
                    onCheckedChange={(checked) => setFormData({ ...formData, impacts_paid_leave: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-sm">Bloque la création de shifts</Label>
                  <Switch
                    checked={formData.blocks_shifts}
                    onCheckedChange={(checked) => setFormData({ ...formData, blocks_shifts: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-sm">Visible dans les récaps</Label>
                  <Switch
                    checked={formData.visible_in_recap}
                    onCheckedChange={(checked) => setFormData({ ...formData, visible_in_recap: checked })}
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                {editingType && (
                  <Button type="button" variant="outline" onClick={resetForm} className="flex-1">
                    Annuler
                  </Button>
                )}
                <Button type="submit" className="flex-1 bg-orange-600 hover:bg-orange-700">
                  {editingType ? 'Mettre à jour' : 'Créer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}