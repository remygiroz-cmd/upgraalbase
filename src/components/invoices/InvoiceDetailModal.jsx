import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { ExternalLink, Save, History, CheckCircle, X as XIcon, Download, Printer, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

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

export default function InvoiceDetailModal({ open, onClose, invoice }) {
  const queryClient = useQueryClient();
  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });
  const [form, setForm] = useState({});
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [previewUrl, setPreviewUrl] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [previewError, setPreviewError] = useState(false);

  useEffect(() => {
    if (invoice) {
      setForm({
        supplier_name: invoice.supplier_name || '',
        invoice_date: invoice.invoice_date || '',
        description: invoice.description || '',
        amount_ht: invoice.amount_ht || '',
        amount_ttc: invoice.amount_ttc || '',
        amount_tva: invoice.amount_tva || '',
        accounting_account: invoice.accounting_account || '',
        accounting_nature: invoice.accounting_nature || '',
        internal_comments: invoice.internal_comments || ''
      });
      setSelectedCategories(invoice.categories || []);

      // Construire les URLs pour preview et download
      const hostname = window.location.hostname;
      const pathname = window.location.pathname;
      
      // Extraire app_id
      let appId;
      if (hostname.includes('.base44.app')) {
        const match = hostname.match(/app--([^.]+)/);
        appId = match ? match[1] : pathname.split('/').filter(Boolean)[0];
      } else {
        appId = pathname.split('/').filter(Boolean)[0];
      }
      
      const previewUrlBuilt = `${window.location.origin}/api/apps/${appId}/functions/getInvoiceFile?invoice_id=${invoice.id}&mode=preview`;
      const downloadUrlBuilt = `${window.location.origin}/api/apps/${appId}/functions/downloadInvoiceFile?invoice_id=${invoice.id}`;
      
      setPreviewUrl(previewUrlBuilt);
      setDownloadUrl(downloadUrlBuilt);
      setPreviewError(false);
      
      // Logs de debug
      console.log('=== Invoice File URLs ===');
      console.log('Invoice ID:', invoice.id);
      console.log('File name:', invoice.file_name);
      console.log('Supabase URL:', invoice.file_url);
      console.log('');
      console.log('📋 TEST THESE URLS:');
      console.log('Preview (should display PDF):', previewUrlBuilt);
      console.log('Download (should download):', downloadUrlBuilt);
      console.log('========================');
    }
  }, [invoice]);

  const handlePrint = () => {
    if (!previewUrl || previewError) {
      toast.error('Aperçu indisponible');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Impossible d\'ouvrir la fenêtre d\'impression');
      return;
    }

    const isPDF = invoice.file_url.match(/\.(pdf)$/i);
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Impression - ${invoice.file_name || 'Facture'}</title>
          <style>
            body { margin: 0; padding: 0; }
            iframe { width: 100vw; height: 100vh; border: none; }
            img { max-width: 100%; height: auto; display: block; }
            #loading { 
              position: fixed; 
              top: 50%; 
              left: 50%; 
              transform: translate(-50%, -50%);
              font-family: sans-serif;
              color: #666;
            }
            @media print {
              body { margin: 0; }
              iframe, img { page-break-inside: avoid; }
              #loading { display: none; }
            }
          </style>
        </head>
        <body>
          <div id="loading">Chargement du document...</div>
          ${isPDF 
            ? `<iframe src="${previewUrl}" id="printFrame" onload="document.getElementById('loading').style.display='none'; setTimeout(() => window.print(), 1000);"></iframe>`
            : `<img src="${previewUrl}" alt="Facture" id="printImg" onload="document.getElementById('loading').style.display='none'; setTimeout(() => window.print(), 500);" onerror="document.getElementById('loading').innerText='Erreur de chargement';" />`
          }
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Invoice.update(invoice.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Facture mise à jour');
      onClose();
    }
  });

  const handleSave = () => {
    updateMutation.mutate({
      ...form,
      categories: selectedCategories
    });
  };

  const toggleCategory = (cat) => {
    if (selectedCategories.includes(cat)) {
      setSelectedCategories(selectedCategories.filter(c => c !== cat));
    } else {
      setSelectedCategories([...selectedCategories, cat]);
    }
  };

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white border-gray-200 max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gray-900 flex items-center justify-between">
            <span>Détail de la facture</span>
            <div className="flex items-center gap-2">
              {invoice.file_url && previewUrl && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handlePrint}
                    disabled={previewError}
                    className="text-gray-700 hover:text-gray-900 border-gray-300"
                    title="Imprimer"
                  >
                    <Printer className="w-4 h-4 mr-1" />
                    Imprimer
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = downloadUrl;
                      link.download = invoice.file_name || 'facture.pdf';
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="text-gray-700 hover:text-gray-900 border-gray-300"
                    title="Télécharger le fichier"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Télécharger
                  </Button>
                </>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Aperçu */}
          <div className="space-y-4">
            <div>
              <Label className="text-gray-900 font-semibold mb-2 block">
                Aperçu du fichier
              </Label>
              {previewUrl ? (
                <div className="border border-gray-300 rounded-lg overflow-hidden bg-gray-50 relative">
                  {previewError ? (
                    <div className="w-full h-96 flex flex-col items-center justify-center text-gray-500">
                      <AlertCircle className="w-12 h-12 mb-3 text-orange-500" />
                      <p className="font-medium">Aperçu indisponible</p>
                      <p className="text-sm">Le fichier ne peut pas être affiché</p>
                      <p className="text-xs mt-2 text-gray-400">Utilisez le bouton Télécharger</p>
                    </div>
                  ) : invoice.file_url.match(/\.(pdf)$/i) ? (
                    <>
                      <iframe 
                        src={previewUrl}
                        className="w-full h-96"
                        title="Aperçu PDF"
                        onLoad={(e) => {
                          // Vérifier si l'iframe a chargé du JSON au lieu du PDF
                          try {
                            const iframeDoc = e.target.contentDocument || e.target.contentWindow.document;
                            const text = iframeDoc.body.innerText;
                            if (text.includes('App not found') || text.includes('error')) {
                              console.error('Preview error:', text);
                              setPreviewError(true);
                            }
                          } catch (err) {
                            // Cross-origin, assume it's OK
                            console.log('Preview loaded (cross-origin)');
                          }
                        }}
                        onError={() => {
                          console.error('Preview iframe error');
                          setPreviewError(true);
                        }}
                      />
                    </>
                  ) : invoice.file_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                    <img 
                      src={previewUrl}
                      alt="Facture" 
                      className="w-full h-96 object-contain"
                      onError={() => {
                        console.error('Preview image error');
                        setPreviewError(true);
                      }}
                    />
                  ) : (
                    <div className="w-full h-96 flex flex-col items-center justify-center text-gray-500">
                      <ExternalLink className="w-12 h-12 mb-3" />
                      <p className="font-medium">{invoice.file_name || 'Document'}</p>
                      <p className="text-sm">Format non prévisualisable</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="border border-gray-300 rounded-lg overflow-hidden bg-gray-50 w-full h-96 flex items-center justify-center">
                  <p className="text-gray-500">Chargement...</p>
                </div>
              )}
            </div>

            {/* Historique d'envoi */}
            {invoice.send_history && invoice.send_history.length > 0 && (
              <div>
                <Label className="text-gray-900 font-semibold mb-2 flex items-center gap-2">
                  <History className="w-4 h-4" />
                  Historique d'envoi
                </Label>
                <div className="space-y-2">
                  {invoice.send_history.map((entry, i) => (
                    <div key={i} className="bg-gray-50 border border-gray-200 rounded p-3 text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        {entry.success ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <XIcon className="w-4 h-4 text-red-600" />
                        )}
                        <span className="font-medium text-gray-900">
                          {(() => {
                            try {
                              return format(new Date(entry.date), 'dd/MM/yyyy HH:mm', { locale: fr });
                            } catch {
                              return entry.date;
                            }
                          })()}
                        </span>
                        <Badge className="bg-blue-100 text-blue-700 text-xs">
                          {entry.method}
                        </Badge>
                      </div>
                      <p className="text-gray-700">À : {entry.recipient}</p>
                      {entry.error && (
                        <p className="text-red-600 text-xs mt-1">Erreur : {entry.error}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Debug info (admin only) */}
            {currentUser?.role === 'admin' && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-xs">
                <p className="font-semibold text-blue-900 mb-2">🔧 Debug Info (Admin)</p>
                <div className="space-y-1 text-blue-800 font-mono">
                  <p><strong>Bucket:</strong> {invoice.file_bucket || '❌ N/A'}</p>
                  <p><strong>Path:</strong> {invoice.file_path || '❌ N/A'}</p>
                  <p><strong>File Name:</strong> {invoice.file_name || 'N/A'}</p>
                  <p><strong>MIME:</strong> {invoice.file_mime || 'N/A'}</p>
                  <p><strong>Size:</strong> {invoice.file_size ? `${(invoice.file_size / 1024).toFixed(1)} KB` : 'N/A'}</p>
                  <p className="pt-2"><strong>Preview URL:</strong> <a href={previewUrl} target="_blank" rel="noopener" className="underline break-all text-blue-600">{previewUrl}</a></p>
                  <p><strong>Download URL:</strong> <a href={downloadUrl} target="_blank" rel="noopener" className="underline break-all text-blue-600">{downloadUrl}</a></p>
                </div>
              </div>
            )}
          </div>

          {/* Formulaire édition */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="supplier_name" className="text-gray-900">Fournisseur *</Label>
              <Input
                id="supplier_name"
                value={form.supplier_name}
                onChange={(e) => setForm({...form, supplier_name: e.target.value})}
                className="border-gray-300 mt-1"
              />
            </div>

            <div>
              <Label htmlFor="invoice_date" className="text-gray-900">Date facture</Label>
              <Input
                id="invoice_date"
                type="date"
                value={form.invoice_date}
                onChange={(e) => setForm({...form, invoice_date: e.target.value})}
                className="border-gray-300 mt-1"
              />
            </div>

            <div>
              <Label htmlFor="description" className="text-gray-900">Description courte</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) => setForm({...form, description: e.target.value})}
                className="border-gray-300 mt-1"
                placeholder="5-12 mots"
              />
            </div>

            <div>
              <Label className="text-gray-900 mb-2 block">Catégories</Label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      selectedCategories.includes(cat)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="amount_ht" className="text-gray-900">HT (€)</Label>
                <Input
                  id="amount_ht"
                  type="number"
                  step="0.01"
                  value={form.amount_ht}
                  onChange={(e) => setForm({...form, amount_ht: parseFloat(e.target.value) || ''})}
                  className="border-gray-300 mt-1"
                />
              </div>
              <div>
                <Label htmlFor="amount_ttc" className="text-gray-900">TTC (€)</Label>
                <Input
                  id="amount_ttc"
                  type="number"
                  step="0.01"
                  value={form.amount_ttc}
                  onChange={(e) => setForm({...form, amount_ttc: parseFloat(e.target.value) || ''})}
                  className="border-gray-300 mt-1"
                />
              </div>
              <div>
                <Label htmlFor="amount_tva" className="text-gray-900">TVA (€)</Label>
                <Input
                  id="amount_tva"
                  type="number"
                  step="0.01"
                  value={form.amount_tva}
                  onChange={(e) => setForm({...form, amount_tva: parseFloat(e.target.value) || ''})}
                  className="border-gray-300 mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="accounting_account" className="text-gray-900">Compte comptable</Label>
                <Input
                  id="accounting_account"
                  value={form.accounting_account}
                  onChange={(e) => setForm({...form, accounting_account: e.target.value})}
                  className="border-gray-300 mt-1"
                  placeholder="ex: 6063"
                />
              </div>
              <div>
                <Label htmlFor="accounting_nature" className="text-gray-900">Nature</Label>
                <Input
                  id="accounting_nature"
                  value={form.accounting_nature}
                  onChange={(e) => setForm({...form, accounting_nature: e.target.value})}
                  className="border-gray-300 mt-1"
                  placeholder="ex: Carburant"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="internal_comments" className="text-gray-900">Commentaires internes</Label>
              <Textarea
                id="internal_comments"
                value={form.internal_comments}
                onChange={(e) => setForm({...form, internal_comments: e.target.value})}
                className="border-gray-300 mt-1"
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={onClose} className="border-gray-300">
                Annuler
              </Button>
              <Button onClick={handleSave} disabled={updateMutation.isPending} className="bg-orange-600 hover:bg-orange-700">
                <Save className="w-4 h-4 mr-2" />
                Enregistrer
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}