import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Clock, AlertCircle } from 'lucide-react';

export default function TaskDurationModal({ open, onOpenChange, task, onSave }) {
  const [durationMode, setDurationMode] = useState(task?.durationMode || 'FIXED');
  const [estimatedMinutes, setEstimatedMinutes] = useState(task?.estimatedMinutes || 0);
  const [minutesPerUnit, setMinutesPerUnit] = useState(task?.minutesPerUnit || 0);
  const [unitLabel, setUnitLabel] = useState(task?.unitLabel || task?.unit || '');

  useEffect(() => {
    if (task) {
      setDurationMode(task.durationMode || 'FIXED');
      setEstimatedMinutes(task.estimatedMinutes || 0);
      setMinutesPerUnit(task.minutesPerUnit || 0);
      setUnitLabel(task.unitLabel || task.unit || '');
    }
  }, [task]);

  const handleSave = () => {
    const data = {
      durationMode,
      estimatedMinutes: durationMode === 'FIXED' ? Number(estimatedMinutes) : 0,
      minutesPerUnit: durationMode === 'PER_UNIT' ? Number(minutesPerUnit) : 0,
      unitLabel: durationMode === 'PER_UNIT' ? unitLabel : task?.unit || ''
    };
    
    onSave(data);
    onOpenChange(false);
  };

  const formatTime = (minutes) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h${mins.toString().padStart(2, '0')}` : `${hours}h`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-orange-600" />
            Définir la durée - {task?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Mode de calcul */}
          <div>
            <Label>Mode de calcul</Label>
            <Select value={durationMode} onValueChange={setDurationMode}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FIXED">Durée fixe</SelectItem>
                <SelectItem value="PER_UNIT">Durée par unité</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-1">
              {durationMode === 'FIXED' 
                ? 'La tâche prend toujours le même temps'
                : 'Le temps dépend de la quantité'}
            </p>
          </div>

          {/* Durée fixe */}
          {durationMode === 'FIXED' && (
            <div>
              <Label>Durée estimée (minutes)</Label>
              <Input
                type="number"
                min="0"
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(e.target.value)}
                placeholder="Ex: 15"
                className="mt-1"
              />
              {estimatedMinutes > 0 && (
                <p className="text-xs text-orange-600 mt-1 font-medium">
                  ⏱ {formatTime(Number(estimatedMinutes))}
                </p>
              )}
            </div>
          )}

          {/* Durée par unité */}
          {durationMode === 'PER_UNIT' && (
            <>
              <div>
                <Label>Minutes par unité</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={minutesPerUnit}
                  onChange={(e) => setMinutesPerUnit(e.target.value)}
                  placeholder="Ex: 2"
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Libellé de l'unité</Label>
                <Input
                  type="text"
                  value={unitLabel}
                  onChange={(e) => setUnitLabel(e.target.value)}
                  placeholder="Ex: kg, bacs, portions"
                  className="mt-1"
                />
              </div>

              {minutesPerUnit > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <p className="text-xs text-gray-700 font-medium mb-1">
                    Exemple de calcul :
                  </p>
                  <p className="text-sm text-orange-600 font-semibold">
                    {minutesPerUnit} min/{unitLabel || 'unité'} × 10 = {formatTime(Number(minutesPerUnit) * 10)}
                  </p>
                </div>
              )}
            </>
          )}

          {/* Warning si pas de durée */}
          {((durationMode === 'FIXED' && estimatedMinutes <= 0) || 
            (durationMode === 'PER_UNIT' && minutesPerUnit <= 0)) && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-700">
                Sans durée définie, cette tâche affichera "Durée à définir"
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Annuler
            </Button>
            <Button
              onClick={handleSave}
              className="flex-1 bg-orange-600 hover:bg-orange-700"
            >
              Enregistrer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}