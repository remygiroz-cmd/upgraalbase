import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Search, Check, X } from 'lucide-react';
import { shouldDisplayEmployeeInPlanning } from '@/components/planning/employeeDisplayFilter';
import { formatLocalDate } from '@/components/planning/dateUtils';

export default function ProposeShiftModal({ open, onOpenChange, currentUser, positions: positionsProp, shifts, nonShiftEvents }) {
  const [position, setPosition] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: allEmployees = [] } = useQuery({
    queryKey: ['employees', 'active'],
    queryFn: () => base44.entities.Employee.filter({ is_active: true }),
    staleTime: 5 * 60 * 1000,
  });

  // Fetch positions directly if not provided or empty
  const { data: fetchedPositions = [] } = useQuery({
    queryKey: ['positions', 'active'],
    queryFn: async () => {
      const all = await base44.entities.Position.filter({ is_active: true });
      return all.sort((a, b) => (a.order || 0) - (b.order || 0));
    },
    staleTime: 5 * 60 * 1000,
  });

  const positions = (positionsProp && positionsProp.length > 0) ? positionsProp : fetchedPositions;

  // Eligible employees: displayable in planning + no shift/nonShift that day
  const eligibleEmployees = useMemo(() => {
    if (!date) return [];
    const [y, m] = date.split('-').map(Number);
    const year = y;
    const month = m - 1;

    const shiftEmployeeIds = new Set(
      shifts.filter(s => s.date === date && s.status !== 'archived').map(s => s.employee_id)
    );
    const nonShiftEmployeeIds = new Set(
      nonShiftEvents.filter(e => e.date === date).map(e => e.employee_id)
    );

    return allEmployees.filter(emp => {
      if (!shouldDisplayEmployeeInPlanning(emp, year, month)) return false;
      if (shiftEmployeeIds.has(emp.id)) return false;
      if (nonShiftEmployeeIds.has(emp.id)) return false;
      return true;
    });
  }, [date, allEmployees, shifts, nonShiftEvents]);

  const filteredEmployees = useMemo(() => {
    if (!search) return eligibleEmployees;
    const q = search.toLowerCase();
    return eligibleEmployees.filter(e =>
      `${e.first_name} ${e.last_name}`.toLowerCase().includes(q)
    );
  }, [eligibleEmployees, search]);

  const toggleEmployee = (id) => {
    setSelectedEmployeeIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    if (!position || !date || !startTime || !endTime) {
      toast.error('Veuillez remplir tous les champs obligatoires');
      return;
    }
    if (selectedEmployeeIds.length === 0) {
      toast.error('Sélectionnez au moins un employé');
      return;
    }

    setSaving(true);
    try {
      const dedupeKey = `${date}_${startTime}_${endTime}_${position}_${currentUser?.id || currentUser?.email}_${Date.now()}`;

      const offer = await base44.entities.ShiftOffer.create({
        created_by_user_id: currentUser?.id || currentUser?.email,
        created_by_name: currentUser?.full_name || currentUser?.email,
        position,
        date,
        start_time: startTime,
        end_time: endTime,
        notes: notes || null,
        status: 'open',
        dedupe_key: dedupeKey,
      });

      const recipients = selectedEmployeeIds.map(empId => {
        const emp = allEmployees.find(e => e.id === empId);
        return {
          offer_id: offer.id,
          employee_id: empId,
          employee_name: emp ? `${emp.first_name} ${emp.last_name}` : empId,
          status: 'pending',
        };
      });

      await base44.entities.ShiftOfferRecipient.bulkCreate(recipients);

      toast.success(`Offre envoyée à ${recipients.length} employé(s) ✅`);
      onOpenChange(false);
      resetForm();
    } catch (err) {
      toast.error('Erreur : ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setPosition(''); setDate(''); setStartTime(''); setEndTime('');
    setNotes(''); setSelectedEmployeeIds([]); setSearch('');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-orange-600 font-bold">📅 Proposer un shift supplémentaire</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Position */}
          <div>
            <Label className="text-xs font-semibold text-gray-600">Poste *</Label>
            <Select value={position} onValueChange={setPosition}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Choisir un poste…" />
              </SelectTrigger>
              <SelectContent>
                {positions.map(p => (
                  <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date */}
          <div>
            <Label className="text-xs font-semibold text-gray-600">Date *</Label>
            <Input type="date" value={date} onChange={e => { setDate(e.target.value); setSelectedEmployeeIds([]); }} className="h-9" />
          </div>

          {/* Horaires */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-gray-600">Début *</Label>
              <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs font-semibold text-gray-600">Fin *</Label>
              <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="h-9" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs font-semibold text-gray-600">Notes (optionnel)</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Informations complémentaires…" className="h-9" />
          </div>

          {/* Employee selection */}
          <div>
            <Label className="text-xs font-semibold text-gray-600 mb-1 block">
              Employés disponibles ce jour
              {date && <span className="ml-1 text-gray-400">({eligibleEmployees.length} dispo.)</span>}
            </Label>
            {!date ? (
              <p className="text-xs text-gray-400 italic py-2">Sélectionnez une date pour voir les disponibilités.</p>
            ) : (
              <>
                <div className="relative mb-2">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <Input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Rechercher…"
                    className="h-8 pl-7 text-xs"
                  />
                </div>
                <div className="max-h-44 overflow-y-auto border rounded-lg divide-y">
                  {filteredEmployees.length === 0 ? (
                    <p className="text-xs text-gray-400 italic p-3 text-center">Aucun employé disponible</p>
                  ) : (
                    filteredEmployees.map(emp => {
                      const selected = selectedEmployeeIds.includes(emp.id);
                      return (
                        <button
                          key={emp.id}
                          type="button"
                          onClick={() => toggleEmployee(emp.id)}
                          className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors ${selected ? 'bg-orange-50 text-orange-700' : 'hover:bg-gray-50'}`}
                        >
                          <span>{emp.first_name} {emp.last_name}</span>
                          {selected && <Check className="w-4 h-4 text-orange-500" />}
                        </button>
                      );
                    })
                  )}
                </div>
                {selectedEmployeeIds.length > 0 && (
                  <p className="text-xs text-orange-600 font-medium mt-1">{selectedEmployeeIds.length} sélectionné(s)</p>
                )}
              </>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={() => { onOpenChange(false); resetForm(); }} className="flex-1">Annuler</Button>
            <Button onClick={handleSubmit} disabled={saving} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white">
              {saving ? 'Envoi…' : 'Envoyer l\'offre'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}