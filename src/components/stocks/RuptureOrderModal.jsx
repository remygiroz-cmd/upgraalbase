import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle, ShoppingCart, X } from 'lucide-react';

export default function RuptureOrderModal({ open, ruptureItems, supplierName, isLoading, onConfirm, onClose }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md mx-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-600 text-base sm:text-lg">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            Articles en rupture détectés
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-gray-700 text-sm">
            <strong>{ruptureItems.length} article{ruptureItems.length > 1 ? 's' : ''}</strong> n'ont pas pu être pris lors de cette liste de courses :
          </p>

          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto">
            {ruptureItems.map((item, i) => (
              <div key={i} className="flex items-start justify-between gap-2 text-sm">
                <span className="font-medium text-gray-800 break-words min-w-0">{item.product_name}</span>
                <span className="text-orange-700 font-bold whitespace-nowrap flex-shrink-0">
                  {item.quantity} {item.unit}
                </span>
              </div>
            ))}
          </div>

          <p className="text-gray-600 text-sm break-words">
            Souhaitez-vous créer un nouveau bon de commande pour <strong>{supplierName}</strong> avec ces articles ?
          </p>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <Button
            onClick={() => onConfirm(true)}
            disabled={isLoading}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white text-sm"
          >
            <ShoppingCart className="w-4 h-4 mr-2 flex-shrink-0" />
            Oui, créer une nouvelle commande
          </Button>
          <Button
            variant="outline"
            onClick={() => onConfirm(false)}
            disabled={isLoading}
            className="w-full border-gray-300 text-gray-700 hover:bg-gray-50 text-sm"
          >
            <X className="w-4 h-4 mr-2 flex-shrink-0" />
            Non, clôturer sans recommander
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}