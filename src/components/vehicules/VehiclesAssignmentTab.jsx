import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CalendarDays, Plus, Zap, CheckCircle2, XCircle, AlertTriangle, Lock, RefreshCw, Users, Car } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';
import { calcLoaStats, vehicleDisplayName } from './vehiculeUtils';
import AssignmentCheckDetails from './AssignmentCheckDetails';

/**
 * Sort delivery vehicles by priority:
 * 1. SOCIETE vehicles (by km_actuel ASC)
 * 2. LOA vehicles (by km_restants DESC)
 */
function sortDeliveryVehicles(vehicles) {
  const societe = vehicles
    .filter(v => v.propriete === 'SOCIETE')
    .sort((a, b) => (a.km_actuel || 0) - (b.km_actuel || 0));

  const loa = vehicles
    .filter(v => v.propriete === 'LOA')
    .map(v => ({ ...v, _kmRestants: calcLoaStats(v)?.kmRestants ?? 0 }))
    .sort((a, b) => b._kmRestants - a._kmRestants);

  return [...societe, ...loa];
}

export default function VehiclesAssignmentTab() {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(moment().format('YYYY-MM-DD'));
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualForm, setManualForm] = useState({ vehicule_id: '', employe_id: '' });

  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => base44.entities.Vehicle.list()
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.filter({ is_active: true })
  });

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['assignments', selectedDate],
    queryFn: () => base44.entities.VehicleAssignment.filter({ date: selectedDate })
  });

  // Get all shifts for selected date to determine who is present
  const { data: shifts = [] } = useQuery({
    queryKey: ['shifts-date', selectedDate],
    queryFn: () => base44.entities.Shift.filter({ date: selectedDate })
  });

  const vehicleMap = useMemo(() => Object.fromEntries(vehicles.map(v => [v.id, v])), [vehicles]);
  const employeeMap = useMemo(() => Object.fromEntries(employees.map(e => [e.id, e])), [employees]);

  // Employees present today with a shift (not absent/leave)
  const presentEmployeeIds = useMemo(() => {
    return new Set(
      shifts
        .filter(s => s.status !== 'absent' && s.status !== 'leave')
        .map(s => s.employee_id)
    );
  }, [shifts]);

  // Livreurs = present employees in team "Livraison" or position containing "livreur"
  const livreursPresents = useMemo(() => {
    return employees.filter(e => {
      if (!presentEmployeeIds.has(e.id)) return false;
      const team = (e.team || '').toLowerCase();
      const position = (e.position || '').toLowerCase();
      return team.includes('livraison') || position.includes('livreur') || position.includes('livreuse');
    });
  }, [employees, presentEmployeeIds]);

  // Auto-assignable vehicles: ACTIF + LIVRAISON only (never DIRECTION)
  const autoVehicles = useMemo(() => {
    return sortDeliveryVehicles(
      vehicles.filter(v => v.statut === 'ACTIF' && v.type_usage === 'LIVRAISON')
    );
  }, [vehicles]);

  const nbLivreurs = livreursPresents.length;
  const nbVehicles = autoVehicles.length;
  const canAutoAssign = nbLivreurs > 0 && nbVehicles > 0;

  // Re-auto-assign mutation
  const autoAssignMutation = useMutation({
    mutationFn: async () => {
      if (!canAutoAssign) throw new Error('Aucun livreur présent ou aucun véhicule disponible');

      // Delete existing AUTO (non-locked) assignments for this date
      const toDelete = assignments.filter(a => a.source === 'AUTO' && !a.locked);
      await Promise.all(toDelete.map(a => base44.entities.VehicleAssignment.delete(a.id)));

      // Keep MANUEL and locked assignments to avoid conflicts
      const kept = assignments.filter(a => a.source === 'MANUEL' || a.locked);
      const keptVehicleIds = new Set(kept.map(a => a.vehicule_id));
      const keptEmployeeIds = new Set(kept.map(a => a.employe_id));

      // Filter available vehicles and livreurs (not already in kept assignments)
      const availableVehicles = autoVehicles.filter(v => !keptVehicleIds.has(v.id));
      const availableLivreurs = livreursPresents.filter(e => !keptEmployeeIds.has(e.id));

      const count = Math.min(availableVehicles.length, availableLivreurs.length);
      if (count === 0) throw new Error('Tous les livreurs ou véhicules sont déjà assignés manuellement');

      const toCreate = availableVehicles.slice(0, count).map((v, i) => ({
        date: selectedDate,
        vehicule_id: v.id,
        employe_id: availableLivreurs[i].id,
        employe_name: `${availableLivreurs[i].first_name} ${availableLivreurs[i].last_name}`,
        source: 'AUTO',
        locked: false,
        statut: 'ASSIGNE'
      }));

      await base44.entities.VehicleAssignment.bulkCreate(toCreate);
      return { created: toCreate.length, total: nbLivreurs, vehicles: nbVehicles };
    },
    onSuccess: ({ created, total, vehicles }) => {
      queryClient.invalidateQueries({ queryKey: ['assignments', selectedDate] });
      if (total > vehicles) {
        toast.warning(`${created} assignation(s) créée(s). ${total - vehicles} livreur(s) sans véhicule.`);
      } else {
        toast.success(`${created} assignation(s) automatique(s) créée(s)`);
      }
    },
    onError: (e) => toast.error(e.message)
  });

  const manualAssignMutation = useMutation({
    mutationFn: async () => {
      if (!manualForm.vehicule_id || !manualForm.employe_id) throw new Error('Véhicule et employé requis');
      // Check conflicts
      const conflict = assignments.find(a => a.vehicule_id === manualForm.vehicule_id || a.employe_id === manualForm.employe_id);
      if (conflict) throw new Error('Ce véhicule ou cet employé est déjà assigné ce jour');
      const emp = employeeMap[manualForm.employe_id];
      return base44.entities.VehicleAssignment.create({
        date: selectedDate,
        vehicule_id: manualForm.vehicule_id,
        employe_id: manualForm.employe_id,
        employe_name: emp ? `${emp.first_name} ${emp.last_name}` : '',
        source: 'MANUEL',
        locked: false,
        statut: 'ASSIGNE'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments', selectedDate] });
      toast.success('Assignation manuelle créée');
      setShowManualForm(false);
      setManualForm({ vehicule_id: '', employe_id: '' });
    },
    onError: (e) => toast.error(e.message)
  });

  const deleteAssignMutation = useMutation({
    mutationFn: (id) => base44.entities.VehicleAssignment.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments', selectedDate] });
      toast.success('Assignation supprimée');
    }
  });

  const toggleLockMutation = useMutation({
    mutationFn: ({ id, locked }) => base44.entities.VehicleAssignment.update(id, { locked }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assignments', selectedDate] })
  });

  // Livreurs without a vehicle after auto-assign
  const assignedEmployeeIds = new Set(assignments.map(a => a.employe_id));
  const livreursWithoutVehicle = livreursPresents.filter(e => !assignedEmployeeIds.has(e.id));

  return (
    <div className="space-y-5 mt-4">
      {/* Date picker + actions */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <Label className="text-sm font-medium">Date</Label>
          <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="mt-1 w-44" />
        </div>
        <Button
          onClick={() => autoAssignMutation.mutate()}
          disabled={autoAssignMutation.isPending || !canAutoAssign}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <RefreshCw className={`w-4 h-4 mr-1 ${autoAssignMutation.isPending ? 'animate-spin' : ''}`} />
          {autoAssignMutation.isPending ? 'Calcul...' : `Ré-auto-assigner (${Math.min(nbLivreurs, nbVehicles)} véhicules)`}
        </Button>
        <Button variant="outline" onClick={() => setShowManualForm(true)}>
          <Plus className="w-4 h-4 mr-1" /> Manuel
        </Button>
      </div>

      {/* Stats banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Users className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-semibold text-blue-800">Livreurs présents</span>
          </div>
          <p className="text-2xl font-bold text-blue-900">{nbLivreurs}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Car className="w-4 h-4 text-green-600" />
            <span className="text-xs font-semibold text-green-800">Véhicules dispo</span>
          </div>
          <p className="text-2xl font-bold text-green-900">{nbVehicles}</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <CheckCircle2 className="w-4 h-4 text-gray-500" />
            <span className="text-xs font-semibold text-gray-600">Assignés</span>
          </div>
          <p className="text-2xl font-bold text-gray-800">{assignments.length}</p>
        </div>
        {nbLivreurs > nbVehicles && (
          <div className="bg-orange-50 border border-orange-300 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <AlertTriangle className="w-4 h-4 text-orange-600" />
              <span className="text-xs font-semibold text-orange-800">Sans véhicule</span>
            </div>
            <p className="text-2xl font-bold text-orange-900">{nbLivreurs - nbVehicles}</p>
          </div>
        )}
      </div>

      {/* Alert: no delivery drivers */}
      {nbLivreurs === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-600 flex items-center gap-2">
          <Users className="w-4 h-4" /> Aucun livreur planifié pour ce jour.
        </div>
      )}

      {/* Alert: no vehicles */}
      {nbVehicles === 0 && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> Aucun véhicule LIVRAISON ACTIF disponible.
        </div>
      )}

      {/* Alert: livreurs without vehicle */}
      {livreursWithoutVehicle.length > 0 && assignments.length > 0 && (
        <div className="bg-orange-50 border border-orange-300 rounded-lg p-3 text-sm text-orange-800">
          <p className="font-semibold flex items-center gap-1 mb-1"><AlertTriangle className="w-4 h-4" /> Livreurs sans véhicule :</p>
          <ul className="list-disc ml-5 space-y-0.5">
            {livreursWithoutVehicle.map(e => (
              <li key={e.id}>{e.first_name} {e.last_name}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Assignments list */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-400">Chargement...</div>
      ) : assignments.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Aucune assignation pour ce jour</p>
          <p className="text-sm mt-1">Utilisez l'auto-assignation ou créez manuellement.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {assignments.map(a => {
            const vehicle = vehicleMap[a.vehicule_id];
            const emp = employeeMap[a.employe_id] || { first_name: a.employe_name || '?', last_name: '' };
            return (
              <div key={a.id} className={`border rounded-xl p-4 ${a.non_conformite ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900">
                        {vehicle ? `${vehicle.marque} ${vehicle.modele}` : a.vehicule_id}
                      </span>
                      {vehicle && <span className="text-xs text-gray-400 font-mono">{vehicle.immatriculation}</span>}
                      {vehicle && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${vehicle.propriete === 'SOCIETE' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                          {vehicle.propriete}
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        a.source === 'AUTO' ? 'bg-blue-100 text-blue-800'
                        : 'bg-purple-100 text-purple-800'
                      }`}>
                        {a.source}
                      </span>
                      {a.locked && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 flex items-center gap-1">
                          <Lock className="w-2.5 h-2.5" /> VERROUILLEE
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      👤 {emp.first_name} {emp.last_name}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      {a.km_debut != null && <span>Km départ: {a.km_debut}</span>}
                      {a.km_fin != null && <span>Km fin: {a.km_fin}</span>}
                      {a.distance_calculee != null && <span className="font-medium text-gray-700">{a.distance_calculee} km parcourus</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs flex items-center gap-1">
                        {a.debut_shift_fait ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <XCircle className="w-3.5 h-3.5 text-gray-300" />}
                        Début shift
                      </span>
                      <span className="text-xs flex items-center gap-1">
                        {a.fin_service_fait ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <XCircle className="w-3.5 h-3.5 text-gray-300" />}
                        Fin service
                      </span>
                      <span className="text-xs flex items-center gap-1">
                        {a.cle_remise ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <XCircle className="w-3.5 h-3.5 text-gray-300" />}
                        Clé remise
                      </span>
                      {a.non_conformite && (
                        <span className="text-xs text-red-600 flex items-center gap-1 font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" /> Non-conformité
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      a.statut === 'TERMINE' ? 'bg-green-100 text-green-800'
                      : a.statut === 'EN_COURS' ? 'bg-blue-100 text-blue-800'
                      : 'bg-gray-100 text-gray-700'
                    }`}>{a.statut}</span>
                    <button
                      onClick={() => toggleLockMutation.mutate({ id: a.id, locked: !a.locked })}
                      className={`text-xs flex items-center gap-1 ${a.locked ? 'text-yellow-600 hover:text-yellow-800' : 'text-gray-400 hover:text-yellow-600'}`}
                      title={a.locked ? 'Déverrouiller' : 'Verrouiller'}
                    >
                      <Lock className="w-3 h-3" /> {a.locked ? 'Déverrou.' : 'Verrou.'}
                    </button>
                    {!a.locked && (
                      <button onClick={() => { if (confirm('Supprimer cette assignation ?')) deleteAssignMutation.mutate(a.id); }}
                        className="text-xs text-red-400 hover:text-red-700">Supprimer</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Manual assign modal */}
      <Dialog open={showManualForm} onOpenChange={setShowManualForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assignation manuelle</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-gray-500 -mt-2">En mode manuel, tous les véhicules ACTIFS sont disponibles (y compris Direction).</p>
          <div className="space-y-4">
            <div>
              <Label>Véhicule (tous types)</Label>
              <Select value={manualForm.vehicule_id} onValueChange={v => setManualForm(f => ({ ...f, vehicule_id: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Choisir un véhicule..." /></SelectTrigger>
                <SelectContent>
                  {vehicles.filter(v => v.statut === 'ACTIF').map(v => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.type_usage === 'DIRECTION' ? '🔑 ' : '🚚 '}{v.marque} {v.modele} — {v.immatriculation} ({v.type_usage})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Conducteur</Label>
              <Select value={manualForm.employe_id} onValueChange={v => setManualForm(f => ({ ...f, employe_id: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Choisir un employé..." /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}{e.position ? ` — ${e.position}` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={() => manualAssignMutation.mutate()} disabled={manualAssignMutation.isPending} className="flex-1 bg-blue-600 hover:bg-blue-700">
                {manualAssignMutation.isPending ? 'Création...' : 'Créer l\'assignation'}
              </Button>
              <Button variant="outline" onClick={() => setShowManualForm(false)}>Annuler</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}