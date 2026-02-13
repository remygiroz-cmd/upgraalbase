import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Check, X, Calendar, User, AlertCircle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function LeaveRequestNotification({ request, onDismiss }) {
  const queryClient = useQueryClient();
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const approveMutation = useMutation({
    mutationFn: async () => {
      // Get month context for the CP period
      const startDate = new Date(request.start_cp);
      const monthKey = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
      
      // Get or create PlanningMonth
      const planningMonths = await base44.entities.PlanningMonth.filter({ month_key: monthKey });
      let resetVersion = 0;
      
      if (planningMonths.length === 0) {
        const newMonth = await base44.entities.PlanningMonth.create({
          year: startDate.getFullYear(),
          month: startDate.getMonth(),
          month_key: monthKey,
          reset_version: 0
        });
        resetVersion = 0;
      } else {
        resetVersion = planningMonths[0].reset_version || 0;
      }

      // Create the CP period
      const periodData = {
        employee_id: request.employee_id,
        employee_name: request.employee_name,
        last_work_day: request.last_work_day,
        first_work_day_after: request.first_work_day_after,
        start_cp: request.start_cp,
        end_cp: request.end_cp,
        cp_days_auto: request.cp_days_computed,
        cp_days_manual: request.manual_override_days || null,
        notes: request.notes,
        month_key: monthKey,
        reset_version: resetVersion
      };

      const period = await base44.entities.PaidLeavePeriod.create(periodData);

      // Update request status
      const currentUser = await base44.auth.me();
      await base44.entities.LeaveRequest.update(request.id, {
        status: 'APPROVED',
        decision_by_user_id: currentUser.id,
        decision_by_user_email: currentUser.email,
        decision_at: new Date().toISOString(),
        created_period_id: period.id
      });

      return period;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leaveRequests'] });
      queryClient.invalidateQueries({ queryKey: ['paidLeavePeriods'] });
      toast.success('Demande acceptée et période CP créée');
      onDismiss?.();
    },
    onError: (error) => {
      toast.error('Erreur : ' + error.message);
    }
  });

  const rejectMutation = useMutation({
    mutationFn: async (reason) => {
      const currentUser = await base44.auth.me();
      return await base44.entities.LeaveRequest.update(request.id, {
        status: 'REJECTED',
        decision_by_user_id: currentUser.id,
        decision_by_user_email: currentUser.email,
        decision_at: new Date().toISOString(),
        rejection_reason: reason || null
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leaveRequests'] });
      toast.success('Demande refusée');
      setShowRejectModal(false);
      onDismiss?.();
    },
    onError: (error) => {
      toast.error('Erreur : ' + error.message);
    }
  });

  return (
    <>
      <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
            <Calendar className="w-5 h-5 text-white" />
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-blue-900 mb-1">
              📝 Demande de CP à valider
            </h3>
            
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-blue-700" />
                <span className="font-semibold text-blue-900">{request.employee_name}</span>
              </div>
              
              <div className="flex items-center gap-2 text-gray-700">
                <span className="font-medium">Départ:</span>
                <span>{new Date(request.last_work_day).toLocaleDateString('fr-FR')}</span>
              </div>
              
              <div className="flex items-center gap-2 text-gray-700">
                <span className="font-medium">Reprise:</span>
                <span>{new Date(request.first_work_day_after).toLocaleDateString('fr-FR')}</span>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-700">CP décomptés:</span>
                <span className="text-lg font-bold text-green-700">{request.cp_days_computed} j</span>
              </div>
              
              {request.notes && (
                <div className="mt-2 text-xs text-gray-600 bg-white/50 rounded p-2">
                  <strong>Notes:</strong> {request.notes}
                </div>
              )}
            </div>
            
            <div className="flex gap-2 mt-3">
              <Button
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending || rejectMutation.isPending}
                size="sm"
                className="bg-green-600 hover:bg-green-700 flex-1"
              >
                <Check className="w-4 h-4 mr-1" />
                Accepter
              </Button>
              
              <Button
                onClick={() => setShowRejectModal(true)}
                disabled={approveMutation.isPending || rejectMutation.isPending}
                size="sm"
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50 flex-1"
              >
                <X className="w-4 h-4 mr-1" />
                Refuser
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Reject Modal */}
      <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-red-700 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Refuser la demande de CP
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-900">
              <p className="font-semibold">Demande de {request.employee_name}</p>
              <p className="text-xs mt-1">
                Du {new Date(request.last_work_day).toLocaleDateString('fr-FR')} au {new Date(request.first_work_day_after).toLocaleDateString('fr-FR')}
              </p>
            </div>

            <div>
              <Label className="text-sm font-semibold text-gray-900">Motif de refus (optionnel)</Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Expliquez pourquoi cette demande est refusée..."
                rows={3}
                className="mt-1"
              />
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => setShowRejectModal(false)}
                variant="outline"
                className="flex-1"
              >
                Annuler
              </Button>
              <Button
                onClick={() => rejectMutation.mutate(rejectionReason)}
                disabled={rejectMutation.isPending}
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                Confirmer le refus
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}