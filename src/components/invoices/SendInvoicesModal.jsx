import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Send, Loader2, CheckCircle } from 'lucide-react';

export default function SendInvoicesModal({ invoiceIds, onClose }) {
  const queryClient = useQueryClient();
  const [recipient, setRecipient] = useState('');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSend = async () => {
    if (!recipient) return;

    setSending(true);
    try {
      await base44.functions.invoke('sendInvoices', {
        invoice_ids: invoiceIds,
        recipient,
        method: 'manual'
      });

      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['invoices'] });

      setTimeout(() => {
        onClose();
      }, 1500);

    } catch (error) {
      console.error('Error sending invoices:', error);
      alert('Erreur lors de l\'envoi: ' + error.message);
      setSending(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-white border-gray-200">
        <DialogHeader>
          <DialogTitle className="text-gray-900">
            Envoyer {invoiceIds.length} facture(s) à la comptabilité
          </DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="text-center py-8">
            <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
            <p className="text-lg font-semibold text-gray-900">Envoi réussi!</p>
            <p className="text-sm text-gray-600 mt-2">
              Les factures ont été envoyées avec succès
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="recipient" className="text-gray-900">Email du destinataire *</Label>
              <Input
                id="recipient"
                type="email"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="comptable@entreprise.com"
                className="bg-white border-gray-300 text-gray-900 mt-1"
                disabled={sending}
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900 font-medium mb-2">📧 Contenu de l'email</p>
              <ul className="text-xs text-blue-800 space-y-1">
                <li>• Tableau récapitulatif des factures</li>
                <li>• Montant total TTC</li>
                <li>• Fichiers joints à l'email</li>
              </ul>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={sending}
                className="border-gray-300 text-gray-900 hover:bg-gray-50"
              >
                Annuler
              </Button>
              <Button
                onClick={handleSend}
                disabled={!recipient || sending}
                className="bg-orange-600 hover:bg-orange-700"
              >
                {sending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Envoi...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Envoyer
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}