import React, { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { FileText, Download, Printer, Upload, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/ui/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import RegistryImportModal from '@/components/personnel/RegistryImportModal';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function RegistrePersonnel() {
  const queryClient = useQueryClient();
  const [showImport, setShowImport] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

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
                {isManager && <th className="px-4 py-3 text-center text-xs font-semibold text-gray-900 border-r border-gray-300 w-12 print:hidden">Action</th>}
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
                <tr key={entry.id} className={cn(
                  "border-b border-gray-200 hover:bg-gray-50 print:hover:bg-white",
                  index % 2 === 0 && "bg-white"
                )}>
                  {isManager && (
                    <td className="px-4 py-3 text-center border-r border-gray-200 print:hidden">
                      <button
                        onClick={() => setDeleteConfirm(entry)}
                        className="text-red-600 hover:text-red-800 transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
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