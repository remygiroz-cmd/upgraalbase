import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeftRight, Check, X, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import moment from 'moment';
import { cn } from '@/lib/utils';

export default function ShiftSwapNotification({ request, currentEmployee, mode = 'manager' }) {
  // mode: 'manager' (approve/reject) | 'employee' (view decision)
  const queryClient = useQueryClient();
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  function timeToMins(t) {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  function shiftsOverlap(s1, e1, s2, e2) {
    return timeToMins(s1) < timeToMins(e2) && timeToMins(s2) < timeToMins(e1);
  }

  const approveMutation = useMutation({
    mutationFn: async () => {
      // Re-fetch shifts to verify they still exist and haven't changed
      const [shiftAArr, shiftBArr] = await Promise.all([
        base44.entities.Shift.filter({ id: request.shift_a_id }),
        base44.entities.Shift.filter({ id: request.shift_b_id })
      ]);

      const sA = shiftAArr[0];
      const sB = shiftBArr[0];

      if (!sA || !sB) {
        throw new Error('Un ou plusieurs shifts sont introuvables. Ils ont peut-être été supprimés.');
      }

      // Version check
      if (request.shift_a_updated_at && sA.updated_date && sA.updated_date !== request.shift_a_updated_at) {
        throw new Error('Impossible d\'effectuer l\'échange : le shift A a été modifié depuis la demande.');
      }
      if (request.shift_b_updated_at && sB.updated_date && sB.updated_date !== request.shift_b_updated_at) {
        throw new Error('Impossible d\'effectuer l\'échange : le shift B a été modifié depuis la demande.');
      }

      // Verify same month
      if (sA.date?.substring(0, 7) !== sB.date?.substring(0, 7)) {
        throw new Error('Les shifts ne sont plus dans le même mois.');
      }

      // Conflict check: fetch all shifts for both employees on the concerned dates
      const [aShiftsOnBDay, bShiftsOnADay] = await Promise.all([
        base44.entities.Shift.filter({ employee_id: sA.employee_id, date: sB.date }),
        base44.entities.Shift.filter({ employee_id: sB.employee_id, date: sA.date })
      ]);

      // Check A's other shifts on sB.date
      const conflictA = aShiftsOnBDay.filter(s => s.id !== sA.id && s.id !== sB.id)
        .some(s => shiftsOverlap(sB.start_time, sB.end_time, s.start_time, s.end_time));
      if (conflictA) {
        await base44.entities.ShiftSwapRequest.update(request.id, {
          status: 'REJECTED',
          decided_at: new Date().toISOString(),
          rejection_reason: 'Échange impossible : conflit d\'horaires suite à modification du planning.'
        });
        throw new Error('Échange impossible : conflit d\'horaires suite à modification du planning. La demande a été automatiquement refusée.');
      }

      // Check B's other shifts on sA.date
      const conflictB = bShiftsOnADay.filter(s => s.id !== sA.id && s.id !== sB.id)
        .some(s => shiftsOverlap(sA.start_time, sA.end_time, s.start_time, s.end_time));
      if (conflictB) {
        await base44.entities.ShiftSwapRequest.update(request.id, {
          status: 'REJECTED',
          decided_at: new Date().toISOString(),
          rejection_reason: 'Échange impossible : conflit d\'horaires suite à modification du planning.'
        });
        throw new Error('Échange impossible : conflit d\'horaires suite à modification du planning. La demande a été automatiquement refusée.');
      }

      // Swap ONLY employee_id on both shifts
      await Promise.all([
        base44.entities.Shift.update(sA.id, { employee_id: sB.employee_id, employee_name: sB.employee_name }),
        base44.entities.Shift.update(sB.id, { employee_id: sA.employee_id, employee_name: sA.employee_name })
      ]);

      // Update request status
      await base44.entities.ShiftSwapRequest.update(request.id, {
        status: 'APPROVED',
        decided_by_user_id: (await base44.auth.me()).id,
        decided_at: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shiftSwapRequests'] });
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      toast.success('Échange de shift approuvé et appliqué sur le planning');
    },
    onError: (err) => {
      toast.error('Erreur : ' + err.message);
    }
  });

  const rejectMutation = useMutation({
    mutationFn: async (reason) => {
      const me = await base44.auth.me();
      await base44.entities.ShiftSwapRequest.update(request.id, {
        status: 'REJECTED',
        decided_by_user_id: me.id,
        decided_at: new Date().toISOString(),
        rejection_reason: reason || ''
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shiftSwapRequests'] });
      toast.success('Demande d\'échange refusée');
      setShowRejectInput(false);
    },
    onError: (err) => {
      toast.error('Erreur : ' + err.message);
    }
  });

  const dismissMutation = useMutation({
    mutationFn: async () => {
      const dismissed = request.dismissed_by_employee_ids || [];
      if (!dismissed.includes(currentEmployee.id)) {
        dismissed.push(currentEmployee.id);
      }
      await base44.entities.ShiftSwapRequest.update(request.id, {
        dismissed_by_employee_ids: dismissed
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shiftSwapRequests'] });
      queryClient.invalidateQueries({ queryKey: ['mySwapDecisions'] });
    }
  });

  const isPending = approveMutation.isPending || rejectMutation.isPending;

  if (mode === 'employee') {
    // Notification de décision pour l'employé
    const isApproved = request.status === 'APPROVED';
    const isMe = currentEmployee?.id === request.employee_a_id;
    const otherName = isMe ? request.employee_b_name : request.employee_a_name;

    return (
      <Card className={cn(
        "p-4 relative group",
        isApproved ? "bg-green-50 border-green-300" : "bg-red-50 border-red-300"
      )}>
        <button
          onClick={() => dismissMutation.mutate()}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-gray-200/50"
          title="Masquer"
        >
          <Trash2 className="w-4 h-4 text-gray-500" />
        </button>

        <div className="flex items-start gap-3">
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
            isApproved ? "bg-green-600" : "bg-red-600"
          )}>
            {isApproved ? <Check className="w-5 h-5 text-white" /> : <X className="w-5 h-5 text-white" />}
          </div>
          <div className="flex-1">
            <h3 className={cn("font-bold text-sm mb-1", isApproved ? "text-green-900" : "text-red-900")}>
              {isApproved ? 'Échange de shift accepté ✓' : 'Échange de shift refusé ✗'}
            </h3>
            <p className="text-sm text-gray-700">
              Échange avec <strong>{otherName}</strong>
            </p>
            <div className="text-xs text-gray-600 mt-1">
              <span className="font-medium">Shift A :</span> {moment(request.shift_a_date).format('DD/MM/YYYY')} {request.shift_a_start_time}→{request.shift_a_end_time}
            </div>
            <div className="text-xs text-gray-600">
              <span className="font-medium">Shift B :</span> {moment(request.shift_b_date).format('DD/MM/YYYY')} {request.shift_b_start_time}→{request.shift_b_end_time}
            </div>
            {!isApproved && request.rejection_reason && (
              <div className="mt-2 bg-white/50 rounded p-2 text-xs text-gray-700">
                <strong>Motif :</strong> {request.rejection_reason}
              </div>
            )}
            <p className="text-xs text-gray-500 mt-2">
              Décision le {moment(request.decided_at).format('DD/MM/YYYY')}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  // Mode manager: approve/reject
  return (
    <Card className="p-4 bg-purple-50 border-purple-300">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0">
          <ArrowLeftRight className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-sm text-purple-900">Demande d'échange de shift</h3>
          <p className="text-sm text-gray-700 mt-1">
            <strong>{request.employee_a_name}</strong> souhaite échanger son shift du{' '}
            <strong>{moment(request.shift_a_date).format('DD/MM/YYYY')} {request.shift_a_start_time}→{request.shift_a_end_time}
            {request.shift_a_position ? ` (${request.shift_a_position})` : ''}</strong>{' '}
            avec <strong>{request.employee_b_name}</strong>
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div className="bg-white border border-purple-200 rounded p-2">
              <p className="text-gray-500 mb-0.5">Shift A — {request.employee_a_name}</p>
              <p className="font-semibold">{moment(request.shift_a_date).format('DD/MM/YYYY')}</p>
              <p>{request.shift_a_start_time} → {request.shift_a_end_time}</p>
              {request.shift_a_position && <p className="text-gray-500">{request.shift_a_position}</p>}
            </div>
            <div className="bg-white border border-purple-200 rounded p-2">
              <p className="text-gray-500 mb-0.5">Shift B — {request.employee_b_name}</p>
              <p className="font-semibold">{moment(request.shift_b_date).format('DD/MM/YYYY')}</p>
              <p>{request.shift_b_start_time} → {request.shift_b_end_time}</p>
              {request.shift_b_position && <p className="text-gray-500">{request.shift_b_position}</p>}
            </div>
          </div>
          {request.message && (
            <div className="mt-2 bg-white/70 rounded p-2 text-xs text-gray-700 italic">
              "{request.message}"
            </div>
          )}
          <p className="text-xs text-gray-500 mt-1">
            Demande du {moment(request.created_date).format('DD/MM/YYYY à HH:mm')}
          </p>
        </div>
      </div>

      {showRejectInput ? (
        <div className="space-y-2">
          <input
            type="text"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Motif de refus (optionnel)"
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          />
          <div className="flex gap-2">
            <Button
              onClick={() => rejectMutation.mutate(rejectReason)}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs py-1.5"
              disabled={isPending}
            >
              <X className="w-3 h-3 mr-1" />
              Confirmer le refus
            </Button>
            <Button
              onClick={() => setShowRejectInput(false)}
              variant="outline"
              className="text-xs"
              disabled={isPending}
            >
              Annuler
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            onClick={() => approveMutation.mutate()}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm py-2"
            disabled={isPending}
          >
            <Check className="w-4 h-4 mr-1.5" />
            {approveMutation.isPending ? 'Application...' : 'Accepter'}
          </Button>
          <Button
            onClick={() => setShowRejectInput(true)}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm py-2"
            disabled={isPending}
          >
            <X className="w-4 h-4 mr-1.5" />
            Refuser
          </Button>
        </div>
      )}
    </Card>
  );
}