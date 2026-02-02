import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, Copy, AlertTriangle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import NonShiftCard from './NonShiftCard';
import { checkMinimumRest, checkDailyHours, calculateShiftDuration } from './LegalChecks';

const STATUSES = [
  { value: 'planned', label: '📋 Planifié', color: 'blue' },
  { value: 'confirmed', label: '✅ Confirmé', color: 'green' },
  { value: 'completed', label: '✔️ Réalisé', color: 'emerald' },
  { value: 'cancelled', label: '❌ Annulé', color: 'red' }
];

export default function ShiftFormModal({ 
  open, 
  onOpenChange, 
  selectedCell, 
  existingShifts = [],
  existingNonShifts = [],
  allShifts = [],
  onSave,
  currentUser 
}) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('shifts');

  const { data: positions = [] } = useQuery({
    queryKey: ['positions'],
    queryFn: async () => {
      const all = await base44.entities.Position.filter({ is_active: true });
      return all.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
  });

  const { data: nonShiftTypes = [] } = useQuery({
    queryKey: ['nonShiftTypes'],
    queryFn: async () => {
      const types = await base44.entities.NonShiftType.filter({ is_active: true });
      return types.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
  });

  const [formData, setFormData] = useState({
    position: '',
    start_time: '09:00',
    end_time: '17:00',
    break_minutes: 0,
    status: 'planned',
    notes: ''
  });

  const [nonShiftForm, setNonShiftForm] = useState({
    non_shift_type_id: '',
    notes: ''
  });

  const [legalWarnings, setLegalWarnings] = useState([]);
  const [selectedEditShift, setSelectedEditShift] = useState(null);
  const [keepModalOpen, setKeepModalOpen] = useState(false);

  const saveNonShiftMutation = useMutation({
    mutationFn: (data) => base44.entities.NonShiftEvent.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nonShiftEvents'] });
      toast.success('Événement enregistré');
      resetNonShiftForm();
    }
  });

  const deleteNonShiftMutation = useMutation({
    mutationFn: (id) => base44.entities.NonShiftEvent.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nonShiftEvents'] });
      toast.success('Événement supprimé');
    }
  });

  useEffect(() => {
    if (!open) {
      resetForm();
      resetNonShiftForm();
      setSelectedEditShift(null);
      setLegalWarnings([]);
      setActiveTab('shifts');
    }
  }, [open]);

  useEffect(() => {
    if (selectedEditShift) {
      setFormData({
        position: selectedEditShift.position || '',
        start_time: selectedEditShift.start_time || '09:00',
        end_time: selectedEditShift.end_time || '17:00',
        break_minutes: selectedEditShift.break_minutes || 0,
        status: selectedEditShift.status || 'planned',
        notes: selectedEditShift.notes || ''
      });
    }
  }, [selectedEditShift]);

  const resetForm = () => {
    setFormData({
      position: '',
      start_time: '09:00',
      end_time: '17:00',
      break_minutes: 0,
      status: 'planned',
      notes: ''
    });
    setSelectedEditShift(null);
    setLegalWarnings([]);
  };

  const resetNonShiftForm = () => {
    setNonShiftForm({
      non_shift_type_id: '',
      notes: ''
    });
  };

  const validateShift = () => {
    const warnings = [];
    
    if (!formData.position) {
      toast.error('Le poste est obligatoire');
      return false;
    }

    const newShift = {
      ...formData,
      date: selectedCell.date,
      employee_id: selectedCell.employeeId
    };

    const employeeShifts = allShifts.filter(s => 
      s.employee_id === selectedCell.employeeId && 
      s.id !== selectedEditShift?.id
    );
    
    const restCheck = checkMinimumRest(employeeShifts, newShift);
    if (!restCheck.valid) {
      warnings.push({ type: 'error', message: restCheck.message });
    }

    const dailyShifts = existingShifts.filter(s => s.id !== selectedEditShift?.id);
    const dailyCheck = checkDailyHours([...dailyShifts, newShift]);
    if (dailyCheck.warning) {
      warnings.push({ type: 'warning', message: dailyCheck.message });
    }

    setLegalWarnings(warnings);

    if (warnings.some(w => w.type === 'error')) {
      return false;
    }

    return true;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!validateShift()) return;

    const shiftData = {
      ...formData,
      date: selectedCell.date,
      employee_id: selectedCell.employeeId,
      employee_name: selectedCell.employeeName,
      modified_by: currentUser?.email,
      modified_by_name: currentUser?.full_name,
      modified_at: new Date().toISOString()
    };

    onSave(selectedEditShift?.id, shiftData);

    if (keepModalOpen) {
      resetForm();
      toast.success('Shift enregistré. Vous pouvez en ajouter un autre.');
    } else {
      onOpenChange(false);
    }
  };

  const handleDuplicate = (shift) => {
    setFormData({
      position: shift.position,
      start_time: shift.start_time,
      end_time: shift.end_time,
      break_minutes: shift.break_minutes,
      status: 'planned',
      notes: shift.notes || ''
    });
    setSelectedEditShift(null);
  };

  const calculateDuration = () => {
    if (!formData.start_time || !formData.end_time) return '0h00';
    const [startH, startM] = formData.start_time.split(':').map(Number);
    const [endH, endM] = formData.end_time.split(':').map(Number);
    
    let totalMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    if (totalMinutes < 0) totalMinutes += 24 * 60;
    totalMinutes -= (formData.break_minutes || 0);
    
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h${minutes.toString().padStart(2, '0')}`;
  };

  const handleSaveNonShift = () => {
    if (!nonShiftForm.non_shift_type_id) {
      toast.error('Veuillez sélectionner un type');
      return;
    }

    const selectedType = nonShiftTypes.find(t => t.id === nonShiftForm.non_shift_type_id);
    
    const data = {
      employee_id: selectedCell.employeeId,
      employee_name: selectedCell.employeeName,
      date: selectedCell.date,
      non_shift_type_id: nonShiftForm.non_shift_type_id,
      non_shift_type_label: selectedType?.label || '',
      notes: nonShiftForm.notes
    };

    saveNonShiftMutation.mutate(data);
  };

  const handleDeleteNonShift = (nonShift) => {
    if (window.confirm(`Supprimer cet événement ?`)) {
      deleteNonShiftMutation.mutate(nonShift.id);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-orange-600">
            Gestion du planning - {selectedCell?.employeeName}
          </DialogTitle>
          <p className="text-sm text-gray-600">
            {selectedCell?.dayInfo?.dayName} {selectedCell?.dayInfo?.day} {selectedCell?.monthName} {selectedCell?.year}
          </p>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="shifts">Shifts</TabsTrigger>
            <TabsTrigger value="nonshifts">Absences / Statuts</TabsTrigger>
          </TabsList>

          <TabsContent value="shifts" className="space-y-4">
            {/* Shifts existants */}
            {existingShifts.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-900">Shifts de la journée</h3>
                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full font-semibold">
                    {existingShifts.length} shift(s)
                  </span>
                </div>
                {existingShifts.map((shift) => (
                  <div
                    key={shift.id}
                    className={cn(
                      "p-3 rounded-lg border-2 transition-all cursor-pointer",
                      selectedEditShift?.id === shift.id 
                        ? "border-orange-500 bg-orange-50" 
                        : "border-gray-200 bg-white hover:border-orange-300"
                    )}
                    onClick={() => setSelectedEditShift(shift)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900">{shift.position}</div>
                        <div className="text-sm text-gray-600">
                          {shift.start_time} - {shift.end_time} • {calculateShiftDuration(shift).toFixed(1)}h
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicate(shift);
                        }}
                        className="text-orange-600 hover:text-orange-700"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Alertes légales */}
            {legalWarnings.length > 0 && (
              <div className="space-y-2">
                {legalWarnings.map((warning, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "flex items-start gap-2 p-3 rounded-lg",
                      warning.type === 'error' ? "bg-red-50 border border-red-200" : "bg-orange-50 border border-orange-200"
                    )}
                  >
                    <AlertTriangle className={cn("w-5 h-5 flex-shrink-0 mt-0.5", warning.type === 'error' ? "text-red-600" : "text-orange-600")} />
                    <p className={cn("text-sm", warning.type === 'error' ? "text-red-900" : "text-orange-900")}>
                      {warning.message}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Formulaire shift */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="block mb-2 font-semibold">Poste *</Label>
                  <Select
                    value={formData.position}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, position: value }))}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Sélectionner..." />
                    </SelectTrigger>
                    <SelectContent>
                      {positions.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-gray-500">
                          Aucun poste configuré
                        </div>
                      ) : (
                        positions.map(pos => (
                          <SelectItem key={pos.id} value={pos.label}>
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: pos.color }}
                              />
                              {pos.label}
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="block mb-2 font-semibold">Statut</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map(status => (
                        <SelectItem key={status.value} value={status.value}>
                          {status.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="block mb-2 font-semibold">Heure début *</Label>
                  <Input
                    type="time"
                    value={formData.start_time}
                    onChange={(e) => setFormData(prev => ({ ...prev, start_time: e.target.value }))}
                    className="h-11"
                    required
                  />
                </div>

                <div>
                  <Label className="block mb-2 font-semibold">Heure fin *</Label>
                  <Input
                    type="time"
                    value={formData.end_time}
                    onChange={(e) => setFormData(prev => ({ ...prev, end_time: e.target.value }))}
                    className="h-11"
                    required
                  />
                </div>

                <div>
                  <Label className="block mb-2 font-semibold">Pause (min)</Label>
                  <Input
                    type="number"
                    value={formData.break_minutes}
                    onChange={(e) => setFormData(prev => ({ ...prev, break_minutes: parseInt(e.target.value) || 0 }))}
                    className="h-11"
                    min="0"
                  />
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-semibold text-blue-900">
                  Durée travaillée : {calculateDuration()}
                </span>
              </div>

              <div>
                <Label className="block mb-2 font-semibold">Notes (optionnel)</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Notes additionnelles..."
                  rows={2}
                />
              </div>

              <div className="flex items-center gap-3 pt-4 border-t">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={keepModalOpen}
                    onChange={(e) => setKeepModalOpen(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                  />
                  <span className="text-sm text-gray-700">Garder ouvert pour ajouter plusieurs shifts</span>
                </label>
              </div>

              <div className="flex gap-3">
                {selectedEditShift && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetForm}
                    className="flex-1"
                  >
                    Nouveau shift
                  </Button>
                )}
                <Button
                  type="submit"
                  className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-semibold h-12"
                >
                  {selectedEditShift ? '✏️ Modifier' : <><Plus className="w-5 h-5 mr-2" /> Ajouter</>}
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="nonshifts" className="space-y-4">
            {/* Existing Non-Shifts */}
            {existingNonShifts && existingNonShifts.length > 0 && (
              <div>
                <Label className="text-sm font-semibold mb-2">Événements existants</Label>
                <div className="space-y-2">
                  {existingNonShifts.map((nonShift) => {
                    const type = nonShiftTypes.find(t => t.id === nonShift.non_shift_type_id);
                    return (
                      <NonShiftCard 
                        key={nonShift.id} 
                        nonShift={nonShift}
                        nonShiftType={type}
                        onClick={() => {}}
                        onDelete={handleDeleteNonShift}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Non-Shift Form */}
            <div className="border-2 border-gray-200 rounded-lg p-4 space-y-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                ➕ Ajouter un événement
              </h3>

              {nonShiftTypes.length === 0 ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-900">
                  Aucun type de non-shift configuré. Allez dans les paramètres pour les créer.
                </div>
              ) : (
                <>
                  <div>
                    <Label>Type d'événement *</Label>
                    <Select 
                      value={nonShiftForm.non_shift_type_id} 
                      onValueChange={(value) => setNonShiftForm({ ...nonShiftForm, non_shift_type_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner..." />
                      </SelectTrigger>
                      <SelectContent>
                        {nonShiftTypes.map(type => (
                          <SelectItem key={type.id} value={type.id}>
                            <div className="flex items-center gap-2">
                              <span>{type.icon}</span>
                              <span>{type.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Notes (optionnel)</Label>
                    <Textarea
                      value={nonShiftForm.notes}
                      onChange={(e) => setNonShiftForm({ ...nonShiftForm, notes: e.target.value })}
                      placeholder="Ex: Certificat médical à fournir"
                      rows={2}
                    />
                  </div>

                  {nonShiftForm.non_shift_type_id && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs">
                      {(() => {
                        const selectedType = nonShiftTypes.find(t => t.id === nonShiftForm.non_shift_type_id);
                        if (!selectedType) return null;
                        
                        const activeParams = [];
                        if (selectedType.is_paid) activeParams.push('💰 Payé');
                        if (selectedType.generates_work_hours) activeParams.push('⏱️ Génère heures');
                        if (selectedType.blocks_shifts) activeParams.push('🚫 Bloque shifts');
                        if (selectedType.impacts_payroll) activeParams.push('📊 Impact paie');
                        
                        return (
                          <div>
                            <p className="font-semibold text-blue-900 mb-1">Paramètres actifs :</p>
                            {activeParams.length > 0 ? (
                              <p className="text-blue-800">{activeParams.join(' • ')}</p>
                            ) : (
                              <p className="text-blue-800 italic">Aucun paramètre actif (événement informatif uniquement)</p>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  <Button 
                    onClick={handleSaveNonShift}
                    disabled={saveNonShiftMutation.isPending}
                    className="w-full bg-orange-600 hover:bg-orange-700"
                  >
                    {saveNonShiftMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
                  </Button>
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}