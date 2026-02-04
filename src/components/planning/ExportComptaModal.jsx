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
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export default function ExportComptaModal({ open, onOpenChange, monthStart, monthEnd, holidayDates = [] }) {
  const [customMessage, setCustomMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [debugLog, setDebugLog] = useState([]);
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

    // SIMPLE PROTOCOL: Only worked hours, no complex deductions
     const autoTotalHours = employeeShifts.reduce((sum, shift) => sum + calculateShiftDuration(shift), 0);

     // Calculate monthly contract hours (simple)
     const isFullTime = employee?.work_time_type === 'full_time';
     const contractHoursWeekly = employee?.contract_hours_weekly 
       ? parseFloat(employee.contract_hours_weekly.replace(':', '.').replace(/h/g, ''))
       : (isFullTime ? 35 : 0);
     const autoMonthlyContractHours = contractHoursWeekly * 4.33;

     // Apply manual overrides
     const totalHours = employeeRecap?.manual_total_hours ?? autoTotalHours;
     const contractHours = employeeRecap?.manual_contract_hours ?? autoMonthlyContractHours;
     const deductedHours = 0; // Placeholder - not calculated yet
     const paidBaseHours = totalHours;

    // SIMPLE PROTOCOL: No overtime/complementary calculations yet
    // Base values only
    let overtime_25 = 0;
    let overtime_50 = 0;
    let complementary_10 = 0;
    let complementary_25 = 0;
    
    // Total paid = worked hours only (no majorations)
    let totalPaid = totalHours;

    // Placeholder for non-shifts and CP
     const nonShiftsCounts = employeeRecap?.manual_non_shifts || {};
     const cpDays = employeeRecap?.manual_cp_days ?? 0;
     const holidayHoursData = { count: 0, dates: [], workedHours: 0, paidBonus: 0 };

     // Total paid = worked hours (no majorations)
     const totalPaidHours = totalHours;

    return {
       employee,
       team,
       contractHours,
       deductedHours,
       paidBaseHours,
       totalHours,
       overtime_25: 0,
       overtime_50: 0,
       complementary_10: 0,
       complementary_25: 0,
       totalPaidHours,
       nonShiftsCounts,
       cpDays,
       holidayHoursData
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

  const addDebugLog = (message, data = null) => {
    const log = { time: new Date().toISOString(), message, data };
    setDebugLog(prev => [...prev, log]);
    console.log('[ExportCompta]', message, data);
  };

  const generatePDF = async () => {
    addDebugLog('📄 Début génération PDF');

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    // Configuration
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    
    // === PAGE 1: Tableau récap paie ===
    addDebugLog('📊 Génération page 1: Récap paie');

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

    // Tableau avec autoTable
    const tableData = payrollData.map(d => [
      `${d.employee.first_name} ${d.employee.last_name}`,
      d.team?.name || d.employee.position || '-',
      d.employee.contract_type?.toUpperCase() || '',
      d.contractHours.toFixed(1) + 'h',
      d.deductedHours > 0 ? d.deductedHours.toFixed(1) + 'h' : '-',
      d.paidBaseHours.toFixed(1) + 'h',
      d.totalHours.toFixed(1) + 'h',
      d.complementary_10 > 0 ? d.complementary_10.toFixed(1) + 'h' : '-',
      d.complementary_25 > 0 ? d.complementary_25.toFixed(1) + 'h' : '-',
      d.overtime_25 > 0 ? d.overtime_25.toFixed(1) + 'h' : '-',
      d.overtime_50 > 0 ? d.overtime_50.toFixed(1) + 'h' : '-',
      d.totalPaidHours.toFixed(1) + 'h',
      Object.entries(d.nonShiftsCounts).map(([label, count]) => `${label}: ${count}j`).join(', ') || '-',
      d.cpDays > 0 ? d.cpDays + 'j' : '-',
      d.holidayHoursData.count > 0 ? `${d.holidayHoursData.count}j (${d.holidayHoursData.workedHours.toFixed(1)}h)` : '-'
    ]);

    // Ligne TOTAL
    tableData.push([
      'TOTAL',
      '',
      '',
      totals.contractHours.toFixed(1) + 'h',
      totals.deductedHours.toFixed(1) + 'h',
      totals.paidBaseHours.toFixed(1) + 'h',
      totals.totalHours.toFixed(1) + 'h',
      totals.complementary_10.toFixed(1) + 'h',
      totals.complementary_25.toFixed(1) + 'h',
      totals.overtime_25.toFixed(1) + 'h',
      totals.overtime_50.toFixed(1) + 'h',
      totals.totalPaidHours.toFixed(1) + 'h',
      '',
      '',
      ''
    ]);

    doc.autoTable({
      startY: margin + 25,
      head: [[
        'Employé', 'Poste', 'Contrat', 'Base', 'Décomp.', 'Payée', 
        'Effect.', 'C+10%', 'C+25%', 'S+25%', 'S+50%', 'Total', 'Absences', 'CP', 'Fériés'
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
        fontSize: 7
      },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 25 },
        2: { cellWidth: 15 },
        3: { cellWidth: 15, halign: 'right' },
        4: { cellWidth: 15, halign: 'right', textColor: [220, 38, 38] },
        5: { cellWidth: 15, halign: 'right', fillColor: [219, 234, 254] },
        6: { cellWidth: 15, halign: 'right' },
        7: { cellWidth: 15, halign: 'right' },
        8: { cellWidth: 15, halign: 'right' },
        9: { cellWidth: 15, halign: 'right' },
        10: { cellWidth: 15, halign: 'right' },
        11: { cellWidth: 15, halign: 'right', fillColor: [219, 234, 254] },
        12: { cellWidth: 28, fontSize: 6 },
        13: { cellWidth: 12, halign: 'right' },
        14: { cellWidth: 22, halign: 'right', fontSize: 6, textColor: [147, 51, 234] }
      },
      didParseCell: (data) => {
        // Ligne TOTAL en gras
        if (data.row.index === tableData.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [229, 231, 235];
        }
      },
      margin: { left: margin, right: margin }
    });

    // Pied de page
    const finalY = doc.lastAutoTable.finalY || margin + 100;
    doc.setFontSize(7);
    doc.setTextColor(128, 128, 128);
    doc.text('Document généré automatiquement via UpGraal', pageWidth / 2, pageHeight - 5, { align: 'center' });

    // === PAGE 2: Planning ===
    addDebugLog('📅 Génération page 2: Planning');
    doc.addPage();

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(`Planning ${monthName} ${year}`, pageWidth / 2, margin + 15, { align: 'center' });

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(settings.etablissement_name || 'Établissement', pageWidth / 2, margin + 22, { align: 'center' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(128, 128, 128);
    doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, pageWidth / 2, margin + 27, { align: 'center' });

    // Récupérer les shifts et non-shifts pour le planning
    const daysInMonth = new Date(year, month, 0).getDate();
    const planningRows = [];

    // Fonction pour obtenir l'abréviation du non-shift avec debug
    const getNonShiftLabel = (nsEvent, nsType, employeeName, date) => {
      // Debug log
      addDebugLog('🔍 Résolution non-shift', { 
        employeeName, 
        date,
        nsEvent: { id: nsEvent?.id, non_shift_type_id: nsEvent?.non_shift_type_id },
        nsType: nsType ? { id: nsType.id, label: nsType.label, code: nsType.code } : null
      });

      if (!nsType) {
        console.error('❌ NonShiftType introuvable pour event:', nsEvent?.id);
        addDebugLog('❌ Type non trouvé', { eventId: nsEvent?.id });
        return '???';
      }
      
      // Priorité 1: utiliser le code explicite
      if (nsType.code) {
        addDebugLog('✅ Code utilisé', { code: nsType.code });
        return nsType.code.toUpperCase();
      }
      
      // Priorité 2: extraire des 3 premières lettres du label
      if (nsType.label) {
        const shortLabel = nsType.label.substring(0, 3).toUpperCase();
        addDebugLog('⚠️ Pas de code, utilise label', { shortLabel });
        return shortLabel;
      }
      
      // Fallback final
      addDebugLog('⚠️ Fallback utilisé');
      return '???';
    };

    // Construire les lignes du planning par employé
    for (const empData of payrollData) {
      const empShifts = shifts.filter(s => s.employee_id === empData.employee.id);
      const empNonShifts = nonShiftEvents.filter(ns => ns.employee_id === empData.employee.id);

      const row = [`${empData.employee.first_name} ${empData.employee.last_name}`];
      
      // Pour chaque jour du mois
      for (let day = 1; day <= Math.min(daysInMonth, 31); day++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayShifts = empShifts.filter(s => s.date === dateStr);
        const dayNonShifts = empNonShifts.filter(ns => ns.date === dateStr);

        if (dayShifts.length > 0 && dayNonShifts.length > 0) {
          // Les deux : shift + non-shift
          const shift = dayShifts[0];
          const ns = dayNonShifts[0];
          const nsType = nonShiftTypes.find(t => t.id === ns.non_shift_type_id);
          const nsLabel = getNonShiftLabel(ns, nsType, `${empData.employee.first_name} ${empData.employee.last_name}`, dateStr);
          row.push(`${shift.start_time}-${shift.end_time}\n${nsLabel}`);
        } else if (dayShifts.length > 0) {
          // Seulement shift
          const shift = dayShifts[0];
          row.push(`${shift.start_time}-${shift.end_time}`);
        } else if (dayNonShifts.length > 0) {
          // Seulement non-shift
          const ns = dayNonShifts[0];
          const nsType = nonShiftTypes.find(t => t.id === ns.non_shift_type_id);
          const nsLabel = getNonShiftLabel(ns, nsType, `${empData.employee.first_name} ${empData.employee.last_name}`, dateStr);
          row.push(nsLabel);
        } else {
          row.push('-');
        }
      }

      planningRows.push(row);
    }

    // En-têtes jours
    const dayHeaders = ['Employé'];
    for (let day = 1; day <= Math.min(daysInMonth, 31); day++) {
      dayHeaders.push(String(day));
    }

    doc.setTextColor(0, 0, 0);
    doc.autoTable({
      startY: margin + 35,
      head: [dayHeaders],
      body: planningRows,
      styles: {
        fontSize: 5,
        cellPadding: 1.5,
        overflow: 'linebreak'
      },
      headStyles: {
        fillColor: [243, 244, 246],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        fontSize: 6
      },
      columnStyles: {
        0: { cellWidth: 35, fontStyle: 'bold' }
      },
      margin: { left: margin, right: margin }
    });

    // Légende des codes non-shifts
    const legendY = doc.lastAutoTable.finalY + 5;
    if (legendY < pageHeight - 20) {
      // Générer la légende à partir des types utilisés ce mois
      const usedTypes = new Set();
      nonShiftEvents.forEach(ns => {
        if (ns.non_shift_type_id) usedTypes.add(ns.non_shift_type_id);
      });

      const legendItems = nonShiftTypes
        .filter(t => usedTypes.has(t.id))
        .map(t => `${t.code || t.label?.substring(0, 3).toUpperCase()} = ${t.label}`)
        .join(' · ');

      if (legendItems) {
        doc.setFontSize(7);
        doc.setTextColor(60, 60, 60);
        doc.setFont('helvetica', 'bold');
        doc.text('Légende : ', margin, legendY);
        doc.setFont('helvetica', 'normal');

        const lines = doc.splitTextToSize(legendItems, pageWidth - margin * 2 - 15);
        doc.text(lines, margin + 15, legendY);
      }
    }

    doc.setFontSize(7);
    doc.setTextColor(128, 128, 128);
    doc.text('Document généré automatiquement via UpGraal', pageWidth / 2, pageHeight - 5, { align: 'center' });

    addDebugLog('✅ PDF généré avec légende');
    return doc;
  };

  const handleDownloadPDFs = async () => {
    setIsGenerating(true);
    setError(null);
    setDebugLog([]);
    
    const startTime = Date.now();

    try {
      addDebugLog('🚀 Génération PDF', { year, month, employeeCount: payrollData.length });

      const doc = await generatePDF();

      addDebugLog('💾 Téléchargement PDF');
      doc.save(`Export_Compta_${monthName}_${year}.pdf`);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      addDebugLog(`✅ Terminé en ${elapsed}s`);

      toast.success('PDF téléchargé avec succès');

    } catch (error) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      
      addDebugLog(`❌ Erreur après ${elapsed}s`, { 
        message: error.message,
        stack: error.stack 
      });

      setError(`Erreur : ${error.message}`);
      toast.error('Échec : ' + error.message);
      console.error('ExportCompta error:', error);
    } finally {
      setIsGenerating(false);
      addDebugLog('🏁 Fin du processus');
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
      addDebugLog('📧 Génération PDF pour email');

      // Générer le PDF
      const doc = await generatePDF();
      const pdfBlob = doc.output('blob');

      // CRITICAL: Vérifier que le Blob est valide
      if (!pdfBlob || pdfBlob.size === 0) {
        throw new Error('PDF non généré ou vide (taille: 0)');
      }

      addDebugLog('✅ PDF généré', { size: pdfBlob.size, type: pdfBlob.type });

      // Convertir le Blob en File (requis pour multipart/form-data)
      const pdfFilename = `Export_Compta_${monthName}_${year}.pdf`;
      const pdfFile = new File([pdfBlob], pdfFilename, { type: 'application/pdf' });

      addDebugLog('📤 Upload PDF', { filename: pdfFilename, size: pdfFile.size });

      // Upload du PDF avec un vrai File object
      const uploadResult = await base44.integrations.Core.UploadFile({ file: pdfFile });
      
      if (!uploadResult || !uploadResult.file_url) {
        throw new Error('Upload échoué: aucune URL retournée');
      }

      const pdfUrl = uploadResult.file_url;
      addDebugLog('✅ PDF uploadé', { url: pdfUrl });

      // Envoyer l'email avec pièce jointe
      addDebugLog('📧 Envoi email');
      await base44.functions.invoke('sendComptaExport', {
        pdfUrl,
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

      addDebugLog('✅ Email envoyé');
      toast.success('Email envoyé à la comptabilité avec PDF en pièce jointe');
      onOpenChange(false);
    } catch (error) {
      addDebugLog('❌ Erreur envoi email', { 
        message: error.message,
        stack: error.stack 
      });
      setError(`Erreur envoi : ${error.message}`);
      toast.error('Erreur lors de l\'envoi : ' + error.message);
      console.error('Send email error:', error);
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
                    <th className="px-2 py-2 text-right font-semibold">Fériés</th>
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
                          <td className="px-2 py-2 text-right text-[10px]">
                            {data.holidayHoursData.count > 0 ? (
                              <div>
                                <div className="font-semibold">{data.holidayHoursData.count}j</div>
                                <div className="text-purple-700">{data.holidayHoursData.workedHours.toFixed(1)}h</div>
                              </div>
                            ) : '-'}
                          </td>
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
                    <td colSpan="3"></td>
                    </tr>
                    </tbody>
                    </table>
            </div>
          </div>

          {/* Erreur */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-red-900 text-sm">Erreur de génération</p>
                  <p className="text-red-800 text-xs mt-1">{error}</p>
                  <Button
                    onClick={() => { setError(null); handleDownloadPDFs(); }}
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

          {/* Debug mode */}
          {debugMode && debugLog.length > 0 && (
            <div className="bg-gray-900 text-gray-100 rounded-lg p-3 text-xs font-mono max-h-48 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-green-400">📋 Debug Log</span>
                <button 
                  onClick={() => setDebugLog([])}
                  className="text-gray-400 hover:text-white text-xs"
                >
                  Effacer
                </button>
              </div>
              {debugLog.map((log, idx) => (
                <div key={idx} className="mb-1 border-b border-gray-800 pb-1">
                  <span className="text-gray-500">[{new Date(log.time).toLocaleTimeString()}]</span>{' '}
                  <span>{log.message}</span>
                  {log.data && (
                    <pre className="text-gray-400 ml-4 mt-1 text-[10px]">
                      {JSON.stringify(log.data, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Message personnalisé */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-sm font-semibold text-gray-700">Message personnalisé (optionnel)</Label>
              <button
                onClick={() => setDebugMode(!debugMode)}
                className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
              >
                {debugMode ? '🔍 Debug ON' : '🔍 Debug'}
              </button>
            </div>
            <Textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Ajoutez un message personnalisé qui sera inclus dans l'email..."
              rows={3}
              className="mt-1"
            />
            <p className="text-xs text-gray-500 mt-1">
              💡 Le document PDF contient : le tableau des éléments de paie + le planning mensuel complet.
            </p>
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

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}