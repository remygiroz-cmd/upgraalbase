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
import { getActiveMonthContext } from './monthContext';

// Utility: Extract month_key from ISO date string (YYYY-MM-DD)
function getMonthKeyFromISO(dateISO) {
  if (!dateISO || typeof dateISO !== 'string') return null;
  const parts = dateISO.split('-');
  if (parts.length < 2) return null;
  return `${parts[0]}-${parts[1]}`; // "YYYY-MM"
}

export default function AddCPGlobalModal({ onClose, year, month }) {
  const queryClient = useQueryClient();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [cpStartDate, setCpStartDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [notes, setNotes] = useState('');
  const [manualOverride, setManualOverride] = useState('');
  const [showDebug, setShowDebug] = useState(false);
  const [monthContext, setMonthContext] = useState(null);

  // SOURCE DE VÉRITÉ UNIQUE: Récupérer le contexte du mois actif
  // Format: YYYY-MM (e.g., "2026-02")
  const monthKey = year && month !== undefined ? `${year}-${String(month + 1).padStart(2, '0')}` : null;

  console.log('[CP MODAL] Initializing with:', { year, month, monthKey });

  // Get active month context (SOURCE DE VÉRITÉ UNIQUE)
  React.useEffect(() => {
    if (monthKey) {
      console.log('[CP MODAL] useEffect triggered for monthKey:', monthKey);
      getActiveMonthContext(monthKey).then(ctx => {
        console.log('[CP MODAL] monthContext loaded:', ctx);
        setMonthContext(ctx);
      });
    }
  }, [monthKey]);

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
      console.log('Employé ID:', employeeId);
      console.log('Employé nom:', periodData.employee_name);
      console.log('Période CP:', startCP, '->', endCP);
      console.log('Month key:', periodData.month_key);
      console.log('Reset version:', periodData.reset_version);

      // Step 1: Create CP period
      console.log('\n📝 Step 1: Creating PaidLeavePeriod record...');
      const cpPeriod = await base44.entities.PaidLeavePeriod.create(periodData);
      console.log('✓ PaidLeavePeriod created with ID:', cpPeriod.id);

      // Step 2: APPLY CP - Fetch shifts in period (robust: by employee + reset_version only)
      console.log('\n🔍 Step 2: APPLYING CP - Fetching ALL shifts for employee...');
      console.log('Query filters:', { 
        employee_id: employeeId, 
        reset_version: periodData.reset_version 
      });
      console.log('Will filter by date range:', startCP, '→', endCP);
      
      const allShifts = await base44.entities.Shift.filter({
        employee_id: employeeId,
        reset_version: periodData.reset_version
      });
      
      console.log(`\n📊 SHIFTS ANALYSIS:`);
      console.log(`  Total shifts for employee in month: ${allShifts.length}`);
      console.log(`  All shift dates:`, allShifts.map(s => `${s.date} (ID: ${s.id})`));
      console.log(`  CP period range: ${startCP} → ${endCP}`);
      
      const shiftsInPeriod = allShifts.filter(shift => {
        const inPeriod = shift.date >= startCP && shift.date <= endCP;
        console.log(`  - Shift ${shift.id} on ${shift.date}: ${inPeriod ? '✓ IN PERIOD' : '✗ outside'}`);
        return inPeriod;
      });
      
      console.log(`\n✓ Shifts to process: ${shiftsInPeriod.length}`);
      if (shiftsInPeriod.length > 0) {
        console.log('  Details:', shiftsInPeriod.map(s => ({ id: s.id, date: s.date, position: s.position })));
      } else {
        console.log('  ⚠️ NO SHIFTS FOUND IN CP PERIOD - This may be expected if employee has no work scheduled');
      }

      // Step 3: Extract impacted days (days with actual shifts)
      console.log('\n🗓️ Step 3: Extracting impacted days...');
      const impactedDays = [...new Set(shiftsInPeriod.map(shift => shift.date))].sort();
      console.log(`  Impacted days (with shifts): ${impactedDays.length} days`);
      console.log(`  Days list: ${impactedDays.join(', ') || 'NONE'}`);

      if (impactedDays.length === 0) {
        console.log('\n⚠️ RESULT: No shifts found in CP period');
        console.log('   → No days to process');
        console.log('   → No CP non-shifts will be created (expected behavior per business rule)');
        console.log('═══════════════════════════════════════════════════════════\n');
        return { 
          cpPeriod, 
          deletedShifts: 0,
          createdNonShifts: 0,
          impactedDays: []
        };
      }

      // Step 4: Delete all shifts on impacted days
      console.log(`\n🗑️ Step 4: Deleting ${shiftsInPeriod.length} shifts on impacted days...`);
      const deleteResults = await Promise.allSettled(
        shiftsInPeriod.map(shift => {
          console.log(`  → Deleting shift ID ${shift.id} (date: ${shift.date}, position: ${shift.position})...`);
          return base44.entities.Shift.delete(shift.id);
        })
      );
      
      const deleted = deleteResults.filter(r => r.status === 'fulfilled').length;
      const failed = deleteResults.filter(r => r.status === 'rejected');
      
      if (failed.length > 0) {
        console.error(`\n❌ DELETION FAILURES: ${failed.length} shifts could not be deleted`);
        failed.forEach((f, idx) => {
          console.error(`  Failure ${idx + 1}:`, f.reason);
        });
        throw new Error(`Impossible de supprimer ${failed.length} shift(s). Vérifiez les permissions ou les règles de sécurité.`);
      }
      
      console.log(`✓ Successfully deleted ${deleted} shifts (${deleted === shiftsInPeriod.length ? 'ALL' : 'PARTIAL'})`);

      // Step 5: Verify CP non-shift type exists
      console.log('\n📋 Step 5: Verifying CP non-shift type...');
      if (!cpNonShiftType) {
        console.error('❌ CP non-shift type NOT FOUND');
        console.error('   Expected: type with key="conges_payes" OR code="CP"');
        throw new Error('Type de non-shift CP non trouvé. Veuillez configurer un type avec key="conges_payes" ou code="CP".');
      }
      console.log(`✓ CP non-shift type found: "${cpNonShiftType.label}" (code: ${cpNonShiftType.code}, ID: ${cpNonShiftType.id})`);

      // Step 6: Check existing CP non-shifts (for idempotence)
      console.log('\n🔎 Step 6: Checking existing CP non-shifts (idempotence check)...');
      const existingNonShifts = await base44.entities.NonShiftEvent.filter({
        employee_id: employeeId,
        non_shift_type_id: cpNonShiftType.id,
        month_key: periodData.month_key,
        reset_version: periodData.reset_version
      });
      const existingCPDates = new Set(existingNonShifts.map(ns => ns.date));
      console.log(`  Found ${existingCPDates.size} existing CP non-shifts`);
      if (existingCPDates.size > 0) {
        console.log(`  Existing CP dates: ${Array.from(existingCPDates).join(', ')}`);
      }

      // Step 7: Create CP non-shifts ONLY on impacted days (where shifts existed)
      console.log(`\n➕ Step 7: Creating CP non-shifts on impacted days...`);
      const nonShiftsToCreate = impactedDays.filter(date => !existingCPDates.has(date));
      console.log(`  Days needing CP creation: ${nonShiftsToCreate.length} / ${impactedDays.length}`);
      console.log(`  Days to create: ${nonShiftsToCreate.join(', ') || 'NONE (already exist)'}`);
      
      let createdCount = 0;
      
      if (nonShiftsToCreate.length > 0) {
        console.log(`  Creating ${nonShiftsToCreate.length} CP non-shifts...`);
        const createResults = await Promise.allSettled(
          nonShiftsToCreate.map(date => {
            const cpData = {
              employee_id: employeeId,
              employee_name: periodData.employee_name,
              date: date,
              non_shift_type_id: cpNonShiftType.id,
              non_shift_type_label: cpNonShiftType.label,
              notes: `CP (période du ${startCP} au ${endCP})`,
              month_key: periodData.month_key,
              reset_version: periodData.reset_version
            };
            console.log(`  → Creating CP for ${date}...`, cpData);
            return base44.entities.NonShiftEvent.create(cpData);
          })
        );
        
        createdCount = createResults.filter(r => r.status === 'fulfilled').length;
        const createFailed = createResults.filter(r => r.status === 'rejected');
        
        if (createFailed.length > 0) {
          console.error(`\n❌ CP CREATION FAILURES: ${createFailed.length} non-shifts could not be created`);
          createFailed.forEach((f, idx) => {
            console.error(`  Failure ${idx + 1}:`, f.reason);
          });
          throw new Error(`Impossible de créer ${createFailed.length} non-shift(s) CP. Vérifiez les permissions ou les champs requis.`);
        }
        
        console.log(`✓ Successfully created ${createdCount} CP non-shifts`);
      } else {
        console.log('✓ All CP non-shifts already exist (idempotent behavior)');
      }

      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('✅ CRÉATION PÉRIODE CP - TERMINÉ AVEC SUCCÈS');
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`📅 Période CP: ${startCP} → ${endCP}`);
      console.log(`👤 Employé: ${periodData.employee_name} (ID: ${employeeId})`);
      console.log(`🗓️ Jours impactés (avec shifts): ${impactedDays.length}`);
      console.log(`   Liste: ${impactedDays.join(', ')}`);
      console.log(`🗑️ Shifts supprimés: ${deleted} / ${shiftsInPeriod.length}`);
      console.log(`➕ Non-shifts CP créés: ${createdCount}`);
      console.log(`📋 Non-shifts CP existants (avant): ${existingCPDates.size}`);
      console.log(`📋 Non-shifts CP totaux (après): ${existingCPDates.size + createdCount}`);
      console.log('═══════════════════════════════════════════════════════════\n');

      return { 
        cpPeriod, 
        deletedShifts: deleted,
        createdNonShifts: createdCount,
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
        `Période CP créée avec succès`,
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

  const isValid = selectedEmployeeId && cpStartDate && returnDate && cpStartDate < returnDate;
  
  let cpData = null;
  if (isValid) {
    const period = calculateCPPeriod(cpStartDate, returnDate);
    const days = calculateCPDays(period.startCP, period.endCP, showDebug);
    cpData = { ...period, ...days };
  }

  const handleSave = async () => {
    console.log('[CP] ============ BUTTON CLICKED ============');
    console.log('[CP] Validation state:', {
      selectedEmployeeId,
      cpStartDate,
      returnDate,
      isValid,
      saveMutation_isPending: saveMutation.isPending,
      monthKey,
      monthContext: !!monthContext
    });

    if (!selectedEmployeeId) {
      console.warn('[CP] BLOCKED: No employee selected');
      toast.error('Veuillez sélectionner un employé');
      return;
    }

    if (!cpStartDate || !returnDate) {
      console.warn('[CP] BLOCKED: Missing dates', { cpStartDate, returnDate });
      toast.error('Veuillez remplir les deux dates');
      return;
    }

    if (cpStartDate >= returnDate) {
      console.warn('[CP] BLOCKED: Invalid date range', { cpStartDate, returnDate });
      toast.error('Le jour de reprise doit être après le départ en CP');
      return;
    }

    if (!cpNonShiftType) {
      console.error('[CP] BLOCKED: CP non-shift type not found');
      toast.error('Type de non-shift CP non trouvé. Veuillez configurer les types de non-shifts.');
      return;
    }

    if (!monthKey) {
      console.error('[CP] BLOCKED: monthKey is null');
      toast.error('Erreur: mois non identifié');
      return;
    }

    // Wait for monthContext to be available
    if (!monthContext) {
      console.log('[CP] monthContext not loaded, fetching...');
      try {
        const ctx = await getActiveMonthContext(monthKey);
        console.log('[CP] monthContext fetched:', ctx);
        setMonthContext(ctx);
        // Continue with the saved mutation after context is ready
        setTimeout(() => handleSaveContinue(ctx), 100);
        return;
      } catch (error) {
        console.error('[CP] Failed to fetch monthContext:', error);
        toast.error('Erreur: impossible de charger le contexte du mois');
        return;
      }
    }

    console.log('[CP] monthContext available, proceeding...');
    handleSaveContinue(monthContext);
  };

  const handleSaveContinue = (ctx) => {
    console.log('[CP] ============ handleSaveContinue CALLED ============');
    console.log('[CP] Context:', ctx);
    console.log('[CP] cpData:', cpData);
    console.log('[CP] selectedEmployee:', selectedEmployee);

    if (!ctx) {
      console.error('[CP] BLOCKED: ctx is null');
      toast.error('Erreur: contexte du mois indisponible');
      return;
    }

    if (!cpData) {
      console.error('[CP] BLOCKED: cpData is null');
      toast.error('Erreur: dates CP non calculées');
      return;
    }

    if (!selectedEmployee) {
      console.error('[CP] BLOCKED: selectedEmployee is null');
      toast.error('Erreur: employé non sélectionné');
      return;
    }

    const periodData = {
      employee_id: selectedEmployee.id,
      employee_name: `${selectedEmployee.first_name} ${selectedEmployee.last_name}`,
      cp_start_date: cpStartDate,
      return_date: returnDate,
      start_cp: cpData.startCP,
      end_cp: cpData.endCP,
      cp_days_auto: cpData.countedDays,
      cp_days_manual: manualOverride ? parseFloat(manualOverride) : null,
      notes: notes || '',
      month_key: ctx.month_key,
      reset_version: ctx.reset_version
    };

    console.log('[CP] periodData ready for mutation:', periodData);
    console.log('[CP] Calling saveMutation.mutate()...');
    
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
          <p>Définissez le <strong>départ en CP</strong> (premier jour en congés) et le <strong>jour de reprise</strong>.</p>
          <p className="mt-1 text-xs text-blue-700">
            La période CP est calculée du départ en CP (inclus) à la veille du jour de reprise (inclus).
          </p>
        </div>
      </Alert>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-sm font-semibold text-gray-900">Départ en CP *</Label>
          <Input
            type="date"
            value={cpStartDate}
            onChange={(e) => setCpStartDate(e.target.value)}
            className="mt-1"
            disabled={!selectedEmployeeId}
          />
          <p className="text-xs text-gray-500 mt-1">Premier jour en congés (inclus)</p>
        </div>
        <div>
          <Label className="text-sm font-semibold text-gray-900">Jour de reprise *</Label>
          <Input
            type="date"
            value={returnDate}
            onChange={(e) => setReturnDate(e.target.value)}
            className="mt-1"
            disabled={!selectedEmployeeId}
          />
          <p className="text-xs text-gray-500 mt-1">Premier jour travaillé après CP</p>
        </div>
      </div>

      {cpStartDate && returnDate && cpStartDate >= returnDate && (
        <Alert className="bg-red-50 border-red-300">
          <AlertTriangle className="w-4 h-4 text-red-600" />
          <p className="text-sm text-red-900 ml-2">
            Le jour de reprise doit être postérieur au départ en CP.
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