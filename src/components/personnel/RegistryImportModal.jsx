import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Upload, AlertCircle, CheckCircle } from 'lucide-react';

export default function RegistryImportModal({ open, onOpenChange, onSuccess }) {
  const [data, setData] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  const handleImport = async () => {
    if (!data.trim()) {
      toast.error('Veuillez coller les données');
      return;
    }

    setImporting(true);
    try {
      const response = await base44.functions.invoke('importPersonnelRegistry', { data });
      setResult(response.data);
      
      if (response.data.errors?.length > 0) {
        toast.warning(`${response.data.imported} importés, ${response.data.errors.length} erreurs`);
      } else if (response.data.imported > 0) {
        toast.success(`${response.data.imported} employé(s) importé(s) avec succès`);
      }
      
      if (response.data.imported > 0) {
        setTimeout(() => onSuccess(), 800);
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur lors de l\'import');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setData('');
    setResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-white border-gray-300 max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-gray-900 flex items-center gap-2">
            <Upload className="w-5 h-5 text-orange-600" />
            Importer le registre
          </DialogTitle>
          <DialogDescription className="text-gray-600">
            Collez le contenu du tableau (NOM, PRÉNOM, DATE DE NAISSANCE, etc.)
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4 py-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Formats acceptés :</p>
                <ul className="text-xs space-y-1 mt-2">
                  <li>• TSV (Tab) depuis Excel/Google Sheets</li>
                  <li>• CSV séparé par virgule</li>
                  <li>• CSV séparé par point-virgule</li>
                  <li>• Avec ou sans ligne d'en-tête</li>
                </ul>
              </div>
            </div>

            <div>
              <Label className="text-gray-900 mb-2 block">Données à importer</Label>
              <textarea
                value={data}
                onChange={(e) => setData(e.target.value)}
                placeholder="Collez ici le contenu du tableau..."
                className="w-full h-40 p-3 border-2 border-gray-300 rounded-lg bg-white text-gray-900 text-sm font-mono"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                className="border-gray-300 text-gray-900"
              >
                Annuler
              </Button>
              <Button
                onClick={handleImport}
                disabled={importing || !data.trim()}
                className="bg-orange-600 hover:bg-orange-700"
              >
                {importing ? 'Import en cours...' : 'Importer'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className={`rounded-lg p-4 flex gap-3 ${
              result.errors?.length === 0 
                ? 'bg-green-50 border border-green-200' 
                : 'bg-amber-50 border border-amber-200'
            }`}>
              <CheckCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                result.errors?.length === 0 ? 'text-green-600' : 'text-amber-600'
              }`} />
              <div>
                <p className={`font-medium ${
                  result.errors?.length === 0 ? 'text-green-800' : 'text-amber-800'
                }`}>
                  {result.imported} employé(s) importé(s) avec succès
                </p>
                {result.errors?.length > 0 && (
                  <p className="text-amber-700 text-sm mt-1">
                    {result.errors.length} ligne(s) non importée(s)
                  </p>
                )}
              </div>
            </div>

            {result.errors?.length > 0 && (
              <div className="bg-white border border-red-200 rounded-lg p-3 max-h-48 overflow-y-auto">
                <p className="text-xs font-semibold text-red-900 mb-2">Détail des erreurs :</p>
                <div className="space-y-1">
                  {result.errors.map((error, idx) => (
                    <p key={idx} className="text-xs text-red-700 font-mono">{error}</p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button
                onClick={handleClose}
                className="bg-orange-600 hover:bg-orange-700"
              >
                {result.imported > 0 ? 'Fermer et voir' : 'Fermer'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}