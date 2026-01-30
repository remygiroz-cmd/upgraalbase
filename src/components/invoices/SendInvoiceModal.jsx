import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Send, Loader2 } from 'lucide-react';

export default function SendInvoiceModal({ open, onClose, invoice }) {
  const queryClient = useQueryClient();
  const [recipients, setRecipients] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachFile, setAttachFile] = useState(true);

  const { data: settings } = useQuery({
    queryKey: ['invoiceSettings'],
    queryFn: async () => {
      const result = await base44.entities.InvoiceSettings.filter({ setting_key: 'auto_send_config' });
      return result[0] || null;
    }
  });

  useEffect(() => {
    if (invoice && settings) {
      const defaultRecipients = (settings.recipients || []).join(', ');
      setRecipients(defaultRecipients);
      setSubject(settings.email_subject || `Facture ${invoice.supplier_name || ''}`);
      setBody(settings.email_body || `Bonjour,\n\nVeuillez trouver ci-joint la facture ${invoice.supplier_name || ''}.\n\nCordialement`);
    } else if (invoice) {
      setRecipients('');
      setSubject(`Facture ${invoice.supplier_name || ''}`);
      setBody(`Bonjour,\n\nVeuillez trouver ci-joint la facture ${invoice.supplier_name || ''}.\n\nCordialement`);
    }
  }, [invoice, settings]);

  const sendMutation = useMutation({
    mutationFn: async (data) => {
      const result = await base44.functions.invoke('sendInvoicesToAccounting', data);
      return result.data;
    },
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
        toast.success('Facture envoyée avec succès');
        onClose();
      } else {
        toast.error(`Erreur : ${data.errors.join(', ')}`);
      }
    },
    onError: (error) => {
      toast.error('Erreur lors de l\'envoi');
      console.error(error);
    }
  });

  const handleSend = () => {
    if (!recipients.trim()) {
      toast.error('Veuillez saisir au moins un destinataire');
      return;
    }

    const recipientsList = recipients.split(',').map(r => r.trim()).filter(Boolean);

    sendMutation.mutate({
      invoice_ids: [invoice.id],
      recipients: recipientsList,
      method: 'manuel',
      attach_file: attachFile,
      custom_subject: subject,
      custom_body: body
    });
  };

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white border-gray-200 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-gray-900 flex items-center gap-2">
            <Send className="w-5 h-5" />
            Envoyer à la comptabilité
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
            <p className="font-medium text-gray-900">{invoice.supplier_name || 'Sans nom'}</p>
            <p className="text-gray-600">
              {invoice.invoice_date || 'Date inconnue'} • {invoice.amount_ttc?.toFixed(2) || '0.00'}€
            </p>
          </div>

          <div>
            <Label htmlFor="recipients" className="text-gray-900">
              Destinataire(s) <span className="text-red-500">*</span>
            </Label>
            <Input
              id="recipients"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder="email@exemple.com, autre@exemple.com"
              className="border-gray-300 mt-1"
            />
            <p className="text-xs text-gray-500 mt-1">Séparez les emails par des virgules</p>
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
              rows={5}
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <Label className="text-gray-900 font-medium">Joindre la facture</Label>
              <p className="text-xs text-gray-500">Si désactivé, un lien sécurisé sera envoyé</p>
            </div>
            <Switch
              checked={attachFile}
              onCheckedChange={setAttachFile}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
            <Button variant="outline" onClick={onClose} className="border-gray-300">
              Annuler
            </Button>
            <Button 
              onClick={handleSend} 
              disabled={sendMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {sendMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Envoi...</>
              ) : (
                <><Send className="w-4 h-4 mr-2" /> Envoyer</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}