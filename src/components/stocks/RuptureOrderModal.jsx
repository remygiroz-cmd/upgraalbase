import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle, ShoppingCart, X } from 'lucide-react';

export default function RuptureOrderModal({ open, ruptureItems, supplierName, isLoading, onConfirm, onClose }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-600">
            <AlertCircle className="w-5 h-5" />
            Articles en rupture détectés
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-gray-700 text-sm">
            <strong>{ruptureItems.length} article{ruptureItems.length > 1 ? 's' : ''}</strong> n'ont pas pu être pris lors de cette liste de courses :
          </p>

          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
            {ruptureItems.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-800">{item.product_name}</span>
                <span className="text-orange-700 font-bold ml-2 whitespace-nowrap">
                  {item.quantity} {item.unit}
                </span>
              </div>
            ))}
          </div>

          <p className="text-gray-600 text-sm">
            Souhaitez-vous créer un nouveau bon de commande pour <strong>{supplierName}</strong> avec ces articles ?
          </p>
        </div>

        <DialogFooter className="flex-col gap-2 pt-2">
          <Button
            onClick={() => onConfirm(true)}
            disabled={isLoading}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white"
          >
            <ShoppingCart className="w-4 h-4 mr-2" />
            Oui, créer une nouvelle commande
          </Button>
          <Button
            variant="outline"
            onClick={() => onConfirm(false)}
            disabled={isLoading}
            className="w-full border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            <X className="w-4 h-4 mr-2" />
            Non, clôturer sans recommander
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}