import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function InvoiceUploadModal({ open, onClose }) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setSuccess(false);

    try {
      // 1. Upload du fichier
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      // 2. Extraction IA
      setUploading(false);
      setExtracting(true);
      
      const extractedData = await base44.functions.invoke('extractInvoiceData', {
        file_url
      });

      // 3. Nom normalisé
      const normalizedName = `${extractedData.data.invoice_date || 'XXXX-XX-XX'}__${(extractedData.data.supplier || 'FOURNISSEUR').replace(/[^a-zA-Z0-9]/g, '_')}__${(extractedData.data.amount_ttc || 0).toFixed(2)}.pdf`;

      // 4. Créer la facture
      await base44.entities.Invoice.create({
        file_url,
        file_name: file.name,
        normalized_file_name: normalizedName,
        supplier: extractedData.data.supplier,
        invoice_date: extractedData.data.invoice_date,
        categories: extractedData.data.categories || [],
        short_description: extractedData.data.short_description,
        accounting_account: extractedData.data.accounting_account,
        amount_ht: extractedData.data.amount_ht,
        amount_ttc: extractedData.data.amount_ttc,
        vat: extractedData.data.vat,
        indexed_text: extractedData.data.indexed_text,
        ai_confidence: extractedData.data.confidence,
        status: extractedData.data.status,
        send_history: []
      });

      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['invoices'] });

      setTimeout(() => {
        onClose();
      }, 1500);

    } catch (error) {
      console.error('Error uploading invoice:', error);
      alert('Erreur lors de l\'upload: ' + error.message);
      setUploading(false);
      setExtracting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white border-gray-200">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Uploader une facture</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {success ? (
            <div className="text-center py-8">
              <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
              <p className="text-lg font-semibold text-gray-900">Facture importée avec succès!</p>
              <p className="text-sm text-gray-600 mt-2">L'extraction IA a été effectuée</p>
            </div>
          ) : uploading || extracting ? (
            <div className="text-center py-8">
              <Loader2 className="w-16 h-16 text-orange-600 mx-auto mb-4 animate-spin" />
              <p className="text-lg font-semibold text-gray-900">
                {uploading ? 'Upload en cours...' : 'Extraction des données...'}
              </p>
              <p className="text-sm text-gray-600 mt-2">
                {extracting && 'L\'IA analyse la facture (cela peut prendre quelques secondes)'}
              </p>
            </div>
          ) : (
            <label className="block">
              <div className={cn(
                "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
                "border-gray-300 hover:border-orange-500 hover:bg-orange-50"
              )}>
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-lg font-medium text-gray-900 mb-2">
                  Cliquez pour uploader
                </p>
                <p className="text-sm text-gray-600">
                  PDF ou image (JPEG, PNG)
                </p>
              </div>
              <input
                type="file"
                accept=".pdf,image/*"
                onChange={handleFileUpload}
                disabled={uploading || extracting}
                className="hidden"
              />
            </label>
          )}

          {!uploading && !extracting && !success && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900 font-medium mb-2">✨ Extraction automatique</p>
              <ul className="text-xs text-blue-800 space-y-1">
                <li>• Fournisseur et date</li>
                <li>• Montants HT, TTC, TVA</li>
                <li>• Catégorie et description</li>
                <li>• Texte intégral pour recherche</li>
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}