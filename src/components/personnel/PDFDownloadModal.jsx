import React, { useState } from 'react';
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
      // Wrapper HTML with CSS pour impression
      const fullHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: A4 portrait;
      margin: 20mm;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Calibri', 'Arial', sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #000;
      background: #fff;
    }
  </style>
</head>
<body>
  ${html}
</body>
</html>`;

      // Créer un blob HTML
      const blob = new Blob([fullHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);

      // Créer un lien de téléchargement
      const link = document.createElement('a');
      link.href = url;
      link.download = `${contractType}_${employeeName}_${new Date().toISOString().split('T')[0]}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setDownloaded(true);
      toast.success('HTML téléchargé. Ouvrez avec un navigateur et imprimez en PDF (Ctrl+P ou Cmd+P)');

      // Fermer après 3 secondes
      setTimeout(() => {
        setDownloaded(false);
        onOpenChange(false);
      }, 3000);

    } catch (error) {
      console.error('Erreur lors du téléchargement:', error);
      toast.error('Erreur lors du téléchargement');
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
                  Le contrat sera téléchargé en HTML. Ouvrez le fichier avec votre navigateur, puis appuyez sur <strong>Ctrl+P</strong> (ou <strong>Cmd+P</strong> sur Mac) pour l'imprimer en PDF au format A4 portrait.
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
                      Téléchargement...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Télécharger
                    </>
                  )}
                </Button>
              </div>
            </>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="font-semibold text-green-800">Téléchargement réussi</p>
                <p className="text-sm text-green-700">Ouvrez le fichier et imprimez en PDF (Ctrl+P)</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}