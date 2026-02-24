import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export default function AssignationSettings({ formData, onChange }) {
  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.filter({ is_active: true })
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.filter({ is_active: true })
  });

  const daysOfWeek = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const dayLabels = { MON: 'Lun', TUE: 'Mar', WED: 'Mer', THU: 'Jeu', FRI: 'Ven', SAT: 'Sam', SUN: 'Dim' };

  const handleAutoAssignDaysToggle = (day) => {
    const current = formData.auto_assign_days || [];
    const updated = current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day];
    onChange('auto_assign_days', updated);
  };

  return (
    <div className="space-y-4">
      {/* Mode d'assignation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mode d'assignation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Mode *</Label>
            <Select value={formData.assignment_mode} onValueChange={(val) => onChange('assignment_mode', val)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MANUAL_ONLY">Manuel uniquement</SelectItem>
                <SelectItem value="MANUAL_AUTO_BUTTON">Manuel + Bouton auto</SelectItem>
                <SelectItem value="AUTO_DAILY">Auto quotidienne</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.assignment_mode === 'AUTO_DAILY' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Heure d'assignation</Label>
                  <Input
                    type="time"
                    value={formData.auto_assign_hour || '08:00'}
                    onChange={(e) => onChange('auto_assign_hour', e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <Switch
                      checked={formData.auto_assign_do_not_override}
                      onCheckedChange={(val) => onChange('auto_assign_do_not_override', val)}
                    />
                    Ne pas remplacer assignations existantes
                  </Label>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium mb-2 block">Jours d'assignation</Label>
                <div className="flex flex-wrap gap-2">
                  {daysOfWeek.map(day => (
                    <button
                      key={day}
                      onClick={() => handleAutoAssignDaysToggle(day)}
                      className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                        (formData.auto_assign_days || []).includes(day)
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      {dayLabels[day]}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Cible d'assignation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cible d'assignation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Type de cible *</Label>
            <Select value={formData.assignment_target_type} onValueChange={(val) => onChange('assignment_target_type', val)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL_PRESENT">Tous les présents</SelectItem>
                <SelectItem value="ROLE_LIVREUR">Rôle "Livreur"</SelectItem>
                <SelectItem value="TEAM">Équipe(s) spécifique(s)</SelectItem>
                <SelectItem value="CUSTOM">Employés spécifiques</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.assignment_target_type === 'TEAM' && (
            <div>
              <Label className="text-sm font-medium">Équipes assignables</Label>
              <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                {teams.map(team => (
                  <label key={team.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={(formData.assignment_target_team_ids || []).includes(team.id)}
                      onChange={(e) => {
                        const current = formData.assignment_target_team_ids || [];
                        const updated = e.target.checked
                          ? [...current, team.id]
                          : current.filter(id => id !== team.id);
                        onChange('assignment_target_team_ids', updated);
                      }}
                      className="w-4 h-4 rounded"
                    />
                    {team.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {formData.assignment_target_type === 'CUSTOM' && (
            <div>
              <Label className="text-sm font-medium">Employés assignables</Label>
              <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                {employees.map(emp => (
                  <label key={emp.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={(formData.assignment_target_employee_ids || []).includes(emp.id)}
                      onChange={(e) => {
                        const current = formData.assignment_target_employee_ids || [];
                        const updated = e.target.checked
                          ? [...current, emp.id]
                          : current.filter(id => id !== emp.id);
                        onChange('assignment_target_employee_ids', updated);
                      }}
                      className="w-4 h-4 rounded"
                    />
                    {emp.first_name} {emp.last_name}
                  </label>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Véhicules requis */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Véhicules requis</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Lundi-Jeudi</Label>
              <Input
                type="number"
                min="0"
                value={formData.required_vehicles_mon_thu}
                onChange={(e) => onChange('required_vehicles_mon_thu', Number(e.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Vendredi-Dimanche</Label>
              <Input
                type="number"
                min="0"
                value={formData.required_vehicles_fri_sat_sun}
                onChange={(e) => onChange('required_vehicles_fri_sat_sun', Number(e.target.value))}
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}