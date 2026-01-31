import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Users, User, FileText, Download, Printer, Upload, Trash2, FileJson, DollarSign, File } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import EmployeeList from '@/components/personnel/EmployeeList';
import TeamsManager from '@/components/personnel/TeamsManager';
import RegistryImportModal from '@/components/personnel/RegistryImportModal';
import PayrollOverview from '@/components/personnel/PayrollOverview';
import PayslipsManagement from '@/components/personnel/PayslipsManagement';
import PayslipExtraction from '@/components/personnel/PayslipExtraction';
import PayrollDashboard from '@/components/personnel/PayrollDashboard';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';

export default function Equipe() {
  const [activeTab, setActiveTab] = useState('equipes');
  const [showImport, setShowImport] = useState(false);
  const queryClient = useQueryClient();

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
    queryFn: () => base44.entities.PersonnelRegistry.list('start_date'),
    enabled: activeTab === 'registre'
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

  const registryActions = isManager && (
    <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
      <Button
        onClick={() => setShowImport(true)}
        className="bg-orange-600 hover:bg-orange-700 flex-1 md:flex-none"
      >
        <Upload className="w-4 h-4 mr-2" />
        Importer
      </Button>
      <Button
        onClick={handleDownloadPDF}
        variant="outline"
        className="border-gray-300 text-gray-700 hover:bg-gray-100 flex-1 md:flex-none"
      >
        <FileJson className="w-4 h-4 mr-2" />
        <span className="hidden sm:inline">Exporter PDF</span>
        <span className="sm:hidden">PDF</span>
      </Button>
      <Button
        onClick={handleDownloadCSV}
        variant="outline"
        className="border-gray-300 text-gray-700 hover:bg-gray-100 flex-1 md:flex-none"
      >
        <Download className="w-4 h-4 mr-2" />
        <span className="hidden sm:inline">Exporter CSV</span>
        <span className="sm:hidden">CSV</span>
      </Button>
      <Button
        onClick={handlePrint}
        variant="outline"
        className="border-gray-300 text-gray-700 hover:bg-gray-100 flex-1 md:flex-none"
      >
        <Printer className="w-4 h-4 mr-2" />
        <span className="hidden sm:inline">Imprimer</span>
        <span className="sm:hidden">Imprimer</span>
      </Button>
    </div>
  );

  if (isLoading && activeTab === 'registre') {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <PageHeader
        icon={Users}
        title="Gestion du personnel"
        subtitle="Équipes, employés et registre légal"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-8">
        <TabsList className="bg-transparent border-b-2 border-gray-200 p-0 w-full flex gap-0 rounded-none overflow-x-auto">
          <TabsTrigger 
            value="equipes" 
            className="data-[state=active]:bg-transparent data-[state=active]:border-b-[3px] data-[state=active]:border-orange-600 data-[state=active]:text-orange-600 text-gray-600 hover:text-gray-900 text-xs sm:text-sm font-medium min-h-[48px] rounded-none border-b-[3px] border-transparent transition-all whitespace-nowrap"
          >
            <Users className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Équipes</span>
          </TabsTrigger>
          <TabsTrigger 
            value="personnel" 
            className="data-[state=active]:bg-transparent data-[state=active]:border-b-[3px] data-[state=active]:border-orange-600 data-[state=active]:text-orange-600 text-gray-600 hover:text-gray-900 text-xs sm:text-sm font-medium min-h-[48px] rounded-none border-b-[3px] border-transparent transition-all whitespace-nowrap"
          >
            <User className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Personnel</span>
          </TabsTrigger>
          <TabsTrigger 
            value="registre" 
            className="data-[state=active]:bg-transparent data-[state=active]:border-b-[3px] data-[state=active]:border-orange-600 data-[state=active]:text-orange-600 text-gray-600 hover:text-gray-900 text-xs sm:text-sm font-medium min-h-[48px] rounded-none border-b-[3px] border-transparent transition-all whitespace-nowrap"
          >
            <FileText className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Registre</span>
          </TabsTrigger>
          {currentUser?.role === 'admin' && (
            <>
              <TabsTrigger 
                value="masse-salariale" 
                className="data-[state=active]:bg-transparent data-[state=active]:border-b-[3px] data-[state=active]:border-orange-600 data-[state=active]:text-orange-600 text-gray-600 hover:text-gray-900 text-xs sm:text-sm font-medium min-h-[48px] rounded-none border-b-[3px] border-transparent transition-all whitespace-nowrap"
              >
                <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Masse salariale</span>
              </TabsTrigger>
              <TabsTrigger 
                value="fiches-paie" 
                className="data-[state=active]:bg-transparent data-[state=active]:border-b-[3px] data-[state=active]:border-orange-600 data-[state=active]:text-orange-600 text-gray-600 hover:text-gray-900 text-xs sm:text-sm font-medium min-h-[48px] rounded-none border-b-[3px] border-transparent transition-all whitespace-nowrap"
              >
                <File className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Fiches de paie</span>
              </TabsTrigger>
            </>
          )}
        </TabsList>
      </Tabs>

      {activeTab === 'registre' && registryActions && (
        <div className="mb-6">
          {registryActions}
        </div>
      )}

      {activeTab === 'equipes' && <TeamsManager />}
      {activeTab === 'personnel' && <EmployeeList />}
      {activeTab === 'masse-salariale' && currentUser?.role === 'admin' && <PayrollDashboard />}
      {activeTab === 'fiches-paie' && currentUser?.role === 'admin' && <PayslipExtraction />}
      {activeTab === 'registre' && (
        <>
          {registryEntries.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Aucun employé enregistré"
              description="Aucun employé n'a été ajouté au registre pour le moment"
            />
          ) : (
            <>
              <div className="hidden lg:block bg-white border-2 border-gray-300 rounded-lg overflow-x-auto print:border-0">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-100 border-b-2 border-gray-300 print:bg-white">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 border-r border-gray-300">N°</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 border-r border-gray-300">Nom</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 border-r border-gray-300">Prénom</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 border-r border-gray-300">Date naissance</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 border-r border-gray-300">Lieu</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 border-r border-gray-300">Nationalité</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 border-r border-gray-300">Sexe</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 border-r border-gray-300">Adresse</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 border-r border-gray-300">N° SS</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 border-r border-gray-300">Poste</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 border-r border-gray-300">Embauche</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 border-r border-gray-300">Type contrat</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 border-r border-gray-300">Sortie</th>
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
                        <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200 font-semibold">{entry.last_name}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200">{entry.first_name}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200">
                          {entry.birth_date ? new Date(entry.birth_date).toLocaleDateString('fr-FR') : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200">{entry.birth_place || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200">{entry.nationality || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200">
                          {entry.gender === 'male' ? 'H' : entry.gender === 'female' ? 'F' : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200 max-w-xs">{entry.address || '-'}</td>
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

              <div className="lg:hidden space-y-3">
                {registryEntries.map((entry, index) => (
                  <div key={entry.id} className="bg-white border border-gray-300 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-gray-900">{entry.last_name}</span>
                          <span className="text-gray-700">{entry.first_name}</span>
                          <span className="text-xs bg-gray-200 text-gray-800 px-2 py-1 rounded">#{index + 1}</span>
                        </div>
                        {entry.position && <p className="text-sm text-blue-700 font-medium">{entry.position}</p>}
                      </div>
                      {isManager && (
                        <button
                          onClick={() => handleDeleteEntry(entry.id)}
                          className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                          title="Supprimer cette ligne"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs font-semibold text-gray-600 uppercase">Naissance</p>
                        <p className="text-gray-900">{entry.birth_date ? new Date(entry.birth_date).toLocaleDateString('fr-FR') : '-'}</p>
                        {entry.birth_place && <p className="text-xs text-gray-700">{entry.birth_place}</p>}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-600 uppercase">Nationalité</p>
                        <p className="text-gray-900">{entry.nationality || '-'}</p>
                        {entry.gender && <p className="text-xs text-gray-700">{entry.gender === 'male' ? 'Homme' : 'Femme'}</p>}
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs font-semibold text-gray-600 uppercase">Adresse</p>
                        <p className="text-gray-900 whitespace-pre-wrap">{entry.address || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-600 uppercase">N° SS</p>
                        <p className="text-gray-900 font-mono text-xs">{entry.social_security_number || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-600 uppercase">Embauche</p>
                        <p className="text-gray-900">{entry.start_date ? new Date(entry.start_date).toLocaleDateString('fr-FR') : '-'}</p>
                      </div>
                      {entry.contract_type && (
                        <div>
                          <p className="text-xs font-semibold text-gray-600 uppercase">Type contrat</p>
                          <p className="text-gray-900">{entry.contract_type}</p>
                        </div>
                      )}
                      {entry.exit_date && (
                        <div>
                          <p className="text-xs font-semibold text-red-600 uppercase">Date sortie</p>
                          <p className="text-red-700 font-semibold">{new Date(entry.exit_date).toLocaleDateString('fr-FR')}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
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
            @page {
              size: A4 landscape;
              margin: 6mm;
            }
            @media print {
              * {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              body {
                margin: 0;
                padding: 0;
                background: white;
              }
              html {
                margin: 0;
                padding: 0;
              }
              div {
                display: none !important;
              }
              div:has(table) {
                display: block !important;
              }
              .bg-white.border-2 {
                border: none !important;
                box-shadow: none !important;
                background: white !important;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                font-size: 7.5pt;
                margin: 0;
                padding: 0;
              }
              thead {
                display: table-header-group;
              }
              th {
                background-color: #f0f0f0 !important;
                border: none;
                border-bottom: 0.6mm solid black;
                padding: 6mm 1mm;
                text-align: left;
                font-weight: bold;
                font-size: 7.5pt;
                height: 8mm;
                vertical-align: middle;
                word-wrap: break-word;
                overflow-wrap: break-word;
                white-space: normal;
              }
              td {
                border: none;
                border-bottom: 0.2mm solid #b4b4b4;
                padding: 1.5mm;
                text-align: left;
                font-size: 7.5pt;
                min-height: 10mm;
                vertical-align: middle;
                word-wrap: break-word;
                overflow-wrap: break-word;
                white-space: normal;
                line-height: 3.8mm;
              }
              tr {
                page-break-inside: avoid;
              }
              tr:last-child td {
                border-bottom: 0.6mm solid black;
              }
              .print\\:hidden {
                display: none !important;
              }
              .print\\:hover\\:bg-white {
                background-color: white !important;
              }
              .print\\:border-0 {
                border: none !important;
              }
              .print\\:bg-white {
                background-color: white !important;
              }
            }
          `}</style>
        </>
      )}
    </div>
  );
}