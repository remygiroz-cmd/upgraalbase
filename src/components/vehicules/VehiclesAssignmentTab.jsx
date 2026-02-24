import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CalendarDays, Plus, Zap, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';
import { calcLoaStats, vehicleDisplayName, scoreVehicleForAssignment } from './vehiculeUtils';

export default function VehiclesAssignmentTab({ currentEmployee }) {
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

  const { data: allAssignments30 = [] } = useQuery({
    queryKey: ['assignments30'],
    queryFn: async () => {
      const from = moment().subtract(30, 'days').format('YYYY-MM-DD');
      const all = await base44.entities.VehicleAssignment.list('-date', 300);
      return all.filter(a => a.date >= from);
    }
  });

  const vehicleMap = useMemo(() => Object.fromEntries(vehicles.map(v => [v.id, v])), [vehicles]);
  const employeeMap = useMemo(() => Object.fromEntries(employees.map(e => [e.id, e])), [employees]);

  const dow = moment(selectedDate).isoWeekday(); // 1=Mon, 7=Sun
  const neededDelivery = dow <= 4 ? 3 : 4;
  const deliveryVehicles = vehicles.filter(v => v.type_usage === 'LIVRAISON' && v.statut === 'ACTIF');

  const autoAssignMutation = useMutation({
    mutationFn: async () => {
      // Score and rank delivery vehicles
      const scored = deliveryVehicles.map(v => ({
        vehicle: v,
        score: scoreVehicleForAssignment(v, allAssignments30, calcLoaStats(v))
      })).sort((a, b) => b.score - a.score);

      const topVehicles = scored.slice(0, neededDelivery).map(s => s.vehicle);
      // Get livreurs (employees who are delivery staff) — for now assign first N active employees
      const livreurs = employees.slice(0, neededDelivery);

      const toCreate = topVehicles.map((v, i) => ({
        date: selectedDate,
        vehicule_id: v.id,
        employe_id: livreurs[i]?.id || '',
        employe_name: livreurs[i] ? `${livreurs[i].first_name} ${livreurs[i].last_name}` : '',
        source: 'AUTO',
        statut: 'ASSIGNE'
      })).filter(a => a.employe_id);

      await base44.entities.VehicleAssignment.bulkCreate(toCreate);
      return toCreate.length;
    },
    onSuccess: (n) => {
      queryClient.invalidateQueries({ queryKey: ['assignments', selectedDate] });
      toast.success(`${n} assignation(s) automatique(s) créée(s)`);
    },
    onError: (e) => toast.error(e.message)
  });

  const manualAssignMutation = useMutation({
    mutationFn: async () => {
      if (!manualForm.vehicule_id || !manualForm.employe_id) throw new Error('Véhicule et employé requis');
      const emp = employeeMap[manualForm.employe_id];
      return base44.entities.VehicleAssignment.create({
        date: selectedDate,
        vehicule_id: manualForm.vehicule_id,
        employe_id: manualForm.employe_id,
        employe_name: emp ? `${emp.first_name} ${emp.last_name}` : '',
        source: 'MANUEL',
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

  const updateStatutMutation = useMutation({
    mutationFn: ({ id, statut }) => base44.entities.VehicleAssignment.update(id, { statut }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assignments', selectedDate] })
  });

  return (
    <div className="space-y-5 mt-4">
      {/* Date picker + actions */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <Label className="text-sm font-medium">Date</Label>
          <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="mt-1 w-44" />
        </div>
        <Button onClick={() => autoAssignMutation.mutate()} disabled={autoAssignMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
          <Zap className="w-4 h-4 mr-1" />
          {autoAssignMutation.isPending ? 'Calcul...' : `Auto-assigner (${neededDelivery} véhicules)`}
        </Button>
        <Button variant="outline" onClick={() => setShowManualForm(true)}>
          <Plus className="w-4 h-4 mr-1" /> Manuel
        </Button>
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900">
        <span className="font-semibold">
          {moment(selectedDate).format('dddd DD MMMM YYYY')} —
        </span>
        {' '}{dow <= 4 ? 'Lundi–Jeudi' : 'Vendredi–Dimanche'} : {neededDelivery} véhicule(s) livraison requis
      </div>

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
                      <span className={`text-xs px-2 py-0.5 rounded-full ${a.source === 'AUTO' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                        {a.source}
                      </span>
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
                    <button onClick={() => { if (confirm('Supprimer cette assignation ?')) deleteAssignMutation.mutate(a.id); }}
                      className="text-xs text-red-500 hover:text-red-700">Supprimer</button>
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
          <div className="space-y-4">
            <div>
              <Label>Véhicule</Label>
              <Select value={manualForm.vehicule_id} onValueChange={v => setManualForm(f => ({ ...f, vehicule_id: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Choisir un véhicule..." /></SelectTrigger>
                <SelectContent>
                  {vehicles.filter(v => v.statut === 'ACTIF').map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.marque} {v.modele} — {v.immatriculation}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Employé</Label>
              <Select value={manualForm.employe_id} onValueChange={v => setManualForm(f => ({ ...f, employe_id: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Choisir un employé..." /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={() => manualAssignMutation.mutate()} disabled={manualAssignMutation.isPending} className="flex-1">
                Créer l'assignation
              </Button>
              <Button variant="outline" onClick={() => setShowManualForm(false)}>Annuler</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}