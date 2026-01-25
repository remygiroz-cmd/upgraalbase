import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ShoppingCart, Trash2, X } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function OrderConflictModal({ isOpen, onClose, existingOrder, onMerge, onReplace }) {
  if (!existingOrder) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gradient-to-br from-slate-900 to-slate-800 border-orange-600 border-2 max-w-md text-white">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-lg bg-orange-600 flex items-center justify-center flex-shrink-0">
              <ShoppingCart className="w-6 h-6 text-white" />
            </div>
            <div>
              <DialogTitle className="text-white text-lg font-bold">
                COMMANDE EN ATTENTE
              </DialogTitle>
              <p className="text-orange-400 text-sm font-medium">
                Fournisseur : {existingOrder.supplier_name}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-gray-300 text-sm">
            Un bon de commande pour <span className="font-bold text-white">{existingOrder.supplier_name}</span> est resté "En cours" depuis plus de 24h (créé le {format(new Date(existingOrder.date), 'dd/MM/yyyy', { locale: fr })}).
          </p>

          <div className="space-y-2">
            <Button
              onClick={onMerge}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold h-12 gap-2"
            >
              <span className="text-lg">+</span>
              AJOUTER À L'ANCIEN BON (FUSION)
            </Button>

            <Button
              onClick={onReplace}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold h-12"
            >
              Fermer l'ancien bon & Créer Nouveau
            </Button>

            <Button
              onClick={onClose}
              variant="outline"
              className="w-full border-gray-500 text-gray-300 hover:bg-slate-700 hover:text-white h-12"
            >
              Annuler
            </Button>
          </div>

          <p className="text-xs text-gray-400 text-center italic">
            Cette alerte évite de passer deux fois la même commande par erreur.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}