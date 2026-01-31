import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Send } from 'lucide-react';

export default function SendInvoiceModal({ open, onClose, invoiceIds }) {
  const queryClient = useQueryClient();
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const { data: settings } = useQuery({
    queryKey: ['invoiceSettings'],
    queryFn: () => base44.entities.InvoiceSettings.filter({ setting_key: 'auto_send_config' })
  });

  useEffect(() => {
    if (settings && settings[0]) {
      setRecipient(settings[0].recipients?.[0] || '');
      setSubject(settings[0].email_subject || `Factures - ${new Date().toLocaleDateString('fr-FR')}`);
      setBody(settings[0].email_body || '');
    } else {
      setSubject(`Factures - ${new Date().toLocaleDateString('fr-FR')}`);
    }
  }, [settings]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('sendInvoicesToAccounting', {
        invoice_ids: invoiceIds,
        recipient,
        subject,
        body,
        method: 'manual'
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success(`${data.sent_count} facture(s) envoyée(s) à ${data.recipient}`);
      onClose();
    },
    onError: (error) => {
      toast.error('Erreur envoi: ' + error.message);
    }
  });

  const handleSend = () => {
    if (!recipient || !recipient.includes('@')) {
      toast.error('Email destinataire invalide');
      return;
    }
    sendMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white border-gray-200">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Envoyer à la comptabilité</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="recipient" className="text-gray-900">Destinataire *</Label>
            <Input
              id="recipient"
              type="email"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="comptabilite@entreprise.com"
              className="border-gray-300 mt-1"
            />
          </div>

          <div>
            <Label htmlFor="subject" className="text-gray-900">Objet</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="border-gray-300 mt-1"
            />
          </div>

          <div>
            <Label htmlFor="body" className="text-gray-900">Message</Label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="border-gray-300 mt-1"
              rows={6}
              placeholder="Bonjour,&#10;&#10;Veuillez trouver ci-joint les factures...&#10;&#10;Cordialement"
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded p-3">
            <p className="text-sm text-blue-900">
              {invoiceIds.length} facture(s) sélectionnée(s) sera(ont) envoyée(s).
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-gray-300">
            Annuler
          </Button>
          <Button
            onClick={handleSend}
            disabled={sendMutation.isPending}
            className="bg-orange-600 hover:bg-orange-700"
          >
            <Send className="w-4 h-4 mr-2" />
            {sendMutation.isPending ? 'Envoi...' : 'Envoyer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}