import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Edit2, RotateCcw } from 'lucide-react';
import { calculateMonthlyRecap } from '@/components/utils/monthlyRecapCalculations';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

/**
 * Récap mensuel COMPLET avec 3 modes de calcul
 *
 * MODE 1 - DÉSACTIVÉ: Aucun calcul automatique
 * MODE 2 - HEBDOMADAIRE: Heures comp/sup calculées à la semaine
 * MODE 3 - MENSUEL: Lissage mensuel pour temps partiel
 *
 * Tous les champs sont surchargeables manuellement
 */
export default function MonthlySummary({
  employee,
  shifts,
  nonShiftEvents = [],
  nonShiftTypes = [],
  monthStart,
  monthEnd,
  holidayDates = [],
  cpPeriods = [],
  monthlyRecap = null,
  weeklyRecaps = [], // Pour le calcul des heures comp/sup
  onRecapUpdate
}) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const queryClient = useQueryClient();

  const year = monthStart.getFullYear();
  const month = monthStart.getMonth() + 1;

  // Récupérer le mode de calcul depuis AppSettings
  const { data: appSettings = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => base44.entities.AppSettings.filter({ setting_key: 'planning_calculation_mode' })
  });

  const calculationMode = appSettings[0]?.planning_calculation_mode || 'disabled';

  // Calculer le récap automatique selon le mode
  const autoRecap = useMemo(() => {
    return calculateMonthlyRecap(
      calculationMode,
      employee,
      shifts,
      nonShiftEvents,
      nonShiftTypes,
      weeklyRecaps,
      cpPeriods,
      holidayDates,
      monthStart,
      monthEnd
    );
  }, [calculationMode, employee, shifts, nonShiftEvents, nonShiftTypes, weeklyRecaps, cpPeriods, holidayDates, monthStart, monthEnd]);

  // Appliquer les surcharges manuelles (priorité sur l'auto)
  const displayedRecap = {
    expectedDays: monthlyRecap?.manual_expected_days ?? autoRecap.expectedDays,
    actualDaysWorked: monthlyRecap?.manual_actual_days ?? autoRecap.actualDaysWorked,
    extraDays: monthlyRecap?.manual_extra_days ?? autoRecap.extraDays,
    expectedHours: monthlyRecap?.manual_expected_hours ?? autoRecap.expectedHours,
    deductedHours: monthlyRecap?.manual_deducted_hours ?? autoRecap.deductedHours,
    adjustedExpectedHours: monthlyRecap?.manual_adjusted_expected_hours ?? autoRecap.adjustedExpectedHours,
    overtime25: monthlyRecap?.manual_overtime_25 ?? autoRecap.overtime25,
    overtime50: monthlyRecap?.manual_overtime_50 ?? autoRecap.overtime50,
    complementary10: monthlyRecap?.manual_complementary_10 ?? autoRecap.complementary10,
    complementary25: monthlyRecap?.manual_complementary_25 ?? autoRecap.complementary25,
    nonShiftsByType: monthlyRecap?.manual_non_shifts ?? autoRecap.nonShiftsByType,
    holidaysWorked: monthlyRecap?.manual_holidays_worked ?? autoRecap.holidaysWorked,
    holidaysHours: monthlyRecap?.manual_holidays_hours ?? autoRecap.holidaysHours,
    cpDays: monthlyRecap?.manual_cp_days ?? autoRecap.cpDays
  };

  const hasManualOverride = !!monthlyRecap;

  const isPartTime = employee?.work_time_type === 'part_time';

  return (
    <>
      <div className={cn(
        "px-2 py-2 text-center relative group border-t-2 border-gray-300 max-h-[350px] overflow-y-auto",
        hasManualOverride && "bg-blue-50"
      )}>
        <button
          onClick={() => setShowEditDialog(true)}
          className="absolute top-1 right-1 p-1 rounded hover:bg-gray-200 transition-colors opacity-0 group-hover:opacity-100 z-10"
          title="Éditer le récapitulatif"
        >
          <Edit2 className="w-3 h-3 text-blue-600" />
        </button>

        <div className="text-[10px] font-bold text-gray-600 uppercase mb-2">
          Récap mois
        </div>

        {/* Jours prévus / réalisés / supplémentaires */}
        {displayedRecap.expectedDays !== null && (
          <div className="text-[10px] text-gray-700 mb-1 space-y-0.5">
            <div>Jours prévus : <strong>{displayedRecap.expectedDays}</strong></div>
            <div>Jours travaillés : <strong>{displayedRecap.actualDaysWorked}</strong></div>
            {displayedRecap.extraDays > 0 && (
              <div className="text-green-700 font-bold">
                Jours supp : +{displayedRecap.extraDays}
              </div>
            )}
          </div>
        )}

        {/* Heures mensuelles prévues ajustées */}
        {displayedRecap.adjustedExpectedHours !== null && (
          <div className="text-xs text-gray-700 mb-2 pt-2 border-t border-gray-200">
            <div className="font-semibold">Heures prévues ajustées</div>
            <div>{displayedRecap.adjustedExpectedHours.toFixed(1)}h</div>
            {displayedRecap.deductedHours > 0 && (
              <div className="text-[9px] text-red-600">
                (−{displayedRecap.deductedHours.toFixed(1)}h déduites)
              </div>
            )}
          </div>
        )}

        {/* Heures complémentaires (temps partiel) */}
        {isPartTime && (displayedRecap.complementary10 > 0 || displayedRecap.complementary25 > 0) && (
          <div className="text-[10px] text-green-700 mb-2 pt-2 border-t border-gray-200">
            <div className="font-bold mb-1">Heures complémentaires</div>
            {displayedRecap.complementary10 > 0 && (
              <div>+10% : {displayedRecap.complementary10.toFixed(1)}h</div>
            )}
            {displayedRecap.complementary25 > 0 && (
              <div>+25% : {displayedRecap.complementary25.toFixed(1)}h</div>
            )}
            <div className="font-bold mt-0.5">
              Total : {((displayedRecap.complementary10 || 0) + (displayedRecap.complementary25 || 0)).toFixed(1)}h
            </div>
          </div>
        )}

        {/* Heures supplémentaires (temps plein) */}
        {!isPartTime && (displayedRecap.overtime25 > 0 || displayedRecap.overtime50 > 0) && (
          <div className="text-[10px] text-orange-700 mb-2 pt-2 border-t border-gray-200">
            <div className="font-bold mb-1">Heures supplémentaires</div>
            {displayedRecap.overtime25 > 0 && (
              <div>+25% : {displayedRecap.overtime25.toFixed(1)}h</div>
            )}
            {displayedRecap.overtime50 > 0 && (
              <div>+50% : {displayedRecap.overtime50.toFixed(1)}h</div>
            )}
            <div className="font-bold mt-0.5">
              Total : {((displayedRecap.overtime25 || 0) + (displayedRecap.overtime50 || 0)).toFixed(1)}h
            </div>
          </div>
        )}

        {/* Non-shifts par type */}
        {displayedRecap.nonShiftsByType && Object.keys(displayedRecap.nonShiftsByType).length > 0 && (
          <div className="text-[10px] text-gray-700 mb-2 pt-2 border-t border-gray-200">
            <div className="font-bold mb-1">Absences</div>
            {Object.entries(displayedRecap.nonShiftsByType).map(([type, count]) => (
              <div key={type}>{type} : {count}j</div>
            ))}
          </div>
        )}

        {/* Jours fériés travaillés */}
        {displayedRecap.holidaysWorked > 0 && (
          <div className="text-[10px] text-purple-700 mb-2 pt-2 border-t border-gray-200">
            <div className="font-bold">Jours fériés travaillés</div>
            <div>{displayedRecap.holidaysWorked} jour{displayedRecap.holidaysWorked > 1 ? 's' : ''}</div>
            <div>{displayedRecap.holidaysHours.toFixed(1)}h</div>
          </div>
        )}

        {/* CP décomptés */}
        {displayedRecap.cpDays > 0 && (
          <div className="text-[10px] font-semibold text-green-700 pt-2 border-t border-gray-200">
            CP : {displayedRecap.cpDays}j
          </div>
        )}

        {hasManualOverride && (
          <div className="mt-2 text-[9px] text-blue-700 font-semibold">
            ✏️ Modifié
          </div>
        )}
      </div>

      <EditMonthlyRecapDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        employee={employee}
        year={year}
        month={month}
        autoRecap={autoRecap}
        currentRecap={monthlyRecap}
        onRecapUpdate={onRecapUpdate}
        calculationMode={calculationMode}
        isPartTime={isPartTime}
      />
    </>
  );
}

function EditMonthlyRecapDialog({ open, onOpenChange, employee, year, month, autoRecap, currentRecap, onRecapUpdate, calculationMode, isPartTime }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({});

  React.useEffect(() => {
    if (open) {
      setFormData({
        manual_expected_days: currentRecap?.manual_expected_days ?? '',
        manual_actual_days: currentRecap?.manual_actual_days ?? '',
        manual_extra_days: currentRecap?.manual_extra_days ?? '',
        manual_expected_hours: currentRecap?.manual_expected_hours ?? '',
        manual_deducted_hours: currentRecap?.manual_deducted_hours ?? '',
        manual_adjusted_expected_hours: currentRecap?.manual_adjusted_expected_hours ?? '',
        manual_overtime_25: currentRecap?.manual_overtime_25 ?? '',
        manual_overtime_50: currentRecap?.manual_overtime_50 ?? '',
        manual_complementary_10: currentRecap?.manual_complementary_10 ?? '',
        manual_complementary_25: currentRecap?.manual_complementary_25 ?? '',
        manual_holidays_worked: currentRecap?.manual_holidays_worked ?? '',
        manual_holidays_hours: currentRecap?.manual_holidays_hours ?? '',
        manual_cp_days: currentRecap?.manual_cp_days ?? '',
        notes: currentRecap?.notes || ''
      });
    }
  }, [open, currentRecap]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (currentRecap) {
        return await base44.entities.MonthlyRecap.update(currentRecap.id, data);
      } else {
        return await base44.entities.MonthlyRecap.create({
          employee_id: employee.id,
          year,
          month,
          ...data
        });
      }
    },
    onSuccess: () => {
      // Invalidate la requête globale (1 seule pour tous les employés)
      queryClient.invalidateQueries({ queryKey: ['allMonthlyRecaps'] });
      if (onRecapUpdate) onRecapUpdate();
      toast.success('Récapitulatif enregistré');
      onOpenChange(false);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (currentRecap) {
        return await base44.entities.MonthlyRecap.delete(currentRecap.id);
      }
    },
    onSuccess: () => {
      // Invalidate la requête globale (1 seule pour tous les employés)
      queryClient.invalidateQueries({ queryKey: ['allMonthlyRecaps'] });
      if (onRecapUpdate) onRecapUpdate();
      toast.success('Modifications supprimées');
      onOpenChange(false);
    }
  });

  const handleSave = () => {
    const cleanData = {};
    Object.keys(formData).forEach(key => {
      if (formData[key] !== '' && formData[key] !== null && formData[key] !== undefined) {
        if (key === 'notes') {
          cleanData[key] = formData[key];
        } else {
          cleanData[key] = parseFloat(formData[key]);
        }
      }
    });

    saveMutation.mutate(cleanData);
  };

  const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-blue-600">
            Éditer le récapitulatif mensuel
          </DialogTitle>
          <p className="text-sm text-gray-600">
            {employee.first_name} {employee.last_name} - {monthNames[month - 1]} {year}
          </p>
          <p className="text-xs text-gray-500">
            Mode: {calculationMode === 'disabled' ? 'Désactivé' : calculationMode === 'weekly' ? 'Hebdomadaire' : 'Mensuel (lissage)'} • 
            {isPartTime ? ' Temps partiel' : ' Temps plein'}
          </p>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-gray-700">
            <strong>Tous les champs sont surchargeables.</strong> Laissez vide pour utiliser la valeur automatique.
          </div>

          {/* Jours */}
          {calculationMode !== 'disabled' && (
            <>
              <div className="font-semibold text-sm text-gray-800">📅 Jours</div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs text-gray-700">Jours prévus</Label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    placeholder={`Auto: ${autoRecap.expectedDays || 0}`}
                    value={formData.manual_expected_days}
                    onChange={(e) => setFormData({...formData, manual_expected_days: e.target.value})}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-700">Jours travaillés</Label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    placeholder={`Auto: ${autoRecap.actualDaysWorked || 0}`}
                    value={formData.manual_actual_days}
                    onChange={(e) => setFormData({...formData, manual_actual_days: e.target.value})}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-700">Jours supp</Label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    placeholder={`Auto: ${autoRecap.extraDays || 0}`}
                    value={formData.manual_extra_days}
                    onChange={(e) => setFormData({...formData, manual_extra_days: e.target.value})}
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Heures mensuelles */}
              <div className="font-semibold text-sm text-gray-800">⏱️ Heures mensuelles</div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs text-gray-700">Heures prévues</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder={`Auto: ${autoRecap.expectedHours?.toFixed(1) || 0}`}
                    value={formData.manual_expected_hours}
                    onChange={(e) => setFormData({...formData, manual_expected_hours: e.target.value})}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-700">Heures déduites</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder={`Auto: ${autoRecap.deductedHours?.toFixed(1) || 0}`}
                    value={formData.manual_deducted_hours}
                    onChange={(e) => setFormData({...formData, manual_deducted_hours: e.target.value})}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-700">Heures ajustées</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder={`Auto: ${autoRecap.adjustedExpectedHours?.toFixed(1) || 0}`}
                    value={formData.manual_adjusted_expected_hours}
                    onChange={(e) => setFormData({...formData, manual_adjusted_expected_hours: e.target.value})}
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Heures complémentaires / supplémentaires */}
              {isPartTime ? (
                <>
                  <div className="font-semibold text-sm text-gray-800">✅ Heures complémentaires</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-gray-700">Comp +10%</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder={`Auto: ${autoRecap.complementary10?.toFixed(1) || 0}`}
                        value={formData.manual_complementary_10}
                        onChange={(e) => setFormData({...formData, manual_complementary_10: e.target.value})}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-700">Comp +25%</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder={`Auto: ${autoRecap.complementary25?.toFixed(1) || 0}`}
                        value={formData.manual_complementary_25}
                        onChange={(e) => setFormData({...formData, manual_complementary_25: e.target.value})}
                        className="mt-1"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="font-semibold text-sm text-gray-800">⚡ Heures supplémentaires</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-gray-700">Supp +25%</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder={`Auto: ${autoRecap.overtime25?.toFixed(1) || 0}`}
                        value={formData.manual_overtime_25}
                        onChange={(e) => setFormData({...formData, manual_overtime_25: e.target.value})}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-700">Supp +50%</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder={`Auto: ${autoRecap.overtime50?.toFixed(1) || 0}`}
                        value={formData.manual_overtime_50}
                        onChange={(e) => setFormData({...formData, manual_overtime_50: e.target.value})}
                        className="mt-1"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Jours fériés */}
              <div className="font-semibold text-sm text-gray-800">🎉 Jours fériés travaillés</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-gray-700">Jours fériés</Label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    placeholder={`Auto: ${autoRecap.holidaysWorked || 0}`}
                    value={formData.manual_holidays_worked}
                    onChange={(e) => setFormData({...formData, manual_holidays_worked: e.target.value})}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-700">Heures fériées</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder={`Auto: ${autoRecap.holidaysHours?.toFixed(1) || 0}`}
                    value={formData.manual_holidays_hours}
                    onChange={(e) => setFormData({...formData, manual_holidays_hours: e.target.value})}
                    className="mt-1"
                  />
                </div>
              </div>
            </>
          )}

          {/* CP */}
          <div className="font-semibold text-sm text-gray-800">🟢 Congés payés</div>
          <div>
            <Label className="text-xs text-gray-700">CP décomptés</Label>
            <Input
              type="number"
              step="0.5"
              min="0"
              placeholder={`Auto: ${autoRecap.cpDays || 0}`}
              value={formData.manual_cp_days}
              onChange={(e) => setFormData({...formData, manual_cp_days: e.target.value})}
              className="mt-1"
            />
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs text-gray-700">Notes</Label>
            <textarea
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
              rows={2}
              placeholder="Commentaires..."
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              onClick={handleSave}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              Enregistrer
            </Button>
            {currentRecap && (
              <Button
                onClick={() => deleteMutation.mutate()}
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50 flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Réinitialiser
              </Button>
            )}
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