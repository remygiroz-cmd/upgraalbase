import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Download, Save, X, Send, CheckCircle, XCircle, AlertCircle, Upload } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import SendInvoicesModal from './SendInvoicesModal';

const CATEGORIES = [
  "Produits alimentaires",
  "Carburant",
  "Fournitures de bureau",
  "Garagiste / Entretien véhicule",
  "Matériel / Équipement",
  "Emballages",
  "Télécom / Internet",
  "Énergie",
  "Divers"
];

const STATUS_LABELS = {
  non_envoyee: { label: 'Non envoyée', icon: AlertCircle, color: 'text-gray-800' },
  a_verifier: { label: 'À vérifier', icon: AlertCircle, color: 'text-yellow-800' },
  envoyee: { label: 'Envoyée', icon: CheckCircle, color: 'text-green-800' }
};

export default function InvoiceDetailModal({ invoice, onClose }) {
  const queryClient = useQueryClient();
  const [showSendModal, setShowSendModal] = useState(false);
  const [form, setForm] = useState({
    supplier: invoice.supplier || '',
    invoice_date: invoice.invoice_date || '',
    categories: invoice.categories || [],
    short_description: invoice.short_description || '',
    accounting_account: invoice.accounting_account || '',
    amount_ht: invoice.amount_ht || 0,
    amount_ttc: invoice.amount_ttc || 0,
    vat: invoice.vat || 0,
    internal_comments: invoice.internal_comments || ''
  });

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Invoice.update(invoice.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      onClose();
    }
  });

  const toggleCategory = (cat) => {
    setForm(prev => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter(c => c !== cat)
        : [...prev.categories, cat]
    }));
  };

  const handleSave = () => {
    updateMutation.mutate({
      ...form,
      status: form.supplier && form.amount_ttc ? 'non_envoyee' : 'a_verifier'
    });
  };

  const handleDownload = async () => {
    if (!invoice.file_url) {
      toast.error('Fichier manquant — réuploader');
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
      toast.success('Téléchargement lancé');
    } catch (error) {
      toast.error('Erreur lors du téléchargement');
    }
  };

  const handleReupload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      toast.info('Upload en cours...');

      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      // Extract bucket and path
      const urlParts = file_url.split('/storage/v1/object/public/');
      let fileBucket = '';
      let filePath = '';

      if (urlParts.length > 1) {
        const pathParts = urlParts[1].split('/');
        fileBucket = pathParts[0];
        filePath = pathParts.slice(1).join('/');
      }

      await base44.entities.Invoice.update(invoice.id, {
        file_url: file_url,
        file_bucket: fileBucket,
        file_path: filePath,
        file_name: file.name,
        file_mime: file.type,
        file_size: file.size
      });

      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Fichier re-uploadé');
      onClose();
    } catch (error) {
      toast.error('Erreur lors du re-upload');
    }
  };

  const StatusIcon = STATUS_LABELS[invoice.status]?.icon;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-white border-gray-200 max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gray-900 flex items-center gap-3">
            <span>Détail facture</span>
            <Badge className={invoice.status === 'envoyee' ? 'bg-green-100 text-green-800' :
                             invoice.status === 'a_verifier' ? 'bg-yellow-100 text-yellow-800' :
                             'bg-gray-100 text-gray-800'}>
              <StatusIcon className="w-4 h-4 mr-1" />
              {STATUS_LABELS[invoice.status]?.label}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
            <div>
              <Label htmlFor="supplier" className="text-gray-900">Fournisseur *</Label>
              <Input
                id="supplier"
                value={form.supplier}
                onChange={(e) => setForm(prev => ({ ...prev, supplier: e.target.value }))}
                className="bg-white border-gray-300 text-gray-900 mt-1"
              />
            </div>

            <div>
              <Label htmlFor="invoice_date" className="text-gray-900">Date facture</Label>
              <Input
                id="invoice_date"
                type="date"
                value={form.invoice_date}
                onChange={(e) => setForm(prev => ({ ...prev, invoice_date: e.target.value }))}
                className="bg-white border-gray-300 text-gray-900 mt-1"
              />
            </div>

            <div>
              <Label className="text-gray-900 mb-2 block">Catégories</Label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                      form.categories.includes(cat)
                        ? 'bg-orange-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="short_description" className="text-gray-900">Description courte</Label>
              <Input
                id="short_description"
                value={form.short_description}
                onChange={(e) => setForm(prev => ({ ...prev, short_description: e.target.value }))}
                className="bg-white border-gray-300 text-gray-900 mt-1"
              />
            </div>

            <div>
              <Label htmlFor="accounting_account" className="text-gray-900">Compte comptable / Nature</Label>
              <Input
                id="accounting_account"
                value={form.accounting_account}
                onChange={(e) => setForm(prev => ({ ...prev, accounting_account: e.target.value }))}
                placeholder="Ex: 6063, Carburant..."
                className="bg-white border-gray-300 text-gray-900 mt-1"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="amount_ht" className="text-gray-900">HT (€)</Label>
                <Input
                  id="amount_ht"
                  type="number"
                  step="0.01"
                  value={form.amount_ht}
                  onChange={(e) => setForm(prev => ({ ...prev, amount_ht: parseFloat(e.target.value) || 0 }))}
                  className="bg-white border-gray-300 text-gray-900 mt-1"
                />
              </div>
              <div>
                <Label htmlFor="amount_ttc" className="text-gray-900">TTC (€) *</Label>
                <Input
                  id="amount_ttc"
                  type="number"
                  step="0.01"
                  value={form.amount_ttc}
                  onChange={(e) => setForm(prev => ({ ...prev, amount_ttc: parseFloat(e.target.value) || 0 }))}
                  className="bg-white border-gray-300 text-gray-900 mt-1"
                />
              </div>
              <div>
                <Label htmlFor="vat" className="text-gray-900">TVA (€)</Label>
                <Input
                  id="vat"
                  type="number"
                  step="0.01"
                  value={form.vat}
                  onChange={(e) => setForm(prev => ({ ...prev, vat: parseFloat(e.target.value) || 0 }))}
                  className="bg-white border-gray-300 text-gray-900 mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="internal_comments" className="text-gray-900">Commentaires internes</Label>
              <Textarea
                id="internal_comments"
                value={form.internal_comments}
                onChange={(e) => setForm(prev => ({ ...prev, internal_comments: e.target.value }))}
                className="bg-white border-gray-300 text-gray-900 mt-1"
                rows={3}
              />
            </div>

            {/* Historique d'envoi */}
            {invoice.send_history && invoice.send_history.length > 0 && (
              <div>
                <Label className="text-gray-900 mb-2 block">Historique d'envoi</Label>
                <div className="bg-gray-50 rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto">
                  {invoice.send_history.map((h, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        {h.success ?
                          <CheckCircle className="w-4 h-4 text-green-600" /> :
                          <XCircle className="w-4 h-4 text-red-600" />
                        }
                        <span className="text-gray-900">
                          {(h.sent_at && !isNaN(new Date(h.sent_at).getTime()))
                            ? format(new Date(h.sent_at), "dd/MM/yyyy 'à' HH:mm", { locale: fr })
                            : '-'}
                        </span>
                        <Badge className="bg-blue-100 text-blue-800 text-xs">
                          {h.method === 'manual' ? 'Manuel' : 'Auto'}
                        </Badge>
                      </div>
                      <span className="text-gray-600 text-xs">{h.recipient}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </div>

        <div className="flex justify-between items-center pt-4 border-t border-gray-200">
          <Button 
            variant="outline" 
            onClick={handleDownload}
            disabled={!invoice.file_url}
            className="border-gray-300 text-gray-900 hover:bg-gray-50"
          >
            <Download className="w-4 h-4 mr-2" />
            Télécharger
          </Button>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="border-gray-300 text-gray-900 hover:bg-gray-50">
              <X className="w-4 h-4 mr-2" />
              Fermer
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowSendModal(true)}
              className="border-blue-300 text-blue-600 hover:bg-blue-50"
            >
              <Send className="w-4 h-4 mr-2" />
              Envoyer
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700"
            >
              <Save className="w-4 h-4 mr-2" />
              Enregistrer
            </Button>
          </div>
        </div>
      </DialogContent>

      {showSendModal && (
        <SendInvoicesModal
          invoices={[invoice]}
          onClose={() => setShowSendModal(false)}
        />
      )}
    </Dialog>
  );
}