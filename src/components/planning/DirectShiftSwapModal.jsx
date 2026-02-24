import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, ArrowLeftRight, Zap } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { formatLocalDate } from './dateUtils';
import moment from 'moment';

// Authorized roles for direct swap
const AUTHORIZED_ROLES = ['admin', 'responsable', 'gérant', 'manager', 'bureau'];

export function canDirectSwap(currentUser, userRole) {
  if (!currentUser) return false;
  if (currentUser.role === 'admin') return true;
  const roleName = userRole?.name?.toLowerCase() || '';
  return AUTHORIZED_ROLES.some(r => roleName.includes(r));
}

function formatShiftLabel(shift) {
  if (!shift) return '';
  const date = moment(shift.date).format('DD/MM/YYYY');
  const duration = calcDuration(shift.start_time, shift.end_time);
  return `${date} — ${shift.start_time}→${shift.end_time}${shift.position ? ` (${shift.position})` : ''}${duration ? ` · ${duration}` : ''}`;
}

function timeToMins(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function shiftsOverlap(start1, end1, start2, end2) {
  return timeToMins(start1) < timeToMins(end2) && timeToMins(start2) < timeToMins(end1);
}

function swapHasConflict(shiftA, shiftB, allShifts) {
  const aShiftsOnBDay = allShifts.filter(s =>
    s.employee_id === shiftA.employee_id &&
    s.date === shiftB.date &&
    s.id !== shiftA.id &&
    s.id !== shiftB.id
  );
  for (const s of aShiftsOnBDay) {
    if (shiftsOverlap(shiftB.start_time, shiftB.end_time, s.start_time, s.end_time)) return true;
  }
  const bShiftsOnADay = allShifts.filter(s =>
    s.employee_id === shiftB.employee_id &&
    s.date === shiftA.date &&
    s.id !== shiftA.id &&
    s.id !== shiftB.id
  );
  for (const s of bShiftsOnADay) {
    if (shiftsOverlap(shiftA.start_time, shiftA.end_time, s.start_time, s.end_time)) return true;
  }
  return false;
}

function calcDuration(start, end) {
  if (!start || !end) return '';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

export default function DirectShiftSwapModal({ open, onOpenChange, currentYear, currentMonth }) {
  const queryClient = useQueryClient();
  const [employeeAId, setEmployeeAId] = useState('');
  const [shiftAId, setShiftAId] = useState('');
  const [employeeBId, setEmployeeBId] = useState('');
  const [shiftBId, setShiftBId] = useState('');
  const [informEmployees, setInformEmployees] = useState(false);

  useEffect(() => {
    if (open) {
      setEmployeeAId('');
      setShiftAId('');
      setEmployeeBId('');
      setShiftBId('');
      setInformEmployees(false);
    }
  }, [open]);

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: userRole } = useQuery({
    queryKey: ['userRole', currentUser?.role_id],
    queryFn: async () => {
      if (!currentUser?.role_id) return null;
      const roles = await base44.entities.Role.filter({ id: currentUser.role_id });
      return roles[0] || null;
    },
    enabled: !!currentUser?.role_id
  });

  const { data: allEmployees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.filter({ is_active: true })
  });

  const { data: allMonthShifts = [] } = useQuery({
    queryKey: ['shifts', currentYear, currentMonth],
    queryFn: async () => {
      const firstDay = formatLocalDate(new Date(currentYear, currentMonth, 1));
      const lastDay = formatLocalDate(new Date(currentYear, currentMonth + 1, 0));
      const all = await base44.entities.Shift.list();
      return all.filter(s => s.date >= firstDay && s.date <= lastDay);
    },
    enabled: open
  });

  const shiftsA = useMemo(() => {
    if (!employeeAId) return [];
    return allMonthShifts.filter(s => s.employee_id === employeeAId);
  }, [allMonthShifts, employeeAId]);

  const allShiftsB = useMemo(() => {
    if (!employeeBId) return [];
    return allMonthShifts.filter(s => s.employee_id === employeeBId);
  }, [allMonthShifts, employeeBId]);

  const shiftsB = useMemo(() => {
    if (!shiftAId) return allShiftsB;
    const shiftA = allMonthShifts.find(s => s.id === shiftAId);
    if (!shiftA) return allShiftsB;
    return allShiftsB.filter(sB => !swapHasConflict(shiftA, sB, allMonthShifts));
  }, [allShiftsB, shiftAId, allMonthShifts]);

  const selectedShiftA = shiftsA.find(s => s.id === shiftAId);
  const selectedShiftB = allShiftsB.find(s => s.id === shiftBId);
  const employeeA = allEmployees.find(e => e.id === employeeAId);
  const employeeB = allEmployees.find(e => e.id === employeeBId);

  const validationError = useMemo(() => {
    if (!shiftAId || !shiftBId) return null;
    if (selectedShiftA && selectedShiftB) {
      if (selectedShiftA.date?.substring(0, 7) !== selectedShiftB.date?.substring(0, 7)) {
        return 'Les shifts doivent appartenir au même mois.';
      }
      if (swapHasConflict(selectedShiftA, selectedShiftB, allMonthShifts)) {
        return 'Échange impossible : conflit d\'horaires détecté.';
      }
    }
    return null;
  }, [shiftAId, shiftBId, selectedShiftA, selectedShiftB, allMonthShifts]);

  const isValid = employeeAId && shiftAId && employeeBId && shiftBId && !validationError;

  const swapMutation = useMutation({
    mutationFn: async () => {
      // Security: verify role
      if (!canDirectSwap(currentUser, userRole)) {
        throw new Error('Accès refusé : vous n\'avez pas les permissions pour effectuer un échange direct.');
      }

      // Re-fetch to ensure shifts still exist
      const [shiftAArr, shiftBArr] = await Promise.all([
        base44.entities.Shift.filter({ id: shiftAId }),
        base44.entities.Shift.filter({ id: shiftBId })
      ]);
      const sA = shiftAArr[0];
      const sB = shiftBArr[0];

      if (!sA || !sB) throw new Error('Un ou plusieurs shifts sont introuvables.');

      if (sA.date?.substring(0, 7) !== sB.date?.substring(0, 7)) {
        throw new Error('Les shifts doivent appartenir au même mois.');
      }

      if (swapHasConflict(sA, sB, allMonthShifts)) {
        throw new Error('Échange impossible : conflit d\'horaires détecté.');
      }

      // Perform the swap — only swap employee_id
      await Promise.all([
        base44.entities.Shift.update(sA.id, {
          employee_id: sB.employee_id,
          employee_name: sB.employee_name
        }),
        base44.entities.Shift.update(sB.id, {
          employee_id: sA.employee_id,
          employee_name: sA.employee_name
        })
      ]);

      // Toujours créer le ShiftSwapRequest pour tracer l'échange (notifications conditionnelles selon informEmployees)
      const dateA = moment(sA.date).format('DD/MM/YYYY');
      const dateB = moment(sB.date).format('DD/MM/YYYY');
      const nameA = sA.employee_name || employeeA?.first_name || 'Employé A';
      const nameB = sB.employee_name || employeeB?.first_name || 'Employé B';
      const managerName = currentUser?.full_name || 'le responsable';

      await base44.entities.ShiftSwapRequest.create({
        status: 'APPROVED',
        employee_a_id: sA.employee_id,
        employee_a_name: nameA,
        shift_a_id: sA.id,
        shift_a_date: sA.date,
        shift_a_start_time: sA.start_time,
        shift_a_end_time: sA.end_time,
        shift_a_position: sA.position || '',
        employee_b_id: sB.employee_id,
        employee_b_name: nameB,
        shift_b_id: sB.id,
        shift_b_date: sB.date,
        shift_b_start_time: sB.start_time,
        shift_b_end_time: sB.end_time,
        shift_b_position: sB.position || '',
        month_key: `${sA.date?.substring(0, 7)}`,
        message: `Échange direct effectué par ${managerName}. ${nameA} : le ${dateB} à la place du ${dateA}. ${nameB} : le ${dateA} à la place du ${dateB}.`,
        decided_at: new Date().toISOString(),
        decided_by_user_email: currentUser?.email || '',
        rejection_reason: ''
      });

      return { informEmployees };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.invalidateQueries({ queryKey: ['allWeeklyRecaps'] });
      queryClient.invalidateQueries({ queryKey: ['allMonthlyRecaps'] });
      queryClient.invalidateQueries({ queryKey: ['approvedSwaps'] });
      if (data?.informEmployees) {
        toast.success('✅ Échange effectué et employés informés.');
      } else {
        toast.success('✅ Échange effectué.');
      }
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error('Erreur : ' + err.message);
    }
  });

  const otherEmployeesForB = allEmployees.filter(e => e.id !== employeeAId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-orange-700 flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Échange de shift direct
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Info banner */}
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-900">
            <p className="font-semibold mb-1">⚡ Échange immédiat</p>
            <p>Cet échange est exécuté immédiatement, sans validation. Seul l'identifiant employé est interverti sur chaque shift.</p>
          </div>

          {/* Employé A */}
          <div>
            <Label className="text-sm font-semibold text-gray-900">Employé A *</Label>
            <Select value={employeeAId} onValueChange={(val) => { setEmployeeAId(val); setShiftAId(''); setShiftBId(''); }}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Choisir l'employé A..." />
              </SelectTrigger>
              <SelectContent>
                {allEmployees.map(emp => (
                  <SelectItem key={emp.id} value={emp.id} disabled={emp.id === employeeBId}>
                    {emp.first_name} {emp.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Shift A */}
          <div>
            <Label className="text-sm font-semibold text-gray-900">
              Shift de {employeeA ? `${employeeA.first_name} ${employeeA.last_name}` : 'l\'employé A'} *
            </Label>
            <Select value={shiftAId} onValueChange={(val) => { setShiftAId(val); setShiftBId(''); }} disabled={!employeeAId || shiftsA.length === 0}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder={!employeeAId ? 'Sélectionner d\'abord un employé' : shiftsA.length === 0 ? 'Aucun shift ce mois-ci' : 'Choisir le shift...'} />
              </SelectTrigger>
              <SelectContent>
                {shiftsA.map(s => (
                  <SelectItem key={s.id} value={s.id}>{formatShiftLabel(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-200" />
            <div className="flex items-center gap-1 text-orange-600 font-bold text-sm">
              <ArrowLeftRight className="w-4 h-4" />
              ÉCHANGE DIRECT
            </div>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Employé B */}
          <div>
            <Label className="text-sm font-semibold text-gray-900">Employé B *</Label>
            <Select value={employeeBId} onValueChange={(val) => { setEmployeeBId(val); setShiftBId(''); }} disabled={!employeeAId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder={!employeeAId ? 'Sélectionner d\'abord l\'employé A' : 'Choisir l\'employé B...'} />
              </SelectTrigger>
              <SelectContent>
                {otherEmployeesForB.map(emp => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Shift B */}
          <div>
            <Label className="text-sm font-semibold text-gray-900">
              Shift de {employeeB ? `${employeeB.first_name} ${employeeB.last_name}` : 'l\'employé B'} *
            </Label>
            <Select value={shiftBId} onValueChange={setShiftBId} disabled={!employeeBId || shiftsB.length === 0}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder={
                  !employeeBId ? 'Sélectionner d\'abord l\'employé B'
                  : !shiftAId ? 'Sélectionner d\'abord le shift A'
                  : shiftsB.length === 0 ? 'Aucun échange possible (conflit horaire)'
                  : 'Choisir le shift...'
                } />
              </SelectTrigger>
              <SelectContent>
                {shiftsB.map(s => (
                  <SelectItem key={s.id} value={s.id}>{formatShiftLabel(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {employeeBId && shiftAId && allShiftsB.length > 0 && shiftsB.length === 0 && (
              <p className="mt-1.5 text-xs text-orange-700 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Aucun échange possible : conflit d'horaires avec tous les shifts disponibles.
              </p>
            )}
          </div>

          {/* Résumé */}
          {selectedShiftA && selectedShiftB && !validationError && (
            <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-4 text-sm">
              <h3 className="font-bold text-orange-900 mb-3">⚡ Résumé de l'échange</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white border border-orange-200 rounded p-2">
                  <p className="text-xs text-gray-500 mb-1">{employeeA?.first_name} reçoit</p>
                  <p className="font-semibold text-gray-900">{moment(selectedShiftB.date).format('DD/MM/YYYY')}</p>
                  <p className="text-gray-700">{selectedShiftB.start_time} → {selectedShiftB.end_time}</p>
                  {selectedShiftB.position && <p className="text-xs text-gray-500">{selectedShiftB.position}</p>}
                </div>
                <div className="bg-white border border-orange-200 rounded p-2">
                  <p className="text-xs text-gray-500 mb-1">{employeeB?.first_name} reçoit</p>
                  <p className="font-semibold text-gray-900">{moment(selectedShiftA.date).format('DD/MM/YYYY')}</p>
                  <p className="text-gray-700">{selectedShiftA.start_time} → {selectedShiftA.end_time}</p>
                  {selectedShiftA.position && <p className="text-xs text-gray-500">{selectedShiftA.position}</p>}
                </div>
              </div>
            </div>
          )}

          {/* Validation error */}
          {validationError && (
            <div className="bg-red-50 border border-red-300 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-900">{validationError}</p>
            </div>
          )}

          {/* Checkbox: informer les employés */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={informEmployees}
                onChange={(e) => setInformEmployees(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-orange-600 cursor-pointer"
              />
              <div>
                <span className="text-sm font-medium text-gray-900">Informer les employés de l'échange</span>
                <p className="text-xs text-gray-500 mt-0.5">Si activé, chaque employé recevra une notification sur sa page d'accueil.</p>
              </div>
            </label>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              onClick={() => swapMutation.mutate()}
              disabled={!isValid || swapMutation.isPending}
              className="flex-1 bg-orange-600 hover:bg-orange-700"
            >
              <Zap className="w-4 h-4 mr-2" />
              {swapMutation.isPending ? 'Échange en cours...' : 'Échanger immédiatement'}
            </Button>
            <Button onClick={() => onOpenChange(false)} variant="outline">
              Annuler
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}