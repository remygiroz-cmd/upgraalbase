import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Thermometer, Plus, Settings, Download, AlertTriangle, CheckCircle2, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import PageHeader from '@/components/ui/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function Temperatures() {
  const queryClient = useQueryClient();
  const today = format(new Date(), 'yyyy-MM-dd');
  const currentHour = new Date().getHours();
  const autoSession = currentHour < 12 ? 'morning' : 'evening';

  const [session, setSession] = useState(autoSession);
  const [showEquipmentModal, setShowEquipmentModal] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState(null);

  const { data: equipment = [], isLoading: loadingEquipment } = useQuery({
    queryKey: ['equipment'],
    queryFn: () => base44.entities.Equipment.filter({ is_active: true }, 'order')
  });

  const { data: temperatures = [], isLoading: loadingTemps } = useQuery({
    queryKey: ['temperatures', today, session],
    queryFn: () => base44.entities.Temperature.filter({ date: today, session })
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
        session,
        temperature: temp,
        target_min: eq.target_min,
        target_max: eq.target_max,
        is_compliant: isCompliant,
        is_auto_filled: false,
        signed_by: currentUser?.email,
        signed_by_name: currentUser?.full_name || currentUser?.email,
        signed_at: new Date().toISOString()
      };

      if (existing) {
        return base44.entities.Temperature.update(existing.id, data);
      }
      return base44.entities.Temperature.create(data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['temperatures', today, session] })
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
    link.download = `temperatures_${today}_${session}.csv`;
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
          </>
        }
      />

      {/* Session Selector */}
      <div className="mb-6 flex gap-2">
        <Button
          variant={session === 'morning' ? 'default' : 'outline'}
          onClick={() => setSession('morning')}
          className={cn(
            session === 'morning'
              ? "bg-amber-600 hover:bg-amber-700"
              : "border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700"
          )}
        >
          <Sun className="w-4 h-4 mr-2" />
          Matin (avant 12h)
        </Button>
        <Button
          variant={session === 'evening' ? 'default' : 'outline'}
          onClick={() => setSession('evening')}
          className={cn(
            session === 'evening'
              ? "bg-indigo-600 hover:bg-indigo-700"
              : "border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700"
          )}
        >
          <Moon className="w-4 h-4 mr-2" />
          Soir (après 16h)
        </Button>
      </div>

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
          {temperature.is_auto_filled && (
            <Badge variant="outline" className="ml-2 text-[10px] border-amber-600/50 text-amber-400">
              Auto
            </Badge>
          )}
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