import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Calendar, DollarSign, Clock } from 'lucide-react';
import { calculateShiftDuration } from './LegalChecks';

export default function HolidayAlertModal({ 
  open, 
  onOpenChange, 
  holiday, 
  employee, 
  shift, 
  policy,
  isEligible,
  onConfirm 
}) {
  const [employeeConsent, setEmployeeConsent] = useState(false);
  const [managerOverride, setManagerOverride] = useState(false);

  if (!holiday || !employee || !shift) return null;

  const shiftDuration = calculateShiftDuration(shift);
  const isMay1 = holiday.is_may_first;
  const payMultiplier = isMay1 ? 2.0 : (policy?.policy_for_non_may1 === 'pay' ? 1.0 : 0);
  const timeOffMinutes = policy?.policy_for_non_may1 === 'time_off' ? shiftDuration * 60 : 0;

  const handleConfirm = () => {
    onConfirm({
      holiday_id: holiday.id,
      holiday_flag: true,
      holiday_pay_multiplier: payMultiplier,
      holiday_comp_minutes: timeOffMinutes,
      explicit_employee_consent: employeeConsent,
      consent_date: new Date().toISOString()
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className={cn(
            "flex items-center gap-2 text-xl",
            isMay1 ? "text-red-600" : "text-purple-600"
          )}>
            <AlertTriangle className="w-6 h-6" />
            {isMay1 ? 'ALERTE : 1er MAI - Doublement obligatoire' : `Jour férié : ${holiday.name}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Info employé */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold mb-2">Employé concerné</h3>
            <p className="text-sm">{employee.first_name} {employee.last_name}</p>
            <p className="text-xs text-gray-600">
              Date d'embauche : {employee.start_date || 'Non renseignée'}
            </p>
            {!isEligible && (
              <div className="mt-2 bg-orange-100 border border-orange-300 rounded p-2">
                <p className="text-xs text-orange-900">
                  ⚠️ Cet employé n'a pas encore {policy?.eligibility_months || 8} mois d'ancienneté. 
                  Les droits aux jours fériés CCN ne s'appliquent pas encore.
                </p>
              </div>
            )}
          </div>

          {/* Info shift */}
          <div className="bg-blue-50 rounded-lg p-4">
            <h3 className="font-semibold mb-2">Détail du shift</h3>
            <p className="text-sm">
              <Calendar className="w-4 h-4 inline mr-1" />
              {shift.date} de {shift.start_time} à {shift.end_time}
            </p>
            <p className="text-sm">
              <Clock className="w-4 h-4 inline mr-1" />
              Durée : {shiftDuration.toFixed(1)}h
            </p>
          </div>

          {/* Calcul impact */}
          {isMay1 && (
            <div className="bg-red-50 border-2 border-red-600 rounded-lg p-4">
              <h3 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Impact rémunération - 1er MAI
              </h3>
              <p className="text-sm text-red-900">
                Rémunération doublée (Art. L3133-6 Code du travail)
              </p>
              <p className="text-lg font-bold text-red-900 mt-2">
                Multiplicateur : x{payMultiplier} 
                <span className="text-sm font-normal ml-2">
                  ({shiftDuration.toFixed(1)}h × {payMultiplier} = {(shiftDuration * payMultiplier).toFixed(1)}h payées)
                </span>
              </p>
            </div>
          )}

          {!isMay1 && policy?.policy_for_non_may1 === 'pay' && isEligible && (
            <div className="bg-green-50 border border-green-300 rounded-lg p-4">
              <h3 className="font-semibold text-green-900 mb-2">
                Compensation : Rémunération normale
              </h3>
              <p className="text-sm text-green-900">
                Le jour férié sera rémunéré normalement (politique établissement)
              </p>
            </div>
          )}

          {!isMay1 && policy?.policy_for_non_may1 === 'time_off' && isEligible && (
            <div className="bg-blue-50 border border-blue-300 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-2">
                Compensation : Récupération en temps
              </h3>
              <p className="text-sm text-blue-900">
                Temps de récupération dû : {(timeOffMinutes / 60).toFixed(1)}h ({timeOffMinutes} minutes)
              </p>
            </div>
          )}

          {/* Consentement */}
          <div className="border-t pt-4 space-y-3">
            <div className="flex items-start gap-2">
              <Checkbox 
                id="employee-consent" 
                checked={employeeConsent}
                onCheckedChange={setEmployeeConsent}
              />
              <Label htmlFor="employee-consent" className="text-sm leading-snug cursor-pointer">
                Je confirme que l'employé a donné son <strong>consentement explicite</strong> pour travailler ce jour férié
                {isMay1 && ' (1er mai)'}
              </Label>
            </div>

            {isMay1 && policy?.may1_open_allowed === false && (
              <div className="bg-red-100 border border-red-300 rounded p-3">
                <p className="text-xs text-red-900">
                  ⚠️ L'établissement n'est pas paramétré pour autoriser l'ouverture le 1er mai. 
                  Vérifiez les paramètres avant de valider ce shift.
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={!employeeConsent}
            className={cn(
              isMay1 ? "bg-red-600 hover:bg-red-700" : "bg-purple-600 hover:bg-purple-700"
            )}
          >
            Confirmer le shift férié
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}