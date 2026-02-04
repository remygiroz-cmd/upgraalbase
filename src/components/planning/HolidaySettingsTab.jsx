import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Calendar, Plus, Trash2, AlertTriangle, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const FRENCH_HOLIDAYS_2026 = [
  { date: '2026-01-01', name: 'Jour de l\'an', is_may_first: false },
  { date: '2026-04-06', name: 'Lundi de Pâques', is_may_first: false },
  { date: '2026-05-01', name: '1er mai - Fête du Travail', is_may_first: true },
  { date: '2026-05-08', name: '8 mai 1945', is_may_first: false },
  { date: '2026-05-14', name: 'Ascension', is_may_first: false },
  { date: '2026-05-25', name: 'Lundi de Pentecôte', is_may_first: false },
  { date: '2026-07-14', name: 'Fête nationale', is_may_first: false },
  { date: '2026-08-15', name: 'Assomption', is_may_first: false },
  { date: '2026-11-01', name: 'Toussaint', is_may_first: false },
  { date: '2026-11-11', name: 'Armistice 1918', is_may_first: false },
  { date: '2026-12-25', name: 'Noël', is_may_first: false }
];

export default function HolidaySettingsTab() {
  const queryClient = useQueryClient();
  const [newHoliday, setNewHoliday] = useState({ date: '', name: '' });

  // Fetch holidays
  const { data: holidays = [] } = useQuery({
    queryKey: ['holidays'],
    queryFn: async () => {
      const allHolidays = await base44.entities.Holiday.filter({ is_active: true });
      return allHolidays.sort((a, b) => a.date.localeCompare(b.date));
    }
  });

  // Fetch policy
  const { data: policies = [] } = useQuery({
    queryKey: ['holidayPolicies'],
    queryFn: () => base44.entities.HolidayPolicy.filter({ is_active: true })
  });

  const policy = policies[0];

  // Mutations
  const createHolidayMutation = useMutation({
    mutationFn: (data) => base44.entities.Holiday.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      toast.success('Jour férié ajouté');
      setNewHoliday({ date: '', name: '' });
    }
  });

  const deleteHolidayMutation = useMutation({
    mutationFn: (id) => base44.entities.Holiday.update(id, { is_active: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      toast.success('Jour férié supprimé');
    }
  });

  const savePolicyMutation = useMutation({
    mutationFn: (data) => {
      if (policy) {
        return base44.entities.HolidayPolicy.update(policy.id, data);
      } else {
        return base44.entities.HolidayPolicy.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holidayPolicies'] });
      toast.success('Politique enregistrée');
    }
  });

  const initializeHolidays = async () => {
    try {
      const toCreate = FRENCH_HOLIDAYS_2026.map(h => ({
        ...h,
        type: 'legal',
        year: 2026,
        is_active: true
      }));
      await base44.entities.Holiday.bulkCreate(toCreate);
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      toast.success('Jours fériés 2026 initialisés');
    } catch (error) {
      toast.error('Erreur : ' + error.message);
    }
  };

  const handleAddHoliday = () => {
    if (!newHoliday.date || !newHoliday.name) {
      toast.error('Date et nom requis');
      return;
    }
    createHolidayMutation.mutate({
      ...newHoliday,
      type: 'local',
      year: parseInt(newHoliday.date.split('-')[0]),
      is_may_first: false,
      is_active: true
    });
  };

  const handlePolicyUpdate = (field, value) => {
    const updatedPolicy = { ...policy, [field]: value };
    savePolicyMutation.mutate(updatedPolicy);
  };

  return (
    <div className="space-y-6">
      {/* Alerte CCN */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Règles juridiques - CCN Restauration Rapide (IDCC 1501)
        </h3>
        <ul className="text-sm text-blue-900 space-y-1">
          <li>• <strong>1er mai</strong> : doublement obligatoire de la rémunération (Code du travail L3133-6)</li>
          <li>• <strong>Autres fériés</strong> : compensation PAY ou TIME_OFF selon politique établissement</li>
          <li>• <strong>Éligibilité</strong> : ancienneté minimale de 8 mois (Article 40 CCN)</li>
          <li>• <strong>Protection</strong> : déplacement du repos hebdo sur férié nécessite consentement explicite</li>
        </ul>
      </div>

      {/* Politique */}
      <div className="border rounded-lg p-4 space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Politique de l'établissement
        </h3>

        <div className="grid gap-4">
          <div>
            <Label className="text-sm font-semibold">Compensation jours fériés (hors 1er mai)</Label>
            <div className="flex gap-2 mt-2">
              <Button
                variant={policy?.policy_for_non_may1 === 'pay' ? 'default' : 'outline'}
                onClick={() => handlePolicyUpdate('policy_for_non_may1', 'pay')}
                className="flex-1"
              >
                Rémunération (PAY)
              </Button>
              <Button
                variant={policy?.policy_for_non_may1 === 'time_off' ? 'default' : 'outline'}
                onClick={() => handlePolicyUpdate('policy_for_non_may1', 'time_off')}
                className="flex-1"
              >
                Récupération temps (TIME_OFF)
              </Button>
            </div>
          </div>

          <div>
            <Label>Ancienneté minimale (mois)</Label>
            <Input
              type="number"
              value={policy?.eligibility_months || 8}
              onChange={(e) => handlePolicyUpdate('eligibility_months', parseInt(e.target.value))}
              min={0}
              max={24}
            />
            <p className="text-xs text-gray-500 mt-1">CCN recommande 8 mois</p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Protection jour de repos fixe</Label>
              <p className="text-xs text-gray-500">Interdire déplacement du repos sur férié sans consentement</p>
            </div>
            <Switch
              checked={policy?.weekly_rest_fixed_day_protection || false}
              onCheckedChange={(val) => handlePolicyUpdate('weekly_rest_fixed_day_protection', val)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Autoriser ouverture le 1er mai</Label>
              <p className="text-xs text-gray-500">Si décoché, alerte forte lors de la planification</p>
            </div>
            <Switch
              checked={policy?.may1_open_allowed || false}
              onCheckedChange={(val) => handlePolicyUpdate('may1_open_allowed', val)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Doublement auto 1er mai</Label>
              <p className="text-xs text-gray-500">Appliquer automatiquement x2 sur la paie</p>
            </div>
            <Switch
              checked={policy?.may1_auto_double_pay !== false}
              onCheckedChange={(val) => handlePolicyUpdate('may1_auto_double_pay', val)}
            />
          </div>
        </div>
      </div>

      {/* Liste des fériés */}
      <div className="border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Jours fériés configurés
          </h3>
          {holidays.length === 0 && (
            <Button onClick={initializeHolidays} className="bg-blue-600">
              Initialiser 2026
            </Button>
          )}
        </div>

        {/* Ajouter férié local */}
        <div className="bg-gray-50 rounded-lg p-3 mb-4 flex gap-2">
          <Input
            type="date"
            value={newHoliday.date}
            onChange={(e) => setNewHoliday({ ...newHoliday, date: e.target.value })}
            placeholder="Date"
          />
          <Input
            value={newHoliday.name}
            onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })}
            placeholder="Nom du férié local"
          />
          <Button onClick={handleAddHoliday} className="bg-green-600">
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        {/* Liste */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {holidays.map((holiday) => (
            <div
              key={holiday.id}
              className={cn(
                "flex items-center justify-between p-3 rounded-lg border-2",
                holiday.is_may_first 
                  ? "bg-red-50 border-red-300" 
                  : "bg-white border-gray-200"
              )}
            >
              <div className="flex items-center gap-3">
                <Calendar className={cn(
                  "w-5 h-5",
                  holiday.is_may_first ? "text-red-600" : "text-purple-600"
                )} />
                <div>
                  <p className="font-semibold">{holiday.name}</p>
                  <p className="text-xs text-gray-600">
                    {new Date(holiday.date).toLocaleDateString('fr-FR', { 
                      weekday: 'long', 
                      day: 'numeric', 
                      month: 'long' 
                    })}
                  </p>
                </div>
                {holiday.is_may_first && (
                  <span className="text-xs font-bold bg-red-600 text-white px-2 py-1 rounded">
                    DOUBLEMENT x2
                  </span>
                )}
                {holiday.type === 'local' && (
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                    Local
                  </span>
                )}
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => deleteHolidayMutation.mutate(holiday.id)}
                className="text-red-600"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}