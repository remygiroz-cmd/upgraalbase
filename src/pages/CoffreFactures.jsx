import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Upload, Filter, Download, Send, Trash2, FileText, 
  Search, Settings, AlertCircle, CheckCircle, Clock, Eye
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import InvoiceDetailModal from '@/components/invoices/InvoiceDetailModal';
import SendInvoiceModal from '@/components/invoices/SendInvoiceModal';
import InvoiceSettingsModal from '@/components/invoices/InvoiceSettingsModal';

const CATEGORIES = [
  'Produits alimentaires',
  'Carburant',
  'Fournitures de bureau',
  'Garagiste / Entretien véhicule',
  'Matériel / Équipement',
  'Emballages',
  'Télécom / Internet',
  'Énergie',
  'Divers'
];

export default function CoffreFactures() {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    category: 'all',
    dateFrom: '',
    dateTo: '',
    minAmount: '',
    maxAmount: ''
  });
  const [detailInvoice, setDetailInvoice] = useState(null);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => base44.entities.Invoice.list('-created_date')
  });

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      
      const extractionResponse = await base44.functions.invoke('extractInvoiceData', { 
        file_url 
      });

      const extractedData = extractionResponse.data;

      return base44.entities.Invoice.create({
        file_url,
        file_name: file.name,
        file_size: file.size,
        supplier_name: extractedData.supplier_name,
        invoice_date: extractedData.invoice_date,
        description: extractedData.description,
        categories: extractedData.categories || [],
        amount_ht: extractedData.amount_ht,
        amount_ttc: extractedData.amount_ttc,
        amount_tva: extractedData.amount_tva,
        indexed_text: extractedData.indexed_text,
        confidence_score: extractedData.confidence_score,
        status: extractedData.status || 'non_envoyee'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Facture uploadée et analysée');
    },
    onError: (error) => {
      toast.error('Erreur upload: ' + error.message);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Invoice.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setSelectedIds([]);
      toast.success('Facture supprimée');
    }
  });

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.includes('pdf') && !file.type.includes('image')) {
      toast.error('Format accepté : PDF ou image');
      return;
    }

    setUploading(true);
    try {
      await uploadMutation.mutateAsync(file);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const searchLower = filters.search.toLowerCase();
      const matchSearch = !filters.search || 
        inv.supplier_name?.toLowerCase().includes(searchLower) ||
        inv.description?.toLowerCase().includes(searchLower) ||
        inv.indexed_text?.toLowerCase().includes(searchLower) ||
        inv.internal_comments?.toLowerCase().includes(searchLower);

      const matchStatus = filters.status === 'all' || inv.status === filters.status;
      
      const matchCategory = filters.category === 'all' || 
        inv.categories?.includes(filters.category);

      const matchDateFrom = !filters.dateFrom || 
        (inv.invoice_date && inv.invoice_date >= filters.dateFrom);

      const matchDateTo = !filters.dateTo || 
        (inv.invoice_date && inv.invoice_date <= filters.dateTo);

      const matchMinAmount = !filters.minAmount || 
        (inv.amount_ttc && inv.amount_ttc >= parseFloat(filters.minAmount));

      const matchMaxAmount = !filters.maxAmount || 
        (inv.amount_ttc && inv.amount_ttc <= parseFloat(filters.maxAmount));

      return matchSearch && matchStatus && matchCategory && 
             matchDateFrom && matchDateTo && matchMinAmount && matchMaxAmount;
    });
  }, [invoices, filters]);

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(filteredInvoices.map(inv => inv.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id, checked) => {
    if (checked) {
      setSelectedIds([...selectedIds, id]);
    } else {
      setSelectedIds(selectedIds.filter(i => i !== id));
    }
  };

  const handleBulkSend = () => {
    if (selectedIds.length === 0) {
      toast.error('Sélectionnez au moins une facture');
      return;
    }
    setSendModalOpen(true);
  };

  const exportCSV = () => {
    const headers = ['Date facture', 'Fournisseur', 'Description', 'Catégories', 'HT', 'TTC', 'TVA', 'Compte', 'Nature', 'Statut', 'Date envoi'];
    const rows = filteredInvoices.map(inv => [
      inv.invoice_date || '',
      inv.supplier_name || '',
      inv.description || '',
      (inv.categories || []).join('; '),
      inv.amount_ht || '',
      inv.amount_ttc || '',
      inv.amount_tva || '',
      inv.accounting_account || '',
      inv.accounting_nature || '',
      inv.status || '',
      inv.sent_at ? format(new Date(inv.sent_at), 'dd/MM/yyyy HH:mm', { locale: fr }) : ''
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `factures_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'envoyee':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Envoyée</Badge>;
      case 'a_verifier':
        return <Badge className="bg-orange-100 text-orange-800"><AlertCircle className="w-3 h-3 mr-1" />À vérifier</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800"><Clock className="w-3 h-3 mr-1" />Non envoyée</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <FileText className="w-8 h-8 text-orange-600" />
            <h1 className="text-3xl font-bold text-gray-900">Coffre à factures</h1>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setSettingsOpen(true)}
              className="border-gray-300"
            >
              <Settings className="w-4 h-4 mr-2" />
              Paramètres
            </Button>
            <label>
              <input
                type="file"
                accept="application/pdf,image/*"
                onChange={handleFileUpload}
                className="hidden"
                disabled={uploading}
              />
              <Button
                as="span"
                disabled={uploading}
                className="bg-orange-600 hover:bg-orange-700 cursor-pointer"
              >
                <Upload className="w-4 h-4 mr-2" />
                {uploading ? 'Upload...' : 'Uploader une facture'}
              </Button>
            </label>
          </div>
        </div>

        {/* Filtres */}
        <div className="bg-white border border-gray-300 rounded-lg p-4 mb-6 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="font-semibold text-gray-900">Filtres</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Recherche..."
                value={filters.search}
                onChange={(e) => setFilters({...filters, search: e.target.value})}
                className="pl-9 border-gray-300"
              />
            </div>
            <Select value={filters.status} onValueChange={(v) => setFilters({...filters, status: v})}>
              <SelectTrigger className="border-gray-300">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                <SelectItem value="non_envoyee">Non envoyée</SelectItem>
                <SelectItem value="a_verifier">À vérifier</SelectItem>
                <SelectItem value="envoyee">Envoyée</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.category} onValueChange={(v) => setFilters({...filters, category: v})}>
              <SelectTrigger className="border-gray-300">
                <SelectValue placeholder="Catégorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes catégories</SelectItem>
                {CATEGORIES.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              placeholder="Date du"
              value={filters.dateFrom}
              onChange={(e) => setFilters({...filters, dateFrom: e.target.value})}
              className="border-gray-300"
            />
            <Input
              type="date"
              placeholder="Date au"
              value={filters.dateTo}
              onChange={(e) => setFilters({...filters, dateTo: e.target.value})}
              className="border-gray-300"
            />
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Min €"
                value={filters.minAmount}
                onChange={(e) => setFilters({...filters, minAmount: e.target.value})}
                className="border-gray-300"
              />
              <Input
                type="number"
                placeholder="Max €"
                value={filters.maxAmount}
                onChange={(e) => setFilters({...filters, maxAmount: e.target.value})}
                className="border-gray-300"
              />
            </div>
          </div>
        </div>

        {/* Actions groupées */}
        {selectedIds.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-center justify-between">
            <span className="text-sm font-medium text-blue-900">
              {selectedIds.length} facture(s) sélectionnée(s)
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleBulkSend}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Send className="w-4 h-4 mr-1" />
                Envoyer à la compta
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={exportCSV}
                className="border-gray-300"
              >
                <Download className="w-4 h-4 mr-1" />
                Export CSV
              </Button>
            </div>
          </div>
        )}

        {/* Tableau */}
        <div className="bg-white border border-gray-300 rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-300">
                <tr>
                  <th className="p-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === filteredInvoices.length && filteredInvoices.length > 0}
                      onChange={handleSelectAll}
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th className="p-3 text-left text-xs font-semibold text-gray-700 uppercase">Date</th>
                  <th className="p-3 text-left text-xs font-semibold text-gray-700 uppercase">Fournisseur</th>
                  <th className="p-3 text-left text-xs font-semibold text-gray-700 uppercase">Description</th>
                  <th className="p-3 text-left text-xs font-semibold text-gray-700 uppercase">Catégories</th>
                  <th className="p-3 text-left text-xs font-semibold text-gray-700 uppercase">HT</th>
                  <th className="p-3 text-left text-xs font-semibold text-gray-700 uppercase">TTC</th>
                  <th className="p-3 text-left text-xs font-semibold text-gray-700 uppercase">Statut</th>
                  <th className="p-3 text-left text-xs font-semibold text-gray-700 uppercase">Fichier</th>
                  <th className="p-3 text-left text-xs font-semibold text-gray-700 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan="10" className="p-6 text-center text-gray-500">
                      Chargement...
                    </td>
                  </tr>
                ) : filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="p-6 text-center text-gray-500">
                      Aucune facture trouvée
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(invoice.id)}
                          onChange={(e) => handleSelectOne(invoice.id, e.target.checked)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="p-3 text-sm text-gray-900">
                        {(() => {
                          if (!invoice.invoice_date) return '-';
                          try {
                            return format(new Date(invoice.invoice_date), 'dd/MM/yyyy', { locale: fr });
                          } catch {
                            return invoice.invoice_date;
                          }
                        })()}
                      </td>
                      <td className="p-3 text-sm font-medium text-gray-900">
                        {invoice.supplier_name || '-'}
                      </td>
                      <td className="p-3 text-sm text-gray-700">
                        {invoice.description || '-'}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {invoice.categories?.slice(0, 2).map((cat, i) => (
                            <Badge key={i} className="bg-blue-100 text-blue-700 text-xs">
                              {cat}
                            </Badge>
                          ))}
                          {invoice.categories?.length > 2 && (
                            <Badge className="bg-gray-100 text-gray-600 text-xs">
                              +{invoice.categories.length - 2}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-sm text-gray-900">
                        {invoice.amount_ht ? `${invoice.amount_ht.toFixed(2)} €` : '-'}
                      </td>
                      <td className="p-3 text-sm font-semibold text-gray-900">
                        {invoice.amount_ttc ? `${invoice.amount_ttc.toFixed(2)} €` : '-'}
                      </td>
                      <td className="p-3">
                        {getStatusBadge(invoice.status)}
                      </td>
                      <td className="p-3">
                        <a
                          href={invoice.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
                        >
                          <FileText className="w-4 h-4" />
                          {invoice.file_name?.substring(0, 15)}...
                        </a>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDetailInvoice(invoice)}
                            className="text-gray-600 hover:text-gray-900"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedIds([invoice.id]);
                              setSendModalOpen(true);
                            }}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            <Send className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (confirm('Supprimer cette facture ?')) {
                                deleteMutation.mutate(invoice.id);
                              }
                            }}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white border border-gray-300 rounded-lg p-4">
            <div className="text-sm text-gray-600">Total factures</div>
            <div className="text-2xl font-bold text-gray-900">{filteredInvoices.length}</div>
          </div>
          <div className="bg-white border border-gray-300 rounded-lg p-4">
            <div className="text-sm text-gray-600">Non envoyées</div>
            <div className="text-2xl font-bold text-gray-900">
              {filteredInvoices.filter(i => i.status === 'non_envoyee').length}
            </div>
          </div>
          <div className="bg-white border border-gray-300 rounded-lg p-4">
            <div className="text-sm text-gray-600">À vérifier</div>
            <div className="text-2xl font-bold text-orange-600">
              {filteredInvoices.filter(i => i.status === 'a_verifier').length}
            </div>
          </div>
          <div className="bg-white border border-gray-300 rounded-lg p-4">
            <div className="text-sm text-gray-600">Total TTC</div>
            <div className="text-2xl font-bold text-green-600">
              {filteredInvoices.reduce((sum, i) => sum + (i.amount_ttc || 0), 0).toFixed(2)} €
            </div>
          </div>
        </div>
      </div>

      {detailInvoice && (
        <InvoiceDetailModal
          open={!!detailInvoice}
          onClose={() => setDetailInvoice(null)}
          invoice={detailInvoice}
        />
      )}

      {sendModalOpen && (
        <SendInvoiceModal
          open={sendModalOpen}
          onClose={() => {
            setSendModalOpen(false);
            setSelectedIds([]);
          }}
          invoiceIds={selectedIds}
        />
      )}

      {settingsOpen && (
        <InvoiceSettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}