import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Calendar, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { calculateCPPeriod, calculateCPDays } from './paidLeaveCalculations';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { usePlanningVersion } from './usePlanningVersion';

export default function AddCPGlobalModal({ onClose, year, month }) {
  const queryClient = useQueryClient();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [lastWorkDay, setLastWorkDay] = useState('');
  const [firstWorkDayAfter, setFirstWorkDayAfter] = useState('');
  const [notes, setNotes] = useState('');
  const [manualOverride, setManualOverride] = useState('');
  const [showDebug, setShowDebug] = useState(false);

  // Get planning version
  const { resetVersion, monthKey } = usePlanningVersion(year, month);

  // Fetch all active employees
  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.filter({ is_active: true })
  });

  // Fetch teams for display
  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.filter({ is_active: true })
  });

  // Fetch non-shift types to get CP type
  const { data: nonShiftTypes = [] } = useQuery({
    queryKey: ['nonShiftTypes'],
    queryFn: () => base44.entities.NonShiftType.filter({ is_active: true })
  });

  const selectedEmployee = employees.find(e => e.id === selectedEmployeeId);
  const cpNonShiftType = nonShiftTypes.find(t => t.key === 'conges_payes' || t.code === 'CP');

  const saveMutation = useMutation({
    mutationFn: async ({ periodData, startCP, endCP, employeeId }) => {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('🏖️ CRÉATION PÉRIODE CP - DÉBUT');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('Employé:', employeeId);
      console.log('Période:', startCP, '->', endCP);

      // Step 1: Create CP period
      console.log('Step 1: Creating PaidLeavePeriod...');
      const cpPeriod = await base44.entities.PaidLeavePeriod.create(periodData);
      console.log('✓ PaidLeavePeriod created:', cpPeriod.id);

      // Step 2: Get all shifts in the CP period for this employee
      console.log('Step 2: Fetching shifts in period...');
      console.log('Filtering with:', { 
        employee_id: employeeId, 
        month_key: periodData.month_key, 
        reset_version: periodData.reset_version 
      });
      
      const allShifts = await base44.entities.Shift.filter({
        employee_id: employeeId,
        month_key: periodData.month_key,
        reset_version: periodData.reset_version
      });
      
      console.log(`Total shifts for employee in month: ${allShifts.length}`);
      console.log('All shift dates:', allShifts.map(s => s.date));
      console.log('CP period:', startCP, 'to', endCP);
      
      const shiftsInPeriod = allShifts.filter(shift => {
        const inPeriod = shift.date >= startCP && shift.date <= endCP;
        if (inPeriod) {
          console.log(`  ✓ Shift ${shift.id} on ${shift.date} IS in CP period`);
        }
        return inPeriod;
      });
      
      console.log(`✓ Found ${shiftsInPeriod.length} shifts to delete:`, shiftsInPeriod.map(s => ({ id: s.id, date: s.date })));

      // Step 3: Extract impacted days (days with actual shifts)
      const impactedDays = [...new Set(shiftsInPeriod.map(shift => shift.date))].sort();
      console.log(`Step 3: Impacted days (with shifts): ${impactedDays.length} days`, impactedDays);

      if (impactedDays.length === 0) {
        console.log('⚠️ No shifts found in CP period - no days to process');
        return { 
          cpPeriod, 
          deletedShifts: 0,
          createdNonShifts: 0,
          impactedDays: []
        };
      }

      // Step 4: Delete all shifts on impacted days
      console.log('Step 4: Deleting shifts on impacted days...');
      const deleteResults = await Promise.allSettled(
        shiftsInPeriod.map(shift => {
          console.log(`  Deleting shift ${shift.id} (${shift.date})...`);
          return base44.entities.Shift.delete(shift.id);
        })
      );
      
      const deleted = deleteResults.filter(r => r.status === 'fulfilled').length;
      const failed = deleteResults.filter(r => r.status === 'rejected');
      
      if (failed.length > 0) {
        console.error(`❌ Failed to delete ${failed.length} shifts:`, failed.map(f => f.reason));
        throw new Error(`Impossible de supprimer ${failed.length} shift(s). Vérifiez les permissions.`);
      }
      
      console.log(`✓ Successfully deleted ${deleted} shifts`);

      // Step 5: Get CP non-shift type
      if (!cpNonShiftType) {
        throw new Error('Type de non-shift CP non trouvé. Veuillez configurer un type avec key="conges_payes" ou code="CP".');
      }
      console.log('Step 5: Using CP non-shift type:', cpNonShiftType.label, '(', cpNonShiftType.code, ')');

      // Step 6: Check existing CP non-shifts (for idempotence)
      const existingNonShifts = await base44.entities.NonShiftEvent.filter({
        employee_id: employeeId,
        non_shift_type_id: cpNonShiftType.id,
        month_key: periodData.month_key,
        reset_version: periodData.reset_version
      });
      const existingCPDates = new Set(existingNonShifts.map(ns => ns.date));
      console.log('Step 6: Existing CP non-shifts:', Array.from(existingCPDates));

      // Step 7: Create CP non-shifts ONLY on impacted days (where shifts existed)
      console.log('Step 7: Creating CP non-shifts on impacted days...');
      const nonShiftsToCreate = impactedDays.filter(date => !existingCPDates.has(date));
      
      if (nonShiftsToCreate.length > 0) {
        const createResults = await Promise.allSettled(
          nonShiftsToCreate.map(date =>
            base44.entities.NonShiftEvent.create({
              employee_id: employeeId,
              employee_name: periodData.employee_name,
              date: date,
              non_shift_type_id: cpNonShiftType.id,
              non_shift_type_label: cpNonShiftType.label,
              notes: `CP (période du ${startCP} au ${endCP})`,
              month_key: periodData.month_key,
              reset_version: periodData.reset_version
            })
          )
        );
        
        const created = createResults.filter(r => r.status === 'fulfilled').length;
        const createFailed = createResults.filter(r => r.status === 'rejected');
        
        if (createFailed.length > 0) {
          console.error(`❌ Failed to create ${createFailed.length} CP non-shifts:`, createFailed.map(f => f.reason));
          throw new Error(`Impossible de créer ${createFailed.length} non-shift(s) CP. Vérifiez les permissions.`);
        }
        
        console.log(`✓ Created ${created} CP non-shifts`);
      } else {
        console.log('✓ All CP non-shifts already exist (idempotent)');
      }

      console.log('═══════════════════════════════════════════════════════════');
      console.log('✅ CRÉATION PÉRIODE CP - TERMINÉ');
      console.log(`Période: ${startCP} → ${endCP}`);
      console.log(`Jours impactés (avec shifts): ${impactedDays.length} - ${impactedDays.join(', ')}`);
      console.log(`Shifts supprimés: ${deleted}`);
      console.log(`Non-shifts CP créés: ${nonShiftsToCreate.length}`);
      console.log(`Non-shifts CP existants: ${existingCPDates.size}`);
      console.log('═══════════════════════════════════════════════════════════');

      return { 
        cpPeriod, 
        deletedShifts: deleted,
        createdNonShifts: nonShiftsToCreate.length,
        impactedDays 
      };
    },
    onSuccess: (result) => {
      console.log('PaidLeavePeriod operation completed:', result);
      queryClient.invalidateQueries({ queryKey: ['paidLeavePeriods'] });
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.invalidateQueries({ queryKey: ['nonShiftEvents'] });
      
      const impactedDaysCount = result.impactedDays?.length || 0;
      toast.success(
        `CP créés du ${cpData.startCP} au ${cpData.endCP}`,
        { 
          description: `${result.deletedShifts} shift(s) remplacé(s) par ${impactedDaysCount} jour(s) de CP` 
        }
      );
      onClose();
    },
    onError: (error) => {
      console.error('Error creating PaidLeavePeriod:', error);
      toast.error(`Erreur: ${error.message || 'Impossible de créer la période CP'}`);
    }
  });

  const isValid = selectedEmployeeId && lastWorkDay && firstWorkDayAfter && lastWorkDay < firstWorkDayAfter;
  
  let cpData = null;
  if (isValid) {
    const period = calculateCPPeriod(lastWorkDay, firstWorkDayAfter);
    const days = calculateCPDays(period.startCP, period.endCP, showDebug);
    cpData = { ...period, ...days };
  }

  const handleSave = () => {
    if (!isValid) {
      toast.error('Veuillez remplir tous les champs requis');
      return;
    }

    if (!monthKey || resetVersion === undefined) {
      toast.error('Erreur: informations de versioning manquantes');
      return;
    }

    if (!cpNonShiftType) {
      toast.error('Type de non-shift CP non trouvé. Veuillez configurer les types de non-shifts.');
      return;
    }

    const periodData = {
      employee_id: selectedEmployee.id,
      employee_name: `${selectedEmployee.first_name} ${selectedEmployee.last_name}`,
      last_work_day: lastWorkDay,
      first_work_day_after: firstWorkDayAfter,
      start_cp: cpData.startCP,
      end_cp: cpData.endCP,
      cp_days_auto: cpData.countedDays,
      cp_days_manual: manualOverride ? parseFloat(manualOverride) : null,
      notes: notes || '',
      month_key: monthKey,
      reset_version: resetVersion
    };

    console.log('Attempting to create CP period with shift replacement:', periodData);
    
    saveMutation.mutate({
      periodData,
      startCP: cpData.startCP,
      endCP: cpData.endCP,
      employeeId: selectedEmployee.id
    });
  };

  return (
    <div className="space-y-6">
      {/* Sélecteur employé */}
      <div>
        <Label className="text-sm font-semibold text-gray-900">Employé *</Label>
        <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
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

      <Alert className="bg-blue-50 border-blue-200">
        <div className="text-sm text-blue-900">
          <p className="font-semibold mb-1">📋 Principe :</p>
          <p>Définissez le <strong>dernier jour travaillé</strong> et le <strong>jour de reprise</strong>.</p>
          <p className="mt-1 text-xs text-blue-700">
            La période CP sera automatiquement calculée (lendemain dernier jour → veille reprise).
          </p>
        </div>
      </Alert>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-sm font-semibold text-gray-900">Dernier jour travaillé *</Label>
          <Input
            type="date"
            value={lastWorkDay}
            onChange={(e) => setLastWorkDay(e.target.value)}
            className="mt-1"
            disabled={!selectedEmployeeId}
          />
          <p className="text-xs text-gray-500 mt-1">Jour avec shift avant CP</p>
        </div>
        <div>
          <Label className="text-sm font-semibold text-gray-900">Jour de reprise *</Label>
          <Input
            type="date"
            value={firstWorkDayAfter}
            onChange={(e) => setFirstWorkDayAfter(e.target.value)}
            className="mt-1"
            disabled={!selectedEmployeeId}
          />
          <p className="text-xs text-gray-500 mt-1">Jour avec shift après CP</p>
        </div>
      </div>

      {lastWorkDay && firstWorkDayAfter && lastWorkDay >= firstWorkDayAfter && (
        <Alert className="bg-red-50 border-red-300">
          <AlertTriangle className="w-4 h-4 text-red-600" />
          <p className="text-sm text-red-900 ml-2">
            Le jour de reprise doit être postérieur au dernier jour travaillé.
          </p>
        </Alert>
      )}

      {isValid && cpData && (
        <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
          <h3 className="font-bold text-green-900 mb-3 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Période CP calculée
          </h3>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-xs text-gray-600">Début CP</p>
              <p className="text-lg font-bold text-green-700">{cpData.startCP}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Fin CP</p>
              <p className="text-lg font-bold text-green-700">{cpData.endCP}</p>
            </div>
          </div>

          <div className="bg-white border border-green-200 rounded p-3 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-700">Total jours calendaires :</span>
              <span className="font-semibold text-gray-900">{cpData.totalDays}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-700">Jours non comptés (dim. + fériés) :</span>
              <span className="font-semibold text-red-600">- {cpData.excludedDays}</span>
            </div>
            <div className="border-t border-green-200 pt-2 flex justify-between items-center">
              <span className="text-sm font-bold text-gray-900">CP décomptés (ouvrables) :</span>
              <span className="text-2xl font-bold text-green-700">{cpData.countedDays} j</span>
            </div>
          </div>
        </div>
      )}

      {isValid && (
        <div className="border-2 border-orange-200 rounded-lg p-4 bg-orange-50">
          <Label className="text-sm font-semibold text-gray-900">
            Surcharge manuelle (badge) - optionnel
          </Label>
          <Input
            type="number"
            step="0.5"
            placeholder={`Auto: ${cpData?.countedDays || 0} jours`}
            value={manualOverride}
            onChange={(e) => setManualOverride(e.target.value)}
            className="mt-2"
          />
          <p className="text-xs text-gray-600 mt-2">
            ⚠️ Cette valeur remplacera le calcul automatique sur le badge affiché dans le planning.
          </p>
        </div>
      )}

      <div>
        <Label className="text-sm font-semibold text-gray-900">Notes (optionnel)</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex: CP anticipés, ajustement RH, etc."
          rows={2}
          className="mt-1"
        />
      </div>

      <div className="flex gap-3 pt-4 border-t">
        <Button
          onClick={handleSave}
          disabled={!isValid || saveMutation.isPending}
          className="flex-1 bg-green-600 hover:bg-green-700"
        >
          <Check className="w-4 h-4 mr-2" />
          {saveMutation.isPending ? 'Enregistrement...' : 'Créer la période'}
        </Button>
        
        <Button
          onClick={onClose}
          variant="outline"
        >
          Annuler
        </Button>
      </div>
    </div>
  );
}