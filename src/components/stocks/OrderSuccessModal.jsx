import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Package } from 'lucide-react';

export default function OrderSuccessModal({ open, onOpenChange, results }) {
  if (!results || results.length === 0) return null;

  const totalArticles = results.reduce((sum, r) => sum + r.itemCount, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            </div>
            <DialogTitle className="text-xl">Commandes validées</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-4">
          <p className="text-sm text-gray-600 mb-4">
            {totalArticles} article{totalArticles > 1 ? 's' : ''} {totalArticles > 1 ? 'ont' : 'a'} été traité{totalArticles > 1 ? 's' : ''} avec succès :
          </p>

          {results.map((result, index) => (
            <div
              key={index}
              className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200"
            >
              <Package className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-gray-900">{result.supplierName}</p>
                <p className="text-sm text-gray-600 mt-1">
                  {result.type === 'created' && (
                    <>Nouveau bon de commande créé avec <span className="font-semibold">{result.itemCount} article{result.itemCount > 1 ? 's' : ''}</span></>
                  )}
                  {result.type === 'merged' && (
                    <><span className="font-semibold">{result.itemCount} article{result.itemCount > 1 ? 's' : ''}</span> ajouté{result.itemCount > 1 ? 's' : ''} au bon de commande existant</>
                  )}
                  {result.type === 'replaced' && (
                    <>Bon de commande remplacé avec <span className="font-semibold">{result.itemCount} article{result.itemCount > 1 ? 's' : ''}</span></>
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}