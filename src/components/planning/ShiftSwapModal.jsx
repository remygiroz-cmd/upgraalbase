import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, ArrowLeftRight, Send } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { formatLocalDate } from './dateUtils';
import moment from 'moment';

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
  const s1 = timeToMins(start1), e1 = timeToMins(end1);
  const s2 = timeToMins(start2), e2 = timeToMins(end2);
  return s1 < e2 && s2 < e1;
}

// Returns true if swapping shiftA and shiftB would create a schedule conflict
// allShifts: all shifts in the month
function swapHasConflict(shiftA, shiftB, allShifts) {
  // After swap: shiftA goes to employee B (on shiftA.date), shiftB goes to employee A (on shiftB.date)
  // Check: does employee A have any other shift on shiftB.date that overlaps shiftB's time?
  const aShiftsOnBDay = allShifts.filter(s =>
    s.employee_id === shiftA.employee_id &&
    s.date === shiftB.date &&
    s.id !== shiftA.id &&
    s.id !== shiftB.id
  );
  for (const s of aShiftsOnBDay) {
    if (shiftsOverlap(shiftB.start_time, shiftB.end_time, s.start_time, s.end_time)) return true;
  }
  // Check: does employee B have any other shift on shiftA.date that overlaps shiftA's time?
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

export default function ShiftSwapModal({ open, onOpenChange, currentYear, currentMonth, monthKey }) {
  const queryClient = useQueryClient();
  const [employeeAId, setEmployeeAId] = useState('');
  const [employeeBId, setEmployeeBId] = useState('');
  const [shiftAId, setShiftAId] = useState('');
  const [shiftBId, setShiftBId] = useState('');
  const [message, setMessage] = useState('');

  // Reset on open
  useEffect(() => {
    if (open) {
      setEmployeeAId('');
      setEmployeeBId('');
      setShiftAId('');
      setShiftBId('');
      setMessage('');
    }
  }, [open]);

  // Current user
  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  // Check if user has permission to submit swaps for others
  const canSubmitForOthers = useMemo(() => {
    if (!currentUser) return false;
    const role = currentUser.role?.toLowerCase() || '';
    return ['admin', 'gérant', 'manager', 'bureau'].some(r => role.includes(r));
  }, [currentUser]);

  // All active employees
  const { data: allEmployees = [] } = useQuery({
    queryKey: ['activeEmployees'],
    queryFn: () => base44.entities.Employee.filter({ is_active: true })
  });

  // Find current employee record
  const currentEmployee = useMemo(() => {
    if (!currentUser?.email || !allEmployees.length) return null;
    const norm = (e) => e?.trim().toLowerCase() || '';
    return allEmployees.find(e => norm(e.email) === norm(currentUser.email));
  }, [currentUser, allEmployees]);

  // Employee A (could be different from currentUser if canSubmitForOthers)
  const employeeA = useMemo(() => {
    if (canSubmitForOthers && employeeAId) {
      return allEmployees.find(e => e.id === employeeAId);
    }
    return currentEmployee;
  }, [canSubmitForOthers, employeeAId, currentEmployee, allEmployees]);

  // All shifts for the current month
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

  // Pending swap requests (to check if a shift is already pending)
  const { data: pendingSwaps = [] } = useQuery({
    queryKey: ['shiftSwapRequests', 'PENDING'],
    queryFn: () => base44.entities.ShiftSwapRequest.filter({ status: 'PENDING' }),
    enabled: open
  });

  const pendingShiftIds = useMemo(() => {
    const ids = new Set();
    pendingSwaps.forEach(s => { ids.add(s.shift_a_id); ids.add(s.shift_b_id); });
    return ids;
  }, [pendingSwaps]);

  // Shifts for employee A
  const shiftsA = useMemo(() => {
    if (!employeeA) return [];
    return allMonthShifts.filter(s => s.employee_id === employeeA.id);
  }, [allMonthShifts, employeeA]);

  // All shifts for employee B (raw)
  const allShiftsB = useMemo(() => {
    if (!employeeBId) return [];
    return allMonthShifts.filter(s => s.employee_id === employeeBId);
  }, [allMonthShifts, employeeBId]);

  // Shifts for employee B filtered by conflict check with selected shift A
  const shiftsB = useMemo(() => {
    if (!shiftAId) return allShiftsB;
    const shiftA = allMonthShifts.find(s => s.id === shiftAId);
    if (!shiftA) return allShiftsB;
    return allShiftsB.filter(sB => !swapHasConflict(shiftA, sB, allMonthShifts));
  }, [allShiftsB, shiftAId, allMonthShifts]);

  const selectedShiftA = shiftsA.find(s => s.id === shiftAId);
  const selectedShiftB = allShiftsB.find(s => s.id === shiftBId);
  const employeeB = allEmployees.find(e => e.id === employeeBId);

  // Validation
  const validationError = useMemo(() => {
    if (!shiftAId || !shiftBId) return null;
    if (pendingShiftIds.has(shiftAId)) return 'Le shift A est déjà impliqué dans une demande d\'échange en attente.';
    if (pendingShiftIds.has(shiftBId)) return 'Le shift B est déjà impliqué dans une demande d\'échange en attente.';
    if (selectedShiftA && selectedShiftB) {
      const monthA = selectedShiftA.date?.substring(0, 7);
      const monthB = selectedShiftB.date?.substring(0, 7);
      if (monthA !== monthB) return 'Les deux shifts doivent appartenir au même mois.';
      if (swapHasConflict(selectedShiftA, selectedShiftB, allMonthShifts)) {
        return 'Échange impossible : conflit d\'horaires détecté.';
      }
    }
    return null;
  }, [shiftAId, shiftBId, selectedShiftA, selectedShiftB, pendingShiftIds, allMonthShifts]);

  const isValid = shiftAId && shiftBId && !validationError && employeeA;

  const submitMutation = useMutation({
    mutationFn: async () => {
      const shiftA = allMonthShifts.find(s => s.id === shiftAId);
      const shiftB = allMonthShifts.find(s => s.id === shiftBId);

      // Backend validation: conflict check
      if (swapHasConflict(shiftA, shiftB, allMonthShifts)) {
        throw new Error('Échange impossible : conflit d\'horaires détecté.');
      }

      const requestData = {
        status: 'PENDING',
        requester_employee_id: currentEmployee.id,
        employee_a_id: currentEmployee.id,
        employee_a_name: `${currentEmployee.first_name} ${currentEmployee.last_name}`,
        shift_a_id: shiftA.id,
        shift_a_date: shiftA.date,
        shift_a_start_time: shiftA.start_time,
        shift_a_end_time: shiftA.end_time,
        shift_a_position: shiftA.position || '',
        shift_a_updated_at: shiftA.updated_date || '',
        employee_b_id: employeeB.id,
        employee_b_name: `${employeeB.first_name} ${employeeB.last_name}`,
        shift_b_id: shiftB.id,
        shift_b_date: shiftB.date,
        shift_b_start_time: shiftB.start_time,
        shift_b_end_time: shiftB.end_time,
        shift_b_position: shiftB.position || '',
        shift_b_updated_at: shiftB.updated_date || '',
        month_key: monthKey,
        message: message || ''
      };

      return await base44.entities.ShiftSwapRequest.create(requestData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shiftSwapRequests'] });
      toast.success('Demande d\'échange envoyée avec succès');
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error('Erreur : ' + err.message);
    }
  });

  const otherEmployees = allEmployees.filter(e => e.id !== currentEmployee?.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-purple-700 flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5" />
            Demande d'échange de shift
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Info banner */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm text-purple-900">
            <p className="font-semibold mb-1">📋 Principe :</p>
            <p>Sélectionnez votre shift et le shift d'un collègue à échanger. La demande sera soumise au responsable planning pour validation.</p>
          </div>

          {/* Shift A — Employé connecté */}
          <div>
            <Label className="text-sm font-semibold text-gray-900">
              Votre shift (Employé A)
            </Label>
            <div className="mt-1 p-2 bg-gray-50 border border-gray-200 rounded text-sm text-gray-700 font-medium">
              {currentEmployee ? `${currentEmployee.first_name} ${currentEmployee.last_name}` : 'Chargement...'}
            </div>
            <Select value={shiftAId} onValueChange={setShiftAId} disabled={!currentEmployee || shiftsA.length === 0}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder={shiftsA.length === 0 ? 'Aucun shift ce mois-ci' : 'Choisir votre shift...'} />
              </SelectTrigger>
              <SelectContent>
                {shiftsA.map(s => (
                  <SelectItem key={s.id} value={s.id} disabled={pendingShiftIds.has(s.id)}>
                    <span className={pendingShiftIds.has(s.id) ? 'text-gray-400 line-through' : ''}>
                      {formatShiftLabel(s)}{pendingShiftIds.has(s.id) ? ' (en attente)' : ''}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-200" />
            <div className="flex items-center gap-1 text-purple-600 font-bold text-sm">
              <ArrowLeftRight className="w-4 h-4" />
              ÉCHANGE
            </div>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Employé B */}
          <div>
            <Label className="text-sm font-semibold text-gray-900">Employé B *</Label>
            <Select value={employeeBId} onValueChange={(val) => { setEmployeeBId(val); setShiftBId(''); }}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Choisir un collègue..." />
              </SelectTrigger>
              <SelectContent>
                {otherEmployees.map(emp => (
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
                  !employeeBId ? 'Sélectionner d\'abord un collègue'
                  : !shiftAId ? 'Sélectionner d\'abord votre shift'
                  : shiftsB.length === 0 ? 'Aucun échange possible (conflit horaire potentiel)'
                  : 'Choisir le shift...'
                } />
              </SelectTrigger>
              <SelectContent>
                {shiftsB.map(s => (
                  <SelectItem key={s.id} value={s.id} disabled={pendingShiftIds.has(s.id)}>
                    <span className={pendingShiftIds.has(s.id) ? 'text-gray-400 line-through' : ''}>
                      {formatShiftLabel(s)}{pendingShiftIds.has(s.id) ? ' (en attente)' : ''}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {employeeBId && shiftAId && allShiftsB.length > 0 && shiftsB.length === 0 && (
              <p className="mt-1.5 text-xs text-orange-700 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Aucun échange possible : conflit d'horaires potentiel avec tous les shifts disponibles.
              </p>
            )}
          </div>

          {/* Summary of swap */}
          {selectedShiftA && selectedShiftB && !validationError && (
            <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4 text-sm">
              <h3 className="font-bold text-green-900 mb-3">✅ Résumé de l'échange</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white border border-green-200 rounded p-2">
                  <p className="text-xs text-gray-500 mb-1">Vous donnez</p>
                  <p className="font-semibold text-gray-900">{moment(selectedShiftA.date).format('DD/MM/YYYY')}</p>
                  <p className="text-gray-700">{selectedShiftA.start_time} → {selectedShiftA.end_time}</p>
                  {selectedShiftA.position && <p className="text-xs text-gray-500">{selectedShiftA.position}</p>}
                </div>
                <div className="bg-white border border-green-200 rounded p-2">
                  <p className="text-xs text-gray-500 mb-1">Vous recevez</p>
                  <p className="font-semibold text-gray-900">{moment(selectedShiftB.date).format('DD/MM/YYYY')}</p>
                  <p className="text-gray-700">{selectedShiftB.start_time} → {selectedShiftB.end_time}</p>
                  {selectedShiftB.position && <p className="text-xs text-gray-500">{selectedShiftB.position}</p>}
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

          {/* Message */}
          <div>
            <Label className="text-sm font-semibold text-gray-900">Message (optionnel)</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ex: Je dois m'absenter ce jour-là pour raison personnelle..."
              rows={2}
              className="mt-1"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              onClick={() => submitMutation.mutate()}
              disabled={!isValid || submitMutation.isPending}
              className="flex-1 bg-purple-600 hover:bg-purple-700"
            >
              <Send className="w-4 h-4 mr-2" />
              {submitMutation.isPending ? 'Envoi...' : 'Envoyer la demande'}
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