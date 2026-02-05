import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, AlertTriangle, CheckCircle, Users } from 'lucide-react';
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

export default function ApplyTemplateGlobalModal({ currentMonth, currentYear, onClose }) {
  const [targetMode, setTargetMode] = useState('all'); // 'all' | 'single'
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [applicationMode, setApplicationMode] = useState('add'); // 'add' | 'replace' | 'recreate'
  const [preview, setPreview] = useState(null);
  const queryClient = useQueryClient();

  // Fetch employees
  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.filter({ is_active: true })
  });

  // Fetch teams
  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.filter({ is_active: true })
  });

  // Fetch templates for selected employee
  const { data: templateWeeks = [] } = useQuery({
    queryKey: ['templateWeeks', selectedEmployeeId],
    queryFn: async () => {
      const weeks = await base44.entities.TemplateWeek.filter({ employee_id: selectedEmployeeId });
      return weeks.sort((a, b) => (a.order || 0) - (b.order || 0));
    },
    enabled: !!selectedEmployeeId && targetMode === 'single'
  });

  // Fetch template shifts
  const { data: templateShifts = [] } = useQuery({
    queryKey: ['templateShifts', selectedTemplateId],
    queryFn: () => base44.entities.TemplateShift.filter({ template_week_id: selectedTemplateId }),
    enabled: !!selectedTemplateId
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      const firstDay = new Date(currentYear, currentMonth, 1);
      const lastDay = new Date(currentYear, currentMonth + 1, 0);
      const startDate = firstDay.toISOString().split('T')[0];
      const endDate = lastDay.toISOString().split('T')[0];

      // Get existing shifts if needed
      let shiftsToDelete = [];
      if (applicationMode === 'replace' || applicationMode === 'recreate') {
        const allShifts = await base44.entities.Shift.list();
        shiftsToDelete = allShifts.filter(s => 
          s.date >= startDate && 
          s.date <= endDate &&
          (targetMode === 'all' || s.employee_id === selectedEmployeeId)
        );
      }

      // Delete existing shifts if needed
      if (shiftsToDelete.length > 0) {
        await Promise.all(shiftsToDelete.map(s => base44.entities.Shift.delete(s.id)));
      }

      // Generate new shifts
      const shiftsToCreate = [];
      
      if (targetMode === 'single') {
        // Apply to one employee
        const employee = employees.find(e => e.id === selectedEmployeeId);
        if (!employee) throw new Error('Employé non trouvé');

        for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
          const jsDay = d.getDay();
          const dayOfWeek = jsDay === 0 ? 7 : jsDay;
          const dateStr = d.toISOString().split('T')[0];

          const dayTemplates = templateShifts.filter(ts => ts.day_of_week === dayOfWeek);

          for (const template of dayTemplates) {
            shiftsToCreate.push({
              employee_id: employee.id,
              employee_name: `${employee.first_name} ${employee.last_name}`,
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
      } else {
        // Apply to all employees
        const allTemplateWeeks = await base44.entities.TemplateWeek.list();
        const allTemplateShifts = await base44.entities.TemplateShift.list();

        for (const employee of employees) {
          const empTemplateWeek = allTemplateWeeks.find(tw => 
            tw.employee_id === employee.id && tw.is_default
          );
          
          if (!empTemplateWeek) continue;

          const empTemplateShifts = allTemplateShifts.filter(ts => 
            ts.template_week_id === empTemplateWeek.id
          );

          for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
            const jsDay = d.getDay();
            const dayOfWeek = jsDay === 0 ? 7 : jsDay;
            const dateStr = d.toISOString().split('T')[0];

            const dayTemplates = empTemplateShifts.filter(ts => ts.day_of_week === dayOfWeek);

            for (const template of dayTemplates) {
              shiftsToCreate.push({
                employee_id: employee.id,
                employee_name: `${employee.first_name} ${employee.last_name}`,
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
        }
      }

      if (shiftsToCreate.length > 0) {
        await base44.entities.Shift.bulkCreate(shiftsToCreate);
      }

      return { created: shiftsToCreate.length, deleted: shiftsToDelete.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.refetchQueries({ queryKey: ['shifts', currentYear, currentMonth] });
      toast.success(`${result.created} shift(s) créé(s), ${result.deleted} supprimé(s)`);
      onClose();
    },
    onError: (error) => {
      toast.error('Erreur : ' + error.message);
    }
  });

  const handlePreview = async () => {
    try {
      const firstDay = new Date(currentYear, currentMonth, 1);
      const lastDay = new Date(currentYear, currentMonth + 1, 0);
      const startDate = firstDay.toISOString().split('T')[0];
      const endDate = lastDay.toISOString().split('T')[0];

      const allShifts = await base44.entities.Shift.list();
      const existingCount = allShifts.filter(s => 
        s.date >= startDate && 
        s.date <= endDate &&
        (targetMode === 'all' || s.employee_id === selectedEmployeeId)
      ).length;

      let estimatedNew = 0;

      if (targetMode === 'single' && templateShifts.length > 0) {
        const daysInMonth = lastDay.getDate();
        estimatedNew = templateShifts.length * Math.ceil(daysInMonth / 7);
      } else if (targetMode === 'all') {
        const allTemplateWeeks = await base44.entities.TemplateWeek.list();
        const allTemplateShifts = await base44.entities.TemplateShift.list();
        const daysInMonth = lastDay.getDate();

        for (const employee of employees) {
          const empTemplateWeek = allTemplateWeeks.find(tw => 
            tw.employee_id === employee.id && tw.is_default
          );
          if (empTemplateWeek) {
            const empShifts = allTemplateShifts.filter(ts => 
              ts.template_week_id === empTemplateWeek.id
            );
            estimatedNew += empShifts.length * Math.ceil(daysInMonth / 7);
          }
        }
      }

      setPreview({
        existingCount,
        estimatedNew,
        hasConflict: existingCount > 0
      });
    } catch (error) {
      toast.error('Erreur lors de la prévisualisation');
    }
  };

  const canPreview = targetMode === 'all' || (targetMode === 'single' && selectedEmployeeId && selectedTemplateId);

  return (
    <div className="space-y-6">
      {/* Target mode */}
      <div>
        <Label className="text-sm font-semibold text-gray-900 mb-3 block">Cible</Label>
        <div className="space-y-2">
          <label className="flex items-start gap-3 p-3 border-2 rounded-lg hover:bg-gray-50 cursor-pointer">
            <input
              type="radio"
              name="targetMode"
              value="all"
              checked={targetMode === 'all'}
              onChange={(e) => {
                setTargetMode(e.target.value);
                setSelectedEmployeeId('');
                setSelectedTemplateId('');
                setPreview(null);
              }}
              className="mt-1"
            />
            <div className="flex-1">
              <p className="font-semibold text-gray-900 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Tous les employés
              </p>
              <p className="text-xs text-gray-600">
                Appliquer le planning type par défaut de chaque employé sur tout le mois
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 border-2 rounded-lg hover:bg-gray-50 cursor-pointer">
            <input
              type="radio"
              name="targetMode"
              value="single"
              checked={targetMode === 'single'}
              onChange={(e) => {
                setTargetMode(e.target.value);
                setPreview(null);
              }}
              className="mt-1"
            />
            <div className="flex-1">
              <p className="font-semibold text-gray-900">Un employé spécifique</p>
              <p className="text-xs text-gray-600">
                Appliquer un planning type à un seul employé
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Employee selection for single mode */}
      {targetMode === 'single' && (
        <>
          <div>
            <Label className="text-sm font-semibold text-gray-900">Employé *</Label>
            <Select value={selectedEmployeeId} onValueChange={(val) => {
              setSelectedEmployeeId(val);
              setSelectedTemplateId('');
              setPreview(null);
            }}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Choisir un employé..." />
              </SelectTrigger>
              <SelectContent>
                {employees.map(emp => {
                  const team = teams.find(t => t.id === emp.team_id);
                  return (
                    <SelectItem key={emp.id} value={emp.id}>
                      <div className="flex items-center gap-2">
                        {team && (
                          <div 
                            className="w-2 h-2 rounded-full flex-shrink-0" 
                            style={{ backgroundColor: team.color || '#3b82f6' }}
                          />
                        )}
                        <span>{emp.first_name} {emp.last_name}</span>
                        {team && (
                          <span className="text-xs text-gray-500">({team.name})</span>
                        )}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {selectedEmployeeId && (
            <div>
              <Label className="text-sm font-semibold text-gray-900">Planning type *</Label>
              <Select value={selectedTemplateId} onValueChange={(val) => {
                setSelectedTemplateId(val);
                setPreview(null);
              }}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Choisir un planning type..." />
                </SelectTrigger>
                <SelectContent>
                  {templateWeeks.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-500">
                      Aucun planning type configuré pour cet employé
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
          )}

          {selectedTemplateId && templateShifts.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-blue-900 mb-2">Aperçu du planning type :</p>
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
        </>
      )}

      {/* Application mode */}
      <div>
        <Label className="text-sm font-semibold text-gray-900 mb-3 block">Mode d'application</Label>
        <div className="space-y-2">
          <label className="flex items-start gap-3 p-3 border-2 rounded-lg hover:bg-gray-50 cursor-pointer">
            <input
              type="radio"
              name="applicationMode"
              value="add"
              checked={applicationMode === 'add'}
              onChange={(e) => setApplicationMode(e.target.value)}
              className="mt-1"
            />
            <div className="flex-1">
              <p className="font-semibold text-gray-900">➕ Ajouter sur les cases vides</p>
              <p className="text-xs text-gray-600">
                Ne remplacer que les jours sans shift existant (recommandé)
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 border-2 rounded-lg hover:bg-gray-50 cursor-pointer">
            <input
              type="radio"
              name="applicationMode"
              value="replace"
              checked={applicationMode === 'replace'}
              onChange={(e) => setApplicationMode(e.target.value)}
              className="mt-1"
            />
            <div className="flex-1">
              <p className="font-semibold text-gray-900">🔁 Remplacer les shifts existants</p>
              <p className="text-xs text-gray-600">
                Supprimer tous les shifts du mois et recréer selon les plannings types
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Preview button */}
      {canPreview && !preview && (
        <Button
          onClick={handlePreview}
          variant="outline"
          className="w-full border-2 border-blue-400 text-blue-700 hover:bg-blue-50"
        >
          📊 Prévisualiser
        </Button>
      )}

      {/* Preview results */}
      {preview && (
        <div className={cn(
          "border-2 rounded-lg p-4",
          preview.hasConflict ? "bg-orange-50 border-orange-300" : "bg-green-50 border-green-300"
        )}>
          <div className="flex items-start gap-3">
            {preview.hasConflict ? (
              <AlertTriangle className="w-6 h-6 text-orange-600 flex-shrink-0 mt-0.5" />
            ) : (
              <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
            )}
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-2">Aperçu</h3>
              <div className="space-y-1 text-sm">
                <p>• Shifts existants : <strong>{preview.existingCount}</strong></p>
                <p>• Nouveaux shifts estimés : <strong>{preview.estimatedNew}</strong></p>
                {preview.hasConflict && applicationMode === 'add' && (
                  <p className="text-orange-700 mt-2">
                    ⚠️ Des shifts existent déjà. Mode "Ajouter" ne créera que sur les cases vides.
                  </p>
                )}
                {preview.hasConflict && applicationMode === 'replace' && (
                  <p className="text-orange-700 mt-2">
                    ⚠️ {preview.existingCount} shift(s) seront supprimés et remplacés.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t">
        <Button
          variant="outline"
          onClick={onClose}
        >
          Annuler
        </Button>
        <Button
          onClick={() => applyMutation.mutate()}
          disabled={!preview || applyMutation.isPending}
          className="flex-1 bg-blue-600 hover:bg-blue-700"
        >
          {applyMutation.isPending ? 'Application...' : 'Appliquer'}
        </Button>
      </div>
    </div>
  );
}