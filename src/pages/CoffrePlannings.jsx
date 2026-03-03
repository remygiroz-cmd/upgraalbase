import React, { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import {
  Camera, Download, Trash2, FileText, Calendar, User, HardDrive,
  Loader2, AlertCircle, CheckCircle2, Filter, ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

function computeMonthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function formatFileSize(kb) {
  if (!kb) return '—';
  if (kb < 1024) return `${kb} Ko`;
  return `${(kb / 1024).toFixed(1)} Mo`;
}

function buildMonthOptions() {
  const options = [];
  const now = new Date();
  for (let i = 6; i >= -6; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = computeMonthKey(d.getFullYear(), d.getMonth());
    options.push({ key, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` });
  }
  return options;
}

const ALLOWED_ROLES = ['gérant', 'gerant', 'bureau', 'manager'];

export default function CoffrePlannings() {
  const queryClient = useQueryClient();
  const [selectedMonthKey, setSelectedMonthKey] = useState(() => {
    const now = new Date();
    return computeMonthKey(now.getFullYear(), now.getMonth());
  });
  const [filterMonth, setFilterMonth] = useState('all');
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Refs pour le rendu offscreen
  const [renderKey, setRenderKey] = useState(null);
  const [snapshotData, setSnapshotData] = useState(null);

  const monthOptions = buildMonthOptions();

  // User
  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: userRole } = useQuery({
    queryKey: ['userRole', currentUser?.role_id],
    queryFn: async () => {
      if (!currentUser?.role_id) return null;
      const roles = await base44.entities.Role.filter({ id: currentUser.role_id });
      return roles[0] || null;
    },
    enabled: !!currentUser?.role_id,
    staleTime: 10 * 60 * 1000,
  });

  const isAdmin = currentUser?.role === 'admin';
  const canAccess = isAdmin || ALLOWED_ROLES.some(r => userRole?.name?.toLowerCase() === r.toLowerCase());
  const canDelete = isAdmin;

  // Snapshots
  const { data: snapshots = [], isLoading: loadingSnapshots } = useQuery({
    queryKey: ['planningSnapshots'],
    queryFn: () => base44.entities.PlanningSnapshot.list('-created_date', 100),
    staleTime: 30 * 1000,
    enabled: canAccess,
  });

  const filteredSnapshots = snapshots.filter(s => filterMonth === 'all' || s.month_key === filterMonth);

  const deleteSnapshotMutation = useMutation({
    mutationFn: (id) => base44.entities.PlanningSnapshot.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planningSnapshots'] });
      toast.success('Snapshot supprimé');
      setConfirmDelete(null);
    },
    onError: (err) => toast.error('Erreur suppression : ' + err.message),
  });

  // Génération du snapshot
  const handleGenerate = useCallback(async () => {
    if (!selectedMonthKey) return;
    setGenerating(true);
    setProgress('Initialisation…');
    setProgressPct(5);
    setRendererReady(false);

    // Lazy import du renderer (pas dans Planning !)
    const SnapshotRenderer = (await import('@/components/planning/SnapshotRenderer')).default;
    const { generateSnapshotPDF } = await import('@/components/planning/SnapshotGenerator');

    // Monter le renderer offscreen en lui passant le monthKey
    setRenderKey(selectedMonthKey);
    setProgress('Chargement des données du mois…');
    setProgressPct(15);

    // Attendre que le renderer soit prêt (via callback onReady)
    // Cf. ci-dessous dans le JSX
  }, [selectedMonthKey]);

  const handleRendererReady = useCallback(async () => {
    if (!rendererRef.current) return;
    setRendererReady(true);

    try {
      const { generateSnapshotPDF } = await import('@/components/planning/SnapshotGenerator');

      const captureEl = rendererRef.current.getCaptureElement();
      const data = rendererRef.current.getData();

      if (!captureEl || !data) throw new Error('Composant offscreen non disponible');

      setProgress('Capture du planning en cours…');
      setProgressPct(35);

      const onProgress = (msg) => {
        setProgress(msg);
        setProgressPct(prev => Math.min(prev + 10, 90));
      };

      const { blob, exportRowsCount } = await generateSnapshotPDF(captureEl, data, onProgress);

      setProgress('Upload du fichier…');
      setProgressPct(92);

      // Nom du fichier
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      const timeStr = `${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}`;
      const fileName = `SNAPSHOT_${selectedMonthKey}_v${data.ctx.reset_version}_${dateStr}_${timeStr}.pdf`;
      const file = new File([blob], fileName, { type: 'application/pdf' });

      const uploaded = await base44.integrations.Core.UploadFile({ file });
      if (!uploaded?.file_url) throw new Error('Upload échoué');

      const fileSizeKb = Math.round(blob.size / 1024);

      setProgress('Sauvegarde dans le coffre…');
      setProgressPct(97);

      await base44.entities.PlanningSnapshot.create({
        month_key: selectedMonthKey,
        month_label: data.monthName + ' ' + data.yr,
        reset_version: data.ctx.reset_version,
        file_url: uploaded.file_url,
        file_name: fileName,
        file_size_kb: fileSizeKb,
        created_by_name: currentUser?.full_name || currentUser?.email || 'Inconnu',
        planning_employees_count: data.employees.length,
        planning_shifts_count: data.shifts.length,
        export_rows_count: exportRowsCount,
      });

      queryClient.invalidateQueries({ queryKey: ['planningSnapshots'] });
      setProgressPct(100);
      setProgress('Snapshot généré avec succès !');
      toast.success(`✅ Snapshot ${data.monthName} ${data.yr} enregistré`);

      await new Promise(r => setTimeout(r, 1200));
    } catch (err) {
      toast.error('Erreur génération : ' + err.message);
      console.error('[Snapshot]', err);
    } finally {
      setGenerating(false);
      setRenderKey(null);
      setRendererReady(false);
      setProgress('');
      setProgressPct(0);
    }
  }, [selectedMonthKey, currentUser, queryClient]);

  const handleRendererError = useCallback((msg) => {
    toast.error('Erreur chargement données : ' + msg);
    setGenerating(false);
    setRenderKey(null);
    setRendererReady(false);
    setProgress('');
    setProgressPct(0);
  }, []);

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-gray-500">
        <AlertCircle className="w-12 h-12 text-gray-300" />
        <p className="text-lg font-medium">Accès non autorisé</p>
        <p className="text-sm">Cette section est réservée aux administrateurs, gérants et managers.</p>
      </div>
    );
  }

  const selectedMonthLabel = monthOptions.find(m => m.key === selectedMonthKey)?.label || selectedMonthKey;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
          <Camera className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Coffre à plannings</h1>
          <p className="text-sm text-gray-500">Snapshots PDF mensuels (planning + export compta)</p>
        </div>
      </div>

      {/* Section génération */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Camera className="w-4 h-4 text-indigo-500" />
          Générer un nouveau snapshot
        </h2>

        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Mois à capturer</label>
            <Select value={selectedMonthKey} onValueChange={setSelectedMonthKey} disabled={generating}>
              <SelectTrigger className="h-9 border-gray-300">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map(m => (
                  <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-indigo-600 hover:bg-indigo-700 h-9 px-5 whitespace-nowrap"
          >
            {generating ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Génération…</>
            ) : (
              <><Camera className="w-4 h-4 mr-2" />📸 Générer le snapshot</>
            )}
          </Button>
        </div>

        {/* Barre de progression */}
        {generating && (
          <div className="mt-4 space-y-2">
            <Progress value={progressPct} className="h-2" />
            <p className="text-xs text-gray-500 text-center">{progress}</p>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-3">
          Le PDF inclut 2 parties : export comptable (page 1) + planning complet en image (page 2+).
          La génération prend environ 15–30 secondes selon le volume de données.
        </p>
      </div>

      {/* Filtres + liste */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-500" />
            Snapshots enregistrés
            {!loadingSnapshots && (
              <span className="text-xs font-normal text-gray-400 ml-1">({filteredSnapshots.length})</span>
            )}
          </h2>

          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger className="h-7 text-xs border-gray-200 w-40">
                <SelectValue placeholder="Tous les mois" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les mois</SelectItem>
                {monthOptions.map(m => (
                  <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loadingSnapshots ? (
          <div className="p-8 text-center text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            Chargement…
          </div>
        ) : filteredSnapshots.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Camera className="w-10 h-10 mx-auto mb-3 text-gray-200" />
            <p className="font-medium text-gray-500">Aucun snapshot</p>
            <p className="text-sm mt-1">Générez votre premier snapshot ci-dessus.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filteredSnapshots.map(snap => (
              <div key={snap.id} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors">
                <div className="w-9 h-9 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText className="w-4 h-4 text-indigo-500" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">{snap.month_label || snap.month_key}</span>
                    <Badge variant="outline" className="text-[10px] h-5 font-mono">v{snap.reset_version}</Badge>
                    {snap.export_rows_count > 0 && (
                      <Badge variant="secondary" className="text-[10px] h-5">{snap.export_rows_count} employés</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />{snap.created_by_name || '—'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {snap.created_date ? new Date(snap.created_date).toLocaleString('fr-FR', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'}
                    </span>
                    {snap.file_size_kb && (
                      <span className="flex items-center gap-1">
                        <HardDrive className="w-3 h-3" />{formatFileSize(snap.file_size_kb)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {snap.file_url && (
                    <>
                      <a
                        href={snap.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Ouvrir dans un nouvel onglet"
                      >
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-indigo-600 hover:bg-indigo-50">
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </a>
                      <a href={snap.file_url} download={snap.file_name || 'snapshot.pdf'}>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-600 hover:bg-gray-100">
                          <Download className="w-4 h-4" />
                        </Button>
                      </a>
                    </>
                  )}
                  {canDelete && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-red-400 hover:bg-red-50 hover:text-red-600"
                      onClick={() => setConfirmDelete(snap)}
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirm delete */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <Trash2 className="w-5 h-5" /> Supprimer le snapshot
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Supprimer le snapshot de <strong>{confirmDelete?.month_label}</strong> (v{confirmDelete?.reset_version}) ?
            Cette action est irréversible.
          </p>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmDelete(null)} className="flex-1">Annuler</Button>
            <Button
              onClick={() => deleteSnapshotMutation.mutate(confirmDelete.id)}
              className="flex-1 bg-red-600 hover:bg-red-700"
              disabled={deleteSnapshotMutation.isPending}
            >
              {deleteSnapshotMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Supprimer'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Renderer offscreen — monté uniquement pendant la génération */}
      {renderKey && (() => {
        const SnapshotRenderer = React.lazy(() => import('@/components/planning/SnapshotRenderer'));
        return (
          <React.Suspense fallback={null}>
            <SnapshotRenderer
              ref={rendererRef}
              monthKey={renderKey}
              onReady={handleRendererReady}
              onError={handleRendererError}
            />
          </React.Suspense>
        );
      })()}
    </div>
  );
}