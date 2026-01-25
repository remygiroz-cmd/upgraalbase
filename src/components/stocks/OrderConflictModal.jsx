import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Plus, Trash2, X } from 'lucide-react';

export default function OrderConflictModal({ 
  isOpen, 
  onClose, 
  supplierName, 
  onReplace, 
  onMerge,
  onCancel 
}) {
  return (
    <Dialog open={isOpen} onOpenChange={onCancel}>
      <DialogContent className="bg-white border-gray-200 max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-lg font-bold text-gray-900">
            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
            </div>
            Bon de commande existant
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <p className="text-sm text-gray-700 leading-relaxed">
            Un bon de commande pour <span className="font-semibold text-gray-900">{supplierName}</span> existe déjà en cours. 
            Que souhaitez-vous faire ?
          </p>

          <div className="space-y-2">
            <Button
              onClick={onMerge}
              className="w-full justify-start gap-3 bg-emerald-600 hover:bg-emerald-700 text-white h-auto py-3 px-4"
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-700 flex items-center justify-center flex-shrink-0">
                <Plus className="w-4 h-4" />
              </div>
              <div className="text-left flex-1">
                <div className="font-semibold">Ajouter au bon de commande existant</div>
                <div className="text-xs text-emerald-100 mt-0.5">Les articles seront ajoutés au bon de commande en cours</div>
              </div>
            </Button>

            <Button
              onClick={onReplace}
              variant="outline"
              className="w-full justify-start gap-3 border-red-600 text-red-600 hover:bg-red-50 h-auto py-3 px-4"
            >
              <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-4 h-4 text-red-600" />
              </div>
              <div className="text-left flex-1">
                <div className="font-semibold">Remplacer le bon de commande</div>
                <div className="text-xs text-red-600/80 mt-0.5">L'ancien bon sera supprimé et remplacé par le nouveau</div>
              </div>
            </Button>

            <Button
              onClick={onCancel}
              variant="outline"
              className="w-full justify-start gap-3 border-gray-300 hover:bg-gray-50 h-auto py-3 px-4"
            >
              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                <X className="w-4 h-4 text-gray-600" />
              </div>
              <div className="text-left flex-1">
                <div className="font-semibold text-gray-700">Annuler</div>
                <div className="text-xs text-gray-500 mt-0.5">Fermer sans rien faire</div>
              </div>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}