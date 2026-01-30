import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { 
  FileText, Upload, Search, Filter, Download, Send, 
  Eye, Edit, Trash2, CheckCircle, AlertCircle, Clock,
  FileSpreadsheet, Archive, Settings, Loader2, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PageHeader from '@/components/ui/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import InvoiceDetailModal from '@/components/invoices/InvoiceDetailModal';
import InvoiceSettingsModal from '@/components/invoices/InvoiceSettingsModal';
import { cn } from '@/lib/utils';

export default function CoffreFactures() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInvoices, setSelectedInvoices] = useState([]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => base44.entities.Invoice.list('-created_date')
  });

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const deleteInvoiceMutation = useMutation({
    mutationFn: (id) => base44.entities.Invoice.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Facture supprimée');
    }
  });

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadingFiles(true);
    let successCount = 0;
    let errorCount = 0;

    for (const file of files) {
      try {
        // Upload fichier
        const { file_url } = await base44.integrations.Core.UploadFile({ file });

        // Extraction IA + OCR
        const extractResult = await base44.functions.invoke('extractInvoiceData', {
          file_url: file_url,
          file_name: file.name
        });

        if (extractResult.data.success) {
          // Créer la facture
          await base44.entities.Invoice.create(extractResult.data.data);
          successCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        console.error('Upload error:', error);
        errorCount++;
      }
    }

    setUploadingFiles(false);
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    
    if (successCount > 0) {
      toast.success(`${successCount} facture(s) uploadée(s) et analysée(s)`);
    }
    if (errorCount > 0) {
      toast.error(`${errorCount} échec(s)`);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSendSelected = async () => {
    if (selectedInvoices.length === 0) {
      toast.error('Sélectionnez au moins une facture');
      return;
    }

    const toVerify = invoices.filter(inv => 
      selectedInvoices.includes(inv.id) && inv.status === 'a_verifier'
    );

    if (toVerify.length > 0) {
      const confirm = window.confirm(
        `${toVerify.length} facture(s) ont le statut "À vérifier".\n\nContinuer quand même ?`
      );
      if (!confirm) return;
    }

    const recipients = prompt('Email(s) destinataire(s) (séparés par des virgules) :');
    if (!recipients) return;

    const recipientsList = recipients.split(',').map(r => r.trim()).filter(Boolean);

    try {
      const result = await base44.functions.invoke('sendInvoicesToAccounting', {
        invoice_ids: selectedInvoices,
        recipients: recipientsList,
        method: 'manuel'
      });

      if (result.data.success) {
        toast.success(result.data.message);
        setSelectedInvoices([]);
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
      } else {
        toast.error(`Erreurs : ${result.data.errors.join(', ')}`);
      }
    } catch (error) {
      toast.error('Erreur lors de l\'envoi');
    }
  };

  const handleExportCSV = () => {
    const filtered = filteredInvoices;
    const headers = [
      'Date facture', 'Fournisseur', 'Description', 'Catégories', 
      'Compte comptable', 'Nature', 'HT', 'TTC', 'TVA', 
      'Statut', 'Date envoi', 'Méthode envoi'
    ];
    
    const rows = filtered.map(inv => [
      inv.invoice_date || '',
      inv.supplier_name || '',
      inv.description || '',
      (inv.categories || []).join(' | '),
      inv.accounting_account || '',
      inv.accounting_nature || '',
      inv.amount_ht || '',
      inv.amount_ttc || '',
      inv.amount_tva || '',
      inv.status || '',
      inv.sent_at ? format(new Date(inv.sent_at), 'dd/MM/yyyy HH:mm', { locale: fr }) : '',
      inv.sent_method || ''
    ]);

    const csv = [headers, ...rows].map(row => row.join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `factures_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success('Export CSV généré');
  };

  // Filtrage
  const filteredInvoices = invoices.filter(inv => {
    // Recherche dans texte, fournisseur, description, catégories, commentaires
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = !searchQuery || 
      (inv.full_text_content && inv.full_text_content.toLowerCase().includes(searchLower)) ||
      (inv.supplier_name && inv.supplier_name.toLowerCase().includes(searchLower)) ||
      (inv.description && inv.description.toLowerCase().includes(searchLower)) ||
      (inv.categories && inv.categories.some(c => c.toLowerCase().includes(searchLower))) ||
      (inv.internal_comments && inv.internal_comments.toLowerCase().includes(searchLower));

    const matchesStatus = filterStatus === 'all' || inv.status === filterStatus;
    const matchesCategory = filterCategory === 'all' || 
      (inv.categories && inv.categories.includes(filterCategory));
    
    const matchesDateStart = !dateStart || (inv.invoice_date && inv.invoice_date >= dateStart);
    const matchesDateEnd = !dateEnd || (inv.invoice_date && inv.invoice_date <= dateEnd);

    return matchesSearch && matchesStatus && matchesCategory && matchesDateStart && matchesDateEnd;
  });

  const statusConfig = {
    non_envoyee: { label: 'Non envoyée', color: 'bg-gray-100 text-gray-700', icon: Clock },
    a_verifier: { label: 'À vérifier', color: 'bg-yellow-100 text-yellow-700', icon: AlertCircle },
    envoyee: { label: 'Envoyée', color: 'bg-green-100 text-green-700', icon: CheckCircle }
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={FileText}
        title="Coffre à factures"
        subtitle="Gestion centralisée des factures fournisseurs"
        actions={
          <div className="flex gap-2 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,image/*"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFiles}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {uploadingFiles ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Upload...</>
              ) : (
                <><Upload className="w-4 h-4 mr-2" /> Uploader</>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowSettings(true)}
              className="border-gray-300"
            >
              <Settings className="w-4 h-4 mr-2" /> Paramètres
            </Button>
          </div>
        }
      />

      {/* Barre de recherche et filtres */}
      <div className="bg-white rounded-xl border border-gray-300 p-4 space-y-4">
        <div className="flex gap-3 items-center">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Rechercher (fournisseur, texte facture, commentaires...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 border-gray-300"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className="border-gray-300"
          >
            <Filter className="w-4 h-4 mr-2" />
            Filtres {showFilters && <X className="w-4 h-4 ml-2" />}
          </Button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="border-gray-300">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="non_envoyee">Non envoyée</SelectItem>
                <SelectItem value="a_verifier">À vérifier</SelectItem>
                <SelectItem value="envoyee">Envoyée</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="border-gray-300">
                <SelectValue placeholder="Catégorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes catégories</SelectItem>
                <SelectItem value="Produits alimentaires">Produits alimentaires</SelectItem>
                <SelectItem value="Carburant">Carburant</SelectItem>
                <SelectItem value="Fournitures de bureau">Fournitures de bureau</SelectItem>
                <SelectItem value="Garagiste / Entretien véhicule">Garagiste</SelectItem>
                <SelectItem value="Matériel / Équipement">Matériel</SelectItem>
                <SelectItem value="Emballages">Emballages</SelectItem>
                <SelectItem value="Télécom / Internet">Télécom</SelectItem>
                <SelectItem value="Énergie">Énergie</SelectItem>
                <SelectItem value="Divers">Divers</SelectItem>
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
              placeholder="Date début"
              className="border-gray-300"
            />

            <Input
              type="date"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
              placeholder="Date fin"
              className="border-gray-300"
            />
          </div>
        )}

        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>{filteredInvoices.length} facture(s) trouvée(s)</span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportCSV}
              className="border-gray-300"
            >
              <FileSpreadsheet className="w-4 h-4 mr-1" /> Export CSV
            </Button>
            {selectedInvoices.length > 0 && (
              <Button
                size="sm"
                onClick={handleSendSelected}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Send className="w-4 h-4 mr-1" /> Envoyer ({selectedInvoices.length})
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tableau */}
      <div className="bg-white rounded-xl border border-gray-300 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-300">
              <tr>
                <th className="p-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedInvoices.length === filteredInvoices.length && filteredInvoices.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedInvoices(filteredInvoices.map(i => i.id));
                      } else {
                        setSelectedInvoices([]);
                      }
                    }}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="p-3 text-left text-sm font-semibold text-gray-700">Date</th>
                <th className="p-3 text-left text-sm font-semibold text-gray-700">Fournisseur</th>
                <th className="p-3 text-left text-sm font-semibold text-gray-700">Description</th>
                <th className="p-3 text-left text-sm font-semibold text-gray-700">Catégories</th>
                <th className="p-3 text-right text-sm font-semibold text-gray-700">TTC</th>
                <th className="p-3 text-left text-sm font-semibold text-gray-700">Statut</th>
                <th className="p-3 text-left text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredInvoices.map(invoice => {
                const StatusIcon = statusConfig[invoice.status]?.icon || Clock;
                return (
                  <tr key={invoice.id} className="hover:bg-gray-50">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selectedInvoices.includes(invoice.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedInvoices([...selectedInvoices, invoice.id]);
                          } else {
                            setSelectedInvoices(selectedInvoices.filter(id => id !== invoice.id));
                          }
                        }}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="p-3 text-sm text-gray-900">
                      {invoice.invoice_date 
                        ? format(new Date(invoice.invoice_date), 'dd/MM/yyyy', { locale: fr })
                        : '-'}
                    </td>
                    <td className="p-3 text-sm text-gray-900 font-medium">
                      {invoice.supplier_name || '-'}
                    </td>
                    <td className="p-3 text-sm text-gray-600 max-w-xs truncate">
                      {invoice.description || '-'}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {(invoice.categories || []).slice(0, 2).map((cat, i) => (
                          <Badge key={i} className="bg-blue-100 text-blue-700 text-xs">
                            {cat}
                          </Badge>
                        ))}
                        {(invoice.categories || []).length > 2 && (
                          <Badge className="bg-gray-100 text-gray-600 text-xs">
                            +{(invoice.categories || []).length - 2}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-sm text-gray-900 font-semibold text-right">
                      {invoice.amount_ttc ? `${invoice.amount_ttc.toFixed(2)}€` : '-'}
                    </td>
                    <td className="p-3">
                      <Badge className={cn("flex items-center gap-1 w-fit", statusConfig[invoice.status]?.color)}>
                        <StatusIcon className="w-3 h-3" />
                        {statusConfig[invoice.status]?.label}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedInvoice(invoice)}
                          className="text-blue-600 hover:text-blue-700"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (confirm('Supprimer cette facture ?')) {
                              deleteInvoiceMutation.mutate(invoice.id);
                            }
                          }}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredInvoices.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>Aucune facture trouvée</p>
            </div>
          )}
        </div>
      </div>

      <InvoiceDetailModal
        open={!!selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
        invoice={selectedInvoice}
      />

      <InvoiceSettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );
}