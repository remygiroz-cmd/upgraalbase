import React, { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { FileText, Download, Printer, Upload, Trash2, FileJson } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/ui/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import RegistryImportModal from '@/components/personnel/RegistryImportModal';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export default function RegistrePersonnel() {
  const queryClient = useQueryClient();
  const [showImport, setShowImport] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [swipedId, setSwipedId] = useState(null);
  const [touchStart, setTouchStart] = useState(0);

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
    queryFn: () => base44.entities.PersonnelRegistry.list('entry_order')
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.PersonnelRegistry.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personnelRegistry'] });
      toast.success('Entrée supprimée');
      setDeleteConfirm(null);
    },
    onError: () => {
      toast.error('Erreur lors de la suppression');
    }
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

  const handleTouchStart = (e) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e, entryId) => {
    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStart - touchEnd;
    
    if (diff > 50) {
      setSwipedId(entryId);
    } else if (diff < -50) {
      setSwipedId(null);
    }
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

  const handleDownloadPDF = async () => {
    const element = document.getElementById('registry-table');
    if (!element) return;

    try {
      const canvas = await html2canvas(element, {
        scale: 1,
        useCORS: true,
        allowTaint: true,
        logging: false,
        windowWidth: 1400
      });
      
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });
      
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth - 4;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 2;

      const imgData = canvas.toDataURL('image/png');
      
      pdf.addImage(imgData, 'PNG', 2, position, imgWidth, imgHeight);
      heightLeft -= (pageHeight - 4);

      while (heightLeft > 0) {
        position = heightLeft - imgHeight + 2;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 2, position, imgWidth, imgHeight);
        heightLeft -= (pageHeight - 4);
      }

      pdf.save(`registre-personnel-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      toast.error('Erreur lors de la génération du PDF');
    }
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
                  onClick={handleDownloadCSV}
                  variant="outline"
                  className="border-gray-300 text-gray-700 hover:bg-gray-100"
                >
                  <Download className="w-4 h-4 mr-2" />
                  CSV
                </Button>
                <Button
                  onClick={handleDownloadPDF}
                  variant="outline"
                  className="border-gray-300 text-gray-700 hover:bg-gray-100"
                >
                  <FileJson className="w-4 h-4 mr-2" />
                  PDF
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
        <div id="registry-table" className="bg-white border-2 border-gray-300 rounded-lg overflow-x-auto print:border-0">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-100 border-b-2 border-gray-300 print:bg-white">
                {isManager && <th className="px-2 py-3 text-center text-xs font-semibold text-gray-900 border-r border-gray-300 w-12 lg:w-auto print:hidden"></th>}
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
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900">Date de sortie</th>
              </tr>
            </thead>
            <tbody>
              {registryEntries.map((entry, index) => (
                <tr 
                  key={entry.id} 
                  onTouchStart={handleTouchStart}
                  onTouchEnd={(e) => handleTouchEnd(e, entry.id)}
                  className={cn(
                    "border-b border-gray-200 print:hover:bg-white transition-all duration-200",
                    swipedId === entry.id ? "bg-red-50" : (index % 2 === 0 ? "bg-white" : ""),
                    "hover:bg-gray-50 group"
                  )}>
                  {isManager && (
                    <td className="px-2 py-3 text-center border-r border-gray-200 print:hidden">
                      {/* Desktop - show on hover */}
                      <button
                        onClick={() => setDeleteConfirm(entry)}
                        className="hidden lg:inline-block opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-800 transition-opacity"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      
                      {/* Mobile - show when swiped */}
                      {swipedId === entry.id && (
                        <button
                          onClick={() => {
                            setDeleteConfirm(entry);
                            setSwipedId(null);
                          }}
                          className="lg:hidden text-red-600 hover:text-red-800 transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  )}
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

      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        title="Supprimer du registre"
        description={deleteConfirm ? `Supprimer ${deleteConfirm.first_name} ${deleteConfirm.last_name} du registre ? Cette action est irréversible.` : ''}
        onConfirm={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
        variant="danger"
        confirmText="Supprimer"
      />

      <style>{`
        @media print {
          * {
            margin: 0 !important;
            padding: 0 !important;
          }
          
          body, html, #__next, main, [role="main"] {
            margin: 0 !important;
            padding: 0 !important;
          }
          
          aside, nav, [class*="sidebar"], [class*="Sidebar"] {
            display: none !important;
          }
          
          body {
            padding: 1mm;
            font-size: 7px;
          }
          
          #registry-table {
            width: 100%;
            overflow: visible !important;
          }
          
          table {
            width: 100%;
            border-collapse: collapse;
            page-break-inside: auto;
            font-size: 7px;
          }
          
          thead {
            display: table-header-group;
            page-break-after: avoid;
          }
          
          tbody {
            display: table-row-group;
          }
          
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          
          th, td {
            border: 0.5px solid #000;
            padding: 1px;
            text-align: left;
            font-size: 7px;
            white-space: normal;
            word-break: break-word;
          }
          
          th {
            background-color: #e0e0e0 !important;
            font-weight: bold;
          }
          
          .print\\:hidden {
            display: none !important;
          }
          
          div[class*="PageHeader"] {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}