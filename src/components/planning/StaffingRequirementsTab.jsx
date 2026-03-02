import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Plus, Trash2, Save, Users, CheckCircle2 } from 'lucide-react';

const DAYS = [
  { key: 'mon', label: 'Lun' },
  { key: 'tue', label: 'Mar' },
  { key: 'wed', label: 'Mer' },
  { key: 'thu', label: 'Jeu' },
  { key: 'fri', label: 'Ven' },
  { key: 'sat', label: 'Sam' },
  { key: 'sun', label: 'Dim' },
];

export default function StaffingRequirementsTab({ positions = [] }) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState([]);
  const [newPosition, setNewPosition] = useState('');
  const [dirty, setDirty] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  // Prevent the useEffect from overwriting local edits after a save
  const isSavingRef = useRef(false);
  const initializedRef = useRef(false);

  const { data: requirements = [], isLoading } = useQuery({
    queryKey: ['staffingRequirements'],
    queryFn: () => base44.entities.StaffingRequirement.list(),
    staleTime: 60 * 1000,
  });

  // Only initialize rows from server data on first load (not on every invalidation)
  useEffect(() => {
    if (isSavingRef.current) return; // ignore refetch triggered by our own save
    if (initializedRef.current && !dirty) {
      // Refresh from server if there are no pending local changes
      setRows(requirements.map(r => ({ ...r })));
    } else if (!initializedRef.current && requirements.length >= 0) {
      setRows(requirements.map(r => ({ ...r })));
      initializedRef.current = true;
    }
  }, [requirements]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMutation = useMutation({
    mutationFn: async (updatedRows) => {
      isSavingRef.current = true;
      const ops = [];
      for (const row of updatedRows) {
        const payload = {
          position: row.position,
          mon: row.mon || 0,
          tue: row.tue || 0,
          wed: row.wed || 0,
          thu: row.thu || 0,
          fri: row.fri || 0,
          sat: row.sat || 0,
          sun: row.sun || 0,
        };
        if (row.id) {
          ops.push(base44.entities.StaffingRequirement.update(row.id, payload));
        } else {
          ops.push(base44.entities.StaffingRequirement.create(payload));
        }
      }
      const results = await Promise.all(ops);
      return results;
    },
    onSuccess: (results) => {
      // Update local rows with server-returned ids (for newly created rows)
      setRows(prev => prev.map((r, i) => r.id ? r : { ...r, ...results[i] }));
      setDirty(false);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
      toast.success('Besoins d\'effectif enregistrés ✓');
      // Now safe to invalidate — isSavingRef will be cleared after refetch
      queryClient.invalidateQueries({ queryKey: ['staffingRequirements'] }).finally(() => {
        isSavingRef.current = false;
      });
    },
    onError: (err) => {
      isSavingRef.current = false;
      toast.error('Erreur lors de l\'enregistrement : ' + err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (row) => {
      if (row.id) await base44.entities.StaffingRequirement.delete(row.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staffingRequirements'] });
      toast.success('Ligne supprimée');
    },
  });

  const handleChange = (idx, day, value) => {
    const num = Math.max(0, parseInt(value) || 0);
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [day]: num } : r));
    setDirty(true);
  };

  const handleAddPosition = () => {
    const trimmed = newPosition.trim().toUpperCase();
    if (!trimmed) return;
    if (rows.some(r => r.position.toUpperCase() === trimmed)) {
      toast.error('Ce poste existe déjà');
      return;
    }
    setRows(prev => [...prev, { position: trimmed, mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 }]);
    setNewPosition('');
    setDirty(true);
  };

  const handleDelete = (idx) => {
    const row = rows[idx];
    if (row.id) {
      deleteMutation.mutate(row);
    }
    setRows(prev => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const handleAddFromPositions = (posLabel) => {
    if (rows.some(r => r.position.toUpperCase() === posLabel.toUpperCase())) {
      toast.info('Ce poste est déjà configuré');
      return;
    }
    setRows(prev => [...prev, { position: posLabel, mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 }]);
    setDirty(true);
  };

  if (isLoading) return <div className="py-8 text-center text-gray-400 text-sm">Chargement…</div>;

  const unusedPositions = positions.filter(p => !rows.some(r => r.position.toUpperCase() === p.label.toUpperCase()));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-1">
          <Users className="w-4 h-4 text-amber-700" />
          <h3 className="font-semibold text-amber-900 text-sm">Besoins d'effectif par poste</h3>
        </div>
        <p className="text-xs text-amber-800">
          Définissez le nombre minimum de personnes requises par poste et par jour de semaine.
          Un avertissement ⚠️ s'affichera dans le planning si le seuil n'est pas atteint.
        </p>
      </div>

      {/* Quick add from existing positions */}
      {unusedPositions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-gray-500 self-center">Ajouter rapidement :</span>
          {unusedPositions.map(p => (
            <button
              key={p.id}
              onClick={() => handleAddFromPositions(p.label)}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-xs border border-dashed border-gray-300 text-gray-600 hover:border-amber-400 hover:text-amber-700 hover:bg-amber-50 transition-colors"
              style={{ borderColor: p.color ? p.color + '80' : undefined }}
            >
              <Plus className="w-3 h-3" />
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2 font-semibold text-gray-700 text-xs">Poste</th>
                {DAYS.map(d => (
                  <th key={d.key} className={`px-2 py-2 text-center font-semibold text-xs ${d.key === 'sat' || d.key === 'sun' ? 'text-orange-600' : 'text-gray-700'}`}>
                    {d.label}
                  </th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row, idx) => (
                <tr key={row.id || idx} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {(() => {
                        const pos = positions.find(p => p.label.toUpperCase() === row.position.toUpperCase());
                        return pos ? (
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: pos.color || '#6b7280' }} />
                        ) : null;
                      })()}
                      <span className="font-medium text-gray-900 text-xs">{row.position}</span>
                    </div>
                  </td>
                  {DAYS.map(d => (
                    <td key={d.key} className="px-1 py-1 text-center">
                      <input
                        type="number"
                        min="0"
                        max="20"
                        value={row[d.key] || 0}
                        onChange={(e) => handleChange(idx, d.key, e.target.value)}
                        className={`w-10 text-center text-xs border rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-amber-400 ${
                          (row[d.key] || 0) > 0 ? 'border-amber-300 bg-amber-50 font-semibold' : 'border-gray-200 bg-white text-gray-400'
                        }`}
                      />
                    </td>
                  ))}
                  <td className="px-1 py-1 text-center">
                    <button
                      onClick={() => handleDelete(idx)}
                      className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-lg">
          Aucun besoin configuré. Ajoutez des postes ci-dessous.
        </div>
      )}

      {/* Add custom position */}
      <div className="flex gap-2">
        <Input
          placeholder="Nom du poste (ex: LIVRAISON)"
          value={newPosition}
          onChange={(e) => setNewPosition(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddPosition()}
          className="text-sm h-8"
        />
        <Button onClick={handleAddPosition} variant="outline" size="sm" className="h-8 px-3 gap-1">
          <Plus className="w-3.5 h-3.5" />
          Ajouter
        </Button>
      </div>

      {/* Save button */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <p className="text-xs text-gray-500 flex items-center gap-2">
          {rows.length} poste{rows.length !== 1 ? 's' : ''} configuré{rows.length !== 1 ? 's' : ''}
          {dirty && <span className="text-amber-600 font-medium">• Modifications non enregistrées</span>}
        </p>
        <div className="flex items-center gap-2">
          {savedOk && !dirty && (
            <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Enregistré
            </span>
          )}
          <Button
            onClick={() => saveMutation.mutate(rows)}
            disabled={!dirty || saveMutation.isPending}
            className={`h-8 gap-1.5 text-xs ${dirty ? 'bg-amber-600 hover:bg-amber-700' : 'bg-gray-400'}`}
          >
            <Save className="w-3.5 h-3.5" />
            {saveMutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </div>
  );
}