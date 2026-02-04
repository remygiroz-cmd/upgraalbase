import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatLocalDate } from './dateUtils';

export default function ApplyAllTemplatesModal({ open, onOpenChange, monthStart, monthEnd }) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [summary, setSummary] = useState(null);
  const queryClient = useQueryClient();

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.filter({ is_active: true }),
    enabled: open
  });

  const { data: allTemplateWeeks = [] } = useQuery({
    queryKey: ['templateWeeks'],
    queryFn: () => base44.entities.TemplateWeek.list(),
    enabled: open
  });

  const { data: allShifts = [] } = useQuery({
    queryKey: ['shifts'],
    queryFn: () => base44.entities.Shift.list(),
    enabled: open
  });

  const { data: allTemplateShifts = [] } = useQuery({
    queryKey: ['templateShifts'],
    queryFn: () => base44.entities.TemplateShift.list(),
    enabled: open
  });

  const handleApplyAll = async () => {
    setIsExecuting(true);
    setSummary(null);

    const results = {
      processed: 0,
      ignored: 0,
      ignoredReasons: {
        noTemplate: 0,
        multipleTemplates: 0
      },
      shiftsCreated: 0,
      errors: []
    };

    const startDateStr = formatLocalDate(monthStart);
    const endDateStr = formatLocalDate(monthEnd);

    try {
      // Pour chaque employé
      for (const employee of employees) {
        // Récupérer les templates de cet employé
        const employeeTemplates = allTemplateWeeks.filter(tw => tw.employee_id === employee.id);

        // Logique de sélection
        if (employeeTemplates.length === 0) {
          results.ignored++;
          results.ignoredReasons.noTemplate++;
          continue;
        }

        if (employeeTemplates.length > 1) {
          results.ignored++;
          results.ignoredReasons.multipleTemplates++;
          continue;
        }

        // Exactement 1 template : appliquer
        const template = employeeTemplates[0];
        results.processed++;

        try {
          // Récupérer les shifts du template
          const templateShifts = allTemplateShifts.filter(ts => ts.template_week_id === template.id);

          if (templateShifts.length === 0) {
            continue;
          }

          // Générer les shifts pour la période
          const shiftsToCreate = [];
          for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
            const jsDay = d.getDay();
            const dayOfWeek = jsDay === 0 ? 7 : jsDay; // ISO: 1=Lundi, 7=Dimanche
            
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;

            // Trouver les templates pour ce jour
            const dayTemplates = templateShifts.filter(ts => ts.day_of_week === dayOfWeek);

            for (const tmpl of dayTemplates) {
              // Vérifier si un shift identique existe déjà
              const existsAlready = allShifts.some(s =>
                s.employee_id === employee.id &&
                s.date === dateStr &&
                s.start_time === tmpl.start_time &&
                s.end_time === tmpl.end_time
              );

              if (!existsAlready) {
                shiftsToCreate.push({
                  employee_id: employee.id,
                  employee_name: `${employee.first_name} ${employee.last_name}`,
                  date: dateStr,
                  start_time: tmpl.start_time,
                  end_time: tmpl.end_time,
                  break_minutes: tmpl.break_minutes || 0,
                  position: tmpl.position,
                  status: 'planned',
                  notes: tmpl.notes || ''
                });
              }
            }
          }

          // Créer les shifts
          if (shiftsToCreate.length > 0) {
            await base44.entities.Shift.bulkCreate(shiftsToCreate);
            results.shiftsCreated += shiftsToCreate.length;
          }
        } catch (error) {
          results.errors.push({
            employeeId: employee.id,
            employeeName: `${employee.first_name} ${employee.last_name}`,
            message: error.message
          });
        }
      }

      // Refresh
      await queryClient.invalidateQueries({ queryKey: ['shifts'] });

      setSummary(results);

      if (results.errors.length === 0) {
        toast.success(
          `✅ ${results.shiftsCreated} shift(s) créé(s) pour ${results.processed} employé(s)`
        );
      } else {
        toast.warning(
          `⚠️ ${results.shiftsCreated} shifts créés, ${results.errors.length} erreur(s)`
        );
      }
    } catch (error) {
      toast.error('Erreur lors de l\'application : ' + error.message);
      results.errors.push({ message: error.message });
      setSummary(results);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-orange-600 flex items-center gap-2">
            ⚡ Appliquer tous les plannings types
          </DialogTitle>
        </DialogHeader>

        {!summary ? (
          <div className="space-y-4">
            <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-blue-900 text-sm mb-1">
                  Application automatique des plannings types
                </p>
                <ul className="text-xs text-blue-800 space-y-1">
                  <li>✓ Seuls les employés avec EXACTEMENT 1 planning type seront remplis</li>
                  <li>✓ Les employés sans planning type ou avec plusieurs seront ignorés</li>
                  <li>✓ Aucun shift existant ne sera supprimé</li>
                  <li>✓ Les doublons ne seront pas créés</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => onOpenChange(false)}
                variant="outline"
                className="flex-1"
                disabled={isExecuting}
              >
                Annuler
              </Button>
              <Button
                onClick={handleApplyAll}
                disabled={isExecuting}
                className="flex-1 bg-orange-600 hover:bg-orange-700"
              >
                {isExecuting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Exécution...
                  </>
                ) : (
                  '🚀 Appliquer'
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className={cn(
              "rounded-lg p-4 border-2",
              summary.errors.length === 0
                ? "bg-green-50 border-green-300"
                : "bg-yellow-50 border-yellow-300"
            )}>
              <div className="flex items-start gap-3">
                {summary.errors.length === 0 ? (
                  <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <h3 className={cn(
                    "font-bold text-sm mb-2",
                    summary.errors.length === 0 ? "text-green-900" : "text-yellow-900"
                  )}>
                    {summary.errors.length === 0 ? '✅ Succès' : '⚠️ Terminé avec avertissements'}
                  </h3>

                  <div className={cn(
                    "space-y-1 text-xs",
                    summary.errors.length === 0 ? "text-green-800" : "text-yellow-800"
                  )}>
                    <p>📊 <strong>{summary.shiftsCreated} shift(s)</strong> créé(s)</p>
                    <p>✅ <strong>{summary.processed} employé(s)</strong> traité(s)</p>
                    <p>⏭️ <strong>{summary.ignored} employé(s)</strong> ignoré(s) :</p>
                    <ul className="ml-4 space-y-0.5">
                      <li>• {summary.ignoredReasons.noTemplate} sans planning type</li>
                      <li>• {summary.ignoredReasons.multipleTemplates} avec plusieurs plannings types</li>
                    </ul>
                  </div>

                  {summary.errors.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-yellow-200">
                      <p className="font-semibold text-yellow-900 text-xs mb-2">Erreurs :</p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {summary.errors.map((err, idx) => (
                          <div key={idx} className="text-[10px] font-mono bg-red-50 p-1 rounded border border-red-200">
                            {err.employeeName || 'Erreur globale'}: {err.message}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Button
              onClick={() => {
                setSummary(null);
                onOpenChange(false);
              }}
              className="w-full bg-orange-600 hover:bg-orange-700"
            >
              Fermer
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}