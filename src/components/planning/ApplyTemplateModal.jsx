import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const DAYS_MAP = {
  1: 'Lundi',
  2: 'Mardi',
  3: 'Mercredi',
  4: 'Jeudi',
  5: 'Vendredi',
  6: 'Samedi',
  7: 'Dimanche'
};

export default function ApplyTemplateModal({ open, onOpenChange, employeeId, employeeName }) {
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [conflicts, setConflicts] = useState(null);
  const [conflictMode, setConflictMode] = useState('replace'); // replace, add, cancel
  const queryClient = useQueryClient();

  const { data: templateWeeks = [] } = useQuery({
    queryKey: ['templateWeeks', employeeId],
    queryFn: async () => {
      const weeks = await base44.entities.TemplateWeek.filter({ employee_id: employeeId });
      return weeks.sort((a, b) => (a.order || 0) - (b.order || 0));
    },
    enabled: !!employeeId && open
  });

  const { data: templateShifts = [] } = useQuery({
    queryKey: ['templateShifts', selectedTemplateId],
    queryFn: () => base44.entities.TemplateShift.filter({ template_week_id: selectedTemplateId }),
    enabled: !!selectedTemplateId
  });

  const { data: existingShifts = [] } = useQuery({
    queryKey: ['shifts', startDate, endDate],
    queryFn: async () => {
      if (!startDate || !endDate) return [];
      const allShifts = await base44.entities.Shift.list();
      return allShifts.filter(s => 
        s.employee_id === employeeId && 
        s.date >= startDate && 
        s.date <= endDate
      );
    },
    enabled: !!startDate && !!endDate && !!employeeId
  });

  const applyTemplateMutation = useMutation({
    mutationFn: async ({ mode }) => {
      if (!startDate || !endDate || !selectedTemplateId) {
        throw new Error('Données incomplètes');
      }

      const start = new Date(startDate);
      const end = new Date(endDate);
      const shifts = [];

      // Generate shifts for each day in range
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = d.getDay() === 0 ? 7 : d.getDay(); // 1=Lundi, 7=Dimanche
        const dateStr = d.toISOString().split('T')[0];

        // Find template shifts for this day
        const dayTemplates = templateShifts.filter(ts => ts.day_of_week === dayOfWeek);

        for (const template of dayTemplates) {
          shifts.push({
            employee_id: employeeId,
            employee_name: employeeName,
            date: dateStr,
            start_time: template.start_time,
            end_time: template.end_time,
            break_minutes: template.break_minutes || 0,
            position: template.position,
            notes: template.notes || '',
            status: 'planned'
          });
        }
      }

      // If replace mode, delete existing shifts first
      if (mode === 'replace' && existingShifts.length > 0) {
        await Promise.all(existingShifts.map(s => base44.entities.Shift.delete(s.id)));
      }

      // Create new shifts
      if (shifts.length > 0) {
        await base44.entities.Shift.bulkCreate(shifts);
      }

      return shifts.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      toast.success(`${count} shift(s) appliqué(s)`);
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      toast.error('Erreur : ' + error.message);
    }
  });

  const resetForm = () => {
    setSelectedTemplateId('');
    setStartDate('');
    setEndDate('');
    setConflicts(null);
    setConflictMode('replace');
  };

  const handlePreview = () => {
    if (!startDate || !endDate || !selectedTemplateId) {
      toast.error('Veuillez remplir tous les champs');
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start > end) {
      toast.error('La date de début doit être avant la date de fin');
      return;
    }

    // Check conflicts
    const conflictDates = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const dayShifts = existingShifts.filter(s => s.date === dateStr);
      if (dayShifts.length > 0) {
        conflictDates.push({ date: dateStr, count: dayShifts.length });
      }
    }

    setConflicts({
      hasConflicts: conflictDates.length > 0,
      conflictDates,
      totalExistingShifts: existingShifts.length
    });
  };

  const handleApply = () => {
    if (conflicts?.hasConflicts && conflictMode === 'cancel') {
      onOpenChange(false);
      resetForm();
      return;
    }

    applyTemplateMutation.mutate({ mode: conflictMode });
  };

  const getDaysBetween = () => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-orange-600">
            <Calendar className="w-6 h-6" />
            Appliquer un planning type
          </DialogTitle>
          <p className="text-sm text-gray-600">
            {employeeName}
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Sélection de la semaine type */}
          <div>
            <Label>Semaine type *</Label>
            <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir une semaine type..." />
              </SelectTrigger>
              <SelectContent>
                {templateWeeks.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-500">
                    Aucune semaine type configurée
                  </div>
                ) : (
                  templateWeeks.map(week => (
                    <SelectItem key={week.id} value={week.id}>
                      <div className="flex items-center gap-2">
                        {week.is_default && <span className="text-orange-600">⭐</span>}
                        {week.name}
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Aperçu de la semaine type */}
          {selectedTemplateId && templateShifts.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-blue-900 mb-2">Aperçu de la semaine type :</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[1, 2, 3, 4, 5, 6, 7].map(day => {
                  const dayShifts = templateShifts.filter(s => s.day_of_week === day);
                  return (
                    <div key={day} className="flex items-center gap-2">
                      <span className="font-semibold text-gray-700 w-20">{DAYS_MAP[day]}</span>
                      <span className="text-gray-600">
                        {dayShifts.length > 0 ? `${dayShifts.length} shift(s)` : '-'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sélection de la période */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Date de début *</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setConflicts(null);
                }}
              />
            </div>
            <div>
              <Label>Date de fin *</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setConflicts(null);
                }}
              />
            </div>
          </div>

          {startDate && endDate && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
              <p className="text-gray-700">
                📅 Période : <span className="font-semibold">{getDaysBetween()} jour(s)</span>
              </p>
            </div>
          )}

          {/* Bouton prévisualiser */}
          {startDate && endDate && selectedTemplateId && !conflicts && (
            <Button
              onClick={handlePreview}
              variant="outline"
              className="w-full border-2 border-blue-400 text-blue-700 hover:bg-blue-50"
            >
              Vérifier les conflits
            </Button>
          )}

          {/* Gestion des conflits */}
          {conflicts && (
            <div className={cn(
              "border-2 rounded-lg p-4 space-y-4",
              conflicts.hasConflicts ? "bg-orange-50 border-orange-300" : "bg-green-50 border-green-300"
            )}>
              <div className="flex items-start gap-3">
                {conflicts.hasConflicts ? (
                  <>
                    <AlertTriangle className="w-6 h-6 text-orange-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-orange-900 mb-1">Conflits détectés</h3>
                      <p className="text-sm text-orange-800 mb-3">
                        {conflicts.totalExistingShifts} shift(s) existant(s) sur {conflicts.conflictDates.length} jour(s)
                      </p>

                      {/* Options de résolution */}
                      <div className="space-y-2">
                        <label className="flex items-start gap-3 p-3 border-2 border-orange-200 rounded-lg hover:bg-orange-100 cursor-pointer">
                          <input
                            type="radio"
                            name="conflictMode"
                            value="replace"
                            checked={conflictMode === 'replace'}
                            onChange={(e) => setConflictMode(e.target.value)}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <p className="font-semibold text-orange-900 flex items-center gap-2">
                              🔁 Remplacer les shifts existants
                            </p>
                            <p className="text-xs text-orange-700">
                              Les shifts actuels seront supprimés et remplacés par le planning type
                            </p>
                          </div>
                        </label>

                        <label className="flex items-start gap-3 p-3 border-2 border-orange-200 rounded-lg hover:bg-orange-100 cursor-pointer">
                          <input
                            type="radio"
                            name="conflictMode"
                            value="add"
                            checked={conflictMode === 'add'}
                            onChange={(e) => setConflictMode(e.target.value)}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <p className="font-semibold text-orange-900 flex items-center gap-2">
                              ➕ Ajouter en complément
                            </p>
                            <p className="text-xs text-orange-700">
                              Les shifts du planning type seront ajoutés aux shifts existants
                            </p>
                          </div>
                        </label>

                        <label className="flex items-start gap-3 p-3 border-2 border-orange-200 rounded-lg hover:bg-orange-100 cursor-pointer">
                          <input
                            type="radio"
                            name="conflictMode"
                            value="cancel"
                            checked={conflictMode === 'cancel'}
                            onChange={(e) => setConflictMode(e.target.value)}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <p className="font-semibold text-orange-900 flex items-center gap-2">
                              ❌ Annuler
                            </p>
                            <p className="text-xs text-orange-700">
                              Ne rien modifier, fermer la fenêtre
                            </p>
                          </div>
                        </label>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-green-900">Aucun conflit</h3>
                      <p className="text-sm text-green-800">
                        La période est libre, vous pouvez appliquer le planning type
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              resetForm();
            }}
          >
            Annuler
          </Button>
          <Button
            onClick={handleApply}
            disabled={!conflicts || applyTemplateMutation.isPending}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {applyTemplateMutation.isPending ? 'Application...' : 'Appliquer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}