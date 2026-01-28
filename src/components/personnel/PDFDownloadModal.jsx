import React, { useState } from 'react';
import html2pdf from 'npm:html2pdf.js@0.10.1';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Loader2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function PDFDownloadModal({ open, onOpenChange, documentId, html, contractType, employeeName }) {
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const generateAndDownloadPDF = async () => {
    if (!html) {
      toast.error('HTML non disponible');
      return;
    }

    setDownloading(true);
    try {
      // Créer un élément temporaire pour le contenu HTML
      const element = document.createElement('div');
      element.innerHTML = html;

      // Options pour html2pdf
      const options = {
        margin: [20, 20, 20, 20],
        filename: `${contractType}_${employeeName}_${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      // Générer et télécharger le PDF
      await html2pdf().set(options).from(element).save();

      setDownloaded(true);
      toast.success('PDF téléchargé avec succès');

      // Fermer après 2 secondes
      setTimeout(() => {
        setDownloaded(false);
        onOpenChange(false);
      }, 2000);

    } catch (error) {
      console.error('Erreur lors de la génération du PDF:', error);
      toast.error('Erreur lors de la génération du PDF');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white border-gray-300">
        <DialogHeader>
          <DialogTitle className="text-gray-900 flex items-center gap-2">
            <Download className="w-5 h-5 text-orange-600" />
            Télécharger le contrat
          </DialogTitle>
          <DialogDescription className="text-gray-600">
            {contractType === 'CDD' ? 'Contrat à durée déterminée' : 'Contrat à durée indéterminée'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!downloaded ? (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  Cliquez sur le bouton ci-dessous pour télécharger le PDF du contrat en format A4 portrait avec marges fixes.
                </p>
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={downloading}
                  className="border-gray-300 text-gray-900"
                >
                  Annuler
                </Button>
                <Button
                  onClick={generateAndDownloadPDF}
                  disabled={downloading}
                  className="bg-orange-600 hover:bg-orange-700 gap-2"
                >
                  {downloading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Génération en cours...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Télécharger PDF
                    </>
                  )}
                </Button>
              </div>
            </>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="font-semibold text-green-800">PDF téléchargé avec succès</p>
                <p className="text-sm text-green-700">Fermeture automatique...</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}