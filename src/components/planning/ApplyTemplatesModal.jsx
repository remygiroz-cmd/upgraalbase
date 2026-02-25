import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getActiveShiftsForMonth, bulkUpsertShifts, buildDedupeKey } from './shiftService';
import { usePlanningVersion } from './usePlanningVersion';

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const DAYS_MAP = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday'
};

export default function ApplyTemplatesModal({ open, onOpenChange, monthStart, monthEnd, onSuccess }) {
  const [mode, setMode] = useState('add_empty'); // add_empty | replace | recreate
  const [includeInactive, setIncludeInactive] = useState(false);
  const [includeNoTemplate, setIncludeNoTemplate] = useState(false);
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const year = monthStart.getFullYear();
  const month = monthStart.getMonth() + 1; // 1-based
  const monthName = MONTHS[monthStart.getMonth()];
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const { resetVersion } = usePlanningVersion(year, month - 1); // usePlanningVersion uses 0-based month

  // Fetch employees with templates
  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.list(),
    enabled: open
  });

  const { data: templateWeeks = [] } = useQuery({
    queryKey: ['templateWeeks'],
    queryFn: () => base44.entities.TemplateWeek.list(),
    enabled: open
  });

  const { data: existingShifts = [] } = useQuery({
    queryKey: ['shifts', year, month - 1, resetVersion],
    queryFn: () => getActiveShiftsForMonth(monthKey, resetVersion),
    enabled: open && resetVersion !== undefined
  });

  const { data: nonShiftEvents = [] } = useQuery({
    queryKey: ['nonShiftEvents', year, month],
    queryFn: async () => {
      const allEvents = await base44.entities.NonShiftEvent.list();
      const firstDay = formatDate(monthStart);
      const lastDay = formatDate(monthEnd);
      return allEvents.filter(e => e.date >= firstDay && e.date <= lastDay);
    },
    enabled: open
  });

  // Calculate preview
  const filteredEmployees = employees.filter(emp => {
    if (!includeInactive && !emp.is_active) return false;
    const hasTemplate = templateWeeks.some(t => t.employee_id === emp.id && t.is_active);
    if (!includeNoTemplate && !hasTemplate) return false;
    return true;
  });

  const employeesWithTemplates = filteredEmployees.filter(emp => 
    templateWeeks.some(t => t.employee_id === emp.id && t.is_active)
  );

  let estimatedShifts = 0;
  let occupiedCells = 0;

  employeesWithTemplates.forEach(emp => {
    const empTemplates = templateWeeks.filter(t => t.employee_id === emp.id && t.is_active);
    if (empTemplates.length === 0) return;

    const activeTemplate = empTemplates[0];
    if (!activeTemplate.template_shifts) return;

    // Count shifts per week
    const shiftsPerWeek = activeTemplate.template_shifts.length;
    const daysInMonth = new Date(year, month, 0).getDate();
    const weeksInMonth = Math.ceil(daysInMonth / 7);
    
    estimatedShifts += shiftsPerWeek * weeksInMonth;

    // Count occupied cells
    if (mode === 'add_empty') {
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month - 1, day);
        const dateStr = formatDate(date);
        const hasShift = existingShifts.some(s => s.employee_id === emp.id && s.date === dateStr);
        const hasAbsence = nonShiftEvents.some(e => e.employee_id === emp.id && e.date === dateStr);
        if (hasShift || hasAbsence) occupiedCells++;
      }
    }
  });

  const handleApply = async () => {
    setApplying(true);
    setProgress({ current: 0, total: employeesWithTemplates.length });

    try {
      const shiftsToCreate = [];
      let shiftsCreated = 0;
      let shiftsIgnored = 0;
      let shiftsReplaced = 0;

      // Step 1: Si mode "recreate" ou "replace", supprimer les shifts existants
      if (mode === 'recreate') {
        const shiftsToDelete = existingShifts.map(s => s.id);
        for (const shiftId of shiftsToDelete) {
          await base44.entities.Shift.delete(shiftId);
          shiftsReplaced++;
        }
      }

      // Step 2: Générer les shifts
      for (let i = 0; i < employeesWithTemplates.length; i++) {
        const emp = employeesWithTemplates[i];
        setProgress({ current: i + 1, total: employeesWithTemplates.length });

        const empTemplates = templateWeeks.filter(t => t.employee_id === emp.id && t.is_active);
        if (empTemplates.length === 0) continue;

        const activeTemplate = empTemplates[0];
        if (!activeTemplate.template_shifts || activeTemplate.template_shifts.length === 0) continue;

        // Si mode "replace", supprimer les shifts de cet employé ce mois
        if (mode === 'replace') {
          const empShifts = existingShifts.filter(s => s.employee_id === emp.id);
          for (const shift of empShifts) {
            await base44.entities.Shift.delete(shift.id);
            shiftsReplaced++;
          }
        }

        // Générer pour chaque jour du mois
        const daysInMonth = new Date(year, month, 0).getDate();
        for (let day = 1; day <= daysInMonth; day++) {
          const date = new Date(year, month - 1, day);
          const dateStr = formatDate(date);
          const dayOfWeek = date.getDay();
          const dayKey = DAYS_MAP[dayOfWeek];

          // Vérifier si l'employé a une absence ce jour
          const hasAbsence = nonShiftEvents.some(e => e.employee_id === emp.id && e.date === dateStr);
          if (hasAbsence) {
            shiftsIgnored++;
            continue;
          }

          // Vérifier si déjà occupé (mode add_empty)
          if (mode === 'add_empty') {
            const hasShift = existingShifts.some(s => s.employee_id === emp.id && s.date === dateStr);
            if (hasShift) {
              shiftsIgnored++;
              continue;
            }
          }

          // Trouver les shifts du template pour ce jour
          const templateShiftsForDay = activeTemplate.template_shifts.filter(ts => ts.day === dayKey);
          
          for (const templateShift of templateShiftsForDay) {
            shiftsToCreate.push({
              employee_id: emp.id,
              employee_name: `${emp.first_name} ${emp.last_name}`,
              date: dateStr,
              start_time: templateShift.start_time,
              end_time: templateShift.end_time,
              break_minutes: templateShift.break_minutes || 0,
              position: emp.position || '',
              team: emp.team || '',
              status: 'planned',
              notes: 'Généré depuis planning type',
              month_key: monthKey,
              reset_version: resetVersion
            });
          }
        }
      }

      // Step 3: Upsert les shifts (dédupliqué par dedupe_key)
      let upsertResult = { created: 0, updated: 0 };
      if (shiftsToCreate.length > 0) {
        // Re-fetch fresh cache after possible deletions above
        const freshCache = await base44.entities.Shift.list();
        upsertResult = await bulkUpsertShifts(shiftsToCreate, freshCache);
        shiftsCreated = upsertResult.created + upsertResult.updated;
      }

      setApplying(false);
      const updatedLabel = upsertResult.updated > 0 ? `, ${upsertResult.updated} mis à jour` : '';
      toast.success(`✓ ${upsertResult.created} shifts créés${updatedLabel}, ${shiftsIgnored} ignorés, ${shiftsReplaced} remplacés`);
      onSuccess?.();
      onOpenChange(false);

    } catch (error) {
      setApplying(false);
      console.error('Apply templates error:', error);
      toast.error('Erreur lors de l\'application: ' + error.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-blue-600 flex items-center gap-2">
            <Calendar className="w-6 h-6" />
            Appliquer les plannings types – {monthName} {year}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Mode de génération */}
          <div>
            <Label className="text-sm font-semibold text-gray-900 mb-3 block">Mode d'application</Label>
            <div className="space-y-2">
              <label className="flex items-start gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                <input
                  type="radio"
                  checked={mode === 'add_empty'}
                  onChange={() => setMode('add_empty')}
                  className="mt-1"
                />
                <div>
                  <p className="font-medium text-gray-900">Ajouter uniquement sur les cases vides</p>
                  <p className="text-xs text-gray-600">Recommandé – Ne pas écraser les shifts existants</p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                <input
                  type="radio"
                  checked={mode === 'replace'}
                  onChange={() => setMode('replace')}
                  className="mt-1"
                />
                <div>
                  <p className="font-medium text-gray-900">Remplacer les shifts existants</p>
                  <p className="text-xs text-gray-600">Supprimer puis recréer pour les employés concernés uniquement</p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 border border-orange-300 bg-orange-50 rounded-lg hover:bg-orange-100 cursor-pointer">
                <input
                  type="radio"
                  checked={mode === 'recreate'}
                  onChange={() => setMode('recreate')}
                  className="mt-1"
                />
                <div>
                  <p className="font-medium text-orange-900 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Recréer tout le mois
                  </p>
                  <p className="text-xs text-orange-800">Efface TOUS les shifts du mois puis applique les templates</p>
                </div>
              </label>
            </div>
          </div>

          {/* Options */}
          <div>
            <Label className="text-sm font-semibold text-gray-900 mb-3 block">Options</Label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(e) => setIncludeInactive(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm text-gray-700">Inclure les employés inactifs</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeNoTemplate}
                  onChange={(e) => setIncludeNoTemplate(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm text-gray-700">Inclure les employés sans planning type</span>
              </label>
            </div>
          </div>

          {/* Aperçu */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              Aperçu avant exécution
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-700">Employés concernés :</span>
                <span className="font-semibold text-blue-900">{employeesWithTemplates.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-700">Shifts estimés à créer :</span>
                <span className="font-semibold text-blue-900">~{estimatedShifts}</span>
              </div>
              {mode === 'add_empty' && (
                <div className="flex justify-between">
                  <span className="text-gray-700">Cases déjà occupées (ignorées) :</span>
                  <span className="font-semibold text-orange-700">~{occupiedCells}</span>
                </div>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {applying && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                <span className="text-sm font-medium text-gray-900">
                  Application en cours... ({progress.current}/{progress.total})
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              onClick={() => onOpenChange(false)}
              variant="outline"
              disabled={applying}
              className="flex-1"
            >
              Annuler
            </Button>
            <Button
              onClick={handleApply}
              disabled={applying || employeesWithTemplates.length === 0}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {applying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Application...
                </>
              ) : (
                'Confirmer l\'application'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}