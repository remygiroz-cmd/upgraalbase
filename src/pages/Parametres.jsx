import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Settings, User, Bell, Palette, Clock, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import PageHeader from '@/components/ui/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function Parametres() {
  const queryClient = useQueryClient();
  
  const { data: currentUser, isLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const [preferences, setPreferences] = useState({
    notifications_enabled: true,
    daily_summary: true,
    task_reminders: false,
    theme: 'dark',
    default_view: 'mise_en_place',
    session_timeout: 30
  });

  const updateUserMutation = useMutation({
    mutationFn: (data) => base44.auth.updateMe(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      toast.success('Paramètres enregistrés avec succès');
    }
  });

  const handleSavePreferences = () => {
    updateUserMutation.mutate({
      preferences: preferences
    });
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <PageHeader
        icon={Settings}
        title="Paramètres"
        subtitle="Personnalisez votre expérience UpGraal"
      />

      <div className="max-w-4xl mx-auto">
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="bg-slate-800 p-1">
            <TabsTrigger value="profile" className="data-[state=active]:bg-slate-700">
              <User className="w-4 h-4 mr-2" />
              Profil
            </TabsTrigger>
            <TabsTrigger value="notifications" className="data-[state=active]:bg-slate-700">
              <Bell className="w-4 h-4 mr-2" />
              Notifications
            </TabsTrigger>
            <TabsTrigger value="interface" className="data-[state=active]:bg-slate-700">
              <Palette className="w-4 h-4 mr-2" />
              Interface
            </TabsTrigger>
            <TabsTrigger value="session" className="data-[state=active]:bg-slate-700">
              <Clock className="w-4 h-4 mr-2" />
              Session
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-6">
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
              <h3 className="text-lg font-semibold mb-4">Informations personnelles</h3>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="full_name">Nom complet</Label>
                  <Input
                    id="full_name"
                    defaultValue={currentUser?.full_name}
                    className="bg-slate-700 border-slate-600 mt-2"
                    disabled
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Contactez un administrateur pour modifier votre nom
                  </p>
                </div>

                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    defaultValue={currentUser?.email}
                    className="bg-slate-700 border-slate-600 mt-2"
                    disabled
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    L'email ne peut pas être modifié
                  </p>
                </div>

                <div>
                  <Label htmlFor="role">Rôle</Label>
                  <Input
                    id="role"
                    defaultValue={currentUser?.role === 'admin' ? 'Administrateur' : 'Utilisateur'}
                    className="bg-slate-700 border-slate-600 mt-2"
                    disabled
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-6">
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
              <h3 className="text-lg font-semibold mb-4">Préférences de notifications</h3>
              
              <div className="space-y-4">
                <SettingRow
                  label="Activer les notifications"
                  description="Recevoir des notifications dans l'application"
                  checked={preferences.notifications_enabled}
                  onCheckedChange={(checked) => 
                    setPreferences({ ...preferences, notifications_enabled: checked })
                  }
                />

                <SettingRow
                  label="Résumé quotidien"
                  description="Recevoir un résumé de la journée en fin de service"
                  checked={preferences.daily_summary}
                  onCheckedChange={(checked) => 
                    setPreferences({ ...preferences, daily_summary: checked })
                  }
                />

                <SettingRow
                  label="Rappels de tâches"
                  description="Être notifié des tâches à venir"
                  checked={preferences.task_reminders}
                  onCheckedChange={(checked) => 
                    setPreferences({ ...preferences, task_reminders: checked })
                  }
                />
              </div>
            </div>
          </TabsContent>

          {/* Interface Tab */}
          <TabsContent value="interface" className="space-y-6">
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
              <h3 className="text-lg font-semibold mb-4">Apparence</h3>
              
              <div className="space-y-4">
                <div>
                  <Label>Thème</Label>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <button
                      onClick={() => setPreferences({ ...preferences, theme: 'dark' })}
                      className={cn(
                        "p-4 rounded-xl border-2 transition-all",
                        preferences.theme === 'dark'
                          ? "border-orange-600 bg-orange-600/10"
                          : "border-slate-700 bg-slate-800 hover:border-slate-600"
                      )}
                    >
                      <div className="w-full h-16 bg-slate-900 rounded-lg mb-2"></div>
                      <p className="text-sm font-medium">Sombre</p>
                    </button>
                    <button
                      onClick={() => setPreferences({ ...preferences, theme: 'light' })}
                      className={cn(
                        "p-4 rounded-xl border-2 transition-all",
                        preferences.theme === 'light'
                          ? "border-orange-600 bg-orange-600/10"
                          : "border-slate-700 bg-slate-800 hover:border-slate-600"
                      )}
                    >
                      <div className="w-full h-16 bg-slate-100 rounded-lg mb-2"></div>
                      <p className="text-sm font-medium">Clair</p>
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    Le thème clair sera disponible prochainement
                  </p>
                </div>

                <div>
                  <Label htmlFor="default_view">Vue par défaut</Label>
                  <select
                    id="default_view"
                    value={preferences.default_view}
                    onChange={(e) => setPreferences({ ...preferences, default_view: e.target.value })}
                    className="w-full mt-2 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100"
                  >
                    <option value="home">Accueil</option>
                    <option value="mise_en_place">Mise en Place</option>
                    <option value="travail_du_jour">Travail du Jour</option>
                    <option value="temperatures">Températures</option>
                  </select>
                  <p className="text-xs text-slate-400 mt-1">
                    Page affichée à l'ouverture de l'application
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Session Tab */}
          <TabsContent value="session" className="space-y-6">
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
              <h3 className="text-lg font-semibold mb-4">Gestion de session</h3>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="session_timeout">Délai d'inactivité (minutes)</Label>
                  <Input
                    id="session_timeout"
                    type="number"
                    min="5"
                    max="120"
                    value={preferences.session_timeout}
                    onChange={(e) => setPreferences({ ...preferences, session_timeout: parseInt(e.target.value) })}
                    className="bg-slate-700 border-slate-600 mt-2"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Temps avant déconnexion automatique (5 à 120 minutes)
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-700">
                  <Button
                    variant="outline"
                    className="border-red-600 text-red-400 hover:bg-red-600/20"
                    onClick={() => base44.auth.logout()}
                  >
                    Se déconnecter
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Save Button */}
        <div className="sticky bottom-6 mt-6 flex justify-end">
          <Button
            onClick={handleSavePreferences}
            className="bg-orange-600 hover:bg-orange-700 shadow-lg"
            disabled={updateUserMutation.isPending}
          >
            <Save className="w-4 h-4 mr-2" />
            Enregistrer les paramètres
          </Button>
        </div>
      </div>
    </div>
  );
}

function SettingRow({ label, description, checked, onCheckedChange }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-700/50 last:border-0">
      <div className="flex-1">
        <p className="font-medium">{label}</p>
        <p className="text-sm text-slate-400">{description}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}