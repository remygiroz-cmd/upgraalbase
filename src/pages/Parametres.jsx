import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Settings, User, Bell, Palette, Clock, Save, Check, Upload, Image, Sparkles, Loader2, Shield, Users as UsersIcon, Calendar, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import PageHeader from '@/components/ui/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import GestionRoles from './GestionRoles';
import GestionUtilisateurs from './GestionUtilisateurs';
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
    theme: 'professional-light',
    default_view: 'mise_en_place',
    session_timeout: 30
  });

  useEffect(() => {
    if (currentUser?.preferences) {
      setPreferences((prev) => ({
        ...prev,
        ...currentUser.preferences
      }));
    }
  }, [currentUser]);

  const updateUserMutation = useMutation({
    mutationFn: (data) => base44.auth.updateMe(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      toast.success('Paramètres enregistrés avec succès');
      window.location.reload();
    }
  });

  const handleSavePreferences = () => {
    updateUserMutation.mutate({
      preferences: preferences
    });
  };

  const isAdmin = currentUser?.role === 'admin';

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <PageHeader
        icon={Settings}
        title="Paramètres"
        subtitle="Personnalisez votre expérience UpGraal" />


      <div className="max-w-4xl mx-auto">
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="grid grid-cols-2 sm:grid-cols-3 lg:flex lg:flex-wrap gap-2 bg-transparent p-0 h-auto">
            <TabsTrigger 
              value="profile" 
              className="data-[state=active]:bg-orange-100 data-[state=active]:text-orange-900 data-[state=active]:border-orange-500 bg-white border-2 border-gray-300 text-gray-900 px-4 py-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <User className="w-4 h-4 mr-2" />
              <span>Profil</span>
            </TabsTrigger>
            <TabsTrigger 
              value="notifications" 
              className="data-[state=active]:bg-orange-100 data-[state=active]:text-orange-900 data-[state=active]:border-orange-500 bg-white border-2 border-gray-300 text-gray-900 px-4 py-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Bell className="w-4 h-4 mr-2" />
              <span>Notifications</span>
            </TabsTrigger>
            <TabsTrigger 
              value="interface" 
              className="data-[state=active]:bg-orange-100 data-[state=active]:text-orange-900 data-[state=active]:border-orange-500 bg-white border-2 border-gray-300 text-gray-900 px-4 py-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Palette className="w-4 h-4 mr-2" />
              <span>Interface</span>
            </TabsTrigger>
            <TabsTrigger 
              value="session" 
              className="data-[state=active]:bg-orange-100 data-[state=active]:text-orange-900 data-[state=active]:border-orange-500 bg-white border-2 border-gray-300 text-gray-900 px-4 py-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Clock className="w-4 h-4 mr-2" />
              <span>Session</span>
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger 
                value="roles" 
                className="data-[state=active]:bg-orange-100 data-[state=active]:text-orange-900 data-[state=active]:border-orange-500 bg-white border-2 border-gray-300 text-gray-900 px-4 py-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Shield className="w-4 h-4 mr-2" />
                <span>Rôles</span>
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger 
                value="users" 
                className="data-[state=active]:bg-orange-100 data-[state=active]:text-orange-900 data-[state=active]:border-orange-500 bg-white border-2 border-gray-300 text-gray-900 px-4 py-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <UsersIcon className="w-4 h-4 mr-2" />
                <span>Utilisateurs</span>
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger 
                value="automation" 
                className="data-[state=active]:bg-orange-100 data-[state=active]:text-orange-900 data-[state=active]:border-orange-500 bg-white border-2 border-gray-300 text-gray-900 px-4 py-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Calendar className="w-4 h-4 mr-2" />
                <span>Automation</span>
              </TabsTrigger>
            )}
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-6">
            {currentUser?.role === 'admin' && (
              <>
                <LogoUploadSection />
                <EmailSenderSettings />
                <GenerateMissingImagesSection />
              </>
            )}
            
            <div className="bg-slate-100 p-6 rounded-2xl border border-slate-700/50">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Informations personnelles</h3>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="full_name">Nom complet</Label>
                  <Input
                    id="full_name"
                    defaultValue={currentUser?.full_name}
                    className="bg-slate-700 border-slate-600 mt-2"
                    disabled />

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
                    disabled />

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
                    disabled />

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
                  } />


                <SettingRow
                  label="Résumé quotidien"
                  description="Recevoir un résumé de la journée en fin de service"
                  checked={preferences.daily_summary}
                  onCheckedChange={(checked) =>
                  setPreferences({ ...preferences, daily_summary: checked })
                  } />


                <SettingRow
                  label="Rappels de tâches"
                  description="Être notifié des tâches à venir"
                  checked={preferences.task_reminders}
                  onCheckedChange={(checked) =>
                  setPreferences({ ...preferences, task_reminders: checked })
                  } />

              </div>
            </div>
          </TabsContent>

          {/* Interface Tab */}
          <TabsContent value="interface" className="space-y-6">
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
              <h3 className="text-lg font-semibold mb-4">Apparence</h3>
              
              <div className="space-y-6">
                <div>
                  <Label className="text-base font-semibold mb-4 block">Sélectionnez votre design</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    {/* Design A - Professional Light */}
                    <button
                      onClick={() => setPreferences({ ...preferences, theme: 'professional-light' })}
                      className={cn(
                        "group relative p-5 rounded-2xl border-2 transition-all text-left",
                        preferences.theme === 'professional-light' ?
                        "border-blue-600 bg-blue-600/10 shadow-lg" :
                        "border-slate-700 bg-slate-800 hover:border-slate-600"
                      )}>

                      {preferences.theme === 'professional-light' &&
                      <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      }
                      <div className="space-y-3">
                        <div className="w-full h-24 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-3 border border-gray-200">
                          <div className="flex gap-2 mb-2">
                            <div className="w-8 h-8 rounded-lg bg-blue-600"></div>
                            <div className="flex-1 space-y-1">
                              <div className="h-2 bg-gray-300 rounded w-2/3"></div>
                              <div className="h-1.5 bg-gray-200 rounded w-1/2"></div>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <div className="h-2 bg-gray-300 rounded"></div>
                            <div className="h-2 bg-blue-200 rounded w-3/4"></div>
                          </div>
                        </div>
                        <div>
                          <p className="font-semibold text-sm mb-1">Professionnel Clair</p>
                          <p className="text-xs text-slate-400 leading-relaxed">
                            Design sobre et épuré avec fond clair, parfait pour une utilisation intensive en cuisine. Contraste optimal et lisibilité maximale.
                          </p>
                        </div>
                      </div>
                    </button>

                    {/* Design B - Dark Premium */}
                    <button
                      onClick={() => setPreferences({ ...preferences, theme: 'dark-premium' })}
                      className={cn(
                        "group relative p-5 rounded-2xl border-2 transition-all text-left",
                        preferences.theme === 'dark-premium' ?
                        "border-violet-600 bg-violet-600/10 shadow-lg" :
                        "border-slate-700 bg-slate-800 hover:border-slate-600"
                      )}>

                      {preferences.theme === 'dark-premium' &&
                      <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-violet-600 flex items-center justify-center">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      }
                      <div className="space-y-3">
                        <div className="w-full h-24 bg-gradient-to-br from-slate-950 to-slate-900 rounded-lg p-3 border border-slate-800">
                          <div className="flex gap-2 mb-2">
                            <div className="w-8 h-8 rounded-lg bg-violet-600"></div>
                            <div className="flex-1 space-y-1">
                              <div className="h-2 bg-slate-700 rounded w-2/3"></div>
                              <div className="h-1.5 bg-slate-800 rounded w-1/2"></div>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <div className="h-2 bg-slate-700 rounded"></div>
                            <div className="h-2 bg-violet-900/50 rounded w-3/4"></div>
                          </div>
                        </div>
                        <div>
                          <p className="font-semibold text-sm mb-1">Dark Premium</p>
                          <p className="text-xs text-slate-400 leading-relaxed">
                            Mode sombre élégant et moderne, idéal pour réduire la fatigue visuelle. Interface épurée avec accent violet.
                          </p>
                        </div>
                      </div>
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mt-4 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                    Le changement de thème s'applique immédiatement après enregistrement
                  </p>
                </div>

                <div>
                  <Label htmlFor="default_view">Vue par défaut</Label>
                  <select
                    id="default_view"
                    value={preferences.default_view}
                    onChange={(e) => setPreferences({ ...preferences, default_view: e.target.value })}
                    className="w-full mt-2 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100">

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
                    className="bg-slate-700 border-slate-600 mt-2" />

                  <p className="text-xs text-slate-400 mt-1">
                    Temps avant déconnexion automatique (5 à 120 minutes)
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-700">
                  <Button
                    variant="outline"
                    className="border-red-600 text-red-400 hover:bg-red-600/20"
                    onClick={() => base44.auth.logout()}>

                    Se déconnecter
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Roles Tab */}
          {isAdmin && (
            <TabsContent value="roles">
              <GestionRoles />
            </TabsContent>
          )}

          {/* Users Tab */}
          {isAdmin && (
            <TabsContent value="users">
              <GestionUtilisateurs />
            </TabsContent>
          )}

          {/* Automation Tab */}
          {isAdmin && (
            <TabsContent value="automation">
              <AutomationSettings />
            </TabsContent>
          )}
        </Tabs>

        {/* Save Button */}
        <div className="sticky bottom-6 mt-6 flex justify-center sm:justify-end">
          <Button
            onClick={handleSavePreferences}
            className="bg-orange-600 hover:bg-orange-700 shadow-lg w-full sm:w-auto min-h-[48px]"
            disabled={updateUserMutation.isPending}>

            <Save className="w-4 h-4 mr-2" />
            Enregistrer les paramètres
          </Button>
        </div>
      </div>
    </div>);

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
        onCheckedChange={onCheckedChange} />

    </div>);

}

function GenerateMissingImagesSection() {
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list()
  });

  const tasksWithoutImages = tasks.filter(task => !task.image_url);

  const handleGenerateAllImages = async () => {
    setGenerating(true);
    setProgress({ current: 0, total: tasksWithoutImages.length });

    for (let i = 0; i < tasksWithoutImages.length; i++) {
      const task = tasksWithoutImages[i];
      try {
        const result = await base44.integrations.Core.GenerateImage({
          prompt: `Extreme close-up professional photograph of "${task.name}", macro shot, highly detailed, sharp focus on the dish or ingredient, clean white or minimal background, commercial food photography, studio lighting, photorealistic, 8k quality, subject clearly visible and centered`
        });
        
        if (result?.url) {
          await base44.entities.Task.update(task.id, { image_url: result.url });
        }
        
        setProgress({ current: i + 1, total: tasksWithoutImages.length });
      } catch (error) {
        console.error(`Failed to generate image for task ${task.name}:`, error);
      }
    }

    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    toast.success(`${tasksWithoutImages.length} images générées avec succès`);
    setGenerating(false);
    setProgress({ current: 0, total: 0 });
  };

  if (tasksWithoutImages.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-2xl border-2 border-gray-300 p-6 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Image className="w-5 h-5" />
            Génération automatique d'images
          </h3>
          <p className="text-sm text-gray-700 mt-1">
            {tasksWithoutImages.length} tâche{tasksWithoutImages.length > 1 ? 's' : ''} sans image
          </p>
        </div>
      </div>

      {generating && (
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-700 mb-2">
            <span>Génération en cours...</span>
            <span>{progress.current} / {progress.total}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-orange-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      <Button
        onClick={handleGenerateAllImages}
        disabled={generating}
        className="w-full bg-orange-600 hover:bg-orange-700"
      >
        {generating ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Génération en cours...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4 mr-2" />
            Générer toutes les images manquantes
          </>
        )}
      </Button>
    </div>
  );
}

function AutomationSettings() {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: automationSettings = [] } = useQuery({
    queryKey: ['automationSettings'],
    queryFn: () => base44.entities.AppSettings.filter({ setting_key: 'auto_complete_session' })
  });

  const currentSettings = automationSettings[0] || {
    auto_enabled: false,
    completion_times: ['14:00', '22:00']
  };

  const [settings, setSettings] = useState({
    auto_enabled: currentSettings.auto_enabled || false,
    completion_times: currentSettings.completion_times || ['14:00', '22:00']
  });

  useEffect(() => {
    if (automationSettings[0]) {
      setSettings({
        auto_enabled: automationSettings[0].auto_enabled || false,
        completion_times: automationSettings[0].completion_times || ['14:00', '22:00']
      });
    }
  }, [automationSettings]);

  const saveSettingsMutation = useMutation({
    mutationFn: async (newSettings) => {
      // Save settings
      let savedSettings;
      if (automationSettings[0]?.id) {
        savedSettings = await base44.entities.AppSettings.update(automationSettings[0].id, newSettings);
      } else {
        savedSettings = await base44.entities.AppSettings.create({ 
          setting_key: 'auto_complete_session', 
          ...newSettings 
        });
      }
      
      // Enable/disable automation based on settings
      if (newSettings.auto_enabled) {
        // Call backend to enable automation
        await base44.functions.invoke('enableAutomation', { automation_id: '6973350316b38ba38f4f6ce3' });
      } else {
        // Call backend to disable automation
        await base44.functions.invoke('disableAutomation', { automation_id: '6973350316b38ba38f4f6ce3' });
      }
      
      return savedSettings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automationSettings'] });
      toast.success('Paramètres d\'automation enregistrés');
      setSaving(false);
    },
    onError: (error) => {
      toast.error('Erreur lors de l\'enregistrement: ' + error.message);
      setSaving(false);
    }
  });

  const handleSave = () => {
    setSaving(true);
    saveSettingsMutation.mutate(settings);
  };

  const handleAddTime = () => {
    setSettings({
      ...settings,
      completion_times: [...settings.completion_times, '18:00']
    });
  };

  const handleRemoveTime = (index) => {
    const newTimes = settings.completion_times.filter((_, i) => i !== index);
    setSettings({
      ...settings,
      completion_times: newTimes.length > 0 ? newTimes : ['14:00']
    });
  };

  const handleTimeChange = (index, newTime) => {
    const newTimes = [...settings.completion_times];
    newTimes[index] = newTime;
    setSettings({
      ...settings,
      completion_times: newTimes
    });
  };

  return (
    <div className="bg-white rounded-2xl border-2 border-gray-300 p-6 shadow-sm">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Clôture automatique du Travail du Jour
        </h3>
        <p className="text-sm text-gray-700 mt-1">
          La session active sera automatiquement terminée et enregistrée dans l'historique aux heures définies
        </p>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg border border-orange-200">
          <div>
            <p className="font-medium text-gray-900">Activer l'automation</p>
            <p className="text-sm text-gray-700 mt-1">
              Terminer automatiquement la session du jour aux heures définies
            </p>
          </div>
          <Switch
            checked={settings.auto_enabled}
            onCheckedChange={(checked) => setSettings({ ...settings, auto_enabled: checked })}
          />
        </div>

        {settings.auto_enabled && (
          <div className="space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div>
              <Label className="text-base font-semibold mb-3 block">Heures de clôture automatique</Label>
              <div className="space-y-3">
                {settings.completion_times.map((time, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={time}
                      onChange={(e) => handleTimeChange(index, e.target.value)}
                      className="bg-white"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveTime(index)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      disabled={settings.completion_times.length === 1}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                onClick={handleAddTime}
                className="mt-3 w-full border-orange-600 text-orange-600 hover:bg-orange-50"
              >
                <Plus className="w-4 h-4 mr-2" />
                Ajouter une heure
              </Button>
              <p className="text-xs text-gray-600 mt-2">
                L'automation vérifie toutes les 15 minutes si une clôture doit être effectuée
              </p>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-900">
                <strong>Important :</strong> La session active sera automatiquement marquée comme "Terminée" et archivée dans l'historique. Cette action est équivalente au bouton "Terminée".
              </p>
            </div>
          </div>
        )}

        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-orange-600 hover:bg-orange-700"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Enregistrement...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Enregistrer les paramètres
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function EmailSenderSettings() {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: emailSettings = [] } = useQuery({
    queryKey: ['emailSenderSettings'],
    queryFn: () => base44.entities.AppSettings.filter({ setting_key: 'email_sender_name' })
  });

  const currentSenderName = emailSettings[0]?.email_sender_name || 'UpGraal';
  const [senderName, setSenderName] = useState(currentSenderName);

  useEffect(() => {
    if (emailSettings[0]?.email_sender_name) {
      setSenderName(emailSettings[0].email_sender_name);
    }
  }, [emailSettings]);

  const saveEmailSettingsMutation = useMutation({
    mutationFn: async (name) => {
      if (emailSettings[0]?.id) {
        return base44.entities.AppSettings.update(emailSettings[0].id, { email_sender_name: name });
      }
      return base44.entities.AppSettings.create({ setting_key: 'email_sender_name', email_sender_name: name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emailSenderSettings'] });
      toast.success('Nom d\'expéditeur mis à jour');
      setSaving(false);
    },
    onError: () => {
      toast.error('Erreur lors de la mise à jour');
      setSaving(false);
    }
  });

  const handleSave = () => {
    if (!senderName.trim()) {
      toast.error('Le nom d\'expéditeur ne peut pas être vide');
      return;
    }
    setSaving(true);
    saveEmailSettingsMutation.mutate(senderName.trim());
  };

  return (
    <div className="bg-white rounded-2xl border-2 border-gray-300 p-6 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Configuration des emails
        </h3>
        <p className="text-sm text-gray-700 mt-1">
          Définissez le nom qui apparaîtra comme expéditeur dans les emails envoyés
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="sender-name">Nom de l'expéditeur</Label>
          <Input
            id="sender-name"
            type="text"
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            placeholder="UpGraal"
            className="mt-2"
          />
          <p className="text-xs text-gray-600 mt-1">
            Ce nom apparaîtra dans la boîte de réception des destinataires
          </p>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving || senderName === currentSenderName}
          className="w-full bg-orange-600 hover:bg-orange-700"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Enregistrement...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Enregistrer
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function LogoUploadSection() {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const { data: appSettings = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => base44.entities.AppSettings.filter({ setting_key: 'app_logo' })
  });

  const currentLogo = appSettings[0]?.logo_url || 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69497257a1b1a9a05e568521/71ee8b574_logonouveau.png';

  const saveLogoMutation = useMutation({
    mutationFn: async (logoUrl) => {
      if (appSettings[0]?.id) {
        return base44.entities.AppSettings.update(appSettings[0].id, { logo_url: logoUrl });
      }
      return base44.entities.AppSettings.create({ setting_key: 'app_logo', logo_url: logoUrl });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appSettings'] });
      toast.success('Logo mis à jour avec succès');
      setUploading(false);
    }
  });

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Veuillez sélectionner une image');
      return;
    }

    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      saveLogoMutation.mutate(file_url);
    } catch (error) {
      toast.error('Erreur lors de l\'upload du logo');
      setUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border-2 border-gray-300 p-6 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Image className="w-5 h-5" />
            Logo de l'application
          </h3>
          <p className="text-sm text-gray-700 mt-1">
            Personnalisez le logo affiché pour tous les utilisateurs
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
        <div className="flex-shrink-0">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl border-2 border-gray-300 bg-gray-50 flex items-center justify-center overflow-hidden">
            <img 
              src={currentLogo} 
              alt="Logo actuel" 
              className="w-full h-full object-contain p-2"
            />
          </div>
        </div>

        <div className="flex-1 w-full">
          <Label 
            htmlFor="logo-upload" 
            className="cursor-pointer"
          >
            <div className={cn(
              "border-2 border-dashed rounded-xl p-6 text-center transition-all",
              uploading ? "border-gray-300 bg-gray-100" : "border-gray-400 hover:border-orange-500 hover:bg-orange-50"
            )}>
              <Upload className="w-8 h-8 mx-auto mb-2 text-gray-600" />
              <p className="text-sm font-medium text-gray-900">
                {uploading ? 'Upload en cours...' : 'Cliquez pour uploader un nouveau logo'}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                PNG, JPG ou SVG (max 2MB)
              </p>
            </div>
          </Label>
          <Input
            id="logo-upload"
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            disabled={uploading}
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
}