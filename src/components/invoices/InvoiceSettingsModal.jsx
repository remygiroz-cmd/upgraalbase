import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Save, Clock } from 'lucide-react';

export default function InvoiceSettingsModal({ open, onClose }) {
  const queryClient = useQueryClient();
  
  const { data: settings } = useQuery({
    queryKey: ['invoiceSettings'],
    queryFn: async () => {
      const result = await base44.entities.InvoiceSettings.filter({ setting_key: 'auto_send_config' });
      return result[0] || null;
    }
  });

  const [form, setForm] = useState({
    auto_send_enabled: false,
    frequency: 'weekly',
    send_time: '09:00',
    send_day: 1,
    only_non_sent: true,
    exclude_to_verify: true,
    group_in_one_email: true,
    recipients: [],
    email_subject: 'Factures fournisseurs',
    email_body: 'Bonjour,\n\nVeuillez trouver ci-joint les factures fournisseurs.\n\nCordialement'
  });

  const [recipientInput, setRecipientInput] = useState('');

  useEffect(() => {
    if (settings) {
      setForm({
        auto_send_enabled: settings.auto_send_enabled || false,
        frequency: settings.frequency || 'weekly',
        send_time: settings.send_time || '09:00',
        send_day: settings.send_day || 1,
        only_non_sent: settings.only_non_sent !== false,
        exclude_to_verify: settings.exclude_to_verify !== false,
        group_in_one_email: settings.group_in_one_email !== false,
        recipients: settings.recipients || [],
        email_subject: settings.email_subject || 'Factures fournisseurs',
        email_body: settings.email_body || 'Bonjour,\n\nVeuillez trouver ci-joint les factures fournisseurs.\n\nCordialement'
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (settings?.id) {
        return base44.entities.InvoiceSettings.update(settings.id, data);
      } else {
        return base44.entities.InvoiceSettings.create({
          setting_key: 'auto_send_config',
          ...data
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoiceSettings'] });
      toast.success('Paramètres enregistrés');
      onClose();
    }
  });

  const handleSave = () => {
    if (form.auto_send_enabled && form.recipients.length === 0) {
      toast.error('Ajoutez au moins un destinataire');
      return;
    }
    saveMutation.mutate(form);
  };

  const addRecipient = () => {
    if (recipientInput.trim() && !form.recipients.includes(recipientInput.trim())) {
      setForm({...form, recipients: [...form.recipients, recipientInput.trim()]});
      setRecipientInput('');
    }
  };

  const removeRecipient = (email) => {
    setForm({...form, recipients: form.recipients.filter(r => r !== email)});
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white border-gray-200 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gray-900 flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Paramètres d'envoi automatique
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div>
              <Label className="text-gray-900 font-semibold">Activer l'envoi automatique</Label>
              <p className="text-sm text-gray-600 mt-1">Les factures seront envoyées automatiquement selon la fréquence choisie</p>
            </div>
            <Switch
              checked={form.auto_send_enabled}
              onCheckedChange={(checked) => setForm({...form, auto_send_enabled: checked})}
            />
          </div>

          {form.auto_send_enabled && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-900">Fréquence</Label>
                  <Select value={form.frequency} onValueChange={(value) => setForm({...form, frequency: value})}>
                    <SelectTrigger className="border-gray-300 mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Quotidien</SelectItem>
                      <SelectItem value="weekly">Hebdomadaire</SelectItem>
                      <SelectItem value="monthly">Mensuel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-gray-900">Heure d'envoi</Label>
                  <Input
                    type="time"
                    value={form.send_time}
                    onChange={(e) => setForm({...form, send_time: e.target.value})}
                    className="border-gray-300 mt-1"
                  />
                </div>
              </div>

              {form.frequency !== 'daily' && (
                <div>
                  <Label className="text-gray-900">
                    {form.frequency === 'weekly' ? 'Jour de la semaine' : 'Jour du mois'}
                  </Label>
                  <Select value={form.send_day.toString()} onValueChange={(value) => setForm({...form, send_day: parseInt(value)})}>
                    <SelectTrigger className="border-gray-300 mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {form.frequency === 'weekly' ? (
                        <>
                          <SelectItem value="1">Lundi</SelectItem>
                          <SelectItem value="2">Mardi</SelectItem>
                          <SelectItem value="3">Mercredi</SelectItem>
                          <SelectItem value="4">Jeudi</SelectItem>
                          <SelectItem value="5">Vendredi</SelectItem>
                          <SelectItem value="6">Samedi</SelectItem>
                          <SelectItem value="7">Dimanche</SelectItem>
                        </>
                      ) : (
                        Array.from({length: 28}, (_, i) => (
                          <SelectItem key={i + 1} value={(i + 1).toString()}>
                            {i + 1}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <Label className="text-gray-900">Envoyer uniquement les factures non envoyées</Label>
                  <Switch
                    checked={form.only_non_sent}
                    onCheckedChange={(checked) => setForm({...form, only_non_sent: checked})}
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <Label className="text-gray-900">Exclure les factures "À vérifier"</Label>
                  <Switch
                    checked={form.exclude_to_verify}
                    onCheckedChange={(checked) => setForm({...form, exclude_to_verify: checked})}
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <Label className="text-gray-900">Regrouper en un seul email</Label>
                  <Switch
                    checked={form.group_in_one_email}
                    onCheckedChange={(checked) => setForm({...form, group_in_one_email: checked})}
                  />
                </div>
              </div>

              <div>
                <Label className="text-gray-900">Destinataires</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    type="email"
                    placeholder="email@exemple.com"
                    value={recipientInput}
                    onChange={(e) => setRecipientInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addRecipient())}
                    className="border-gray-300"
                  />
                  <Button onClick={addRecipient} className="bg-blue-600 hover:bg-blue-700">
                    Ajouter
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {form.recipients.map((email, i) => (
                    <div key={i} className="bg-blue-100 text-blue-900 px-3 py-1 rounded-full text-sm flex items-center gap-2">
                      {email}
                      <button onClick={() => removeRecipient(email)} className="hover:text-blue-700">
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="email_subject" className="text-gray-900">Objet de l'email</Label>
                <Input
                  id="email_subject"
                  value={form.email_subject}
                  onChange={(e) => setForm({...form, email_subject: e.target.value})}
                  className="border-gray-300 mt-1"
                />
              </div>

              <div>
                <Label htmlFor="email_body" className="text-gray-900">Corps de l'email</Label>
                <Textarea
                  id="email_body"
                  value={form.email_body}
                  onChange={(e) => setForm({...form, email_body: e.target.value})}
                  className="border-gray-300 mt-1"
                  rows={5}
                />
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
            <Button variant="outline" onClick={onClose} className="border-gray-300">
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending} className="bg-orange-600 hover:bg-orange-700">
              <Save className="w-4 h-4 mr-2" />
              Enregistrer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}