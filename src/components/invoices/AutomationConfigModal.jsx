import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Clock, Mail, Filter, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const DAYS = [
  { value: 'monday', label: 'Lundi' },
  { value: 'tuesday', label: 'Mardi' },
  { value: 'wednesday', label: 'Mercredi' },
  { value: 'thursday', label: 'Jeudi' },
  { value: 'friday', label: 'Vendredi' },
  { value: 'saturday', label: 'Samedi' },
  { value: 'sunday', label: 'Dimanche' }
];

const STATUSES = [
  { value: 'non_envoyee', label: 'Non envoyée' },
  { value: 'a_verifier', label: 'À vérifier' },
  { value: 'envoyee', label: 'Envoyée' }
];

export default function AutomationConfigModal({ open, onClose, config = null }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState(config || {
    name: '',
    recipient_email: '',
    send_day: 'monday',
    send_time: '09:00',
    status_filter: ['non_envoyee'],
    enabled: true
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.InvoiceAutomationConfig.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automationConfigs'] });
      onClose();
    }
  });

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.InvoiceAutomationConfig.update(config.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automationConfigs'] });
      onClose();
    }
  });

  const handleSubmit = () => {
    if (!formData.name || !formData.recipient_email) {
      alert('Veuillez remplir tous les champs obligatoires');
      return;
    }

    if (config?.id) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  const toggleStatus = (status) => {
    setFormData(prev => ({
      ...prev,
      status_filter: prev.status_filter.includes(status)
        ? prev.status_filter.filter(s => s !== status)
        : [...prev.status_filter, status]
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white border-gray-200 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-gray-900">
            {config ? 'Modifier la configuration' : 'Nouvelle configuration d\'envoi'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Nom */}
          <div>
            <label className="text-sm font-medium text-gray-900 mb-2 block">
              Nom de la configuration *
            </label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="ex: Envoi hebdomadaire comptabilité"
              className="bg-white border-gray-300 text-gray-900"
            />
          </div>

          {/* Email destinataire */}
          <div>
            <label className="text-sm font-medium text-gray-900 mb-2 block flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Email destinataire *
            </label>
            <Input
              type="email"
              value={formData.recipient_email}
              onChange={(e) => setFormData({ ...formData, recipient_email: e.target.value })}
              placeholder="comptabilite@example.com"
              className="bg-white border-gray-300 text-gray-900"
            />
          </div>

          {/* Jour et heure */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-900 mb-2 block flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Jour
              </label>
              <Select value={formData.send_day} onValueChange={(value) => setFormData({ ...formData, send_day: value })}>
                <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS.map(day => (
                    <SelectItem key={day.value} value={day.value}>
                      {day.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-900 mb-2 block">Heure</label>
              <Input
                type="time"
                value={formData.send_time}
                onChange={(e) => setFormData({ ...formData, send_time: e.target.value })}
                className="bg-white border-gray-300 text-gray-900"
              />
            </div>
          </div>

          {/* Filtres de statut */}
          <div>
            <label className="text-sm font-medium text-gray-900 mb-3 block flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Factures à envoyer
            </label>
            <div className="space-y-2">
              {STATUSES.map(status => (
                <label key={status.value} className="flex items-center gap-3 p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={formData.status_filter.includes(status.value)}
                    onChange={() => toggleStatus(status.value)}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-900 font-medium">{status.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">⏰ Fonctionnement</p>
              <p className="text-xs">Les factures sélectionnées seront envoyées automatiquement à {formData.recipient_email} chaque {DAYS.find(d => d.value === formData.send_day)?.label.toLowerCase()} à {formData.send_time}.</p>
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-gray-300 text-gray-900 hover:bg-gray-50"
          >
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || updateMutation.isPending}
            className="bg-orange-600 hover:bg-orange-700"
          >
            <CheckCircle2 className="w-4 h-4 mr-2" />
            {config ? 'Mettre à jour' : 'Créer'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}