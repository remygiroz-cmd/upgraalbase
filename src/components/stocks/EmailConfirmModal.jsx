import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Mail } from 'lucide-react';

export default function EmailConfirmModal({ isOpen, onClose, supplierName, recipientEmail }) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-white border-gray-200 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-gray-900 flex items-center gap-2">
            <CheckCircle2 className="w-6 h-6 text-green-600" />
            Email envoyé avec succès
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-start gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
            <Mail className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 text-sm">
              <p className="text-gray-700 mb-2">
                Le bon de commande pour <span className="font-semibold">{supplierName}</span> a été envoyé par email.
              </p>
              <p className="text-gray-600 text-xs">
                Destinataire: <span className="font-medium">{recipientEmail}</span>
              </p>
            </div>
          </div>

          <p className="text-sm text-gray-500 text-center">
            Le statut de la commande a été mis à jour en "Envoyée"
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={onClose} className="bg-orange-600 hover:bg-orange-700">
            OK
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}