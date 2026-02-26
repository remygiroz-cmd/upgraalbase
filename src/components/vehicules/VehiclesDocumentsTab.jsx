import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, FileText, Trash2, AlertTriangle, CheckCircle2, Download, Eye, Upload, X, FileImage, File } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';
import { isDocumentExpired, isDocumentExpiringSoon } from './vehiculeUtils';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = [
  'application/pdf',
  'image/png', 'image/jpeg', 'image/jpg', 'image/heic',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

const defaultForm = {
  vehicule_id: '', type_doc: 'ASSURANCE', nom: '',
  date_expiration: '', rappel_auto: true, notes: ''
};

const TYPE_LABELS = {
  CARTE_GRISE: '📋 Carte grise', ASSURANCE: '🛡️ Assurance',
  CONTROLE_TECHNIQUE: '🔍 Contrôle technique', CONTRAT_LOA: '📄 Contrat LOA', AUTRE: '📎 Autre'
};

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function getFileIcon(fileType) {
  if (!fileType) return <FileText className="w-4 h-4 text-gray-400" />;
  if (fileType === 'application/pdf') return <FileText className="w-4 h-4 text-red-500" />;
  if (fileType.startsWith('image/')) return <FileImage className="w-4 h-4 text-blue-500" />;
  return <File className="w-4 h-4 text-purple-500" />;
}

export default function VehiclesDocumentsTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [filterVehicle, setFilterVehicle] = useState('');
  const [form, setForm] = useState(defaultForm);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: vehicles = [] } = useQuery({ queryKey: ['vehicles'], queryFn: () => base44.entities.Vehicle.list() });
  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['allDocuments'],
    queryFn: () => base44.entities.VehicleDocument.list()
  });

  const { data: currentUser } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });

  const vehicleMap = Object.fromEntries(vehicles.map(v => [v.id, v]));
  const filtered = documents.filter(d => !filterVehicle || d.vehicule_id === filterVehicle);
  const grouped = filtered.reduce((acc, d) => {
    if (!acc[d.vehicule_id]) acc[d.vehicule_id] = [];
    acc[d.vehicule_id].push(d);
    return acc;
  }, {});

  const handleFileSelect = (file) => {
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type) && !file.name.endsWith('.heic')) {
      toast.error('Type de fichier non autorisé');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('Fichier trop volumineux (max 10 Mo)');
      return;
    }
    setSelectedFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFileSelect(file);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.vehicule_id) throw new Error('Sélectionnez un véhicule');
      if (!selectedFile) throw new Error('Veuillez sélectionner un fichier');

      setUploading(true);
      const { file_url } = await base44.integrations.Core.UploadFile({ file: selectedFile });
      setUploading(false);

      return base44.entities.VehicleDocument.create({
        ...form,
        fichier_url: file_url,
        file_name: selectedFile.name,
        file_size: selectedFile.size,
        file_type: selectedFile.type,
        uploaded_by: currentUser?.email || '',
        uploaded_at: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allDocuments'] });
      toast.success('Document ajouté');
      setShowForm(false);
      setForm(defaultForm);
      setSelectedFile(null);
      setUploading(false);
    },
    onError: (e) => {
      setUploading(false);
      toast.error(e.message);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.VehicleDocument.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allDocuments'] });
      toast.success('Document supprimé');
    }
  });

  const handleDownload = (doc) => {
    if (!doc.fichier_url) return;
    const a = document.createElement('a');
    a.href = doc.fichier_url;
    a.download = doc.file_name || doc.nom || 'document';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const getDocStatus = (doc) => {
    if (isDocumentExpired(doc)) return { label: 'Expiré', className: 'bg-red-100 text-red-800', icon: <AlertTriangle className="w-3 h-3" /> };
    if (isDocumentExpiringSoon(doc, 7)) return { label: 'Expire dans 7j', className: 'bg-red-100 text-red-800', icon: <AlertTriangle className="w-3 h-3" /> };
    if (isDocumentExpiringSoon(doc, 30)) return { label: `Dans ${moment(doc.date_expiration).diff(moment(), 'days')}j`, className: 'bg-orange-100 text-orange-800', icon: <AlertTriangle className="w-3 h-3" /> };
    if (doc.date_expiration) return { label: moment(doc.date_expiration).format('DD/MM/YY'), className: 'bg-green-100 text-green-800', icon: <CheckCircle2 className="w-3 h-3" /> };
    return null;
  };

  const closeForm = () => {
    setShowForm(false);
    setForm(defaultForm);
    setSelectedFile(null);
  };

  return (
    <div className="space-y-5 mt-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <select value={filterVehicle} onChange={e => setFilterVehicle(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm">
          <option value="">Tous les véhicules</option>
          {vehicles.map(v => (
            <option key={v.id} value={v.id}>{v.marque} {v.modele} — {v.immatriculation}</option>
          ))}
        </select>
        <Button onClick={() => setShowForm(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-1" /> Ajouter un document
        </Button>
      </div>

      {/* Alertes */}
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
                          <div className="flex items-start gap-2 flex-1">
                            {getFileIcon(d.file_type)}
                            <div>
                              <p className="font-medium text-gray-900 text-sm">{TYPE_LABELS[d.type_doc] || d.type_doc}</p>
                              {d.nom && <p className="text-xs text-gray-500">{d.nom}</p>}
                              {d.file_name && <p className="text-xs text-gray-400">{d.file_name}{d.file_size ? ` — ${formatSize(d.file_size)}` : ''}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {status && (
                              <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${status.className}`}>
                                {status.icon} {status.label}
                              </span>
                            )}
                          </div>
                        </div>

                        {d.notes && <p className="text-xs text-gray-500 mt-2">{d.notes}</p>}
                        {d.rappel_auto && <p className="text-xs text-blue-500 mt-1">🔔 Rappel automatique activé</p>}

                        {/* Actions */}
                        {d.fichier_url && (
                          <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                            <Button size="sm" variant="outline" className="flex-1 text-xs h-7"
                              onClick={() => setPreviewDoc(d)}>
                              <Eye className="w-3 h-3 mr-1" /> Voir
                            </Button>
                            <Button size="sm" variant="outline" className="flex-1 text-xs h-7"
                              onClick={() => handleDownload(d)}>
                              <Download className="w-3 h-3 mr-1" /> Télécharger
                            </Button>
                            <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600 h-7 w-7 p-0"
                              onClick={() => { if (confirm('Supprimer ce document ?')) deleteMutation.mutate(d.id); }}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                        {!d.fichier_url && (
                          <div className="flex justify-end mt-2">
                            <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600 h-7 w-7 p-0"
                              onClick={() => { if (confirm('Supprimer ce document ?')) deleteMutation.mutate(d.id); }}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal ajout */}
      <Dialog open={showForm} onOpenChange={closeForm}>
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

            {/* Upload zone */}
            <div>
              <Label>Fichier * <span className="text-gray-400 font-normal">(PDF, JPG, PNG, DOCX — max 10 Mo)</span></Label>
              <input ref={fileInputRef} type="file"
                accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx"
                className="hidden"
                onChange={e => handleFileSelect(e.target.files[0])} />

              {selectedFile ? (
                <div className="mt-1 flex items-center gap-3 p-3 border border-green-200 bg-green-50 rounded-lg">
                  {getFileIcon(selectedFile.type)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{selectedFile.name}</p>
                    <p className="text-xs text-gray-500">{formatSize(selectedFile.size)}</p>
                  </div>
                  <button onClick={() => setSelectedFile(null)} className="text-gray-400 hover:text-red-500 flex-shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`mt-1 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                    dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
                  }`}>
                  <Upload className="w-6 h-6 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm text-gray-500">Glissez un fichier ici ou <span className="text-blue-600 font-medium">cliquez pour parcourir</span></p>
                </div>
              )}
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
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || uploading}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                {uploading ? 'Upload en cours...' : createMutation.isPending ? 'Enregistrement...' : 'Ajouter'}
              </Button>
              <Button variant="outline" onClick={closeForm}>Annuler</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview modal */}
      {previewDoc && (
        <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {getFileIcon(previewDoc.file_type)}
                {previewDoc.file_name || previewDoc.nom || 'Document'}
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-3">
              {previewDoc.file_type?.startsWith('image/') ? (
                <img src={previewDoc.fichier_url} alt={previewDoc.file_name} className="max-w-full max-h-[65vh] rounded-lg object-contain" />
              ) : previewDoc.file_type === 'application/pdf' ? (
                <iframe src={previewDoc.fichier_url} title="PDF" className="w-full h-[65vh] rounded-lg border" />
              ) : (
                <div className="text-center py-10 text-gray-500">
                  <File className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Aperçu non disponible pour ce type de fichier.</p>
                </div>
              )}
              <Button onClick={() => handleDownload(previewDoc)} className="bg-blue-600 hover:bg-blue-700">
                <Download className="w-4 h-4 mr-2" /> Télécharger
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}