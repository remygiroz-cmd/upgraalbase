import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Thermometer, Plus, Settings, Download, AlertTriangle, CheckCircle2, Save, History, Trash2, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import PageHeader from '@/components/ui/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';

export default function Temperatures() {
  const queryClient = useQueryClient();
  const today = format(new Date(), 'yyyy-MM-dd');

  const [showEquipmentModal, setShowEquipmentModal] = useState(false);
  const [showEquipmentForm, setShowEquipmentForm] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [confirmDeleteEquipment, setConfirmDeleteEquipment] = useState(null);

  const { data: equipment = [], isLoading: loadingEquipment } = useQuery({
    queryKey: ['equipment'],
    queryFn: () => base44.entities.Equipment.filter({ is_active: true }, 'order')
  });

  const { data: temperatures = [], isLoading: loadingTemps } = useQuery({
    queryKey: ['temperatures', today],
    queryFn: () => base44.entities.Temperature.filter({ date: today })
  });

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const saveTempMutation = useMutation({
    mutationFn: async ({ equipmentId, morningTemp, eveningTemp, equipment: eq }) => {
      const existing = temperatures.find(t => t.equipment_id === equipmentId);
      const morningCompliant = morningTemp !== undefined && morningTemp !== null ? 
        morningTemp >= eq.target_min && morningTemp <= eq.target_max : null;
      const eveningCompliant = eveningTemp !== undefined && eveningTemp !== null ?
        eveningTemp >= eq.target_min && eveningTemp <= eq.target_max : null;
      
      const data = {
        equipment_id: equipmentId,
        date: today,
        target_min: eq.target_min,
        target_max: eq.target_max
      };

      if (morningTemp !== undefined && morningTemp !== null) {
        data.morning_temp = morningTemp;
        data.morning_compliant = morningCompliant;
        data.morning_signed_by = currentUser?.email;
        data.morning_signed_by_name = currentUser?.full_name || currentUser?.email;
        data.morning_signed_at = new Date().toISOString();
      }

      if (eveningTemp !== undefined && eveningTemp !== null) {
        data.evening_temp = eveningTemp;
        data.evening_compliant = eveningCompliant;
        data.evening_signed_by = currentUser?.email;
        data.evening_signed_by_name = currentUser?.full_name || currentUser?.email;
        data.evening_signed_at = new Date().toISOString();
      }

      if (existing) {
        return base44.entities.Temperature.update(existing.id, data);
      }
      return base44.entities.Temperature.create(data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['temperatures', today] })
  });

  const saveEquipmentMutation = useMutation({
    mutationFn: async (data) => {
      if (editingEquipment?.id) {
        return base44.entities.Equipment.update(editingEquipment.id, data);
      }
      return base44.entities.Equipment.create({ ...data, order: equipment.length });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      setShowEquipmentForm(false);
      setEditingEquipment(null);
      toast.success('Équipement sauvegardé');
    }
  });

  const deleteEquipmentMutation = useMutation({
    mutationFn: (id) => base44.entities.Equipment.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      toast.success('Équipement supprimé');
      setConfirmDeleteEquipment(null);
    }
  });

  const saveSnapshotMutation = useMutation({
    mutationFn: async () => {
      const snapshot = equipment.map(eq => {
        const temp = temperatures.find(t => t.equipment_id === eq.id);
        const defaultTemp = eq.type === 'positive' ? 3 : -18;
        return {
          equipment_id: eq.id,
          equipment_name: eq.name,
          equipment_type: eq.type,
          morning_temp: temp?.morning_temp ?? defaultTemp,
          evening_temp: temp?.evening_temp ?? defaultTemp,
          target_min: eq.target_min,
          target_max: eq.target_max,
          morning_compliant: temp?.morning_compliant ?? true,
          evening_compliant: temp?.evening_compliant ?? true
        };
      });

      await base44.entities.TemperatureSnapshot.create({
        date: today,
        snapshot,
        recorded_by: currentUser?.email,
        recorded_by_name: currentUser?.full_name || currentUser?.email,
        recorded_at: new Date().toISOString()
      });

      // Reset all temperatures to default values
      const resetPromises = equipment.map(async (eq) => {
        const existing = temperatures.find(t => t.equipment_id === eq.id);
        const defaultTemp = eq.type === 'positive' ? 3 : -18;
        const isCompliant = defaultTemp >= eq.target_min && defaultTemp <= eq.target_max;

        const data = {
          equipment_id: eq.id,
          date: today,
          morning_temp: defaultTemp,
          evening_temp: defaultTemp,
          target_min: eq.target_min,
          target_max: eq.target_max,
          morning_compliant: isCompliant,
          evening_compliant: isCompliant,
          morning_signed_by: 'système',
          morning_signed_by_name: 'Valeur par défaut',
          morning_signed_at: new Date().toISOString(),
          evening_signed_by: 'système',
          evening_signed_by_name: 'Valeur par défaut',
          evening_signed_at: new Date().toISOString()
        };

        if (existing) {
          return base44.entities.Temperature.update(existing.id, data);
        }
        return base44.entities.Temperature.create(data);
      });

      await Promise.all(resetPromises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['temperatureSnapshots'] });
      queryClient.invalidateQueries({ queryKey: ['temperatures', today] });
      toast.success('Températures enregistrées et réinitialisées');
    }
  });

  const handleExportCSV = () => {
    const rows = [['Équipement', 'Type', 'Matin', 'Conforme Matin', 'Soir', 'Conforme Soir', 'Min', 'Max']];
    
    equipment.forEach(eq => {
      const temp = temperatures.find(t => t.equipment_id === eq.id);
      rows.push([
        eq.name,
        eq.type === 'positive' ? 'Positif' : 'Négatif',
        temp?.morning_temp ?? 'Non relevé',
        temp?.morning_compliant ? 'Oui' : (temp?.morning_temp !== undefined ? 'NON' : '-'),
        temp?.evening_temp ?? 'Non relevé',
        temp?.evening_compliant ? 'Oui' : (temp?.evening_temp !== undefined ? 'NON' : '-'),
        eq.target_min,
        eq.target_max
      ]);
    });

    const csv = rows.map(r => r.join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `temperatures_${today}.csv`;
    link.click();
  };

  const getTempForEquipment = (eqId) => temperatures.find(t => t.equipment_id === eqId);

  if (loadingEquipment || loadingTemps) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <PageHeader
        icon={Thermometer}
        title="Températures HACCP"
        subtitle={format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => setShowHistoryModal(true)}
              className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700"
            >
              <History className="w-4 h-4 mr-2" />
              Historique
            </Button>
            {currentUser?.role === 'admin' && (
              <Button
                variant="outline"
                onClick={() => setShowEquipmentModal(true)}
                className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700"
              >
                <Settings className="w-4 h-4 mr-2" />
                Équipements
              </Button>
            )}
            <Button
              variant="outline"
              onClick={handleExportCSV}
              className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700"
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            <Button
              onClick={() => saveSnapshotMutation.mutate()}
              disabled={saveSnapshotMutation.isPending || temperatures.length === 0}
              className="bg-orange-600 hover:bg-orange-700"
            >
              <Save className="w-4 h-4 mr-2" />
              Enregistrer températures
            </Button>
          </>
        }
      />

      {equipment.length === 0 ? (
        <EmptyState
          icon={Thermometer}
          title="Aucun équipement"
          description="Ajoutez vos frigos et congélateurs pour commencer les relevés"
          action={
            <Button
              onClick={() => setShowEquipmentModal(true)}
              className="bg-orange-600 hover:bg-orange-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Ajouter un équipement
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {equipment.map(eq => (
            <TemperatureCard
              key={eq.id}
              equipment={eq}
              temperature={getTempForEquipment(eq.id)}
              onSave={({ morningTemp, eveningTemp }) => 
                saveTempMutation.mutate({ equipmentId: eq.id, morningTemp, eveningTemp, equipment: eq })
              }
              isSaving={saveTempMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* Equipment List Modal */}
      <EquipmentListModal
        open={showEquipmentModal}
        onClose={() => setShowEquipmentModal(false)}
        equipment={equipment}
        onAdd={() => {
          setEditingEquipment(null);
          setShowEquipmentForm(true);
        }}
        onEdit={(eq) => {
          setEditingEquipment(eq);
          setShowEquipmentForm(true);
        }}
        onDelete={(eq) => setConfirmDeleteEquipment(eq)}
        isAdmin={currentUser?.role === 'admin'}
      />

      {/* Equipment Form Modal */}
      <EquipmentFormModal
        open={showEquipmentForm}
        onClose={() => {
          setShowEquipmentForm(false);
          setEditingEquipment(null);
        }}
        equipment={editingEquipment}
        onSave={(data) => saveEquipmentMutation.mutate(data)}
        isSaving={saveEquipmentMutation.isPending}
      />

      <ConfirmDialog
        open={!!confirmDeleteEquipment}
        onOpenChange={(open) => !open && setConfirmDeleteEquipment(null)}
        title="Supprimer l'équipement"
        description={`Êtes-vous sûr de vouloir supprimer "${confirmDeleteEquipment?.name}" ? Toutes les températures associées seront conservées.`}
        onConfirm={() => deleteEquipmentMutation.mutate(confirmDeleteEquipment.id)}
        variant="danger"
        confirmText="Supprimer"
      />

      {/* History Modal */}
      <HistoryModal
        open={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
      />
    </div>
  );
}

function TemperatureCard({ equipment, temperature, onSave, isSaving }) {
  const defaultTemp = equipment.type === 'positive' ? 3 : -18;
  const [morningValue, setMorningValue] = useState('');
  const [eveningValue, setEveningValue] = useState('');
  
  useEffect(() => {
    setMorningValue(temperature?.morning_temp !== undefined && temperature?.morning_temp !== null ? temperature.morning_temp.toString() : defaultTemp.toString());
    setEveningValue(temperature?.evening_temp !== undefined && temperature?.evening_temp !== null ? temperature.evening_temp.toString() : defaultTemp.toString());
  }, [temperature, defaultTemp]);

  const handleSave = (type) => {
    const morningTemp = type === 'morning' || type === 'both' ? parseFloat(morningValue) : undefined;
    const eveningTemp = type === 'evening' || type === 'both' ? parseFloat(eveningValue) : undefined;
    
    if ((morningTemp !== undefined && !isNaN(morningTemp)) || (eveningTemp !== undefined && !isNaN(eveningTemp))) {
      onSave({ morningTemp, eveningTemp });
    }
  };

  const isPositive = equipment.type === 'positive';
  const morningCompliant = temperature?.morning_compliant;
  const eveningCompliant = temperature?.evening_compliant;
  const hasMorning = temperature?.morning_temp !== undefined;
  const hasEvening = temperature?.evening_temp !== undefined;

  return (
    <div className="p-4 rounded-2xl border-2 bg-white border-gray-300 transition-all">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">{equipment.name}</h3>
          <Badge
            variant="outline"
            className={cn(
              "mt-1",
              isPositive
                ? "border-cyan-600/50 text-cyan-400"
                : "border-indigo-600/50 text-indigo-400"
            )}
          >
            {isPositive ? 'Positif' : 'Négatif'}
          </Badge>
        </div>
      </div>

      <p className="text-xs text-gray-700 font-medium mb-3">
        Cible: {equipment.target_min}°C à {equipment.target_max}°C
      </p>

      {/* Morning Temperature */}
      <div className="mb-4 p-3 rounded-lg bg-gray-50 border border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs font-semibold text-gray-700">Début de service</Label>
          {hasMorning && (
            morningCompliant ? (
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600" />
            )
          )}
        </div>
        <div className="flex items-center gap-2 mb-2">
          <Input
            type="number"
            step="0.1"
            value={morningValue}
            onChange={(e) => setMorningValue(e.target.value)}
            className="bg-white border-gray-300 text-center text-lg font-bold h-10"
          />
          <span className="text-lg text-gray-700">°C</span>
        </div>
        {hasMorning && temperature.morning_signed_by_name && (
          <p className="text-[10px] text-gray-500">
            {temperature.morning_signed_by_name}
          </p>
        )}
        <Button
          onClick={() => handleSave('morning')}
          disabled={!morningValue || isSaving}
          size="sm"
          className="w-full mt-2 h-8 text-xs bg-blue-600 hover:bg-blue-700"
        >
          {hasMorning ? 'Modifier' : 'Enregistrer'}
        </Button>
      </div>

      {/* Evening Temperature */}
      <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs font-semibold text-gray-700">Fin de service</Label>
          {hasEvening && (
            eveningCompliant ? (
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600" />
            )
          )}
        </div>
        <div className="flex items-center gap-2 mb-2">
          <Input
            type="number"
            step="0.1"
            value={eveningValue}
            onChange={(e) => setEveningValue(e.target.value)}
            className="bg-white border-gray-300 text-center text-lg font-bold h-10"
          />
          <span className="text-lg text-gray-700">°C</span>
        </div>
        {hasEvening && temperature.evening_signed_by_name && (
          <p className="text-[10px] text-gray-500">
            {temperature.evening_signed_by_name}
          </p>
        )}
        <Button
          onClick={() => handleSave('evening')}
          disabled={!eveningValue || isSaving}
          size="sm"
          className="w-full mt-2 h-8 text-xs bg-orange-600 hover:bg-orange-700"
        >
          {hasEvening ? 'Modifier' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  );
}

function EquipmentListModal({ open, onClose, equipment, onAdd, onEdit, onDelete, isAdmin }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gestion des équipements</DialogTitle>
        </DialogHeader>

        {equipment.length === 0 ? (
          <EmptyState
            icon={Thermometer}
            title="Aucun équipement"
            description="Commencez par ajouter vos frigos et congélateurs"
          />
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
            {equipment.map((eq) => (
              <div
                key={eq.id}
                className="flex items-center justify-between p-4 bg-slate-900 rounded-lg border border-slate-700"
              >
                <div className="flex-1">
                  <h4 className="font-semibold text-white">{eq.name}</h4>
                  <div className="flex items-center gap-3 mt-1">
                    <Badge
                      variant="outline"
                      className={cn(
                        eq.type === 'positive'
                          ? "border-cyan-600/50 text-cyan-400"
                          : "border-indigo-600/50 text-indigo-400"
                      )}
                    >
                      {eq.type === 'positive' ? 'Positif' : 'Négatif'}
                    </Badge>
                    <span className="text-xs text-slate-400">
                      {eq.target_min}°C à {eq.target_max}°C
                    </span>
                    {eq.location && (
                      <span className="text-xs text-slate-400">• {eq.location}</span>
                    )}
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(eq)}
                      className="text-slate-400 hover:text-white hover:bg-slate-700"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(eq)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-950/30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-between pt-4 border-t border-slate-700">
          <Button
            onClick={onAdd}
            className="bg-orange-600 hover:bg-orange-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nouvel équipement
          </Button>
          <Button
            variant="outline"
            onClick={onClose}
            className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700"
          >
            Fermer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EquipmentFormModal({ open, onClose, equipment, onSave, isSaving }) {
  const [form, setForm] = useState({
    name: '',
    type: 'positive',
    target_min: 0,
    target_max: 4,
    location: ''
  });

  useEffect(() => {
    if (equipment) {
      setForm({
        name: equipment.name || '',
        type: equipment.type || 'positive',
        target_min: equipment.target_min ?? 0,
        target_max: equipment.target_max ?? 4,
        location: equipment.location || ''
      });
    } else {
      setForm({
        name: '',
        type: 'positive',
        target_min: 0,
        target_max: 4,
        location: ''
      });
    }
  }, [equipment, open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700">
        <DialogHeader>
          <DialogTitle>{equipment ? 'Modifier' : 'Nouvel'} équipement</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Nom *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Ex: Frigo 1"
              className="bg-slate-700 border-slate-600 mt-1"
              required
            />
          </div>

          <div>
            <Label>Type</Label>
            <Select
              value={form.type}
              onValueChange={(value) => {
                const defaults = value === 'positive' 
                  ? { target_min: 0, target_max: 4 }
                  : { target_min: -22, target_max: -18 };
                setForm(prev => ({ ...prev, type: value, ...defaults }));
              }}
            >
              <SelectTrigger className="bg-slate-700 border-slate-600 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-700 border-slate-600">
                <SelectItem value="positive">Positif (Frigo)</SelectItem>
                <SelectItem value="negative">Négatif (Congélateur)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="target_min">Temp. min (°C)</Label>
              <Input
                id="target_min"
                type="number"
                step="0.1"
                value={form.target_min}
                onChange={(e) => setForm(prev => ({ ...prev, target_min: parseFloat(e.target.value) }))}
                className="bg-slate-700 border-slate-600 mt-1"
              />
            </div>
            <div>
              <Label htmlFor="target_max">Temp. max (°C)</Label>
              <Input
                id="target_max"
                type="number"
                step="0.1"
                value={form.target_max}
                onChange={(e) => setForm(prev => ({ ...prev, target_max: parseFloat(e.target.value) }))}
                className="bg-slate-700 border-slate-600 mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="location">Emplacement</Label>
            <Input
              id="location"
              value={form.location}
              onChange={(e) => setForm(prev => ({ ...prev, location: e.target.value }))}
              placeholder="Ex: Cuisine principale"
              className="bg-slate-700 border-slate-600 mt-1"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700">
              Annuler
            </Button>
            <Button type="submit" disabled={isSaving} className="bg-orange-600 hover:bg-orange-700">
              {equipment ? 'Mettre à jour' : 'Créer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HistoryModal({ open, onClose }) {
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(null);

  const { data: snapshots = [], isLoading } = useQuery({
    queryKey: ['temperatureSnapshots'],
    queryFn: () => base44.entities.TemperatureSnapshot.list('-recorded_at'),
    enabled: open
  });

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.TemperatureSnapshot.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['temperatureSnapshots'] });
      toast.success('Historique supprimé');
      setConfirmDelete(null);
    }
  });

  const isAdmin = currentUser?.role === 'admin';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Historique des températures HACCP</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <LoadingSpinner />
        ) : snapshots.length === 0 ? (
          <EmptyState
            icon={History}
            title="Aucun historique"
            description="Les enregistrements apparaîtront ici après avoir cliqué sur 'Enregistrer températures'"
          />
        ) : (
          <div className="space-y-4 overflow-y-auto pr-2">
            {snapshots.map((snapshot) => (
              <div key={snapshot.id} className="bg-slate-900 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex-1">
                    <h4 className="font-semibold text-white">
                      {format(new Date(snapshot.date), "EEEE d MMMM yyyy", { locale: fr })}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1">
                      Par {snapshot.recorded_by_name} • {format(new Date(snapshot.recorded_at), "dd/MM/yyyy à HH:mm")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm text-slate-300">
                        {snapshot.snapshot.filter(s => s.is_compliant).length}/{snapshot.snapshot.length}
                      </p>
                      <p className="text-xs text-slate-400">conformes</p>
                    </div>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setConfirmDelete(snapshot.id)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-950/30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {snapshot.snapshot.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg border bg-slate-800 border-slate-700"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-white text-sm truncate">{item.equipment_name}</p>
                          <p className="text-xs text-slate-400">
                            Cible: {item.target_min}°C à {item.target_max}°C
                          </p>
                        </div>
                      </div>
                      
                      <div className="space-y-2 mt-2">
                        <div className="flex items-center justify-between p-2 rounded bg-slate-900/50">
                          <div>
                            <p className="text-xs text-slate-400">Matin</p>
                            <p className="text-base font-bold text-white">
                              {item.morning_temp !== undefined ? `${item.morning_temp}°C` : 'N/A'}
                            </p>
                          </div>
                          {item.morning_temp !== undefined && (
                            item.morning_compliant ? (
                              <CheckCircle2 className="w-4 h-4 text-green-400" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-red-400" />
                            )
                          )}
                        </div>

                        <div className="flex items-center justify-between p-2 rounded bg-slate-900/50">
                          <div>
                            <p className="text-xs text-slate-400">Soir</p>
                            <p className="text-base font-bold text-white">
                              {item.evening_temp !== undefined ? `${item.evening_temp}°C` : 'N/A'}
                            </p>
                          </div>
                          {item.evening_temp !== undefined && (
                            item.evening_compliant ? (
                              <CheckCircle2 className="w-4 h-4 text-green-400" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-red-400" />
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-4 border-t border-slate-700 mt-4">
          <Button variant="outline" onClick={onClose} className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700">
            Fermer
          </Button>
        </div>

        <ConfirmDialog
          open={!!confirmDelete}
          onOpenChange={(open) => !open && setConfirmDelete(null)}
          title="Supprimer l'historique"
          description="Êtes-vous sûr de vouloir supprimer cet enregistrement de températures ?"
          onConfirm={() => deleteMutation.mutate(confirmDelete)}
          variant="danger"
          confirmText="Supprimer"
        />
      </DialogContent>
    </Dialog>
  );
}