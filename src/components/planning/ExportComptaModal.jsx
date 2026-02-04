import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Send, Download, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { calculateShiftDuration } from './LegalChecks';
import { calculateDeductedHours, calculatePaidBaseHours, calculateMonthlyContractHours } from './DeductionCalculations';
import { calculateMonthlyEmployeeHours } from './OvertimeCalculations';
import { calculateMonthlyCPTotal } from './paidLeaveCalculations';

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export default function ExportComptaModal({ open, onOpenChange, monthStart, monthEnd }) {
  const [customMessage, setCustomMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const year = monthStart.getFullYear();
  const month = monthStart.getMonth() + 1;
  const monthName = MONTHS[monthStart.getMonth()];

  // Fetch settings
  const { data: settingsData = [] } = useQuery({
    queryKey: ['appSettings', 'compta_export'],
    queryFn: async () => {
      return await base44.entities.AppSettings.filter({ setting_key: 'compta_export' });
    }
  });

  const settings = settingsData[0] || {};
  const hasRequiredSettings = settings.email_compta && settings.etablissement_name && settings.responsable_name && settings.responsable_email;

  // Fetch all data
  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.filter({ is_active: true }),
    enabled: open
  });

  const { data: shifts = [] } = useQuery({
    queryKey: ['shifts', year, month],
    queryFn: async () => {
      const allShifts = await base44.entities.Shift.list();
      const firstDay = formatDate(monthStart);
      const lastDay = formatDate(monthEnd);
      return allShifts.filter(s => s.date >= firstDay && s.date <= lastDay);
    },
    enabled: open
  });

  const { data: nonShiftEvents = [] } = useQuery({
    queryKey: ['nonShiftEvents', year, month],
    queryFn: async () => {
      const allEvents = await base44.entities.NonShiftEvent.list();
      const firstDay = formatDate(monthStart);
      const lastDay = formatDate(monthEnd);
      return allEvents.filter(e => e.date >= firstDay && e.date <= lastDay);
    },
    enabled: open
  });

  const { data: nonShiftTypes = [] } = useQuery({
    queryKey: ['nonShiftTypes'],
    queryFn: async () => {
      const types = await base44.entities.NonShiftType.filter({ is_active: true });
      return types.sort((a, b) => (a.order || 0) - (b.order || 0));
    },
    enabled: open
  });

  const { data: recaps = [] } = useQuery({
    queryKey: ['monthlyRecaps', year, month],
    queryFn: async () => {
      return await base44.entities.MonthlyRecap.filter({ year, month });
    },
    enabled: open
  });

  const { data: cpPeriods = [] } = useQuery({
    queryKey: ['paidLeavePeriods', year, month],
    queryFn: async () => {
      return await base44.entities.PaidLeavePeriod.list();
    },
    enabled: open
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.filter({ is_active: true }),
    enabled: open
  });

  const { data: calculationSettings = [] } = useQuery({
    queryKey: ['appSettings', 'planning_calculation_mode'],
    queryFn: async () => {
      return await base44.entities.AppSettings.filter({ setting_key: 'planning_calculation_mode' });
    },
    enabled: open
  });

  const calculationMode = calculationSettings[0]?.planning_calculation_mode || 'disabled';

  // Calculate payroll data for all employees
  const payrollData = employees.map(employee => {
    const employeeShifts = shifts.filter(s => s.employee_id === employee.id);
    const employeeNonShifts = nonShiftEvents.filter(e => e.employee_id === employee.id);
    const employeeRecap = recaps.find(r => r.employee_id === employee.id);
    const team = teams.find(t => t.id === employee.team_id);

    // Calculate hours
    const autoTotalHours = employeeShifts.reduce((sum, shift) => sum + calculateShiftDuration(shift), 0);
    const autoMonthlyContractHours = calculateMonthlyContractHours(employee);
    const autoDeductedData = calculateDeductedHours(employee, employeeNonShifts, nonShiftTypes, monthStart, monthEnd);
    const autoPaidBaseHours = calculatePaidBaseHours(employee, employeeNonShifts, nonShiftTypes, monthStart, monthEnd);

    // Apply manual overrides
    const totalHours = employeeRecap?.manual_total_hours ?? autoTotalHours;
    const deductedHours = employeeRecap?.manual_deducted_hours ?? autoDeductedData.total;
    const paidBaseHours = employeeRecap?.manual_contract_hours 
      ? employeeRecap.manual_contract_hours 
      : Math.max(0, autoMonthlyContractHours - deductedHours);

    // Calculate overtime/complementary
    let monthlyHours = { type: 'unknown', total: totalHours };
    if (calculationMode === 'monthly') {
      monthlyHours = calculateMonthlyEmployeeHours(shifts, employee.id, monthStart, monthEnd, employee);
    }

    let overtime_25 = monthlyHours.overtime_25 || 0;
    let overtime_50 = monthlyHours.overtime_50 || 0;
    let complementary_10 = monthlyHours.complementary_10 || 0;
    let complementary_25 = monthlyHours.complementary_25 || 0;

    if (employeeRecap) {
      if (employeeRecap.manual_overtime_25 !== undefined) overtime_25 = employeeRecap.manual_overtime_25;
      if (employeeRecap.manual_overtime_50 !== undefined) overtime_50 = employeeRecap.manual_overtime_50;
      if (employeeRecap.manual_complementary_10 !== undefined) complementary_10 = employeeRecap.manual_complementary_10;
      if (employeeRecap.manual_complementary_25 !== undefined) complementary_25 = employeeRecap.manual_complementary_25;
    }

    const totalPaidHours = paidBaseHours + overtime_25 + overtime_50 + complementary_10 + complementary_25;

    // Non-shifts visible in recap
    const autoNonShiftsCounts = {};
    employeeNonShifts.forEach(ns => {
      const type = nonShiftTypes.find(t => t.id === ns.non_shift_type_id);
      if (type && type.visible_in_recap) {
        autoNonShiftsCounts[type.label] = (autoNonShiftsCounts[type.label] || 0) + 1;
      }
    });
    const nonShiftsCounts = employeeRecap?.manual_non_shifts || autoNonShiftsCounts;

    // CP days
    const autoCPDays = calculateMonthlyCPTotal(cpPeriods.filter(p => p.employee_id === employee.id), monthStart, monthEnd);
    const cpDays = employeeRecap?.manual_cp_days ?? autoCPDays;

    return {
      employee,
      team,
      contractHours: autoMonthlyContractHours,
      deductedHours,
      paidBaseHours,
      totalHours,
      overtime_25,
      overtime_50,
      complementary_10,
      complementary_25,
      totalPaidHours,
      nonShiftsCounts,
      cpDays,
      type: monthlyHours.type
    };
  });

  // Calculate totals
  const totals = payrollData.reduce((acc, data) => ({
    contractHours: acc.contractHours + data.contractHours,
    deductedHours: acc.deductedHours + data.deductedHours,
    paidBaseHours: acc.paidBaseHours + data.paidBaseHours,
    totalHours: acc.totalHours + data.totalHours,
    overtime_25: acc.overtime_25 + data.overtime_25,
    overtime_50: acc.overtime_50 + data.overtime_50,
    complementary_10: acc.complementary_10 + data.complementary_10,
    complementary_25: acc.complementary_25 + data.complementary_25,
    totalPaidHours: acc.totalPaidHours + data.totalPaidHours
  }), {
    contractHours: 0,
    deductedHours: 0,
    paidBaseHours: 0,
    totalHours: 0,
    overtime_25: 0,
    overtime_50: 0,
    complementary_10: 0,
    complementary_25: 0,
    totalPaidHours: 0
  });

  const handleDownloadPDFs = async () => {
    setIsGenerating(true);
    try {
      const response = await base44.functions.invoke('generateComptaExport', {
        year,
        month,
        monthName,
        payrollData: payrollData.map(d => ({
          employeeName: `${d.employee.first_name} ${d.employee.last_name}`,
          position: d.employee.position || '',
          team: d.team?.name || '',
          contractType: d.employee.contract_type?.toUpperCase() || '',
          workTimeType: d.employee.work_time_type === 'full_time' ? 'Temps plein' : 'Temps partiel',
          contractHours: d.contractHours,
          deductedHours: d.deductedHours,
          paidBaseHours: d.paidBaseHours,
          totalHours: d.totalHours,
          overtime_25: d.overtime_25,
          overtime_50: d.overtime_50,
          complementary_10: d.complementary_10,
          complementary_25: d.complementary_25,
          totalPaidHours: d.totalPaidHours,
          nonShifts: Object.entries(d.nonShiftsCounts).map(([label, count]) => `${label}: ${count}j`).join(', '),
          cpDays: d.cpDays
        })),
        totals,
        etablissementName: settings.etablissement_name || 'Établissement'
      });

      if (response.data.htmlRecap && response.data.htmlPlanning) {
        // Client-side PDF generation from HTML
        const generatePdfFromHtml = async (htmlContent, filename) => {
          const iframe = document.createElement('iframe');
          iframe.style.position = 'absolute';
          iframe.style.width = '0';
          iframe.style.height = '0';
          iframe.style.border = 'none';
          document.body.appendChild(iframe);

          const doc = iframe.contentWindow.document;
          doc.open();
          doc.write(htmlContent);
          doc.close();

          await new Promise(resolve => setTimeout(resolve, 500));

          iframe.contentWindow.print();
          setTimeout(() => document.body.removeChild(iframe), 1000);
        };

        await generatePdfFromHtml(response.data.htmlRecap, `Elements_paie_${monthName}_${year}.pdf`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        await generatePdfFromHtml(response.data.htmlPlanning, `Planning_${monthName}_${year}.pdf`);

        toast.success('PDFs prêts à être imprimés');
      } else if (response.data.htmlRecapUrl && response.data.htmlPlanningUrl) {
        // Open HTML files in new tabs for printing
        window.open(response.data.htmlRecapUrl, '_blank');
        await new Promise(resolve => setTimeout(resolve, 500));
        window.open(response.data.htmlPlanningUrl, '_blank');
        
        toast.success('Documents ouverts - utilisez Imprimer > Enregistrer en PDF');
      }
    } catch (error) {
      toast.error('Erreur lors de la génération : ' + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendEmail = async () => {
    if (!hasRequiredSettings) {
      toast.error('Paramètres comptabilité incomplets');
      return;
    }

    setIsSending(true);
    try {
      await base44.functions.invoke('sendComptaExport', {
        year,
        month,
        monthName,
        payrollData: payrollData.map(d => ({
          employeeName: `${d.employee.first_name} ${d.employee.last_name}`,
          position: d.employee.position || '',
          team: d.team?.name || '',
          contractType: d.employee.contract_type?.toUpperCase() || '',
          workTimeType: d.employee.work_time_type === 'full_time' ? 'Temps plein' : 'Temps partiel',
          contractHours: d.contractHours,
          deductedHours: d.deductedHours,
          paidBaseHours: d.paidBaseHours,
          totalHours: d.totalHours,
          overtime_25: d.overtime_25,
          overtime_50: d.overtime_50,
          complementary_10: d.complementary_10,
          complementary_25: d.complementary_25,
          totalPaidHours: d.totalPaidHours,
          nonShifts: Object.entries(d.nonShiftsCounts).map(([label, count]) => `${label}: ${count}j`).join(', '),
          cpDays: d.cpDays
        })),
        totals,
        settings: {
          emailCompta: settings.email_compta,
          etablissementName: settings.etablissement_name,
          responsableName: settings.responsable_name,
          responsableEmail: settings.responsable_email,
          responsableCoords: settings.responsable_coords || ''
        },
        customMessage
      });

      toast.success('Email envoyé à la comptabilité');
      onOpenChange(false);
    } catch (error) {
      toast.error('Erreur lors de l\'envoi : ' + error.message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-orange-600 flex items-center gap-2">
            <FileText className="w-6 h-6" />
            Export compta – {monthName} {year}
          </DialogTitle>
        </DialogHeader>

        {!hasRequiredSettings && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-900">
              <p className="font-semibold">Paramètres manquants</p>
              <p>Configurez les paramètres de comptabilité dans Paramètres &gt; Planning &gt; Comptabilité</p>
            </div>
          </div>
        )}

        <div className="space-y-6">
          {/* Bloc A - Récapitulatif paie */}
          <div>
            <h3 className="text-lg font-semibold mb-3 text-gray-900">📊 Récapitulatif global de paie</h3>
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold">Employé</th>
                    <th className="px-2 py-2 text-left font-semibold">Poste/Équipe</th>
                    <th className="px-2 py-2 text-left font-semibold">Contrat</th>
                    <th className="px-2 py-2 text-right font-semibold">Base contrat.</th>
                    <th className="px-2 py-2 text-right font-semibold">Décomptées</th>
                    <th className="px-2 py-2 text-right font-semibold">Base payée</th>
                    <th className="px-2 py-2 text-right font-semibold">Effectuées</th>
                    <th className="px-2 py-2 text-right font-semibold">Compl +10%</th>
                    <th className="px-2 py-2 text-right font-semibold">Compl +25%</th>
                    <th className="px-2 py-2 text-right font-semibold">Supp +25%</th>
                    <th className="px-2 py-2 text-right font-semibold">Supp +50%</th>
                    <th className="px-2 py-2 text-right font-semibold bg-blue-50">Total payé</th>
                    <th className="px-2 py-2 text-left font-semibold">Absences</th>
                    <th className="px-2 py-2 text-right font-semibold">CP</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {payrollData.map((data, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-2 py-2 font-medium">{data.employee.first_name} {data.employee.last_name}</td>
                      <td className="px-2 py-2 text-gray-600">{data.employee.position || data.team?.name || '-'}</td>
                      <td className="px-2 py-2">
                        <div>{data.employee.contract_type?.toUpperCase() || '-'}</div>
                        <div className="text-[10px] text-gray-500">
                          {data.employee.work_time_type === 'full_time' ? 'TP' : 'PT'}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right">{data.contractHours.toFixed(1)}h</td>
                      <td className="px-2 py-2 text-right text-red-600">{data.deductedHours > 0 ? `${data.deductedHours.toFixed(1)}h` : '-'}</td>
                      <td className="px-2 py-2 text-right font-semibold text-blue-900">{data.paidBaseHours.toFixed(1)}h</td>
                      <td className="px-2 py-2 text-right text-gray-600">{data.totalHours.toFixed(1)}h</td>
                      <td className="px-2 py-2 text-right">{data.complementary_10 > 0 ? `${data.complementary_10.toFixed(1)}h` : '-'}</td>
                      <td className="px-2 py-2 text-right">{data.complementary_25 > 0 ? `${data.complementary_25.toFixed(1)}h` : '-'}</td>
                      <td className="px-2 py-2 text-right">{data.overtime_25 > 0 ? `${data.overtime_25.toFixed(1)}h` : '-'}</td>
                      <td className="px-2 py-2 text-right">{data.overtime_50 > 0 ? `${data.overtime_50.toFixed(1)}h` : '-'}</td>
                      <td className="px-2 py-2 text-right font-bold bg-blue-50">{data.totalPaidHours.toFixed(1)}h</td>
                      <td className="px-2 py-2 text-[10px]">
                        {Object.keys(data.nonShiftsCounts).length > 0 ? 
                          Object.entries(data.nonShiftsCounts).map(([label, count]) => (
                            <div key={label}>{label}: {count}j</div>
                          )) : '-'}
                      </td>
                      <td className="px-2 py-2 text-right">{data.cpDays > 0 ? `${data.cpDays}j` : '-'}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-200 font-bold">
                    <td className="px-2 py-2" colSpan="3">TOTAL</td>
                    <td className="px-2 py-2 text-right">{totals.contractHours.toFixed(1)}h</td>
                    <td className="px-2 py-2 text-right text-red-600">{totals.deductedHours.toFixed(1)}h</td>
                    <td className="px-2 py-2 text-right text-blue-900">{totals.paidBaseHours.toFixed(1)}h</td>
                    <td className="px-2 py-2 text-right">{totals.totalHours.toFixed(1)}h</td>
                    <td className="px-2 py-2 text-right">{totals.complementary_10.toFixed(1)}h</td>
                    <td className="px-2 py-2 text-right">{totals.complementary_25.toFixed(1)}h</td>
                    <td className="px-2 py-2 text-right">{totals.overtime_25.toFixed(1)}h</td>
                    <td className="px-2 py-2 text-right">{totals.overtime_50.toFixed(1)}h</td>
                    <td className="px-2 py-2 text-right bg-blue-100">{totals.totalPaidHours.toFixed(1)}h</td>
                    <td colSpan="2"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Message personnalisé */}
          <div>
            <Label className="text-sm font-semibold text-gray-700">Message personnalisé (optionnel)</Label>
            <Textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Ajoutez un message personnalisé qui sera inclus dans l'email..."
              rows={3}
              className="mt-1"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              onClick={handleDownloadPDFs}
              disabled={isGenerating || isSending}
              variant="outline"
              className="flex-1"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Génération...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Télécharger les PDF
                </>
              )}
            </Button>
            <Button
              onClick={handleSendEmail}
              disabled={!hasRequiredSettings || isGenerating || isSending}
              className="flex-1 bg-orange-600 hover:bg-orange-700"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Envoi en cours...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Envoyer à la compta
                </>
              )}
            </Button>
            <Button
              onClick={() => onOpenChange(false)}
              variant="outline"
              disabled={isGenerating || isSending}
            >
              Fermer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}