import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Thermometer, Plus, Settings, Download, AlertTriangle, CheckCircle2, Save, History, Trash2 } from 'lucide-react';
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
  const [editingEquipment, setEditingEquipment] = useState(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

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
    mutationFn: async ({ equipmentId, temp, equipment: eq }) => {
      const existing = temperatures.find(t => t.equipment_id === equipmentId);
      const isCompliant = temp >= eq.target_min && temp <= eq.target_max;
      
      const data = {
        equipment_id: equipmentId,
        date: today,
        temperature: temp,
        target_min: eq.target_min,
        target_max: eq.target_max,
        is_compliant: isCompliant,
        signed_by: currentUser?.email,
        signed_by_name: currentUser?.full_name || currentUser?.email,
        signed_at: new Date().toISOString()
      };

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
      setShowEquipmentModal(false);
      setEditingEquipment(null);
    }
  });

  const saveSnapshotMutation = useMutation({
    mutationFn: async () => {
      const snapshot = equipment.map(eq => {
        const temp = temperatures.find(t => t.equipment_id === eq.id);
        return {
          equipment_id: eq.id,
          equipment_name: eq.name,
          equipment_type: eq.type,
          temperature: temp?.temperature ?? (eq.type === 'positive' ? 3 : -18),
          target_min: eq.target_min,
          target_max: eq.target_max,
          is_compliant: temp?.is_compliant ?? true
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
          temperature: defaultTemp,
          target_min: eq.target_min,
          target_max: eq.target_max,
          is_compliant: isCompliant,
          signed_by: 'système',
          signed_by_name: 'Valeur par défaut',
          signed_at: new Date().toISOString()
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
    const rows = [['Équipement', 'Type', 'Température', 'Min', 'Max', 'Conforme', 'Signé par', 'Date/Heure']];
    
    equipment.forEach(eq => {
      const temp = temperatures.find(t => t.equipment_id === eq.id);
      rows.push([
        eq.name,
        eq.type === 'positive' ? 'Positif' : 'Négatif',
        temp?.temperature ?? 'Non relevé',
        eq.target_min,
        eq.target_max,
        temp ? (temp.is_compliant ? 'Oui' : 'NON') : '-',
        temp?.signed_by_name || '-',
        temp?.signed_at ? format(new Date(temp.signed_at), 'dd/MM/yyyy HH:mm') : '-'
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
            <Button
              variant="outline"
              onClick={() => setShowEquipmentModal(true)}
              className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700"
            >
              <Settings className="w-4 h-4 mr-2" />
              Équipements
            </Button>
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
              onSave={(temp) => saveTempMutation.mutate({ equipmentId: eq.id, temp, equipment: eq })}
              isSaving={saveTempMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* Equipment Modal */}
      <EquipmentModal
        open={showEquipmentModal}
        onClose={() => {
          setShowEquipmentModal(false);
          setEditingEquipment(null);
        }}
        equipment={editingEquipment}
        onSave={(data) => saveEquipmentMutation.mutate(data)}
        isSaving={saveEquipmentMutation.isPending}
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
  const [inputValue, setInputValue] = useState('');
  
  useEffect(() => {
    if (temperature?.temperature !== undefined) {
      setInputValue(temperature.temperature.toString());
    } else {
      setInputValue('');
    }
  }, [temperature]);

  const handleSave = () => {
    const temp = parseFloat(inputValue);
    if (!isNaN(temp)) {
      onSave(temp);
    }
  };

  const isPositive = equipment.type === 'positive';
  const isCompliant = temperature?.is_compliant;
  const hasValue = temperature?.temperature !== undefined;

  return (
    <div className={cn(
      "p-4 rounded-2xl border-2 transition-all",
      hasValue
        ? isCompliant
          ? "bg-orange-50 border-orange-400"
          : "bg-red-50 border-red-400"
        : "bg-white border-gray-300"
    )}>
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
        
        {hasValue && (
          isCompliant ? (
            <CheckCircle2 className="w-6 h-6 text-orange-400" />
          ) : (
            <AlertTriangle className="w-6 h-6 text-red-400" />
          )
        )}
      </div>

      <div className="mb-4">
        <p className="text-xs text-gray-700 font-medium mb-1">
          Cible: {equipment.target_min}°C à {equipment.target_max}°C
        </p>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            step="0.1"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="°C"
            className="bg-gray-50 border-gray-300 text-center text-2xl font-bold h-14"
          />
          <span className="text-2xl text-gray-700">°C</span>
        </div>
      </div>

      {hasValue && temperature.signed_by_name && (
        <p className="text-xs text-gray-600 mb-3">
          Signé par {temperature.signed_by_name}
        </p>
      )}

      <Button
        onClick={handleSave}
        disabled={!inputValue || isSaving}
        className={cn(
          "w-full min-h-[44px]",
          hasValue
            ? "bg-slate-600 hover:bg-slate-500"
            : "bg-orange-600 hover:bg-orange-700"
        )}
      >
        {hasValue ? 'Mettre à jour' : 'Enregistrer'}
      </Button>
    </div>
  );
}

function EquipmentModal({ open, onClose, equipment, onSave, isSaving }) {
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
                      className={cn(
                        "p-3 rounded-lg border",
                        item.temperature !== undefined && item.temperature !== null
                          ? item.is_compliant
                            ? "bg-green-950/30 border-green-800/50"
                            : "bg-red-950/30 border-red-800/50"
                          : "bg-slate-800 border-slate-700"
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-white text-sm truncate">{item.equipment_name}</p>
                          <p className="text-xs text-slate-400">
                            Cible: {item.target_min}°C à {item.target_max}°C
                          </p>
                        </div>
                        {item.temperature !== undefined && item.temperature !== null ? (
                          item.is_compliant ? (
                            <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 ml-2" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 ml-2" />
                          )
                        ) : null}
                      </div>
                      <p className="text-xl font-bold text-white mt-2">
                        {item.temperature !== undefined && item.temperature !== null
                          ? `${item.temperature}°C`
                          : 'Non relevé'}
                      </p>
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