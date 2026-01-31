import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { FileText, Upload, Search, Filter, Download, Send, Eye, Edit2, Trash2, CheckSquare, Square, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import PageHeader from '@/components/ui/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import InvoiceDetailModal from '@/components/invoices/InvoiceDetailModal';
import InvoiceUploadModal from '@/components/invoices/InvoiceUploadModal';
import SendInvoicesModal from '@/components/invoices/SendInvoicesModal';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const STATUS_LABELS = {
  non_envoyee: { label: 'Non envoyée', color: 'bg-gray-100 text-gray-800' },
  a_verifier: { label: 'À vérifier', color: 'bg-yellow-100 text-yellow-800' },
  envoyee: { label: 'Envoyée', color: 'bg-green-100 text-green-800' }
};

export default function CoffreFactures() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [selectedInvoices, setSelectedInvoices] = useState([]);
  const [showDetail, setShowDetail] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => base44.entities.Invoice.list('-created_date', 500)
  });

  const deleteInvoiceMutation = useMutation({
    mutationFn: (id) => base44.entities.Invoice.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setSelectedInvoices([]);
    }
  });

  // Filtrage
  const filteredInvoices = invoices.filter(inv => {
    // Recherche plein texte
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = !searchQuery || 
      inv.supplier?.toLowerCase().includes(searchLower) ||
      inv.short_description?.toLowerCase().includes(searchLower) ||
      inv.internal_comments?.toLowerCase().includes(searchLower) ||
      inv.indexed_text?.toLowerCase().includes(searchLower) ||
      inv.categories?.some(c => c.toLowerCase().includes(searchLower));

    // Filtres
    const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || inv.categories?.includes(categoryFilter);
    const matchesDateRange = (!startDate || inv.invoice_date >= startDate) && 
                              (!endDate || inv.invoice_date <= endDate);
    const matchesAmount = (!minAmount || inv.amount_ttc >= parseFloat(minAmount)) &&
                          (!maxAmount || inv.amount_ttc <= parseFloat(maxAmount));

    return matchesSearch && matchesStatus && matchesCategory && matchesDateRange && matchesAmount;
  });

  const toggleSelect = (id) => {
    setSelectedInvoices(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedInvoices.length === filteredInvoices.length) {
      setSelectedInvoices([]);
    } else {
      setSelectedInvoices(filteredInvoices.map(i => i.id));
    }
  };

  const handleExport = () => {
    const headers = ['Date facture', 'Fournisseur', 'Description', 'Catégories', 'Compte', 'HT', 'TTC', 'TVA', 'Statut', 'Date envoi'];
    const rows = filteredInvoices.map(inv => [
      inv.invoice_date ? format(new Date(inv.invoice_date), 'dd/MM/yyyy') : '',
      inv.supplier || '',
      inv.short_description || '',
      (inv.categories || []).join(', '),
      inv.accounting_account || '',
      inv.amount_ht?.toFixed(2) || '',
      inv.amount_ttc?.toFixed(2) || '',
      inv.vat?.toFixed(2) || '',
      STATUS_LABELS[inv.status]?.label || '',
      inv.last_sent_at ? format(new Date(inv.last_sent_at), 'dd/MM/yyyy HH:mm') : ''
    ]);

    const csv = [headers, ...rows].map(r => r.join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `factures_export_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <PageHeader
        icon={FileText}
        title="Coffre à factures"
        subtitle="Gestion centralisée de vos factures"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="border-gray-300 text-gray-900 hover:bg-gray-50"
            >
              <Filter className="w-4 h-4 mr-2" />
              Filtres
            </Button>
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={filteredInvoices.length === 0}
              className="border-gray-300 text-gray-900 hover:bg-gray-50"
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            <Button
              onClick={() => setShowUpload(true)}
              className="bg-orange-600 hover:bg-orange-700"
            >
              <Upload className="w-4 h-4 mr-2" />
              Uploader
            </Button>
          </div>
        }
      />

      {/* Recherche */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par fournisseur, description, contenu de la facture..."
            className="pl-10 bg-white border-gray-300 text-gray-900"
          />
        </div>
      </div>

      {/* Filtres avancés */}
      {showFilters && (
        <div className="bg-white rounded-xl border-2 border-gray-300 p-4 mb-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-900 mb-2 block">Statut</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="non_envoyee">Non envoyée</SelectItem>
                  <SelectItem value="a_verifier">À vérifier</SelectItem>
                  <SelectItem value="envoyee">Envoyée</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-900 mb-2 block">Catégorie</label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  <SelectItem value="Produits alimentaires">Produits alimentaires</SelectItem>
                  <SelectItem value="Carburant">Carburant</SelectItem>
                  <SelectItem value="Fournitures de bureau">Fournitures de bureau</SelectItem>
                  <SelectItem value="Garagiste / Entretien véhicule">Garagiste / Entretien</SelectItem>
                  <SelectItem value="Matériel / Équipement">Matériel / Équipement</SelectItem>
                  <SelectItem value="Emballages">Emballages</SelectItem>
                  <SelectItem value="Télécom / Internet">Télécom / Internet</SelectItem>
                  <SelectItem value="Énergie">Énergie</SelectItem>
                  <SelectItem value="Divers">Divers</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-900 mb-2 block">Du</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-white border-gray-300 text-gray-900"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-900 mb-2 block">Au</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-white border-gray-300 text-gray-900"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-900 mb-2 block">Montant min (€)</label>
              <Input
                type="number"
                step="0.01"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                className="bg-white border-gray-300 text-gray-900"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-900 mb-2 block">Montant max (€)</label>
              <Input
                type="number"
                step="0.01"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
                className="bg-white border-gray-300 text-gray-900"
              />
            </div>
          </div>

          <Button
            variant="outline"
            onClick={() => {
              setStatusFilter('all');
              setCategoryFilter('all');
              setStartDate('');
              setEndDate('');
              setMinAmount('');
              setMaxAmount('');
            }}
            className="border-gray-300 text-gray-900 hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Réinitialiser
          </Button>
        </div>
      )}

      {/* Actions sélection */}
      {selectedInvoices.length > 0 && (
        <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4 mb-6 flex items-center justify-between">
          <span className="text-gray-900 font-medium">
            {selectedInvoices.length} facture(s) sélectionnée(s)
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setSelectedInvoices([])}
              className="border-gray-300 text-gray-900 hover:bg-gray-50"
            >
              Désélectionner
            </Button>
            <Button
              onClick={() => setShowSend(true)}
              className="bg-orange-600 hover:bg-orange-700"
            >
              <Send className="w-4 h-4 mr-2" />
              Envoyer
            </Button>
          </div>
        </div>
      )}

      {/* Tableau */}
      {filteredInvoices.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Aucune facture"
          description={searchQuery || statusFilter !== 'all' ? "Aucune facture ne correspond aux critères" : "Commencez par uploader vos factures"}
          action={
            <Button onClick={() => setShowUpload(true)} className="bg-orange-600 hover:bg-orange-700">
              <Upload className="w-4 h-4 mr-2" />
              Uploader une facture
            </Button>
          }
        />
      ) : (
        <div className="bg-white rounded-xl border-2 border-gray-300 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b-2 border-gray-200">
                <tr>
                  <th className="p-4 text-left">
                    <button onClick={toggleSelectAll} className="hover:bg-gray-200 rounded p-1">
                      {selectedInvoices.length === filteredInvoices.length ? 
                        <CheckSquare className="w-5 h-5 text-orange-600" /> :
                        <Square className="w-5 h-5 text-gray-400" />
                      }
                    </button>
                  </th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-900">Date</th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-900">Fournisseur</th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-900">Description</th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-900">Catégories</th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-900">Compte</th>
                  <th className="p-4 text-right text-sm font-semibold text-gray-900">HT</th>
                  <th className="p-4 text-right text-sm font-semibold text-gray-900">TTC</th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-900">Statut</th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredInvoices.map(invoice => (
                  <tr key={invoice.id} className="hover:bg-gray-50">
                    <td className="p-4">
                      <button onClick={() => toggleSelect(invoice.id)} className="hover:bg-gray-200 rounded p-1">
                        {selectedInvoices.includes(invoice.id) ?
                          <CheckSquare className="w-5 h-5 text-orange-600" /> :
                          <Square className="w-5 h-5 text-gray-400" />
                        }
                      </button>
                    </td>
                    <td className="p-4 text-sm text-gray-900">
                      {invoice.invoice_date ? format(new Date(invoice.invoice_date), 'dd/MM/yyyy') : '-'}
                    </td>
                    <td className="p-4 text-sm font-medium text-gray-900">{invoice.supplier || '-'}</td>
                    <td className="p-4 text-sm text-gray-700 max-w-xs truncate">{invoice.short_description || '-'}</td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {(invoice.categories || []).slice(0, 2).map((cat, idx) => (
                          <Badge key={idx} className="bg-blue-100 text-blue-800 text-xs">
                            {cat}
                          </Badge>
                        ))}
                        {(invoice.categories?.length || 0) > 2 && (
                          <Badge className="bg-gray-100 text-gray-800 text-xs">
                            +{invoice.categories.length - 2}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-sm text-gray-700">{invoice.accounting_account || '-'}</td>
                    <td className="p-4 text-sm text-gray-900 text-right font-medium">
                      {invoice.amount_ht ? `${invoice.amount_ht.toFixed(2)} €` : '-'}
                    </td>
                    <td className="p-4 text-sm text-gray-900 text-right font-bold">
                      {invoice.amount_ttc ? `${invoice.amount_ttc.toFixed(2)} €` : '-'}
                    </td>
                    <td className="p-4">
                      <Badge className={STATUS_LABELS[invoice.status]?.color}>
                        {STATUS_LABELS[invoice.status]?.label}
                      </Badge>
                      {invoice.last_sent_at && (
                        <div className="text-xs text-gray-500 mt-1">
                          {format(new Date(invoice.last_sent_at), 'dd/MM/yy HH:mm')}
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowDetail(invoice)}
                          className="border-gray-300 text-gray-900 hover:bg-gray-50"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (confirm('Supprimer cette facture ?')) {
                              deleteInvoiceMutation.mutate(invoice.id);
                            }
                          }}
                          className="border-red-300 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {showDetail && (
        <InvoiceDetailModal
          invoice={showDetail}
          onClose={() => setShowDetail(null)}
        />
      )}

      {showUpload && (
        <InvoiceUploadModal
          open={showUpload}
          onClose={() => setShowUpload(false)}
        />
      )}

      {showSend && (
        <SendInvoicesModal
          invoiceIds={selectedInvoices}
          onClose={() => {
            setShowSend(false);
            setSelectedInvoices([]);
          }}
        />
      )}
    </div>
  );
}