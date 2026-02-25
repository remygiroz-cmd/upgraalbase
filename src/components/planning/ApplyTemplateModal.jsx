import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { getActiveShiftsForMonth, bulkUpsertShifts } from './shiftService';
import { usePlanningVersion } from './usePlanningVersion';
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

export default function ApplyTemplateModal({ open, onOpenChange, employeeId, employeeName, embedded = false, currentYear, currentMonth }) {
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [conflicts, setConflicts] = useState(null);
  const [conflictMode, setConflictMode] = useState('replace'); // replace, add, cancel
  const [debugMode, setDebugMode] = useState(false);
  const [debugLogs, setDebugLogs] = useState([]);
  const queryClient = useQueryClient();

  // Active planning version — needed to tag new shifts and filter existing ones
  const derivedYear = currentYear ?? (startDate ? parseInt(startDate.split('-')[0]) : new Date().getFullYear());
  const derivedMonth = currentMonth ?? (startDate ? parseInt(startDate.split('-')[1]) - 1 : new Date().getMonth());
  const { resetVersion, monthKey: activeMonthKey } = usePlanningVersion(derivedYear, derivedMonth);

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
    queryKey: ['shifts', startDate, endDate, activeMonthKey, resetVersion],
    queryFn: async () => {
      if (!startDate || !endDate) return [];
      // Use activeMonthKey derived from the start date
      const [sy, sm] = startDate.split('-').map(Number);
      const mk = `${sy}-${String(sm).padStart(2, '0')}`;
      const monthShifts = await getActiveShiftsForMonth(mk, resetVersion, { employeeId });
      return monthShifts.filter(s => s.date >= startDate && s.date <= endDate);
    },
    enabled: !!startDate && !!endDate && !!employeeId && resetVersion !== undefined
  });

  const applyTemplateMutation = useMutation({
    mutationFn: async ({ mode }) => {
      if (!startDate || !endDate || !selectedTemplateId) {
        throw new Error('Données incomplètes');
      }

      const logs = [];
      
      const templateInfo = {
        employeeId,
        employeeName,
        templateId: selectedTemplateId,
        totalTemplateShifts: templateShifts.length,
        templateShiftsByDay: templateShifts.reduce((acc, ts) => {
          acc[ts.day_of_week] = (acc[ts.day_of_week] || 0) + 1;
          return acc;
        }, {})
      };
      logs.push({ type: 'template_info', data: templateInfo });
      console.log('🔍 APPLY TEMPLATE - Start:', templateInfo);

      // 1️⃣ AVANT APPLICATION : LISTER L'EXISTANT
      const existingLog = {
        count: existingShifts.length,
        shifts: existingShifts.map(s => ({
          id: s.id,
          date: s.date,
          startTime: s.start_time,
          endTime: s.end_time,
          position: s.position
        }))
      };
      logs.push({ type: 'existing_shifts', data: existingLog });
      console.log('🔍 EXISTING SHIFTS:', existingLog);

      // Parse dates LOCALEMENT pour éviter le décalage UTC
      const [startY, startM, startD] = startDate.split('-').map(Number);
      const [endY, endM, endD] = endDate.split('-').map(Number);
      const start = new Date(startY, startM - 1, startD);
      const end = new Date(endY, endM - 1, endD);
      const shifts = [];

      // 2️⃣ PENDANT APPLICATION : GÉNÉRATION DES SHIFTS
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        // JavaScript getDay: 0=Dimanche, 1=Lundi, 2=Mardi, 3=Mercredi, 4=Jeudi, 5=Vendredi, 6=Samedi
        // Notre système: 1=Lundi, 2=Mardi, 3=Mercredi, 4=Jeudi, 5=Vendredi, 6=Samedi, 7=Dimanche
        const jsDay = d.getDay(); // 0-6
        const dayOfWeek = jsDay === 0 ? 7 : jsDay; // Convertir 0 (Dimanche) en 7, garder 1-6 tel quel
        
        // Créer dateStr en LOCAL pour éviter décalage UTC
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
        const dayLabel = dayNames[jsDay];

        // Find template shifts for this day
        const dayTemplates = templateShifts.filter(ts => ts.day_of_week === dayOfWeek);

        const dateLog = {
          date: dateStr,
          jsGetDay: jsDay,
          computedDayOfWeek: dayOfWeek,
          dayLabel,
          matchedTemplates: dayTemplates.length,
          templateDays: dayTemplates.map(t => t.day_of_week),
          templateDetails: dayTemplates.map(t => ({
            day_of_week: t.day_of_week,
            start_time: t.start_time,
            end_time: t.end_time,
            position: t.position
          })),
          dateObject: {
            year: d.getFullYear(),
            month: d.getMonth() + 1,
            day: d.getDate()
          }
        };
        logs.push({ type: 'date_match', data: dateLog });
        console.log('🔍 APPLY TEMPLATE - Processing date:', dateLog);

        // 2️⃣.1 LOG CRÉATION POUR CHAQUE SHIFT
        for (const template of dayTemplates) {
          const shiftPayload = {
            employee_id: employeeId,
            employee_name: employeeName,
            date: dateStr,
            start_time: template.start_time,
            end_time: template.end_time,
            break_minutes: template.break_minutes || 0,
            position: template.position,
            notes: template.notes || '',
            status: 'planned',
            month_key: activeMonthKey,
            reset_version: resetVersion
          };
          
          shifts.push(shiftPayload);
          
          logs.push({ 
            type: 'shift_creation', 
            data: {
              dateSaved: dateStr,
              dateObject: { year, month: d.getMonth() + 1, day: d.getDate() },
              payload: shiftPayload
            }
          });
        }
      }

      // 3️⃣ SUPPRESSION SI MODE REPLACE
      if (mode === 'replace' && existingShifts.length > 0) {
        const deletedIds = existingShifts.map(s => s.id);
        await Promise.all(existingShifts.map(s => base44.entities.Shift.delete(s.id)));
        logs.push({ 
          type: 'deletion', 
          data: { 
            mode: 'replace', 
            deletedCount: deletedIds.length,
            deletedIds 
          }
        });
        console.log('🔍 DELETED SHIFTS:', deletedIds.length);
      }

      // 4️⃣ UPSERT DES NOUVEAUX SHIFTS (protection anti-doublons)
      if (shifts.length > 0) {
        const freshCache = await base44.entities.Shift.list();
        const { created, updated } = await bulkUpsertShifts(shifts, freshCache);
        console.log(`🔍 UPSERT SHIFTS: ${created} créés, ${updated} mis à jour`);
      }

      // 5️⃣ APRÈS APPLICATION : VÉRIFIER LE RÉSULTAT EN BASE
      if (debugMode) {
        // Attendre un peu pour que la base soit à jour
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const allShiftsAfter = await base44.entities.Shift.list();
        const createdShifts = allShiftsAfter.filter(s => 
          s.employee_id === employeeId && 
          s.date >= startDate && 
          s.date <= endDate
        );
        
        const verificationLog = {
          count: createdShifts.length,
          shifts: createdShifts.map(s => {
            const dateParts = s.date.split('-').map(Number);
            const dateObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
            const jsDay = dateObj.getDay();
            const isoDow = jsDay === 0 ? 7 : jsDay;
            
            return {
              id: s.id,
              dateSaved: s.date,
              jsGetDay: jsDay,
              isoDow,
              startTime: s.start_time,
              endTime: s.end_time,
              position: s.position
            };
          })
        };
        
        logs.push({ type: 'verification', data: verificationLog });
        console.log('🔍 VERIFICATION AFTER SAVE:', verificationLog);
        
        setDebugLogs(logs);
      }

      return shifts.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      toast.success(`${count} shift(s) appliqué(s)`);
      if (!debugMode) {
        onOpenChange(false);
        resetForm();
      }
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
    setDebugLogs([]);
  };

  const copyDebugLogs = () => {
    const dayLabels = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    
    let text = '=== DEBUG LOGS - PLANNING TYPE ===\n\n';
    text += `Employé: ${employeeName} (${employeeId})\n`;
    text += `Période: ${startDate} → ${endDate}\n\n`;
    
    // 1️⃣ SHIFTS EXISTANTS AVANT
    const existingLog = debugLogs.find(l => l.type === 'existing_shifts');
    if (existingLog) {
      text += '--- 1️⃣ SHIFTS EXISTANTS AVANT APPLICATION ---\n';
      text += `Total: ${existingLog.data.count}\n`;
      existingLog.data.shifts.forEach(s => {
        text += `  [${s.id}] ${s.date} | ${s.startTime}-${s.endTime} | ${s.position}\n`;
      });
      text += '\n';
    }
    
    // 2️⃣ TEMPLATE SHIFTS STOCKÉS
    text += '--- 2️⃣ TEMPLATE SHIFTS STOCKÉS ---\n';
    templateShifts.forEach(ts => {
      text += `day_of_week: ${ts.day_of_week} (${dayLabels[ts.day_of_week] || 'inconnu'}) | ${ts.start_time}-${ts.end_time} | ${ts.position}\n`;
    });
    text += '\n';
    
    // 3️⃣ MATCHING PAR DATE
    text += '--- 3️⃣ MATCHING PAR DATE ---\n';
    debugLogs.filter(log => log.type === 'date_match').forEach(log => {
      const d = log.data;
      text += `\n${d.date} (${d.dayLabel})\n`;
      text += `  jsGetDay: ${d.jsGetDay} | computed: ${d.computedDayOfWeek}\n`;
      text += `  Shifts matchés: ${d.matchedTemplates}\n`;
      if (d.templateDetails.length > 0) {
        d.templateDetails.forEach(td => {
          text += `    → day_of_week=${td.day_of_week} | ${td.start_time}-${td.end_time} | ${td.position}\n`;
        });
      }
    });
    text += '\n';
    
    // 4️⃣ SHIFTS CRÉÉS (PAYLOAD)
    const creationLogs = debugLogs.filter(l => l.type === 'shift_creation');
    if (creationLogs.length > 0) {
      text += '--- 4️⃣ SHIFTS CRÉÉS (PAYLOAD) ---\n';
      text += `Total: ${creationLogs.length}\n`;
      creationLogs.forEach((log, i) => {
        const d = log.data;
        text += `  [${i+1}] dateSaved: ${d.dateSaved} | ${d.payload.start_time}-${d.payload.end_time} | ${d.payload.position}\n`;
      });
      text += '\n';
    }
    
    // 5️⃣ SUPPRESSION (si replace)
    const deletionLog = debugLogs.find(l => l.type === 'deletion');
    if (deletionLog) {
      text += '--- 5️⃣ SUPPRESSION (MODE REPLACE) ---\n';
      text += `Shifts supprimés: ${deletionLog.data.deletedCount}\n\n`;
    }
    
    // 6️⃣ VÉRIFICATION APRÈS SAUVEGARDE
    const verificationLog = debugLogs.find(l => l.type === 'verification');
    if (verificationLog) {
      text += '--- 6️⃣ VÉRIFICATION APRÈS SAUVEGARDE (RELECTURE DB) ---\n';
      text += `Total en base: ${verificationLog.data.count}\n`;
      verificationLog.data.shifts.forEach(s => {
        text += `  [${s.id}] ${s.dateSaved} (jsGetDay=${s.jsGetDay}, isoDow=${s.isoDow}) | ${s.startTime}-${s.endTime} | ${s.position}\n`;
      });
    }
    
    navigator.clipboard.writeText(text);
    toast.success('Logs copiés dans le presse-papier');
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

  if (embedded) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600 font-medium">
            {employeeName}
          </p>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={debugMode}
              onChange={(e) => setDebugMode(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-gray-600">Mode debug</span>
          </label>
        </div>

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

          {/* Debug Panel */}
          {debugMode && debugLogs.length > 0 && (
            <div className="border-2 border-purple-300 rounded-lg p-4 bg-purple-50 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-purple-900">🔍 Debug Logs Complets</h3>
                <Button
                  onClick={copyDebugLogs}
                  size="sm"
                  variant="outline"
                  className="border-purple-400 text-purple-700"
                >
                  📋 Copier les logs
                </Button>
              </div>

              <div className="space-y-2 max-h-[500px] overflow-y-auto text-[10px]">
                {/* 1️⃣ Shifts existants avant */}
                {debugLogs.find(l => l.type === 'existing_shifts') && (
                  <div className="bg-yellow-50 border border-yellow-300 rounded p-2">
                    <p className="font-bold text-yellow-900 mb-1">1️⃣ Shifts existants AVANT</p>
                    <div className="font-mono text-yellow-800">
                      Total: {debugLogs.find(l => l.type === 'existing_shifts').data.count}
                      {debugLogs.find(l => l.type === 'existing_shifts').data.shifts.slice(0, 5).map((s, i) => (
                        <div key={i} className="ml-2">{s.date} | {s.startTime}-{s.endTime}</div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2️⃣ Template shifts */}
                <div className="bg-blue-50 border border-blue-300 rounded p-2">
                  <p className="font-bold text-blue-900 mb-1">2️⃣ Template stocké</p>
                  <div className="space-y-0.5 font-mono text-blue-800">
                    {templateShifts.map((ts, idx) => {
                      const dayLabels = ['', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
                      return (
                        <div key={idx}>
                          day={ts.day_of_week} ({dayLabels[ts.day_of_week]}) | {ts.start_time}-{ts.end_time}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3️⃣ Matching par date */}
                <div className="bg-purple-50 border border-purple-300 rounded p-2">
                  <p className="font-bold text-purple-900 mb-1">3️⃣ Matching par date</p>
                  <div className="space-y-1 font-mono text-purple-800">
                    {debugLogs.filter(log => log.type === 'date_match').map((log, idx) => {
                      const d = log.data;
                      return (
                        <div key={idx} className="border-l-2 border-purple-400 pl-2">
                          <div className="font-bold">{d.date} ({d.dayLabel})</div>
                          <div className="ml-2 text-gray-600">
                            jsDay={d.jsGetDay} → computed={d.computedDayOfWeek} → matchés: {d.matchedTemplates}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 4️⃣ Shifts créés */}
                {debugLogs.filter(l => l.type === 'shift_creation').length > 0 && (
                  <div className="bg-green-50 border border-green-300 rounded p-2">
                    <p className="font-bold text-green-900 mb-1">4️⃣ Shifts créés (payload)</p>
                    <div className="font-mono text-green-800">
                      Total: {debugLogs.filter(l => l.type === 'shift_creation').length}
                      {debugLogs.filter(l => l.type === 'shift_creation').slice(0, 5).map((log, i) => (
                        <div key={i} className="ml-2">
                          {log.data.dateSaved} | {log.data.payload.start_time}-{log.data.payload.end_time}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 5️⃣ Suppression */}
                {debugLogs.find(l => l.type === 'deletion') && (
                  <div className="bg-red-50 border border-red-300 rounded p-2">
                    <p className="font-bold text-red-900 mb-1">5️⃣ Suppression (replace)</p>
                    <div className="font-mono text-red-800">
                      Shifts supprimés: {debugLogs.find(l => l.type === 'deletion').data.deletedCount}
                    </div>
                  </div>
                )}

                {/* 6️⃣ Vérification après sauvegarde */}
                {debugLogs.find(l => l.type === 'verification') && (
                  <div className="bg-orange-50 border border-orange-300 rounded p-2">
                    <p className="font-bold text-orange-900 mb-1">6️⃣ Vérification DB après save</p>
                    <div className="font-mono text-orange-800">
                      Total en base: {debugLogs.find(l => l.type === 'verification').data.count}
                      {debugLogs.find(l => l.type === 'verification').data.shifts.slice(0, 5).map((s, i) => (
                        <div key={i} className="ml-2">
                          {s.dateSaved} (jsDay={s.jsGetDay}, isoDow={s.isoDow}) | {s.startTime}-{s.endTime}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-4 border-t">
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
        </div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xl text-orange-600">
              <Calendar className="w-6 h-6" />
              Appliquer un planning type
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={debugMode}
                onChange={(e) => setDebugMode(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-gray-600">Mode debug</span>
            </label>
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

          {/* Debug Panel */}
          {debugMode && debugLogs.length > 0 && (
            <div className="border-2 border-purple-300 rounded-lg p-4 bg-purple-50 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-purple-900">🔍 Debug Logs Complets</h3>
                <Button
                  onClick={copyDebugLogs}
                  size="sm"
                  variant="outline"
                  className="border-purple-400 text-purple-700"
                >
                  📋 Copier les logs
                </Button>
              </div>

              <div className="space-y-2 max-h-[500px] overflow-y-auto text-[10px]">
                {/* 1️⃣ Shifts existants avant */}
                {debugLogs.find(l => l.type === 'existing_shifts') && (
                  <div className="bg-yellow-50 border border-yellow-300 rounded p-2">
                    <p className="font-bold text-yellow-900 mb-1">1️⃣ Shifts existants AVANT</p>
                    <div className="font-mono text-yellow-800">
                      Total: {debugLogs.find(l => l.type === 'existing_shifts').data.count}
                      {debugLogs.find(l => l.type === 'existing_shifts').data.shifts.slice(0, 5).map((s, i) => (
                        <div key={i} className="ml-2">{s.date} | {s.startTime}-{s.endTime}</div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2️⃣ Template shifts */}
                <div className="bg-blue-50 border border-blue-300 rounded p-2">
                  <p className="font-bold text-blue-900 mb-1">2️⃣ Template stocké</p>
                  <div className="space-y-0.5 font-mono text-blue-800">
                    {templateShifts.map((ts, idx) => {
                      const dayLabels = ['', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
                      return (
                        <div key={idx}>
                          day={ts.day_of_week} ({dayLabels[ts.day_of_week]}) | {ts.start_time}-{ts.end_time}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3️⃣ Matching par date */}
                <div className="bg-purple-50 border border-purple-300 rounded p-2">
                  <p className="font-bold text-purple-900 mb-1">3️⃣ Matching par date</p>
                  <div className="space-y-1 font-mono text-purple-800">
                    {debugLogs.filter(log => log.type === 'date_match').map((log, idx) => {
                      const d = log.data;
                      return (
                        <div key={idx} className="border-l-2 border-purple-400 pl-2">
                          <div className="font-bold">{d.date} ({d.dayLabel})</div>
                          <div className="ml-2 text-gray-600">
                            jsDay={d.jsGetDay} → computed={d.computedDayOfWeek} → matchés: {d.matchedTemplates}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 4️⃣ Shifts créés */}
                {debugLogs.filter(l => l.type === 'shift_creation').length > 0 && (
                  <div className="bg-green-50 border border-green-300 rounded p-2">
                    <p className="font-bold text-green-900 mb-1">4️⃣ Shifts créés (payload)</p>
                    <div className="font-mono text-green-800">
                      Total: {debugLogs.filter(l => l.type === 'shift_creation').length}
                      {debugLogs.filter(l => l.type === 'shift_creation').slice(0, 5).map((log, i) => (
                        <div key={i} className="ml-2">
                          {log.data.dateSaved} | {log.data.payload.start_time}-{log.data.payload.end_time}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 5️⃣ Suppression */}
                {debugLogs.find(l => l.type === 'deletion') && (
                  <div className="bg-red-50 border border-red-300 rounded p-2">
                    <p className="font-bold text-red-900 mb-1">5️⃣ Suppression (replace)</p>
                    <div className="font-mono text-red-800">
                      Shifts supprimés: {debugLogs.find(l => l.type === 'deletion').data.deletedCount}
                    </div>
                  </div>
                )}

                {/* 6️⃣ Vérification après sauvegarde */}
                {debugLogs.find(l => l.type === 'verification') && (
                  <div className="bg-orange-50 border border-orange-300 rounded p-2">
                    <p className="font-bold text-orange-900 mb-1">6️⃣ Vérification DB après save</p>
                    <div className="font-mono text-orange-800">
                      Total en base: {debugLogs.find(l => l.type === 'verification').data.count}
                      {debugLogs.find(l => l.type === 'verification').data.shifts.slice(0, 5).map((s, i) => (
                        <div key={i} className="ml-2">
                          {s.dateSaved} (jsDay={s.jsGetDay}, isoDow={s.isoDow}) | {s.startTime}-{s.endTime}
                        </div>
                      ))}
                    </div>
                  </div>
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