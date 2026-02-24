import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, RefreshCw, Loader2, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';

const DEFAULT_SETTINGS = {
  enabled: false,
  services: [],
  hours_type: 'complementary',
  home_roles: [],
  show_in_planning: true
};

export default function OptimisationMasseSalariale() {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [recalculating, setRecalculating] = useState(false);

  const { data: settingsArr = [] } = useQuery({
    queryKey: ['optimisationSettings'],
    queryFn: () => base44.entities.AppSettings.filter({ setting_key: 'optimisation_masse_salariale' })
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.filter({ is_active: true })
  });

  const { data: roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: () => base44.entities.Role.list()
  });

  useEffect(() => {
    if (settingsArr[0]) {
      const d = settingsArr[0];
      setSettings({
        enabled: d.enabled ?? DEFAULT_SETTINGS.enabled,
        services: d.services ?? DEFAULT_SETTINGS.services,
        hours_type: d.hours_type ?? DEFAULT_SETTINGS.hours_type,
        home_roles: d.home_roles ?? DEFAULT_SETTINGS.home_roles,
        show_in_planning: d.show_in_planning ?? DEFAULT_SETTINGS.show_in_planning,
      });
    }
  }, [settingsArr]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const payload = {
        enabled: data.enabled,
        services: data.services,
        hours_type: data.hours_type,
        home_roles: data.home_roles,
        show_in_planning: data.show_in_planning,
      };
      if (settingsArr[0]?.id) {
        return base44.entities.AppSettings.update(settingsArr[0].id, payload);
      }
      return base44.entities.AppSettings.create({ setting_key: 'optimisation_masse_salariale', ...payload });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['optimisationSettings'] });
      toast.success('Paramètres enregistrés');
    },
    onError: () => toast.error('Erreur lors de l\'enregistrement')
  });

  const handleSave = () => saveMutation.mutate(settings);

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      await base44.functions.invoke('generateDailyDepartureOrder', {});
      queryClient.invalidateQueries({ queryKey: ['departureOrders'] });
      toast.success('Recalcul effectué avec succès');
    } catch {
      toast.error('Erreur lors du recalcul');
    } finally {
      setRecalculating(false);
    }
  };

  const toggleService = (service) => {
    const current = settings.services || [];
    const updated = current.includes(service)
      ? current.filter(s => s !== service)
      : [...current, service];
    setSettings({ ...settings, services: updated });
  };

  const toggleRole = (roleId) => {
    const current = settings.home_roles || [];
    const updated = current.includes(roleId)
      ? current.filter(r => r !== roleId)
      : [...current, roleId];
    setSettings({ ...settings, home_roles: updated });
  };

  return (
    <div className="bg-white rounded-2xl border-2 border-gray-300 p-6 shadow-sm space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
          <TrendingDown className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Optimisation Masse Salariale</h3>
          <p className="text-sm text-gray-600">Ordre de départ intelligent basé sur les heures complémentaires/supplémentaires</p>
        </div>
      </div>

      {/* Activation */}
      <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-lg border border-emerald-200">
        <div>
          <p className="font-medium text-gray-900">Activer l'optimisation</p>
          <p className="text-sm text-gray-600 mt-0.5">Calcule chaque jour un ordre de départ pour limiter les heures supplémentaires</p>
        </div>
        <Switch
          checked={settings.enabled}
          onCheckedChange={(v) => setSettings({ ...settings, enabled: v })}
        />
      </div>

      {settings.enabled && (
        <>
          {/* Services */}
          <div>
            <Label className="text-sm font-semibold text-gray-900 mb-3 block">Services à optimiser</Label>
            <div className="flex flex-wrap gap-2">
              {teams.map(team => (
                <button
                  key={team.id}
                  onClick={() => toggleService(team.name)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition-colors ${
                    (settings.services || []).includes(team.name)
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-emerald-400'
                  }`}
                >
                  {team.name}
                </button>
              ))}
              {teams.length === 0 && (
                <p className="text-sm text-gray-500">Aucune équipe définie. Configurez les équipes dans Gestion du Personnel.</p>
              )}
            </div>
          </div>

          {/* Type d'heures */}
          <div>
            <Label className="text-sm font-semibold text-gray-900 mb-2 block">Type d'heures pour le calcul</Label>
            <Select
              value={settings.hours_type}
              onValueChange={(v) => setSettings({ ...settings, hours_type: v })}
            >
              <SelectTrigger className="w-full max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="complementary">Heures complémentaires</SelectItem>
                <SelectItem value="overtime">Heures supplémentaires</SelectItem>
                <SelectItem value="both">Complémentaires + Supplémentaires (cumul)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Affichage Home Page et Planning */}
          <div>
            <Label className="text-sm font-semibold text-gray-900 mb-2 block">Afficher sur la Home Page et sur le Planning pour les rôles</Label>
            <div className="flex flex-wrap gap-2">
              {roles.map(role => (
                <button
                  key={role.id}
                  onClick={() => toggleRole(role.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition-colors ${
                    (settings.home_roles || []).includes(role.id)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {role.name}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">Les utilisateurs dont le rôle est coché verront le bloc sur l'accueil et dans le planning.</p>
          </div>

          {/* Recalcul manuel */}
          <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
            <p className="font-medium text-gray-900 mb-1">Recalcul manuel</p>
            <p className="text-sm text-gray-600 mb-3">Force le recalcul immédiat de l'ordre de départ pour aujourd'hui.</p>
            <Button
              onClick={handleRecalculate}
              disabled={recalculating}
              variant="outline"
              className="border-orange-600 text-orange-600 hover:bg-orange-50"
            >
              {recalculating ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Recalcul en cours...</>
              ) : (
                <><RefreshCw className="w-4 h-4 mr-2" />Recalculer maintenant</>
              )}
            </Button>
          </div>
        </>
      )}

      <Button
        onClick={handleSave}
        disabled={saveMutation.isPending}
        className="w-full bg-emerald-600 hover:bg-emerald-700"
      >
        {saveMutation.isPending ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enregistrement...</>
        ) : (
          <><Save className="w-4 h-4 mr-2" />Enregistrer les paramètres</>
        )}
      </Button>
    </div>
  );
}