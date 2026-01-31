import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Users, User, FileText, Download, Printer, Upload, Trash2, FileJson } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/ui/PageHeader';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import EmployeeList from '@/components/personnel/EmployeeList';
import TeamsManager from '@/components/personnel/TeamsManager';
import RegistryImportModal from '@/components/personnel/RegistryImportModal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';

export default function Equipe() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('equipes');
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

  return (
    <div>
      <PageHeader
        icon={Users}
        title="Équipe & Shifts"
        subtitle="Gestion du personnel et planning"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-8">
        <TabsList className="bg-transparent border-b-2 border-gray-200 p-0 w-full grid grid-cols-2 sm:grid-cols-2 h-auto gap-0 rounded-none">
          <TabsTrigger 
            value="equipes" 
            className="data-[state=active]:bg-transparent data-[state=active]:border-b-[3px] data-[state=active]:border-orange-600 data-[state=active]:text-orange-600 text-gray-600 hover:text-gray-900 text-sm sm:text-base font-medium min-h-[48px] rounded-none border-b-[3px] border-transparent transition-all"
          >
            <Users className="w-5 h-5 mr-2" />
            Équipes
          </TabsTrigger>
          <TabsTrigger 
            value="personnel" 
            className="data-[state=active]:bg-transparent data-[state=active]:border-b-[3px] data-[state=active]:border-orange-600 data-[state=active]:text-orange-600 text-gray-600 hover:text-gray-900 text-sm sm:text-base font-medium min-h-[48px] rounded-none border-b-[3px] border-transparent transition-all"
          >
            <User className="w-5 h-5 mr-2" />
            Personnel
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === 'equipes' ? (
        <TeamsManager />
      ) : (
        <div>
          <div className="mb-6 flex justify-end">
            <Button
              onClick={() => setShowImport(true)}
              variant="outline"
              className="border-gray-300 text-gray-700 hover:bg-gray-100"
            >
              <FileText className="w-4 h-4 mr-2" />
              Registre du Personnel
            </Button>
          </div>
          <EmployeeList />
        </div>
      )}
    </div>
  );
}