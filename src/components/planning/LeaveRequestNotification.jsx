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
      const startDate = new Date(request.start_cp);
      const endDate = new Date(request.end_cp);
      
      // Determine all affected months
      const affectedMonths = [];
      let currentDate = new Date(startDate);
      
      while (currentDate <= endDate) {
        const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
        if (!affectedMonths.includes(monthKey)) {
          affectedMonths.push(monthKey);
        }
        currentDate.setMonth(currentDate.getMonth() + 1);
        currentDate.setDate(1);
      }

      // Get or create PlanningMonth for each affected month
      const createdPeriods = [];
      
      for (const monthKey of affectedMonths) {
        const [year, monthNum] = monthKey.split('-').map(Number);
        
        // Get or create planning month
        let planningMonths = await base44.entities.PlanningMonth.filter({ month_key: monthKey });
        let resetVersion = 0;
        
        if (planningMonths.length === 0) {
          await base44.entities.PlanningMonth.create({
            year: year,
            month: monthNum - 1,
            month_key: monthKey,
            reset_version: 0
          });
          resetVersion = 0;
        } else {
          resetVersion = planningMonths[0].reset_version || 0;
        }

        // Determine the period boundaries for this specific month
        const monthStart = new Date(year, monthNum - 1, 1);
        const monthEnd = new Date(year, monthNum, 0);
        
        const periodStart = startDate > monthStart ? startDate : monthStart;
        const periodEnd = endDate < monthEnd ? endDate : monthEnd;

        // Create CP period for this month
        const periodData = {
          employee_id: request.employee_id,
          employee_name: request.employee_name,
          last_work_day: request.last_work_day,
          first_work_day_after: request.first_work_day_after,
          start_cp: periodStart.toISOString().split('T')[0],
          end_cp: periodEnd.toISOString().split('T')[0],
          cp_days_auto: request.cp_days_computed,
          cp_days_manual: request.manual_override_days || null,
          notes: request.notes || `Demande acceptée le ${new Date().toLocaleDateString('fr-FR')}`,
          month_key: monthKey,
          reset_version: resetVersion
        };

        const period = await base44.entities.PaidLeavePeriod.create(periodData);
        createdPeriods.push(period);
      }

      // Update request status
      const currentUser = await base44.auth.me();
      await base44.entities.LeaveRequest.update(request.id, {
        status: 'APPROVED',
        decision_by_user_id: currentUser.id,
        decision_by_user_email: currentUser.email,
        decision_at: new Date().toISOString(),
        created_period_id: createdPeriods[0].id
      });

      // Send notification to requester
      if (request.requested_by_user_email) {
        try {
          await base44.integrations.Core.SendEmail({
            to: request.requested_by_user_email,
            subject: '✅ Votre demande de CP a été acceptée',
            body: `
              <h2>Votre demande de congés payés a été acceptée</h2>
              <p><strong>Période:</strong> Du ${new Date(request.last_work_day).toLocaleDateString('fr-FR')} au ${new Date(request.first_work_day_after).toLocaleDateString('fr-FR')}</p>
              <p><strong>Jours décomptés:</strong> ${request.cp_days_computed} jours</p>
              <p><strong>Date de décision:</strong> ${new Date().toLocaleDateString('fr-FR')}</p>
              <p>Cette période a été ajoutée à votre planning.</p>
            `
          });
        } catch (emailError) {
          console.error('Failed to send email notification:', emailError);
        }
      }

      return createdPeriods;
    },
    onSuccess: (periods) => {
      queryClient.invalidateQueries({ queryKey: ['pendingLeaveRequests'] });
      queryClient.invalidateQueries({ queryKey: ['myLeaveRequestDecisions'] });
      queryClient.invalidateQueries({ queryKey: ['paidLeavePeriods'] });
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.invalidateQueries({ queryKey: ['nonShiftEvents'] });
      
      const monthsAffected = periods.length;
      toast.success(
        monthsAffected > 1 
          ? `Demande acceptée - ${monthsAffected} périodes CP créées (multi-mois)` 
          : 'Demande acceptée et période CP créée'
      );
      onDismiss?.();
    },
    onError: (error) => {
      console.error('Approval error:', error);
      toast.error(`Erreur lors de l'approbation: ${error.message}`);
    }
  });

  const rejectMutation = useMutation({
    mutationFn: async (reason) => {
      const currentUser = await base44.auth.me();
      await base44.entities.LeaveRequest.update(request.id, {
        status: 'REJECTED',
        decision_by_user_id: currentUser.id,
        decision_by_user_email: currentUser.email,
        decision_at: new Date().toISOString(),
        rejection_reason: reason || null
      });

      // Send notification to requester
      if (request.requested_by_user_email) {
        try {
          await base44.integrations.Core.SendEmail({
            to: request.requested_by_user_email,
            subject: '❌ Votre demande de CP a été refusée',
            body: `
              <h2>Votre demande de congés payés a été refusée</h2>
              <p><strong>Période demandée:</strong> Du ${new Date(request.last_work_day).toLocaleDateString('fr-FR')} au ${new Date(request.first_work_day_after).toLocaleDateString('fr-FR')}</p>
              ${reason ? `<p><strong>Motif:</strong> ${reason}</p>` : ''}
              <p><strong>Date de décision:</strong> ${new Date().toLocaleDateString('fr-FR')}</p>
              <p>N'hésitez pas à contacter votre responsable pour plus d'informations.</p>
            `
          });
        } catch (emailError) {
          console.error('Failed to send email notification:', emailError);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingLeaveRequests'] });
      queryClient.invalidateQueries({ queryKey: ['myLeaveRequestDecisions'] });
      toast.success('Demande refusée et employé notifié');
      setShowRejectModal(false);
      onDismiss?.();
    },
    onError: (error) => {
      console.error('Rejection error:', error);
      toast.error(`Erreur lors du refus: ${error.message}`);
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
                {approveMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />
                    Création...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-1" />
                    Accepter
                  </>
                )}
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