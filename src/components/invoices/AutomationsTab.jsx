import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Send, Clock, Mail, Calendar, CheckCircle, AlertCircle, Settings as SettingsIcon, PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const DAYS_OF_WEEK = [
  { value: '1', label: 'Lundi' },
  { value: '2', label: 'Mardi' },
  { value: '3', label: 'Mercredi' },
  { value: '4', label: 'Jeudi' },
  { value: '5', label: 'Vendredi' },
  { value: '6', label: 'Samedi' },
  { value: '0', label: 'Dimanche' }
];

export default function AutomationsTab() {
  const queryClient = useQueryClient();

  const { data: settings = [] } = useQuery({
    queryKey: ['invoiceSettings'],
    queryFn: () => base44.entities.InvoiceSettings.filter({ setting_key: 'auto_send_config' })
  });

  const config = settings[0] || {
    auto_send_enabled: false,
    frequency: 'monthly',
    send_time: '18:00',
    day_of_week: '1',
    day_of_month: 1,
    include_non_envoyee: true,
    include_a_verifier: false,
    include_envoyee: false,
    group_in_one_email: true,
    recipients: [],
    execution_log: []
  };

  const [enabled, setEnabled] = useState(config.auto_send_enabled);
  const [frequency, setFrequency] = useState(config.frequency);
  const [sendTime, setSendTime] = useState(config.send_time);
  const [dayOfWeek, setDayOfWeek] = useState(String(config.day_of_week || '1'));
  const [dayOfMonth, setDayOfMonth] = useState(config.day_of_month || 1);
  const [includeNonEnvoyee, setIncludeNonEnvoyee] = useState(config.include_non_envoyee);
  const [includeAVerifier, setIncludeAVerifier] = useState(config.include_a_verifier);
  const [includeEnvoyee, setIncludeEnvoyee] = useState(config.include_envoyee);
  const [groupInOne, setGroupInOne] = useState(config.group_in_one_email);
  const [recipientsText, setRecipientsText] = useState((config.recipients || []).join(', '));

  useEffect(() => {
    setEnabled(config.auto_send_enabled);
    setFrequency(config.frequency);
    setSendTime(config.send_time);
    setDayOfWeek(String(config.day_of_week || '1'));
    setDayOfMonth(config.day_of_month || 1);
    setIncludeNonEnvoyee(config.include_non_envoyee);
    setIncludeAVerifier(config.include_a_verifier);
    setIncludeEnvoyee(config.include_envoyee);
    setGroupInOne(config.group_in_one_email);
    setRecipientsText((config.recipients || []).join(', '));
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      return base44.functions.invoke('updateAutoSendConfig', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoiceSettings'] });
      queryClient.refetchQueries({ queryKey: ['invoiceSettings'] });
    }
  });

  const testMutation = useMutation({
    mutationFn: () => base44.functions.invoke('executeAutoSendInvoices', { test_mode: true })
  });

  const handleSave = async () => {
    const recipients = recipientsText
      .split(/[,;\n]/)
      .map(r => r.trim())
      .filter(r => r && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r));

    if (enabled && recipients.length === 0) {
      alert('Veuillez saisir au moins une adresse email valide');
      return;
    }

    if (enabled && !includeNonEnvoyee && !includeAVerifier && !includeEnvoyee) {
      alert('Veuillez sélectionner au moins un type de facture à envoyer');
      return;
    }

    try {
      await saveMutation.mutateAsync({
        auto_send_enabled: enabled,
        frequency,
        send_time: sendTime,
        day_of_week: frequency === 'weekly' ? parseInt(dayOfWeek) : null,
        day_of_month: frequency === 'monthly' ? dayOfMonth : null,
        include_non_envoyee: includeNonEnvoyee,
        include_a_verifier: includeAVerifier,
        include_envoyee: includeEnvoyee,
        group_in_one_email: groupInOne,
        recipients,
        automation_id: '697e21bfb8a8ce1bec920778'
      });
      // Rafraîchir les automations après la sauvegarde
      setTimeout(() => queryClient.refetchQueries({ queryKey: ['automations'] }), 500);
      alert('Automatisation enregistrée ✓');
    } catch (err) {
      alert('Erreur: ' + err.message);
    }
  };

  const handleTest = async () => {
    if (!window.confirm('Tester l\'envoi automatique (mode simulation) ?')) return;
    
    try {
      const result = await testMutation.mutateAsync();
      alert(`Test réussi !\n${result.data.invoices_to_send} facture(s) seraient envoyées`);
    } catch (err) {
      alert('Erreur : ' + err.message);
    }
  };

  const nextExecution = () => {
    if (!enabled || !sendTime) return null;

    const now = new Date();
    const [hours, minutes] = sendTime.split(':');
    if (!hours || !minutes) return null;

    let next = new Date();
    next.setHours(parseInt(hours), parseInt(minutes), 0, 0);

    if (frequency === 'daily') {
      if (next <= now) next.setDate(next.getDate() + 1);
    } else if (frequency === 'weekly') {
      const targetDay = parseInt(dayOfWeek);
      const currentDay = next.getDay();
      let daysToAdd = targetDay - currentDay;
      if (daysToAdd <= 0 || (daysToAdd === 0 && next <= now)) daysToAdd += 7;
      next.setDate(next.getDate() + daysToAdd);
    } else if (frequency === 'monthly') {
      next.setDate(dayOfMonth);
      if (next <= now) {
        next.setMonth(next.getMonth() + 1);
      }
    }

    return next;
  };

  const nextExecDate = nextExecution();
  const selectedStatusCount = [includeNonEnvoyee, includeAVerifier, includeEnvoyee].filter(Boolean).length;
  const recipientCount = recipientsText.split(/[,;\n]/).filter(r => r.trim()).length;

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={handleTest}
          disabled={!enabled || testMutation.isPending}
          className="border-gray-300 text-gray-900 hover:bg-gray-50"
        >
          <PlayCircle className="w-4 h-4 mr-2" />
          Tester (simulation)
        </Button>
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="bg-orange-600 hover:bg-orange-700"
        >
          <SettingsIcon className="w-4 h-4 mr-2" />
          Enregistrer
        </Button>
      </div>

      {/* Résumé visuel */}
      {enabled && (
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 border-2 border-orange-200 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-white rounded-lg">
              <CheckCircle className="w-8 h-8 text-orange-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                ✔️ Envoi automatique actif
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-orange-600" />
                  <span className="text-gray-700">
                    {frequency === 'daily' && 'Quotidien'}
                    {frequency === 'weekly' && `Hebdomadaire — ${DAYS_OF_WEEK.find(d => d.value === dayOfWeek)?.label}`}
                    {frequency === 'monthly' && `Mensuel — Le ${dayOfMonth}`}
                    {' à '}{sendTime}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-orange-600" />
                  <span className="text-gray-700">
                    {selectedStatusCount} type{selectedStatusCount > 1 ? 's' : ''} de facture{selectedStatusCount > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-orange-600" />
                  <span className="text-gray-700">
                    {recipientCount} destinataire{recipientCount > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-orange-600" />
                  <span className="text-gray-700">
                    Prochain : {nextExecDate ? format(nextExecDate, 'dd/MM/yyyy à HH:mm', { locale: fr }) : '-'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 1. Activation */}
      <div className="bg-white rounded-xl border-2 border-gray-300 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              Activation de l'envoi automatique
            </h3>
            <p className="text-sm text-gray-500">
              {enabled ? 'Les factures seront envoyées automatiquement selon la configuration' : 'Aucune facture ne sera envoyée automatiquement'}
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            className="data-[state=checked]:bg-orange-600"
          />
        </div>
      </div>

      {/* 2. Sélection des factures */}
      <div className="bg-white rounded-xl border-2 border-gray-300 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Statuts des factures à envoyer
        </h3>
        <div className="space-y-3">
          <label className="flex items-center gap-3 p-3 border-2 border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              checked={includeNonEnvoyee}
              onChange={(e) => setIncludeNonEnvoyee(e.target.checked)}
              className="w-4 h-4"
            />
            <div className="flex-1">
              <div className="font-medium text-gray-900">Factures non envoyées</div>
              <div className="text-xs text-gray-500">Recommandé — factures validées prêtes à être envoyées</div>
            </div>
            <Badge className="bg-gray-100 text-gray-800">Par défaut</Badge>
          </label>

          <label className="flex items-center gap-3 p-3 border-2 border-yellow-200 rounded-lg hover:bg-yellow-50 cursor-pointer">
            <input
              type="checkbox"
              checked={includeAVerifier}
              onChange={(e) => setIncludeAVerifier(e.target.checked)}
              className="w-4 h-4"
            />
            <div className="flex-1">
              <div className="font-medium text-gray-900">Factures à vérifier</div>
              <div className="text-xs text-yellow-700">⚠️ Attention — ces factures nécessitent normalement une vérification manuelle</div>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 border-2 border-red-200 rounded-lg hover:bg-red-50 cursor-pointer opacity-50">
            <input
              type="checkbox"
              checked={includeEnvoyee}
              onChange={(e) => setIncludeEnvoyee(e.target.checked)}
              disabled
              className="w-4 h-4"
            />
            <div className="flex-1">
              <div className="font-medium text-gray-900">Factures déjà envoyées</div>
              <div className="text-xs text-red-700">❌ Désactivé — évite les doublons</div>
            </div>
            <Badge className="bg-red-100 text-red-800">Bloqué</Badge>
          </label>
        </div>
      </div>

      {/* 3. Destinataires */}
      <div className="bg-white rounded-xl border-2 border-gray-300 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Destinataires email
        </h3>
        <textarea
          value={recipientsText}
          onChange={(e) => setRecipientsText(e.target.value)}
          placeholder="compta@cabinet.fr&#10;expert@cabinet.fr&#10;ou&#10;compta@cabinet.fr, direction@entreprise.fr"
          rows={4}
          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-gray-900"
        />
        <p className="text-xs text-gray-500 mt-2">
          Séparés par virgule, point-virgule ou retour à la ligne
        </p>
      </div>

      {/* 4. Fréquence */}
      <div className="bg-white rounded-xl border-2 border-gray-300 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Fréquence d'envoi
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <label className={cn(
            "flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all",
            frequency === 'daily' ? "border-orange-500 bg-orange-50" : "border-gray-200 hover:bg-gray-50"
          )}>
            <input
              type="radio"
              name="frequency"
              value="daily"
              checked={frequency === 'daily'}
              onChange={(e) => setFrequency(e.target.value)}
              className="w-4 h-4"
            />
            <div>
              <div className="font-medium text-gray-900">Quotidienne</div>
              <div className="text-xs text-gray-500">Tous les jours</div>
            </div>
          </label>

          <label className={cn(
            "flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all",
            frequency === 'weekly' ? "border-orange-500 bg-orange-50" : "border-gray-200 hover:bg-gray-50"
          )}>
            <input
              type="radio"
              name="frequency"
              value="weekly"
              checked={frequency === 'weekly'}
              onChange={(e) => setFrequency(e.target.value)}
              className="w-4 h-4"
            />
            <div>
              <div className="font-medium text-gray-900">Hebdomadaire</div>
              <div className="text-xs text-gray-500">Une fois par semaine</div>
            </div>
          </label>

          <label className={cn(
            "flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all",
            frequency === 'monthly' ? "border-orange-500 bg-orange-50" : "border-gray-200 hover:bg-gray-50"
          )}>
            <input
              type="radio"
              name="frequency"
              value="monthly"
              checked={frequency === 'monthly'}
              onChange={(e) => setFrequency(e.target.value)}
              className="w-4 h-4"
            />
            <div>
              <div className="font-medium text-gray-900">Mensuelle</div>
              <div className="text-xs text-gray-500">Une fois par mois</div>
            </div>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {frequency === 'weekly' && (
            <div>
              <label className="text-sm font-medium text-gray-900 mb-2 block">Jour de la semaine</label>
              <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map(day => (
                    <SelectItem key={day.value} value={day.value}>{day.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {frequency === 'monthly' && (
            <div>
              <label className="text-sm font-medium text-gray-900 mb-2 block">Jour du mois</label>
              <Input
                type="number"
                min="1"
                max="28"
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(parseInt(e.target.value))}
                className="bg-white border-gray-300 text-gray-900"
              />
              <p className="text-xs text-gray-500 mt-1">Entre 1 et 28</p>
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-gray-900 mb-2 block">Heure d'envoi</label>
            <Input
              type="time"
              value={sendTime}
              onChange={(e) => setSendTime(e.target.value)}
              className="bg-white border-gray-300 text-gray-900"
            />
          </div>
        </div>
      </div>

      {/* 5. Mode d'envoi */}
      <div className="bg-white rounded-xl border-2 border-gray-300 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Mode d'envoi
        </h3>
        <div className="space-y-3">
          <label className={cn(
            "flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all",
            groupInOne ? "border-orange-500 bg-orange-50" : "border-gray-200 hover:bg-gray-50"
          )}>
            <input
              type="radio"
              name="mode"
              checked={groupInOne}
              onChange={() => setGroupInOne(true)}
              className="w-4 h-4"
            />
            <div className="flex-1">
              <div className="font-medium text-gray-900">Un seul email groupé</div>
              <div className="text-xs text-gray-500">Toutes les factures dans un seul email (recommandé)</div>
            </div>
            <Badge className="bg-orange-100 text-orange-800">Recommandé</Badge>
          </label>

          <label className={cn(
            "flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all",
            !groupInOne ? "border-orange-500 bg-orange-50" : "border-gray-200 hover:bg-gray-50"
          )}>
            <input
              type="radio"
              name="mode"
              checked={!groupInOne}
              onChange={() => setGroupInOne(false)}
              className="w-4 h-4"
            />
            <div className="flex-1">
              <div className="font-medium text-gray-900">Un email par facture</div>
              <div className="text-xs text-gray-500">Chaque facture envoyée séparément</div>
            </div>
          </label>
        </div>
      </div>

      {/* Historique */}
      {config.execution_log && config.execution_log.length > 0 && (
        <div className="bg-white rounded-xl border-2 border-gray-300 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Historique des exécutions
          </h3>
          <div className="space-y-3">
            {config.execution_log.slice(-10).reverse().map((log, idx) => (
              <div key={idx} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                {log.success ? (
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">
                    {format(new Date(log.executed_at), 'dd/MM/yyyy à HH:mm', { locale: fr })}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    {log.invoices_sent} facture(s) envoyée(s)
                  </div>
                  {log.error_message && (
                    <div className="text-xs text-red-600 mt-1">{log.error_message}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Avertissement sécurité */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="font-semibold mb-2">Règles de sécurité</p>
            <ul className="space-y-1 text-xs">
              <li>✓ Aucune facture déjà envoyée ne sera renvoyée</li>
              <li>✓ Les factures "à vérifier" ne seront envoyées que si explicitement activées</li>
              <li>✓ En cas d'échec, le statut de la facture reste inchangé</li>
              <li>✓ Chaque envoi est tracé dans l'historique de la facture</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}