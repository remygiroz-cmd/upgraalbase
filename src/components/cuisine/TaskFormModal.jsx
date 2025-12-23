import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Upload, Sparkles, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

const POSTES = [
  { value: 'chaud', label: 'Chaud' },
  { value: 'froid', label: 'Froid' },
  { value: 'sushi', label: 'Sushi' },
  { value: 'patisserie', label: 'Pâtisserie' },
  { value: 'plonge', label: 'Plonge' },
  { value: 'autre', label: 'Autre' },
];

const DAYS = [
  { key: 'monday', label: 'Lun' },
  { key: 'tuesday', label: 'Mar' },
  { key: 'wednesday', label: 'Mer' },
  { key: 'thursday', label: 'Jeu' },
  { key: 'friday', label: 'Ven' },
  { key: 'saturday', label: 'Sam' },
  { key: 'sunday', label: 'Dim' },
];

export default function TaskFormModal({ open, onClose, task, categories }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('general');
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    name: '',
    category_id: '',
    poste: 'autre',
    duration_minutes: 0,
    duration_seconds: 0,
    tracking_mode: 'binary',
    unit: '',
    requires_stock_check: false,
    auto_schedule: {
      enabled: false,
      trigger_day: 'monday',
      trigger_time: '19:00',
      quantity: 0
    },
    weekly_targets: {
      monday: 0,
      tuesday: 0,
      wednesday: 0,
      thursday: 0,
      friday: 0,
      saturday: 0,
      sunday: 0
    },
    image_url: '',
    instructions: '',
    is_active: true
  });

  useEffect(() => {
    if (task) {
      setForm({
        name: task.name || '',
        category_id: task.category_id || '',
        poste: task.poste || 'autre',
        duration_minutes: task.duration_minutes || 0,
        duration_seconds: task.duration_seconds || 0,
        tracking_mode: task.tracking_mode || 'binary',
        unit: task.unit || '',
        requires_stock_check: task.requires_stock_check || false,
        auto_schedule: task.auto_schedule || {
          enabled: false,
          trigger_day: 'monday',
          trigger_time: '19:00',
          quantity: 0
        },
        weekly_targets: task.weekly_targets || {
          monday: 0, tuesday: 0, wednesday: 0, thursday: 0,
          friday: 0, saturday: 0, sunday: 0
        },
        image_url: task.image_url || '',
        instructions: task.instructions || '',
        is_active: task.is_active !== false
      });
    } else {
      setForm({
        name: '',
        category_id: '',
        poste: 'autre',
        duration_minutes: 0,
        duration_seconds: 0,
        tracking_mode: 'binary',
        unit: '',
        requires_stock_check: false,
        auto_schedule: {
          enabled: false,
          trigger_day: 'monday',
          trigger_time: '19:00',
          quantity: 0
        },
        weekly_targets: {
          monday: 0, tuesday: 0, wednesday: 0, thursday: 0,
          friday: 0, saturday: 0, sunday: 0
        },
        image_url: '',
        instructions: '',
        is_active: true
      });
    }
    setActiveTab('general');
  }, [task, open]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (task?.id) {
        return base44.entities.Task.update(task.id, data);
      }
      return base44.entities.Task.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      onClose();
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate(form);
  };

  const handleGenerateImage = async () => {
    if (!form.name) return;
    setGenerating(true);
    try {
      const result = await base44.integrations.Core.GenerateImage({
        prompt: `Professional food preparation illustration of "${form.name}", clean minimal style, kitchen mise en place, white background, high quality`
      });
      if (result?.url) {
        setForm(prev => ({ ...prev, image_url: result.url }));
      }
    } catch (error) {
      console.error('Image generation failed:', error);
    }
    setGenerating(false);
  };

  const handleUploadImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    try {
      const result = await base44.integrations.Core.UploadFile({ file });
      if (result?.file_url) {
        setForm(prev => ({ ...prev, image_url: result.file_url }));
      }
    } catch (error) {
      console.error('Upload failed:', error);
    }
    setUploading(false);
  };

  const updateWeeklyTarget = (day, value) => {
    setForm(prev => ({
      ...prev,
      weekly_targets: {
        ...prev.weekly_targets,
        [day]: parseInt(value) || 0
      }
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? 'Modifier la tâche' : 'Nouvelle tâche'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4 bg-slate-700">
              <TabsTrigger value="general">Général</TabsTrigger>
              <TabsTrigger value="production">Production</TabsTrigger>
              <TabsTrigger value="auto">Auto</TabsTrigger>
              <TabsTrigger value="visuel">Visuel</TabsTrigger>
            </TabsList>

            {/* General Tab */}
            <TabsContent value="general" className="space-y-4 mt-4">
              <div>
                <Label htmlFor="name">Nom de la tâche *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Tailler les légumes"
                  className="bg-slate-700 border-slate-600 mt-1"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Catégorie</Label>
                  <Select
                    value={form.category_id}
                    onValueChange={(value) => setForm(prev => ({ ...prev, category_id: value }))}
                  >
                    <SelectTrigger className="bg-slate-700 border-slate-600 mt-1">
                      <SelectValue placeholder="Sélectionner..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-700 border-slate-600">
                      {categories.map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Poste</Label>
                  <Select
                    value={form.poste}
                    onValueChange={(value) => setForm(prev => ({ ...prev, poste: value }))}
                  >
                    <SelectTrigger className="bg-slate-700 border-slate-600 mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-700 border-slate-600">
                      {POSTES.map(p => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Durée théorique</Label>
                <div className="grid grid-cols-2 gap-4 mt-1">
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      value={form.duration_minutes}
                      onChange={(e) => setForm(prev => ({ ...prev, duration_minutes: parseInt(e.target.value) || 0 }))}
                      className="bg-slate-700 border-slate-600 pr-12"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">min</span>
                  </div>
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      max="59"
                      value={form.duration_seconds}
                      onChange={(e) => setForm(prev => ({ ...prev, duration_seconds: parseInt(e.target.value) || 0 }))}
                      className="bg-slate-700 border-slate-600 pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">s</span>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Production Tab */}
            <TabsContent value="production" className="space-y-4 mt-4">
              <div>
                <Label>Mode de suivi</Label>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, tracking_mode: 'binary' }))}
                    className={cn(
                      "p-4 rounded-xl border-2 text-left transition-all",
                      form.tracking_mode === 'binary'
                        ? "border-orange-500 bg-orange-500/10"
                        : "border-slate-600 hover:border-slate-500"
                    )}
                  >
                    <p className="font-medium">Binaire</p>
                    <p className="text-xs text-slate-400 mt-1">À faire / Fait</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, tracking_mode: 'quantity' }))}
                    className={cn(
                      "p-4 rounded-xl border-2 text-left transition-all",
                      form.tracking_mode === 'quantity'
                        ? "border-indigo-500 bg-indigo-500/10"
                        : "border-slate-600 hover:border-slate-500"
                    )}
                  >
                    <p className="font-medium">Quantité</p>
                    <p className="text-xs text-slate-400 mt-1">Stock cible par jour</p>
                  </button>
                </div>
              </div>

              {form.tracking_mode === 'quantity' && (
                <>
                  <div>
                    <Label htmlFor="unit">Unité de mesure</Label>
                    <Input
                      id="unit"
                      value={form.unit}
                      onChange={(e) => setForm(prev => ({ ...prev, unit: e.target.value }))}
                      placeholder="Ex: portions, kg, litres..."
                      className="bg-slate-700 border-slate-600 mt-1"
                    />
                  </div>
                  
                  <div className="flex items-center gap-3 p-4 bg-slate-700/50 rounded-xl">
                    <input
                      type="checkbox"
                      id="requires_stock_check"
                      checked={form.requires_stock_check}
                      onChange={(e) => setForm(prev => ({ ...prev, requires_stock_check: e.target.checked }))}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-orange-600 focus:ring-orange-500"
                    />
                    <Label htmlFor="requires_stock_check" className="cursor-pointer flex-1">
                      Vérifier le stock restant avant ajout
                      <p className="text-xs text-slate-400 font-normal mt-1">
                        Cette tâche sera automatiquement cochée avec calcul de la quantité à produire
                      </p>
                    </Label>
                  </div>
                </>
              )}

              <div>
                <Label>
                  {form.tracking_mode === 'binary' 
                    ? 'Multiplicateur par jour' 
                    : 'Stock cible par jour'}
                </Label>
                <div className="grid grid-cols-7 gap-2 mt-2">
                  {DAYS.map(day => (
                    <div key={day.key} className="text-center">
                      <p className="text-xs text-slate-400 mb-1">{day.label}</p>
                      <Input
                        type="number"
                        min="0"
                        value={form.weekly_targets[day.key]}
                        onChange={(e) => updateWeeklyTarget(day.key, e.target.value)}
                        className="bg-slate-700 border-slate-600 text-center px-1"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Auto Schedule Tab */}
            <TabsContent value="auto" className="space-y-4 mt-4">
              <div className="flex items-center gap-3 p-4 bg-slate-700/50 rounded-xl">
                <input
                  type="checkbox"
                  id="auto_schedule_enabled"
                  checked={form.auto_schedule.enabled}
                  onChange={(e) => setForm(prev => ({ 
                    ...prev, 
                    auto_schedule: { ...prev.auto_schedule, enabled: e.target.checked }
                  }))}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-orange-600 focus:ring-orange-500"
                />
                <Label htmlFor="auto_schedule_enabled" className="cursor-pointer flex-1">
                  Activer la planification automatique
                  <p className="text-xs text-slate-400 font-normal mt-1">
                    Cette tâche sera cochée automatiquement selon le jour et l'heure définis
                  </p>
                </Label>
              </div>

              {form.auto_schedule.enabled && (
                <div className="space-y-4 p-4 bg-slate-700/30 rounded-xl">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Jour de déclenchement</Label>
                      <Select
                        value={form.auto_schedule.trigger_day}
                        onValueChange={(value) => setForm(prev => ({ 
                          ...prev, 
                          auto_schedule: { ...prev.auto_schedule, trigger_day: value }
                        }))}
                      >
                        <SelectTrigger className="bg-slate-700 border-slate-600 mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-700 border-slate-600">
                          {DAYS.map(day => (
                            <SelectItem key={day.key} value={day.key}>{day.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Heure de déclenchement</Label>
                      <Input
                        type="time"
                        value={form.auto_schedule.trigger_time}
                        onChange={(e) => setForm(prev => ({ 
                          ...prev, 
                          auto_schedule: { ...prev.auto_schedule, trigger_time: e.target.value }
                        }))}
                        className="bg-slate-700 border-slate-600 mt-1"
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Quantité prédéfinie</Label>
                    <Input
                      type="number"
                      min="0"
                      value={form.auto_schedule.quantity}
                      onChange={(e) => setForm(prev => ({ 
                        ...prev, 
                        auto_schedule: { ...prev.auto_schedule, quantity: parseInt(e.target.value) || 0 }
                      }))}
                      placeholder="Ex: 2 pour 2 saumons"
                      className="bg-slate-700 border-slate-600 mt-1"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      Le temps de production sera multiplié par cette quantité
                    </p>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Visual Tab */}
            <TabsContent value="visuel" className="space-y-4 mt-4">
              <div>
                <Label>Image</Label>
                <div className="mt-2 space-y-3">
                  {form.image_url && (
                    <div className="relative w-32 h-32 rounded-xl overflow-hidden border border-slate-600">
                      <img 
                        src={form.image_url} 
                        alt="Preview" 
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleGenerateImage}
                      disabled={generating || !form.name}
                      className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700"
                    >
                      {generating ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4 mr-2" />
                      )}
                      Générer IA
                    </Button>
                    
                    <label className="cursor-pointer">
                      <Button
                        type="button"
                        variant="outline"
                        className="border-slate-600 pointer-events-none"
                        disabled={uploading}
                      >
                        {uploading ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4 mr-2" />
                        )}
                        Upload photo
                      </Button>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleUploadImage}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="instructions">Instructions</Label>
                <Textarea
                  id="instructions"
                  value={form.instructions}
                  onChange={(e) => setForm(prev => ({ ...prev, instructions: e.target.value }))}
                  placeholder="Étapes de réalisation..."
                  className="bg-slate-700 border-slate-600 mt-1 min-h-[120px]"
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            <Button type="button" variant="outline" onClick={onClose} className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700">
              Annuler
            </Button>
            <Button 
              type="submit" 
              className="bg-orange-600 hover:bg-orange-700"
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {task ? 'Mettre à jour' : 'Créer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}