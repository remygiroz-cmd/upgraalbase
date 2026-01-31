import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Save, Plus, X } from 'lucide-react';

export default function InvoiceSettingsModal({ open, onClose }) {
  const queryClient = useQueryClient();
  const [autoSendEnabled, setAutoSendEnabled] = useState(false);
  const [frequency, setFrequency] = useState('weekly');
  const [sendTime, setSendTime] = useState('09:00');
  const [sendDay, setSendDay] = useState(1);
  const [onlyNonSent, setOnlyNonSent] = useState(true);
  const [excludeToVerify, setExcludeToVerify] = useState(true);
  const [groupInOneEmail, setGroupInOneEmail] = useState(true);
  const [recipients, setRecipients] = useState([]);
  const [newRecipient, setNewRecipient] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');

  const { data: settings } = useQuery({
    queryKey: ['invoiceSettings'],
    queryFn: () => base44.entities.InvoiceSettings.filter({ setting_key: 'auto_send_config' })
  });

  useEffect(() => {
    if (settings && settings[0]) {
      const s = settings[0];
      setAutoSendEnabled(s.auto_send_enabled || false);
      setFrequency(s.frequency || 'weekly');
      setSendTime(s.send_time || '09:00');
      setSendDay(s.send_day || 1);
      setOnlyNonSent(s.only_non_sent !== false);
      setExcludeToVerify(s.exclude_to_verify !== false);
      setGroupInOneEmail(s.group_in_one_email !== false);
      setRecipients(s.recipients || []);
      setEmailSubject(s.email_subject || '');
      setEmailBody(s.email_body || '');
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (settings && settings[0]) {
        return base44.entities.InvoiceSettings.update(settings[0].id, data);
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
    if (autoSendEnabled && recipients.length === 0) {
      toast.error('Ajoutez au moins un destinataire');
      return;
    }

    saveMutation.mutate({
      auto_send_enabled: autoSendEnabled,
      frequency,
      send_time: sendTime,
      send_day: sendDay,
      only_non_sent: onlyNonSent,
      exclude_to_verify: excludeToVerify,
      group_in_one_email: groupInOneEmail,
      recipients,
      email_subject: emailSubject,
      email_body: emailBody
    });
  };

  const addRecipient = () => {
    if (newRecipient && newRecipient.includes('@')) {
      setRecipients([...recipients, newRecipient]);
      setNewRecipient('');
    } else {
      toast.error('Email invalide');
    }
  };

  const removeRecipient = (email) => {
    setRecipients(recipients.filter(r => r !== email));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white border-gray-200 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Paramètres d'envoi automatique</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Activation */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-gray-900 font-semibold">Activer l'envoi automatique</Label>
              <p className="text-sm text-gray-600">Envoyer automatiquement les factures à la comptabilité</p>
            </div>
            <Switch checked={autoSendEnabled} onCheckedChange={setAutoSendEnabled} />
          </div>

          {autoSendEnabled && (
            <>
              {/* Fréquence */}
              <div>
                <Label className="text-gray-900">Fréquence</Label>
                <Select value={frequency} onValueChange={setFrequency}>
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

              {/* Heure */}
              <div>
                <Label className="text-gray-900">Heure d'envoi</Label>
                <Input
                  type="time"
                  value={sendTime}
                  onChange={(e) => setSendTime(e.target.value)}
                  className="border-gray-300 mt-1"
                />
              </div>

              {/* Jour */}
              {frequency !== 'daily' && (
                <div>
                  <Label className="text-gray-900">
                    {frequency === 'weekly' ? 'Jour de la semaine' : 'Jour du mois'}
                  </Label>
                  {frequency === 'weekly' ? (
                    <Select value={sendDay.toString()} onValueChange={(v) => setSendDay(parseInt(v))}>
                      <SelectTrigger className="border-gray-300 mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Lundi</SelectItem>
                        <SelectItem value="2">Mardi</SelectItem>
                        <SelectItem value="3">Mercredi</SelectItem>
                        <SelectItem value="4">Jeudi</SelectItem>
                        <SelectItem value="5">Vendredi</SelectItem>
                        <SelectItem value="6">Samedi</SelectItem>
                        <SelectItem value="0">Dimanche</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type="number"
                      min="1"
                      max="31"
                      value={sendDay}
                      onChange={(e) => setSendDay(parseInt(e.target.value))}
                      className="border-gray-300 mt-1"
                    />
                  )}
                </div>
              )}

              {/* Options */}
              <div className="space-y-3 border-t border-gray-200 pt-4">
                <div className="flex items-center justify-between">
                  <Label className="text-gray-900">Envoyer uniquement les factures non envoyées</Label>
                  <Switch checked={onlyNonSent} onCheckedChange={setOnlyNonSent} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-gray-900">Exclure les factures à vérifier</Label>
                  <Switch checked={excludeToVerify} onCheckedChange={setExcludeToVerify} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-gray-900">Regrouper en un seul email</Label>
                  <Switch checked={groupInOneEmail} onCheckedChange={setGroupInOneEmail} />
                </div>
              </div>

              {/* Destinataires */}
              <div>
                <Label className="text-gray-900 mb-2 block">Destinataires</Label>
                <div className="flex gap-2 mb-2">
                  <Input
                    type="email"
                    placeholder="email@entreprise.com"
                    value={newRecipient}
                    onChange={(e) => setNewRecipient(e.target.value)}
                    className="border-gray-300"
                  />
                  <Button onClick={addRecipient} size="sm" className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="space-y-2">
                  {recipients.map((email, i) => (
                    <div key={i} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded p-2">
                      <span className="text-sm text-gray-900">{email}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeRecipient(email)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Template email */}
              <div>
                <Label className="text-gray-900">Objet de l'email</Label>
                <Input
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="border-gray-300 mt-1"
                  placeholder="Factures - [date]"
                />
              </div>

              <div>
                <Label className="text-gray-900">Corps de l'email</Label>
                <Textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  className="border-gray-300 mt-1"
                  rows={6}
                  placeholder="Bonjour,&#10;&#10;Veuillez trouver ci-joint les factures...&#10;&#10;Cordialement"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-gray-300">
            Annuler
          </Button>
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="bg-orange-600 hover:bg-orange-700"
          >
            <Save className="w-4 h-4 mr-2" />
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}