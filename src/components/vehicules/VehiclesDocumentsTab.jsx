import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, FileText, Trash2, AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';
import { isDocumentExpired, isDocumentExpiringSoon } from './vehiculeUtils';

const defaultForm = {
  vehicule_id: '', type_doc: 'ASSURANCE', nom: '',
  fichier_url: '', date_expiration: '', rappel_auto: true, notes: ''
};

const TYPE_LABELS = {
  CARTE_GRISE: '📋 Carte grise', ASSURANCE: '🛡️ Assurance',
  CONTROLE_TECHNIQUE: '🔍 Contrôle technique', CONTRAT_LOA: '📄 Contrat LOA', AUTRE: '📎 Autre'
};

export default function VehiclesDocumentsTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [filterVehicle, setFilterVehicle] = useState('');
  const [form, setForm] = useState(defaultForm);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: vehicles = [] } = useQuery({ queryKey: ['vehicles'], queryFn: () => base44.entities.Vehicle.list() });
  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['allDocuments'],
    queryFn: () => base44.entities.VehicleDocument.list()
  });

  const vehicleMap = Object.fromEntries(vehicles.map(v => [v.id, v]));

  const filtered = documents.filter(d => !filterVehicle || d.vehicule_id === filterVehicle);

  const grouped = filtered.reduce((acc, d) => {
    if (!acc[d.vehicule_id]) acc[d.vehicule_id] = [];
    acc[d.vehicule_id].push(d);
    return acc;
  }, {});

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.vehicule_id) throw new Error('Sélectionnez un véhicule');
      return base44.entities.VehicleDocument.create(form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allDocuments'] });
      toast.success('Document ajouté');
      setShowForm(false);
      setForm(defaultForm);
    },
    onError: (e) => toast.error(e.message)
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.VehicleDocument.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allDocuments'] });
      toast.success('Document supprimé');
    }
  });

  const getDocStatus = (doc) => {
    if (isDocumentExpired(doc)) return { label: 'Expiré', className: 'bg-red-100 text-red-800', icon: <AlertTriangle className="w-3 h-3" /> };
    if (isDocumentExpiringSoon(doc, 7)) return { label: 'Expire dans 7j', className: 'bg-red-100 text-red-800', icon: <AlertTriangle className="w-3 h-3" /> };
    if (isDocumentExpiringSoon(doc, 30)) return { label: `Dans ${moment(doc.date_expiration).diff(moment(), 'days')}j`, className: 'bg-orange-100 text-orange-800', icon: <AlertTriangle className="w-3 h-3" /> };
    if (doc.date_expiration) return { label: moment(doc.date_expiration).format('DD/MM/YY'), className: 'bg-green-100 text-green-800', icon: <CheckCircle2 className="w-3 h-3" /> };
    return null;
  };

  return (
    <div className="space-y-5 mt-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-3">
          <select value={filterVehicle} onChange={e => setFilterVehicle(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm">
            <option value="">Tous les véhicules</option>
            {vehicles.map(v => (
              <option key={v.id} value={v.id}>{v.marque} {v.modele} — {v.immatriculation}</option>
            ))}
          </select>
        </div>
        <Button onClick={() => setShowForm(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-1" /> Ajouter un document
        </Button>
      </div>

      {/* Summary alerts */}
      {(() => {
        const expired = documents.filter(d => isDocumentExpired(d));
        const soon = documents.filter(d => !isDocumentExpired(d) && isDocumentExpiringSoon(d, 30));
        if (expired.length === 0 && soon.length === 0) return null;
        return (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm">
            <h3 className="font-bold text-red-900 mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Alertes documents
            </h3>
            {expired.length > 0 && <p className="text-red-800">🔴 {expired.length} document(s) expiré(s)</p>}
            {soon.length > 0 && <p className="text-orange-800">🟠 {soon.length} document(s) expirant dans 30 jours</p>}
          </div>
        );
      })()}

      {isLoading ? (
        <div className="text-center py-8 text-gray-400">Chargement...</div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Aucun document</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([vid, docs]) => {
            const v = vehicleMap[vid];
            return (
              <div key={vid}>
                <h3 className="font-semibold text-gray-800 mb-2">
                  🚗 {v ? `${v.marque} ${v.modele} — ${v.immatriculation}` : vid}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {docs.map(d => {
                    const status = getDocStatus(d);
                    return (
                      <div key={d.id} className={`bg-white border rounded-xl p-4 ${
                        isDocumentExpired(d) ? 'border-red-300' : isDocumentExpiringSoon(d, 30) ? 'border-orange-300' : 'border-gray-200'
                      }`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="font-medium text-gray-900 text-sm">{TYPE_LABELS[d.type_doc] || d.type_doc}</p>
                            {d.nom && <p className="text-xs text-gray-500">{d.nom}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            {status && (
                              <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${status.className}`}>
                                {status.icon} {status.label}
                              </span>
                            )}
                            {d.fichier_url && (
                              <a href={d.fichier_url} target="_blank" rel="noopener noreferrer"
                                className="text-blue-500 hover:text-blue-700">
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                            <button onClick={() => { if (confirm('Supprimer ?')) deleteMutation.mutate(d.id); }}
                              className="text-gray-300 hover:text-red-500">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        {d.notes && <p className="text-xs text-gray-500 mt-2">{d.notes}</p>}
                        {d.rappel_auto && <p className="text-xs text-blue-500 mt-1">🔔 Rappel automatique activé</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Form modal */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" /> Ajouter un document
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Véhicule *</Label>
              <Select value={form.vehicule_id} onValueChange={v => set('vehicule_id', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                <SelectContent>
                  {vehicles.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.marque} {v.modele} — {v.immatriculation}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type de document *</Label>
                <Select value={form.type_doc} onValueChange={v => set('type_doc', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Nom / référence</Label>
                <Input value={form.nom} onChange={e => set('nom', e.target.value)} className="mt-1" placeholder="Ex: Police n°..." />
              </div>
            </div>
            <div>
              <Label>URL du fichier</Label>
              <Input value={form.fichier_url} onChange={e => set('fichier_url', e.target.value)} className="mt-1" placeholder="https://..." />
            </div>
            <div>
              <Label>Date d'expiration</Label>
              <Input type="date" value={form.date_expiration} onChange={e => set('date_expiration', e.target.value)} className="mt-1" />
            </div>
            <div
              onClick={() => set('rappel_auto', !form.rappel_auto)}
              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${form.rappel_auto ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}
            >
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${form.rappel_auto ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                {form.rappel_auto && <CheckCircle2 className="w-3 h-3 text-white" />}
              </div>
              <span className="text-sm">🔔 Activer rappels automatiques (J-30, J-7, J-1)</span>
            </div>
            <div>
              <Label>Notes</Label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
                className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="flex-1 bg-blue-600 hover:bg-blue-700">
                {createMutation.isPending ? 'Enregistrement...' : 'Ajouter'}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}