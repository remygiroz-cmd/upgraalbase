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
      try {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🔷 [UI MUTATION] START - Calling approveLeaveRequest', {
          requestId: request.id,
          employeeId: request.employee_id,
          employeeName: request.employee_name
        });

        const response = await base44.functions.invoke('approveLeaveRequest', {
          requestId: request.id
        });
        
        console.log('🔷 [UI MUTATION] RAW RESPONSE received:');
        console.log('  - typeof response:', typeof response);
        console.log('  - response keys:', Object.keys(response || {}));
        console.log('  - response.data exists:', !!response?.data);
        console.log('  - Full response:', JSON.stringify(response, null, 2));
        
        // Extract data - base44.functions.invoke returns { data, status, headers }
        const data = response?.data;
        
        if (!data) {
          console.error('❌ [UI MUTATION] No data in response!', response);
          throw new Error('Pas de données dans la réponse du serveur');
        }
        
        console.log('🔷 [UI MUTATION] DATA extracted:');
        console.log('  - typeof data:', typeof data);
        console.log('  - data.ok:', data.ok);
        console.log('  - data.traceId:', data.traceId);
        console.log('  - Full data:', JSON.stringify(data, null, 2));
        
        if (data.ok === false) {
          console.error('❌ [UI MUTATION] Server returned ok:false:', data);
          throw new Error(data.errorMessage || data.error || 'Erreur serveur (ok:false)');
        }
        
        if (!data.createdPaidLeavePeriodIds || data.createdPaidLeavePeriodIds.length === 0) {
          console.error('❌ [UI MUTATION] No periods created!', data);
          throw new Error('Aucune période créée (createdPaidLeavePeriodIds vide)');
        }
        
        console.log('✅ [UI MUTATION] SUCCESS - Periods created:', data.createdPaidLeavePeriodIds);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        return data;
        
      } catch (error) {
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('❌ [UI MUTATION] CAUGHT ERROR:');
        console.error('  - error.name:', error.name);
        console.error('  - error.message:', error.message);
        console.error('  - error.stack:', error.stack);
        console.error('  - Full error:', error);
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log('✅ [UI APPROVE] SUCCESS - Data received:', {
        ok: data.ok,
        periodsCount: data.createdPaidLeavePeriodIds?.length,
        periodIds: data.createdPaidLeavePeriodIds,
        affectedMonths: data.affectedMonths || data.month_keys,
        employeeId: data.employee_id,
        employeeName: data.employee_name
      });
      
      const affectedMonths = data.affectedMonths || data.month_keys || [];
      const periodIds = data.createdPaidLeavePeriodIds || [];
      
      queryClient.invalidateQueries({ queryKey: ['pendingLeaveRequests'] });
      queryClient.invalidateQueries({ queryKey: ['myLeaveRequestDecisions'] });
      queryClient.invalidateQueries({ queryKey: ['paidLeavePeriods'] });
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.invalidateQueries({ queryKey: ['nonShiftEvents'] });
      
      // Invalidate specific months
      affectedMonths.forEach(monthKey => {
        queryClient.invalidateQueries({ queryKey: ['planning', monthKey] });
        queryClient.invalidateQueries({ queryKey: ['monthlyRecap', monthKey] });
      });

      const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      const isCurrentMonth = affectedMonths.includes(currentMonth);
      
      if (periodIds.length > 1) {
        toast.success(
          `✅ ${periodIds.length} périodes créées sur ${affectedMonths.join(', ')}. IDs: ${periodIds.map(id => id.substring(0, 8)).join(', ')}${!isCurrentMonth ? ' (pas mois actuel)' : ''}`,
          { duration: 8000 }
        );
      } else {
        toast.success(
          `✅ CP créé: ${affectedMonths[0]} - ID: ${periodIds[0]?.substring(0, 8)}... (${data.employee_name})${!isCurrentMonth ? ' - Va sur ce mois pour le voir' : ''}`,
          { duration: 8000 }
        );
      }
      
      onDismiss?.();
    },
    onError: (error) => {
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('❌ [UI APPROVE] ERROR:', {
        message: error.message,
        stack: error.stack,
        error
      });
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      toast.error('❌ Erreur lors de la création des CP', { duration: 6000 });
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
            
            {/* DEBUG RESULT */}
            {debugResult && (
              <div className={`mt-3 p-3 border-2 rounded text-xs font-mono ${
                debugResult.ok ? 'bg-green-50 border-green-400' : 'bg-red-50 border-red-500'
              }`}>
                <div className={`font-bold mb-2 ${debugResult.ok ? 'text-green-900' : 'text-red-900'}`}>
                  {debugResult.ok ? '✅ SUCCESS' : '❌ ERROR'} - DEBUG RESULT
                </div>
                <div className={`space-y-1 ${debugResult.ok ? 'text-green-900' : 'text-red-900'}`}>
                  <div><strong>traceId:</strong> {debugResult.traceId || 'N/A'}</div>
                  <div><strong>ok:</strong> {JSON.stringify(debugResult.ok)}</div>
                  
                  {debugResult.ok ? (
                    <>
                      {debugResult.createdPaidLeavePeriodIds && (
                        <div><strong>createdIds:</strong> {JSON.stringify(debugResult.createdPaidLeavePeriodIds)}</div>
                      )}
                      {debugResult.month_keys && (
                        <div><strong>month_keys:</strong> {JSON.stringify(debugResult.month_keys)}</div>
                      )}
                      {debugResult.employee_id && (
                        <div><strong>employee_id:</strong> {debugResult.employee_id}</div>
                      )}
                      {debugResult.deploymentMode && (
                        <div><strong>deploymentMode:</strong> {debugResult.deploymentMode}</div>
                      )}
                    </>
                  ) : (
                    <>
                      {debugResult.errorMessage && (
                        <div className="text-red-700 font-bold"><strong>errorMessage:</strong> {debugResult.errorMessage}</div>
                      )}
                      {debugResult.errorName && (
                        <div className="text-red-700"><strong>errorName:</strong> {debugResult.errorName}</div>
                      )}
                      {debugResult.context && (
                        <div><strong>context:</strong> {JSON.stringify(debugResult.context)}</div>
                      )}
                      {debugResult.stack && (
                        <div className="mt-2 text-xs bg-red-100 p-2 rounded overflow-auto max-h-24">
                          <strong>stack:</strong><pre className="whitespace-pre-wrap">{debugResult.stack}</pre>
                        </div>
                      )}
                    </>
                  )}
                  
                  <div className="mt-2 max-h-32 overflow-auto bg-white/50 p-2 rounded">
                    <strong>full:</strong> {JSON.stringify(debugResult, null, 2)}
                  </div>
                </div>
              </div>
            )}
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