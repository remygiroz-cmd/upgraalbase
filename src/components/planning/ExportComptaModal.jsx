import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Send, Download, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateFR(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Construit une ligne d'export pour un employé à partir de son récap mensuel
 */
function buildExportRow(employee, recap, nonShiftTypes, cpPeriods, team, monthStart, monthEnd) {
  const monthStartStr = formatDate(monthStart);
  const monthEndStr = formatDate(monthEnd);

  // A) Employé
  const employeeName = `${employee.first_name} ${employee.last_name}`;

  // B) Poste/Équipe
  let posteEquipe = [];
  if (employee.position) posteEquipe.push(employee.position);
  if (team?.name) posteEquipe.push(team.name);
  const posteEquipeStr = posteEquipe.join(' / ') || '-';

  // 2) Payées (hors sup/comp)
  const payeesHorsSup = recap?.worked_base_hours || 0;

  // 3) Compl +10%
  const compl10 = recap?.complementary_10 || 0;

  // 4) Compl +25%
  const compl25 = recap?.complementary_25 || 0;

  // 5) Supp +25%
  const supp25 = recap?.overtime_25 || 0;

  // 6) Supp +50%
  const supp50 = recap?.overtime_50 || 0;

  // 7) Férié (jours + heures)
  const holidayEligible = recap?.holiday_eligible !== false;
  const holidayDays = recap?.holiday_days_count || 0;
  const holidayHours = recap?.holiday_hours_worked || 0;
  const ferieStr = holidayEligible && holidayDays > 0 
    ? `${holidayDays}j (${holidayHours.toFixed(1)}h)` 
    : '-';

  // 1) Total payé
  const isPartTime = employee.work_time_type === 'part_time';
  let totalPaid = payeesHorsSup;
  
  if (isPartTime) {
    totalPaid += compl10 + compl25;
  } else {
    totalPaid += supp25 + supp50;
  }
  
  if (holidayEligible) {
    totalPaid += holidayHours;
  }

  // 8) Non-shifts visibles récap
  const nonShiftsVisible = [];
  if (recap?.non_shifts_by_type) {
    Object.entries(recap.non_shifts_by_type).forEach(([typeId, typeData]) => {
      const nsType = nonShiftTypes.find(t => t.id === typeId);
      if (nsType && nsType.visible_in_recap && typeData.count > 0) {
        const dates = (typeData.dates || []).sort().map(d => {
          const dt = new Date(d + 'T00:00:00');
          return dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
        }).join(', ');
        const code = nsType.code || nsType.label?.substring(0, 3).toUpperCase();
        nonShiftsVisible.push(`${code} (${dates})`);
      }
    });
  }
  const nonShiftsStr = nonShiftsVisible.join('\n') || '-';

  // 9) CP décomptés + détails périodes
  const employeeCPPeriods = cpPeriods.filter(p => 
    p.employee_id === employee.id &&
    p.start_cp <= monthEndStr &&
    p.end_cp >= monthStartStr
  );
  
  let cpStr = '-';
  if (employeeCPPeriods.length > 0) {
    const totalCPDays = recap?.cp_days_total || 0;
    const periodDetails = employeeCPPeriods.map(p => {
      const departDate = formatDateFR(p.cp_start_date);
      const repriseDate = formatDateFR(p.return_date);
      return `(départ le ${departDate}, reprise le ${repriseDate})`;
    }).join(' ; ');
    cpStr = `${totalCPDays} CP décomptés ${periodDetails}`;
  }

  return {
    employeeName,
    posteEquipeStr,
    totalPaid,
    payeesHorsSup,
    compl10,
    compl25,
    supp25,
    supp50,
    ferieStr,
    nonShiftsStr,
    cpStr,
    employee,
    recap
  };
}

export default function ExportComptaModal({ open, onOpenChange, monthStart, monthEnd }) {
  const [customMessage, setCustomMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState(null);

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

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.filter({ is_active: true }),
    enabled: open
  });

  const { data: recaps = [] } = useQuery({
    queryKey: ['monthlyRecaps', year, month],
    queryFn: async () => {
      return await base44.entities.MonthlyRecap.filter({ year, month });
    },
    enabled: open
  });

  const { data: nonShiftTypes = [] } = useQuery({
    queryKey: ['nonShiftTypes'],
    queryFn: async () => {
      return await base44.entities.NonShiftType.filter({ is_active: true });
    },
    enabled: open
  });

  const { data: cpPeriods = [] } = useQuery({
    queryKey: ['paidLeavePeriods'],
    queryFn: async () => {
      return await base44.entities.PaidLeavePeriod.list();
    },
    enabled: open
  });

  // Build export data from recaps only
  const exportData = employees
    .map(employee => {
      const recap = recaps.find(r => r.employee_id === employee.id);
      const team = teams.find(t => t.id === employee.team_id);

      // FILTRAGE: n'inclure que si au moins 1 shift dans le mois
      const hasShifts = recap && (recap.shifts_count > 0 || (recap.worked_hours || 0) > 0);
      if (!hasShifts) return null;

      return buildExportRow(employee, recap, nonShiftTypes, cpPeriods, team, monthStart, monthEnd);
    })
    .filter(Boolean);

  // Calculate totals
  const totals = exportData.reduce((acc, row) => ({
    totalPaid: acc.totalPaid + row.totalPaid,
    payeesHorsSup: acc.payeesHorsSup + row.payeesHorsSup,
    compl10: acc.compl10 + row.compl10,
    compl25: acc.compl25 + row.compl25,
    supp25: acc.supp25 + row.supp25,
    supp50: acc.supp50 + row.supp50
  }), {
    totalPaid: 0,
    payeesHorsSup: 0,
    compl10: 0,
    compl25: 0,
    supp25: 0,
    supp50: 0
  });

  const generatePDF = async () => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    
    // En-tête
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(settings.etablissement_name || 'Établissement', margin, margin + 8);
    
    doc.setFontSize(12);
    doc.text(`Éléments pour établir les fiches de paie - ${monthName} ${year}`, margin, margin + 15);
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(128, 128, 128);
    doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, margin, margin + 20);
    doc.setTextColor(0, 0, 0);

    // Tableau
    const tableData = exportData.map(row => [
      row.employeeName,
      row.posteEquipeStr,
      row.totalPaid.toFixed(1) + 'h',
      row.payeesHorsSup.toFixed(1) + 'h',
      row.compl10 > 0 ? row.compl10.toFixed(1) + 'h' : '-',
      row.compl25 > 0 ? row.compl25.toFixed(1) + 'h' : '-',
      row.supp25 > 0 ? row.supp25.toFixed(1) + 'h' : '-',
      row.supp50 > 0 ? row.supp50.toFixed(1) + 'h' : '-',
      row.ferieStr,
      row.nonShiftsStr,
      row.cpStr
    ]);

    // Ligne TOTAL
    tableData.push([
      'TOTAL',
      '',
      totals.totalPaid.toFixed(1) + 'h',
      totals.payeesHorsSup.toFixed(1) + 'h',
      totals.compl10.toFixed(1) + 'h',
      totals.compl25.toFixed(1) + 'h',
      totals.supp25.toFixed(1) + 'h',
      totals.supp50.toFixed(1) + 'h',
      '',
      '',
      ''
    ]);

    doc.autoTable({
      startY: margin + 25,
      head: [[
        'Employé', 'Poste/Équipe', 'Total payé', 'Payées\n(hors sup/comp)', 
        'Compl\n+10%', 'Compl\n+25%', 'Supp\n+25%', 'Supp\n+50%', 
        'Férié', 'Non-shifts\nvisibles récap', 'CP décomptés'
      ]],
      body: tableData,
      styles: {
        fontSize: 7,
        cellPadding: 2,
        overflow: 'linebreak',
        halign: 'left'
      },
      headStyles: {
        fillColor: [243, 244, 246],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        fontSize: 6.5,
        minCellHeight: 8
      },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 25 },
        2: { cellWidth: 18, halign: 'right', fillColor: [219, 234, 254], fontStyle: 'bold' },
        3: { cellWidth: 18, halign: 'right' },
        4: { cellWidth: 14, halign: 'right' },
        5: { cellWidth: 14, halign: 'right' },
        6: { cellWidth: 14, halign: 'right' },
        7: { cellWidth: 14, halign: 'right' },
        8: { cellWidth: 20, halign: 'right', fontSize: 6, textColor: [147, 51, 234] },
        9: { cellWidth: 40, fontSize: 6 },
        10: { cellWidth: 50, fontSize: 6 }
      },
      didParseCell: (data) => {
        if (data.row.index === tableData.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [229, 231, 235];
        }
      },
      margin: { left: margin, right: margin }
    });

    doc.setFontSize(7);
    doc.setTextColor(128, 128, 128);
    doc.text('Document généré automatiquement via UpGraal', pageWidth / 2, pageHeight - 5, { align: 'center' });

    return doc;
  };

  const handleDownloadPDF = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const doc = await generatePDF();
      doc.save(`Export_Compta_${monthName}_${year}.pdf`);
      toast.success('PDF téléchargé avec succès');
    } catch (error) {
      setError(`Erreur : ${error.message}`);
      toast.error('Échec : ' + error.message);
      console.error('ExportCompta error:', error);
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
    setError(null);
    
    try {
      const doc = await generatePDF();
      const pdfBlob = doc.output('blob');

      if (!pdfBlob || pdfBlob.size === 0) {
        throw new Error('PDF non généré ou vide');
      }

      const pdfFilename = `Export_Compta_${monthName}_${year}.pdf`;
      const pdfFile = new File([pdfBlob], pdfFilename, { type: 'application/pdf' });

      const uploadResult = await base44.integrations.Core.UploadFile({ file: pdfFile });
      
      if (!uploadResult || !uploadResult.file_url) {
        throw new Error('Upload échoué: aucune URL retournée');
      }

      await base44.functions.invoke('sendComptaExport', {
        pdfUrl: uploadResult.file_url,
        pdfFilename,
        monthName,
        year,
        settings: {
          emailCompta: settings.email_compta,
          etablissementName: settings.etablissement_name,
          responsableName: settings.responsable_name,
          responsableEmail: settings.responsable_email,
          responsableCoords: settings.responsable_coords || ''
        },
        customMessage
      });

      toast.success('Email envoyé à la comptabilité avec PDF en pièce jointe');
      onOpenChange(false);
    } catch (error) {
      setError(`Erreur envoi : ${error.message}`);
      toast.error('Erreur lors de l\'envoi : ' + error.message);
      console.error('Send email error:', error);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
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
          {/* Tableau récapitulatif */}
          <div>
            <h3 className="text-lg font-semibold mb-3 text-gray-900">📊 Récapitulatif global de paie</h3>
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold">Employé</th>
                    <th className="px-2 py-2 text-left font-semibold">Poste/Équipe</th>
                    <th className="px-2 py-2 text-right font-semibold bg-blue-50">Total payé</th>
                    <th className="px-2 py-2 text-right font-semibold">Payées<br/>(hors sup/comp)</th>
                    <th className="px-2 py-2 text-right font-semibold">Compl<br/>+10%</th>
                    <th className="px-2 py-2 text-right font-semibold">Compl<br/>+25%</th>
                    <th className="px-2 py-2 text-right font-semibold">Supp<br/>+25%</th>
                    <th className="px-2 py-2 text-right font-semibold">Supp<br/>+50%</th>
                    <th className="px-2 py-2 text-right font-semibold">Férié</th>
                    <th className="px-2 py-2 text-left font-semibold">Non-shifts<br/>visibles récap</th>
                    <th className="px-2 py-2 text-left font-semibold">CP décomptés</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {exportData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-2 py-2 font-medium">{row.employeeName}</td>
                      <td className="px-2 py-2 text-gray-600">{row.posteEquipeStr}</td>
                      <td className="px-2 py-2 text-right font-bold bg-blue-50">{row.totalPaid.toFixed(1)}h</td>
                      <td className="px-2 py-2 text-right">{row.payeesHorsSup.toFixed(1)}h</td>
                      <td className="px-2 py-2 text-right">{row.compl10 > 0 ? `${row.compl10.toFixed(1)}h` : '-'}</td>
                      <td className="px-2 py-2 text-right">{row.compl25 > 0 ? `${row.compl25.toFixed(1)}h` : '-'}</td>
                      <td className="px-2 py-2 text-right">{row.supp25 > 0 ? `${row.supp25.toFixed(1)}h` : '-'}</td>
                      <td className="px-2 py-2 text-right">{row.supp50 > 0 ? `${row.supp50.toFixed(1)}h` : '-'}</td>
                      <td className="px-2 py-2 text-right text-[10px] text-purple-700">{row.ferieStr}</td>
                      <td className="px-2 py-2 text-[10px] whitespace-pre-line">{row.nonShiftsStr}</td>
                      <td className="px-2 py-2 text-[10px]">{row.cpStr}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-200 font-bold">
                    <td className="px-2 py-2" colSpan="2">TOTAL</td>
                    <td className="px-2 py-2 text-right bg-blue-100">{totals.totalPaid.toFixed(1)}h</td>
                    <td className="px-2 py-2 text-right">{totals.payeesHorsSup.toFixed(1)}h</td>
                    <td className="px-2 py-2 text-right">{totals.compl10.toFixed(1)}h</td>
                    <td className="px-2 py-2 text-right">{totals.compl25.toFixed(1)}h</td>
                    <td className="px-2 py-2 text-right">{totals.supp25.toFixed(1)}h</td>
                    <td className="px-2 py-2 text-right">{totals.supp50.toFixed(1)}h</td>
                    <td colSpan="3"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-red-900 text-sm">Erreur de génération</p>
                  <p className="text-red-800 text-xs mt-1">{error}</p>
                  <Button
                    onClick={() => { setError(null); handleDownloadPDF(); }}
                    size="sm"
                    variant="outline"
                    className="mt-2 border-red-300 text-red-700 hover:bg-red-100"
                  >
                    Réessayer
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div>
            <Label className="text-sm font-semibold text-gray-700">Message personnalisé (optionnel)</Label>
            <Textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Ajoutez un message personnalisé qui sera inclus dans l'email..."
              rows={3}
              className="mt-1"
            />
            <p className="text-xs text-gray-500 mt-1">
              💡 Le document PDF contient le tableau des éléments de paie calculés depuis les récaps mensuels.
            </p>
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <Button
              onClick={handleDownloadPDF}
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
                  Télécharger le PDF
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