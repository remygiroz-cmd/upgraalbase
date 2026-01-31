import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Edit2, Clock, Mail, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import AutomationConfigModal from './AutomationConfigModal';
import AutomationHistoryPanel from './AutomationHistoryPanel';

const DAYS_LABELS = {
  monday: 'Lundi',
  tuesday: 'Mardi',
  wednesday: 'Mercredi',
  thursday: 'Jeudi',
  friday: 'Vendredi',
  saturday: 'Samedi',
  sunday: 'Dimanche'
};

export default function AutomationManagementModal({ open, onClose }) {
  const queryClient = useQueryClient();
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);
  const [expandedConfig, setExpandedConfig] = useState(null);

  const { data: configs = [] } = useQuery({
    queryKey: ['automationConfigs'],
    queryFn: () => base44.entities.InvoiceAutomationConfig.list('-created_date', 100),
    enabled: open
  });

  const { data: automationStatus } = useQuery({
    queryKey: ['automationStatus'],
    queryFn: () => base44.functions.invoke('getAutomationStatus'),
    enabled: open
  });

  const deleteConfigMutation = useMutation({
    mutationFn: (id) => base44.entities.InvoiceAutomationConfig.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automationConfigs'] });
    }
  });

  const toggleConfigMutation = useMutation({
    mutationFn: ({ id, enabled }) => 
      base44.entities.InvoiceAutomationConfig.update(id, { enabled: !enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automationConfigs'] });
    }
  });

  const handleEditClose = () => {
    setEditingConfig(null);
    setShowConfigForm(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white border-gray-200 sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gray-900">
            Gestion de l'envoi automatique des factures
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* État de l'automation */}
          {automationStatus?.data?.has_automation ? (
            <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-green-900">Envoi automatique configuré ✓</p>
                  <p className="text-sm text-green-800 mt-1">
                    {automationStatus.data.configs.length} configuration(s) active(s)
                  </p>
                </div>
              </div>

              {automationStatus.data.configs.map(config => (
                <div key={config.id} className="bg-white rounded border border-green-200 p-3 space-y-2 text-sm">
                  <p className="font-medium text-gray-900">{config.name}</p>
                  <div className="space-y-1 text-gray-700">
                    <p>
                      <span className="font-medium">Prochain envoi:</span>{' '}
                      <span className="text-green-700 font-semibold">
                        {format(new Date(config.next_run_at), 'eeee dd MMMM à HH:mm', { locale: fr })}
                      </span>
                    </p>
                    {config.last_run_at && (
                      <p>
                        <span className="font-medium">Dernier envoi:</span> {format(new Date(config.last_run_at), 'dd/MM/yyyy HH:mm', { locale: fr })}
                        {config.last_run_status === 'success' ? (
                          <Badge className="ml-2 bg-green-100 text-green-800">Succès</Badge>
                        ) : (
                          <Badge className="ml-2 bg-red-100 text-red-800">Échec</Badge>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4 flex gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-yellow-900">Aucun envoi automatique configuré</p>
                <p className="text-sm text-yellow-800 mt-1">Créez une configuration pour activer l'envoi automatique de factures.</p>
              </div>
            </div>
          )}

          {/* Bouton créer */}
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setEditingConfig(null);
                setShowConfigForm(true);
              }}
              className="bg-orange-600 hover:bg-orange-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nouvelle configuration
            </Button>
          </div>

          {/* Liste des configurations */}
          {configs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Aucune configuration</p>
            </div>
          ) : (
            <div className="space-y-3">
              {configs.map(config => (
                <div
                  key={config.id}
                  className="border border-gray-300 rounded-lg p-4 space-y-3"
                >
                  {/* En-tête */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-gray-900">{config.name}</h3>
                        <Badge className={config.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                          {config.enabled ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <div className="space-y-1 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4" />
                          {config.recipient_email}
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          {DAYS_LABELS[config.send_day]} à {config.send_time}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingConfig(config);
                          setShowConfigForm(true);
                        }}
                        className="border-gray-300"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (confirm('Supprimer cette configuration ?')) {
                            deleteConfigMutation.mutate(config.id);
                          }
                        }}
                        className="border-red-300 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Statuts filtrés */}
                  <div className="pt-3 border-t border-gray-200">
                    <p className="text-xs font-medium text-gray-700 mb-2">Factures à envoyer:</p>
                    <div className="flex flex-wrap gap-1">
                      {config.status_filter?.map(status => {
                        const labels = {
                          non_envoyee: 'Non envoyée',
                          a_verifier: 'À vérifier',
                          envoyee: 'Envoyée'
                        };
                        return (
                          <Badge key={status} className="bg-blue-100 text-blue-800 text-xs">
                            {labels[status]}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>

                  {/* Dernier envoi */}
                  {config.last_run_at && (
                    <div className="pt-3 border-t border-gray-200 text-xs text-gray-600">
                      <span className="font-medium">Dernier envoi:</span> {format(new Date(config.last_run_at), 'dd MMMM yyyy à HH:mm', { locale: fr })}
                      {config.last_run_status && (
                        <Badge className={`ml-2 ${config.last_run_status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {config.last_run_status === 'success' ? 'Succès' : 'Échec'}
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* Historique */}
                  {config.run_history && config.run_history.length > 0 && (
                    <div className="pt-3 border-t border-gray-200">
                      <button
                        onClick={() => setExpandedConfig(expandedConfig === config.id ? null : config.id)}
                        className="text-xs font-medium text-orange-600 hover:text-orange-700 mb-2"
                      >
                        {expandedConfig === config.id ? '▼ Masquer' : '▶ Voir'} l'historique ({config.run_history.length})
                      </button>
                      {expandedConfig === config.id && (
                        <div className="mt-2">
                          <AutomationHistoryPanel config={config} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Form Modal */}
        {showConfigForm && (
          <AutomationConfigModal
            open={showConfigForm}
            onClose={handleEditClose}
            config={editingConfig}
          />
        )}

        <div className="flex justify-end pt-4 border-t border-gray-200">
          <Button
            onClick={onClose}
            className="bg-orange-600 hover:bg-orange-700"
          >
            Fermer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}