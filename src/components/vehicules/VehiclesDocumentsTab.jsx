import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, FileText, Trash2, ExternalLink, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';
import { isDocumentExpired, isDocumentExpiringSoon } from './vehiculeUtils';

export default function VehiclesDocumentsTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [filterVehicle, setFilterVehicle] = useState('');
  const [form, setForm] = useState({ vehicule_id: '', type_doc: 'ASSURANCE', nom: '', date_expiration: '', fichier_url: '', rappel_auto: true });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: documents = [] } = useQuery({
    queryKey: ['vehicleDocumentsAll'],
    queryFn: () => base44.entities.VehicleDocument.list()
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => base44.entities.Vehicle.list()
  });

  const vehicleMap = Object.fromEntries(vehicles.map(v => [v.id, v]));

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.vehicule_id || !form.type_doc) throw new Error('Véhicule et type requis');
      return base44.entities.VehicleDocument.create(form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicleDocumentsAll'] });
      queryClient.invalidateQueries({ queryKey: ['vehicleDocuments'] });
      toast.success('Document ajouté');
      setShowForm(false);
      setForm({ vehicule_id: '', type_doc: 'ASSURANCE', nom: '', date_expiration: '', fichier_url: '', rappel_auto: true });
    },
    onError: e => toast.error(e.message)
  });

  const deleteMutation = useMutation({
    mutationFn: id => base44.entities.VehicleDocument.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicleDocumentsAll'] });
      toast.success('Supprimé');
    }
  });

  const filtered = filterVehicle ? documents.filter(d => d.vehicule_id === filterVehicle) : documents;
  const sorted = [...filtered].sort((a, b) => {
    const aExp = isDocumentExpired(a);
    const bExp = isDocumentExpired(b);
    if (aExp && !bExp) return -1;
    if (!aExp && bExp) return 1;
    return 0;
  });

  const typeIcons = {
    CARTE_GRISE: '📄', ASSURANCE: '🛡', CONTROLE_TECHNIQUE: '🔍', CONTRAT_LOA: '📋', AUTRE: '📎'
  };

  return (
    <div className="space-y-4 mt-4">
      {/* Alerts */}
      {documents.filter(isDocumentExpired).length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-sm text-red-900">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <strong>{documents.filter(isDocumentExpired).length}</strong> document(s) expiré(s) — action requise
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-center">
        <select value={filterVehicle} onChange={e => setFilterVehicle(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm flex-1 min-w-40">
          <option value="">Tous les véhicules</option>
          {vehicles.map(v => <option key={v.id} value={v.id}>{v.marque} {v.modele} — {v.immatriculation}</option>)}
        </select>
        <Button onClick={() => setShowForm(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-1" /> Ajouter
        </Button>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Aucun document</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(d => {
            const v = vehicleMap[d.vehicule_id];
            const expired = isDocumentExpired(d);
            const expiringSoon = !expired && isDocumentExpiringSoon(d);
            const daysLeft = d.date_expiration ? moment(d.date_expiration).diff(moment(), 'days') : null;
            return (
              <div key={d.id} className={`border rounded-xl p-4 flex items-center justify-between gap-3 ${
                expired ? 'bg-red-50 border-red-300' : expiringSoon ? 'bg-yellow-50 border-yellow-300' : 'bg-white border-gray-200'
              }`}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="text-2xl">{typeIcons[d.type_doc] || '📎'}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">{d.type_doc.replace('_', ' ')}</span>
                      {d.nom && <span className="text-sm text-gray-500">{d.nom}</span>}
                    </div>
                    {v && <p className="text-xs text-blue-600 font-mono">{v.marque} {v.modele} — {v.immatriculation}</p>}
                    {d.date_expiration && (
                      <p className={`text-xs mt-0.5 ${expired ? 'text-red-700 font-bold' : expiringSoon ? 'text-orange-700 font-medium' : 'text-gray-500'}`}>
                        {expired ? `⛔ Expiré le ${moment(d.date_expiration).format('DD/MM/YYYY')}`
                          : expiringSoon ? `⚠️ Expire dans ${daysLeft}j (${moment(d.date_expiration).format('DD/MM/YYYY')})`
                          : `Expire le ${moment(d.date_expiration).format('DD/MM/YYYY')}`}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {d.fichier_url && (
                    <a href={d.fichier_url} target="_blank" rel="noopener noreferrer"
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  <button onClick={() => { if (confirm('Supprimer ce document ?')) deleteMutation.mutate(d.id); }}
                    className="p-1.5 hover:bg-red-50 rounded-lg">
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Form */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajouter un document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Véhicule *</Label>
              <Select value={form.vehicule_id} onValueChange={v => set('vehicule_id', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                <SelectContent>
                  {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.marque} {v.modele} — {v.immatriculation}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Type *</Label>
              <Select value={form.type_doc} onValueChange={v => set('type_doc', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['CARTE_GRISE', 'ASSURANCE', 'CONTROLE_TECHNIQUE', 'CONTRAT_LOA', 'AUTRE'].map(t => (
                    <SelectItem key={t} value={t}>{typeIcons[t]} {t.replace('_', ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nom du document</Label>
              <Input value={form.nom} onChange={e => set('nom', e.target.value)} placeholder="Ex: Assurance 2026" className="mt-1" />
            </div>
            <div>
              <Label>Date d'expiration</Label>
              <Input type="date" value={form.date_expiration} onChange={e => set('date_expiration', e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>URL du fichier</Label>
              <Input value={form.fichier_url} onChange={e => set('fichier_url', e.target.value)} placeholder="https://..." className="mt-1" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="flex-1">
                Ajouter
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}