import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { AlertTriangle, Calendar, Send } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { calculateCPPeriod, calculateCPDays } from './paidLeaveCalculations';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function LeaveRequestModal({ open, onOpenChange }) {
  const queryClient = useQueryClient();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [lastWorkDay, setLastWorkDay] = useState('');
  const [firstWorkDayAfter, setFirstWorkDayAfter] = useState('');
  const [notes, setNotes] = useState('');
  const [showDebug, setShowDebug] = useState(false);

  // Fetch current user
  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  // Fetch all active employees
  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.list()
  });

  const activeEmployees = employees.filter(emp => emp.is_active === true);

  useEffect(() => {
    if (open) {
      setSelectedEmployeeId('');
      setLastWorkDay('');
      setFirstWorkDayAfter('');
      setNotes('');
      setShowDebug(false);
    }
  }, [open]);

  const selectedEmployee = activeEmployees.find(emp => emp.id === selectedEmployeeId);

  const submitRequestMutation = useMutation({
    mutationFn: async (requestData) => {
      return await base44.entities.LeaveRequest.create(requestData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leaveRequests'] });
      queryClient.invalidateQueries({ queryKey: ['urgentAnnouncements'] });
      toast.success('Demande de CP déposée avec succès');
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error('Erreur lors de la création de la demande : ' + error.message);
    }
  });

  // Calculs automatiques
  const isValid = selectedEmployeeId && lastWorkDay && firstWorkDayAfter && lastWorkDay < firstWorkDayAfter;
  
  let cpData = null;
  if (isValid) {
    const period = calculateCPPeriod(lastWorkDay, firstWorkDayAfter);
    const days = calculateCPDays(period.startCP, period.endCP, showDebug);
    cpData = { ...period, ...days };
  }

  const handleSubmit = async () => {
    if (!isValid || !selectedEmployee) {
      toast.error('Veuillez remplir tous les champs obligatoires');
      return;
    }

    // Check for existing pending request with same dates
    const existingRequests = await base44.entities.LeaveRequest.filter({
      employee_id: selectedEmployeeId,
      status: 'PENDING'
    });

    const duplicate = existingRequests.find(req => 
      req.last_work_day === lastWorkDay && 
      req.first_work_day_after === firstWorkDayAfter
    );

    if (duplicate) {
      toast.error('Une demande identique est déjà en attente de validation');
      return;
    }

    const requestData = {
      status: 'PENDING',
      employee_id: selectedEmployee.id,
      employee_name: `${selectedEmployee.first_name} ${selectedEmployee.last_name}`,
      requested_by_user_id: currentUser.id,
      requested_by_user_email: currentUser.email,
      last_work_day: lastWorkDay,
      first_work_day_after: firstWorkDayAfter,
      start_cp: cpData.startCP,
      end_cp: cpData.endCP,
      cp_days_computed: cpData.countedDays,
      calendar_days: cpData.totalDays,
      excluded_days: cpData.excludedDays,
      notes
    };

    submitRequestMutation.mutate(requestData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-blue-700">
            📝 Demande de Congés Payés
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Info */}
          <Alert className="bg-blue-50 border-blue-200">
            <div className="text-sm text-blue-900">
              <p className="font-semibold mb-1">📋 Principe :</p>
              <p>Définissez le <strong>départ en CP</strong> (premier jour en congés) et le <strong>jour de reprise</strong>.</p>
              <p className="mt-1 text-xs text-blue-700">
                La période CP est calculée du départ en CP (inclus) à la veille du jour de reprise (inclus).
              </p>
            </div>
          </Alert>

          {/* Employee Selection */}
          <div>
            <Label className="text-sm font-semibold text-gray-900">Employé *</Label>
            <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Choisir un employé..." />
              </SelectTrigger>
              <SelectContent>
                {activeEmployees.map(emp => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-semibold text-gray-900">Départ en CP *</Label>
              <Input
                type="date"
                value={lastWorkDay}
                onChange={(e) => setLastWorkDay(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">Premier jour en congés (inclus)</p>
            </div>
            <div>
              <Label className="text-sm font-semibold text-gray-900">Jour de reprise *</Label>
              <Input
                type="date"
                value={firstWorkDayAfter}
                onChange={(e) => setFirstWorkDayAfter(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">Premier jour travaillé après CP (inclus)</p>
            </div>
          </div>

          {/* Validation error */}
          {lastWorkDay && firstWorkDayAfter && lastWorkDay >= firstWorkDayAfter && (
            <Alert className="bg-red-50 border-red-300">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <p className="text-sm text-red-900 ml-2">
                Le jour de reprise doit être postérieur au départ en CP.
              </p>
            </Alert>
          )}

          {/* Avertissement délai < 15 jours */}
          {lastWorkDay && (() => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const depart = new Date(lastWorkDay + 'T00:00:00');
            const diffDays = Math.round((depart - today) / (1000 * 60 * 60 * 24));
            return diffDays >= 0 && diffDays < 15;
          })() && (
            <div className="bg-red-600 text-white rounded-lg p-4 flex items-start gap-3 shadow-md">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm">⚠️ Délai insuffisant</p>
                <p className="text-sm mt-0.5">
                  Attention, les congés payés doivent être déposés au minimum <strong>15 jours avant la date de départ souhaitée</strong>.
                </p>
              </div>
            </div>
          )}

          {/* Aperçu période */}
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

          {/* Notes */}
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

          {/* Debug */}
          {isValid && (
            <div>
              <button
                type="button"
                onClick={() => setShowDebug(!showDebug)}
                className="text-xs text-purple-700 hover:text-purple-900 font-semibold"
              >
                {showDebug ? '🔻 Masquer' : '🔍 Afficher'} le détail debug
              </button>
              
              {showDebug && cpData?.details && (
                <div className="mt-2 bg-purple-50 border border-purple-200 rounded p-3 max-h-48 overflow-y-auto">
                  <div className="text-xs space-y-1">
                    {cpData.details.map((d, i) => (
                      <div
                        key={i}
                        className={cn(
                          "flex justify-between",
                          d.counted ? "text-green-700" : "text-red-600"
                        )}
                      >
                        <span>{d.date} ({d.dayName})</span>
                        <span>
                          {d.counted ? '✓ Compté' : `✗ ${d.reason}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              onClick={handleSubmit}
              disabled={!isValid || submitRequestMutation.isPending}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              <Send className="w-4 h-4 mr-2" />
              {submitRequestMutation.isPending ? 'Envoi en cours...' : 'Déposer la demande'}
            </Button>
            
            <Button
              onClick={() => onOpenChange(false)}
              variant="outline"
            >
              Annuler
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}