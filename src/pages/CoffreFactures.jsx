import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { FileText, Upload, Search, Filter, Download, Send, Eye, Edit2, Trash2, CheckSquare, Square, RefreshCw, Loader2, Camera, Zap, Mail, Copy, Check } from 'lucide-react';
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
import AutomationManagementModal from '@/components/invoices/AutomationManagementModal';
import EmailImportLogsPanel from '@/components/invoices/EmailImportLogsPanel';
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
  const [supplierFilter, setSupplierFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [selectedInvoices, setSelectedInvoices] = useState([]);
  const [showDetail, setShowDetail] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showAutomation, setShowAutomation] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [emailCopied, setEmailCopied] = useState(false);
  const [webhookCopied, setWebhookCopied] = useState(false);
  const [showWebhookInfo, setShowWebhookInfo] = useState(false);

  const handleCopyEmail = () => {
    navigator.clipboard?.writeText('factures@factures.upgraal.com').then(() => {
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 2000);
    });
  };

  const { data: webhookInfo, isLoading: webhookLoading } = useQuery({
    queryKey: ['webhookInfo'],
    queryFn: () => base44.functions.invoke('getWebhookInfo').then(r => r.data),
    enabled: showWebhookInfo,
    staleTime: Infinity,
  });

  const handleCopyWebhook = (url) => {
    navigator.clipboard?.writeText(url).then(() => {
      setWebhookCopied(true);
      setTimeout(() => setWebhookCopied(false), 2000);
    });
  };

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
    const matchesSupplier = !supplierFilter || inv.supplier?.toLowerCase().includes(supplierFilter.toLowerCase());
    const matchesAccount = !accountFilter || inv.accounting_account?.toLowerCase().includes(accountFilter.toLowerCase());
    const matchesDateRange = (!startDate || inv.invoice_date >= startDate) && 
                              (!endDate || inv.invoice_date <= endDate);
    const matchesAmount = (!minAmount || inv.amount_ttc >= parseFloat(minAmount)) &&
                          (!maxAmount || inv.amount_ttc <= parseFloat(maxAmount));
    const matchesSource = sourceFilter === 'all' || inv.source === sourceFilter;

    return matchesSearch && matchesStatus && matchesCategory && matchesSupplier && matchesAccount && matchesDateRange && matchesAmount && matchesSource;
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
      (inv.invoice_date && !isNaN(new Date(inv.invoice_date).getTime())) 
        ? format(new Date(inv.invoice_date), 'dd/MM/yyyy') : '',
      inv.supplier || '',
      inv.short_description || '',
      (inv.categories || []).join(', '),
      inv.accounting_account || '',
      inv.amount_ht?.toFixed(2) || '',
      inv.amount_ttc?.toFixed(2) || '',
      inv.vat?.toFixed(2) || '',
      STATUS_LABELS[inv.status]?.label || '',
      (inv.last_sent_at && !isNaN(new Date(inv.last_sent_at).getTime())) 
        ? format(new Date(inv.last_sent_at), 'dd/MM/yyyy HH:mm') : ''
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
              onClick={() => setShowAutomation(true)}
              className="border-gray-300 text-gray-900 hover:bg-gray-50"
            >
              <Zap className="w-4 h-4 mr-2" />
              Automatisation
            </Button>
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
              variant="outline"
              onClick={() => setShowCapture(true)}
              className="border-gray-300 text-gray-900 hover:bg-gray-50"
            >
              <Camera className="w-4 h-4 mr-2" />
              Capturer
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

      {/* Encart import email */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Mail className="w-5 h-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-blue-900">Import automatique par email</p>
              <p className="text-xs text-blue-700 mt-0.5">
                Transférez vos factures à : <span className="font-mono font-bold">factures@factures.upgraal.com</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleCopyEmail}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
            >
              {emailCopied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
              {emailCopied ? 'Copié !' : "Copier l'adresse"}
            </button>
            <button
              onClick={() => setShowWebhookInfo(!showWebhookInfo)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-white border border-purple-300 rounded-lg hover:bg-purple-50 transition-colors"
            >
              <Zap className="w-3.5 h-3.5" />
              URL Webhook Resend
            </button>
            <button
              onClick={() => setSourceFilter(sourceFilter === 'email_inbound' ? 'all' : 'email_inbound')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${sourceFilter === 'email_inbound' ? 'bg-blue-600 text-white border-blue-600' : 'text-blue-700 bg-white border-blue-300 hover:bg-blue-50'}`}
            >
              <Filter className="w-3.5 h-3.5" />
              Importées par email
            </button>
          </div>
        </div>

        {/* Panneau URL Webhook */}
        {showWebhookInfo && (
          <div className="border-t border-blue-200 pt-3 space-y-2">
            {webhookLoading ? (
              <div className="flex items-center gap-2 text-xs text-blue-600">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Chargement des URLs…
              </div>
            ) : webhookInfo ? (
              <div className="space-y-2">
                {/* Warning si pas native */}
                {!webhookInfo.isNativeBase44 && (
                  <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-300 rounded-lg p-2 text-xs text-yellow-800">
                    <span className="text-base leading-none">⚠️</span>
                    <span><strong>BASE44_APP_URL</strong> ({webhookInfo.base44AppUrl}) n'est pas une URL native Base44 (*.base44.app). Utilisez l'URL native ci-dessous.</span>
                  </div>
                )}

                {/* URL Base44 native */}
                {webhookInfo.nativeUrl && (
                  <div className="bg-white border border-blue-200 rounded-lg p-2.5 space-y-1">
                    <p className="text-xs font-medium text-gray-600">URL Base44 native :</p>
                    <div className="flex items-center gap-2">
                      <code className="text-xs text-gray-800 font-mono bg-gray-50 px-2 py-1 rounded flex-1 break-all">{webhookInfo.nativeUrl}</code>
                    </div>
                  </div>
                )}

                {/* URL Webhook complète */}
                {webhookInfo.webhookUrl && (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-2.5 space-y-1">
                    <p className="text-xs font-medium text-purple-700">🔗 URL Webhook à coller dans Resend :</p>
                    <div className="flex items-center gap-2">
                      <code className="text-xs text-purple-900 font-mono bg-white px-2 py-1 rounded flex-1 break-all border border-purple-200">{webhookInfo.webhookUrl}</code>
                      <button
                        onClick={() => handleCopyWebhook(webhookInfo.webhookUrl)}
                        className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-purple-700 bg-white border border-purple-300 rounded-lg hover:bg-purple-50 transition-colors"
                      >
                        {webhookCopied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                        {webhookCopied ? 'Copié !' : 'Copier'}
                      </button>
                    </div>
                  </div>
                )}

                {!webhookInfo.nativeUrl && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">
                    Impossible de déduire l'URL native. Vérifiez le secret <strong>BASE44_APP_URL</strong> dans les paramètres.
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Recherche */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher un mot dans le contenu des factures (ex: intervention, réparation...)"
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
              <label className="text-sm font-medium text-gray-900 mb-2 block">Fournisseur</label>
              <Input
                type="text"
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
                placeholder="Nom du fournisseur"
                className="bg-white border-gray-300 text-gray-900"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-900 mb-2 block">Compte</label>
              <Input
                type="text"
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
                placeholder="Compte comptable"
                className="bg-white border-gray-300 text-gray-900"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-900 mb-2 block">Date facture (Du)</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-white border-gray-300 text-gray-900"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-900 mb-2 block">Date facture (Au)</label>
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
                placeholder="0.00"
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
                placeholder="9999.99"
                className="bg-white border-gray-300 text-gray-900"
              />
            </div>
          </div>

          <Button
            variant="outline"
            onClick={() => {
              setStatusFilter('all');
              setCategoryFilter('all');
              setSupplierFilter('');
              setAccountFilter('');
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
              variant="outline"
              onClick={async () => {
                if (confirm(`Supprimer définitivement ${selectedInvoices.length} facture(s) ?`)) {
                  try {
                    await Promise.all(selectedInvoices.map(id => base44.entities.Invoice.delete(id)));
                    queryClient.invalidateQueries({ queryKey: ['invoices'] });
                    setSelectedInvoices([]);
                  } catch (error) {
                    alert('Erreur lors de la suppression');
                  }
                }
              }}
              className="border-red-300 text-red-600 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Supprimer
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
                  <th className="p-4 text-center text-sm font-semibold text-gray-900">Taille</th>
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
                      {invoice.ai_processing ? (
                        <div className="flex items-center gap-2 text-orange-600">
                          <Loader2 className="w-4 h-4 animate-spin" />
                        </div>
                      ) : invoice.invoice_date && !isNaN(new Date(invoice.invoice_date).getTime()) ? (
                        format(new Date(invoice.invoice_date), 'dd/MM/yyyy')
                      ) : '-'}
                    </td>
                    <td className="p-4 text-sm font-medium text-gray-900">
                      {invoice.ai_processing ? (
                        <div className="flex items-center gap-2 text-orange-600">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-xs">Extraction IA...</span>
                        </div>
                      ) : (
                        invoice.supplier || '-'
                      )}
                    </td>
                    <td className="p-4 text-sm text-gray-700 max-w-xs truncate">
                      {invoice.ai_processing ? '-' : (invoice.short_description || '-')}
                    </td>
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
                      {invoice.ai_processing ? (
                        <Loader2 className="w-4 h-4 animate-spin text-orange-600 ml-auto" />
                      ) : (
                        invoice.amount_ht ? `${invoice.amount_ht.toFixed(2)} €` : '-'
                      )}
                    </td>
                    <td className="p-4 text-sm text-gray-900 text-right font-bold">
                      {invoice.ai_processing ? (
                        <Loader2 className="w-4 h-4 animate-spin text-orange-600 ml-auto" />
                      ) : (
                        invoice.amount_ttc ? `${invoice.amount_ttc.toFixed(2)} €` : '-'
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <div className="text-xs text-gray-600">
                        {invoice.optimized_size ? (
                          <div className="space-y-0.5">
                            <div className="font-medium">{(invoice.optimized_size / 1024).toFixed(0)} Ko</div>
                            {invoice.compression_applied && invoice.original_size !== invoice.optimized_size && (
                              <div className="text-green-600">
                                -{((1 - invoice.optimized_size / invoice.original_size) * 100).toFixed(0)}%
                              </div>
                            )}
                          </div>
                        ) : invoice.file_size ? (
                          <div className="font-medium">{(invoice.file_size / 1024).toFixed(0)} Ko</div>
                        ) : '-'}
                      </div>
                    </td>
                    <td className="p-4">
                      <Badge className={STATUS_LABELS[invoice.status]?.color}>
                        {STATUS_LABELS[invoice.status]?.label}
                      </Badge>
                      {invoice.last_sent_at && !isNaN(new Date(invoice.last_sent_at).getTime()) && (
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
                          onClick={async () => {
                            if (!invoice.file_url) {
                              alert('Fichier manquant — réuploader');
                              return;
                            }
                            try {
                              const response = await fetch(invoice.file_url);
                              const blob = await response.blob();
                              const url = window.URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = invoice.file_name || 'facture.pdf';
                              document.body.appendChild(a);
                              a.click();
                              window.URL.revokeObjectURL(url);
                              a.remove();
                            } catch (error) {
                              alert('Erreur lors du téléchargement');
                            }
                          }}
                          className="border-gray-300 text-gray-900 hover:bg-gray-50"
                          title="Télécharger"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowDetail(invoice)}
                          className="border-gray-300 text-gray-900 hover:bg-gray-50"
                          title="Voir le détail"
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
                          title="Supprimer"
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

      {showCapture && (
        <InvoiceUploadModal
          open={showCapture}
          onClose={() => setShowCapture(false)}
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

      {showAutomation && (
        <AutomationManagementModal
          open={showAutomation}
          onClose={() => setShowAutomation(false)}
        />
      )}
    </div>
  );
}