import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { FileText, Download, Printer, Upload, Trash2, FileJson } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/ui/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import RegistryImportModal from '@/components/personnel/RegistryImportModal';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';

export default function RegistrePersonnel() {
  const queryClient = useQueryClient();
  const [showImport, setShowImport] = useState(false);

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: establishments = [] } = useQuery({
    queryKey: ['establishment'],
    queryFn: () => base44.entities.Establishment.list()
  });

  const { data: registryEntries = [], isLoading } = useQuery({
    queryKey: ['personnelRegistry'],
    queryFn: () => base44.entities.PersonnelRegistry.list('start_date')
  });

  // Check if user is manager/admin
  const isManager = React.useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    
    const establishment = establishments[0];
    if (!establishment?.managers) return false;
    
    return establishment.managers.some(m => m.email?.toLowerCase() === currentUser.email?.toLowerCase());
  }, [currentUser, establishments]);

  const handlePrint = () => {
    window.print();
  };

  const handleDeleteEntry = async (id) => {
    if (confirm('Êtes-vous sûr de vouloir supprimer cette ligne ?')) {
      await base44.entities.PersonnelRegistry.delete(id);
      queryClient.invalidateQueries({ queryKey: ['personnelRegistry'] });
    }
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 6;
    const contentWidth = pageWidth - margin * 2;

    const columns = [
      { header: 'N°', width: 6 },
      { header: 'Nom', width: 14 },
      { header: 'Prénom', width: 14 },
      { header: 'Date naissance', width: 16 },
      { header: 'Lieu', width: 14 },
      { header: 'Nationalité', width: 12 },
      { header: 'Sexe', width: 6 },
      { header: 'Adresse', width: 35 },
      { header: 'N° SS', width: 22 },
      { header: 'Poste', width: 16 },
      { header: 'Date embauche', width: 16 },
      { header: 'Type contrat', width: 11 },
      { header: 'Date sortie', width: 14 }
    ];

    const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);
    const scaleFactor = contentWidth / totalWidth;
    const fontSize = 7.5;
    const headerHeight = 8;
    const minRowHeight = 10;
    const lineHeight = 3.8;

    let yPosition = margin;

    // **HEADER ROW**
    doc.setFontSize(fontSize);
    doc.setFont(undefined, 'bold');
    doc.setFillColor(240, 240, 240);
    
    doc.rect(margin, yPosition, contentWidth, headerHeight, 'F');
    
    columns.forEach((col, colIndex) => {
      const colWidth = col.width * scaleFactor;
      const x = margin + columns.slice(0, colIndex).reduce((sum, c) => sum + c.width * scaleFactor, 0);
      doc.text(col.header, x + 1, yPosition + 5, { maxWidth: colWidth - 2, align: 'left' });
    });

    yPosition += headerHeight;

    // Trait épais sous le header
    doc.setLineWidth(0.6);
    doc.setDrawColor(0, 0, 0);
    doc.line(margin, yPosition, margin + contentWidth, yPosition);
    yPosition += 1;

    doc.setFont(undefined, 'normal');

    // **DATA ROWS**
    registryEntries.forEach((entry, entryIndex) => {
      const rowData = [
        (entryIndex + 1).toString(),
        entry.last_name || '',
        entry.first_name || '',
        entry.birth_date ? new Date(entry.birth_date).toLocaleDateString('fr-FR') : '',
        entry.birth_place || '',
        entry.nationality || '',
        entry.gender === 'male' ? 'H' : entry.gender === 'female' ? 'F' : '',
        entry.address || '',
        entry.social_security_number || '',
        entry.position || '',
        entry.start_date ? new Date(entry.start_date).toLocaleDateString('fr-FR') : '',
        entry.contract_type || '',
        entry.exit_date ? new Date(entry.exit_date).toLocaleDateString('fr-FR') : ''
      ];

      let maxLines = 1;
      columns.forEach((col, colIndex) => {
        const colWidth = col.width * scaleFactor - 2;
        const text = rowData[colIndex];
        const lines = doc.splitTextToSize(text, colWidth);
        maxLines = Math.max(maxLines, lines.length);
      });

      const rowHeight = Math.max(minRowHeight, lineHeight * maxLines + 2);
      const rowStartY = yPosition;

      doc.setFontSize(fontSize);
      columns.forEach((col, colIndex) => {
        const colWidth = col.width * scaleFactor;
        const x = margin + columns.slice(0, colIndex).reduce((sum, c) => sum + c.width * scaleFactor, 0);
        const text = rowData[colIndex];
        const lines = doc.splitTextToSize(text, colWidth - 2);
        
        const textHeight = lines.length * lineHeight;
        const topOffset = (rowHeight - textHeight) / 2 + 1;
        
        doc.text(text, x + 1, rowStartY + topOffset, { 
          maxWidth: colWidth - 2, 
          align: 'left',
          lineHeightFactor: 1.2
        });
      });

      yPosition += rowHeight;

      doc.setLineWidth(0.2);
      doc.setDrawColor(180, 180, 180);
      doc.line(margin, yPosition, margin + contentWidth, yPosition);
    });

    doc.save(`registre-personnel-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleDownloadCSV = () => {
    const headers = [
      'N°',
      'Nom',
      'Prénom',
      'Date de naissance',
      'Lieu de naissance',
      'Nationalité',
      'Sexe',
      'Adresse postale',
      'N° Sécurité Sociale',
      'Poste',
      'Date d\'embauche',
      'Type de contrat',
      'Date de sortie'
    ];

    const rows = registryEntries.map((entry, index) => [
      index + 1,
      entry.last_name || '',
      entry.first_name || '',
      entry.birth_date ? new Date(entry.birth_date).toLocaleDateString('fr-FR') : '',
      entry.birth_place || '',
      entry.nationality || '',
      entry.gender === 'male' ? 'H' : entry.gender === 'female' ? 'F' : '',
      entry.address || '',
      entry.social_security_number || '',
      entry.position || '',
      entry.start_date ? new Date(entry.start_date).toLocaleDateString('fr-FR') : '',
      entry.contract_type || '',
      entry.exit_date ? new Date(entry.exit_date).toLocaleDateString('fr-FR') : ''
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `registre-personnel-${new Date().toISOString().split('T')[0]}.csv`);
    link.click();
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <PageHeader
        icon={FileText}
        title="Registre Unique du Personnel"
        subtitle="Enregistrement légal de tous les employés"
        actions={
          <div className="flex gap-2">
            {isManager && (
              <>
                <Button
                  onClick={() => setShowImport(true)}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Importer
                </Button>
                <Button
                  onClick={handleDownloadPDF}
                  variant="outline"
                  className="border-gray-300 text-gray-700 hover:bg-gray-100"
                >
                  <FileJson className="w-4 h-4 mr-2" />
                  Exporter PDF
                </Button>
                <Button
                  onClick={handleDownloadCSV}
                  variant="outline"
                  className="border-gray-300 text-gray-700 hover:bg-gray-100"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Exporter CSV
                </Button>
                <Button
                  onClick={handlePrint}
                  variant="outline"
                  className="border-gray-300 text-gray-700 hover:bg-gray-100"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Imprimer
                </Button>
              </>
            )}
          </div>
        }
      />

      {registryEntries.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Aucun employé enregistré"
          description="Aucun employé n'a été ajouté au registre pour le moment"
        />
      ) : (
        <div className="bg-white border-2 border-gray-300 rounded-lg overflow-x-auto print:border-0">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-100 border-b-2 border-gray-300 print:bg-white">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 border-r border-gray-300">N°</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 border-r border-gray-300">Nom</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 border-r border-gray-300">Prénom</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 border-r border-gray-300">Date de naissance</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 border-r border-gray-300">Lieu de naissance</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 border-r border-gray-300">Nationalité</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 border-r border-gray-300">Sexe</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 border-r border-gray-300">Adresse postale</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 border-r border-gray-300">N° SS</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 border-r border-gray-300">Poste</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 border-r border-gray-300">Date embauche</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 border-r border-gray-300">Type contrat</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 border-r border-gray-300">Date de sortie</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 print:hidden">Actions</th>
              </tr>
            </thead>
            <tbody>
              {registryEntries.map((entry, index) => (
                <tr key={entry.id} className={cn(
                  "border-b border-gray-200 hover:bg-gray-50 print:hover:bg-white",
                  index % 2 === 0 && "bg-white"
                )}>
                  <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200 font-semibold">{index + 1}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200">{entry.last_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200">{entry.first_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200">
                    {entry.birth_date ? new Date(entry.birth_date).toLocaleDateString('fr-FR') : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200">{entry.birth_place || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200">{entry.nationality || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200">
                    {entry.gender === 'male' ? 'H' : entry.gender === 'female' ? 'F' : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200">{entry.address || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200 font-mono text-xs">{entry.social_security_number || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200">{entry.position || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200">
                    {entry.start_date ? new Date(entry.start_date).toLocaleDateString('fr-FR') : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200">{entry.contract_type || '-'}</td>
                  <td className={cn(
                    "px-4 py-3 text-sm border-r border-gray-200",
                    entry.exit_date ? "text-red-700 font-semibold" : "text-gray-900"
                  )}>
                    {entry.exit_date ? new Date(entry.exit_date).toLocaleDateString('fr-FR') : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400 hover:text-red-600 print:hidden transition-colors">
                    {isManager && (
                      <button
                        onClick={() => handleDeleteEntry(entry.id)}
                        className="p-1 hover:opacity-100 opacity-60"
                        title="Supprimer cette ligne"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                  </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RegistryImportModal
        open={showImport}
        onOpenChange={setShowImport}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['personnelRegistry'] });
          setShowImport(false);
        }}
      />

      <style>{`
        @media print {
          body {
            margin: 0;
            padding: 10mm;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            border: 1px solid black;
            padding: 8px;
            text-align: left;
            font-size: 11px;
          }
          th {
            background-color: #f0f0f0;
            font-weight: bold;
          }
        }
      `}</style>
    </div>
  );
}