import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Calendar, Calculator, Eye, Zap, Lock, Mail, TrendingDown } from 'lucide-react';
import OptimisationMasseSalariale from './OptimisationMasseSalariale';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import PositionsManager from './PositionsManager';
import NonShiftTypesManager from './NonShiftTypesManager';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function PlanningSettingsModal({ open, onOpenChange, displayMode, setDisplayMode }) {
  const [activeTab, setActiveTab] = useState('statuts');
  const [comptaSettings, setComptaSettings] = useState({});
  const queryClient = useQueryClient();

  // Fetch calculation mode setting
  const { data: settings = [] } = useQuery({
    queryKey: ['appSettings', 'planning_calculation_mode'],
    queryFn: async () => {
      return await base44.entities.AppSettings.filter({ setting_key: 'planning_calculation_mode' });
    }
  });

  const currentSetting = settings[0];
  const calculationMode = currentSetting?.planning_calculation_mode || 'disabled';

  // Fetch hours display mode setting
  const { data: displayModeSettings = [] } = useQuery({
    queryKey: ['appSettings', 'hours_display_mode'],
    queryFn: async () => {
      return await base44.entities.AppSettings.filter({ setting_key: 'hours_display_mode' });
    }
  });
  const currentDisplayModeSetting = displayModeSettings[0];
  const hoursDisplayMode = currentDisplayModeSetting?.hours_display_mode || 'HHMM';

  // Mutation to save hours display mode
  const saveDisplayModeMutation = useMutation({
    mutationFn: async (mode) => {
      if (currentDisplayModeSetting) {
        return await base44.entities.AppSettings.update(currentDisplayModeSetting.id, { hours_display_mode: mode });
      } else {
        return await base44.entities.AppSettings.create({ setting_key: 'hours_display_mode', hours_display_mode: mode });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appSettings', 'hours_display_mode'] });
      toast.success('Mode d\'affichage des heures enregistré');
    }
  });

  // Fetch compta export settings
  const { data: comptaSettingsData = [] } = useQuery({
    queryKey: ['appSettings', 'compta_export'],
    queryFn: async () => {
      return await base44.entities.AppSettings.filter({ setting_key: 'compta_export' });
    }
  });

  const currentComptaSettings = comptaSettingsData[0];

  React.useEffect(() => {
    if (currentComptaSettings) {
      setComptaSettings({
        email_compta: currentComptaSettings.email_compta || '',
        etablissement_name: currentComptaSettings.etablissement_name || '',
        responsable_name: currentComptaSettings.responsable_name || '',
        responsable_email: currentComptaSettings.responsable_email || '',
        responsable_coords: currentComptaSettings.responsable_coords || ''
      });
    }
  }, [currentComptaSettings]);

  // Mutation to save calculation mode
  const saveModeMutation = useMutation({
    mutationFn: async (mode) => {
      if (currentSetting) {
        return await base44.entities.AppSettings.update(currentSetting.id, {
          planning_calculation_mode: mode
        });
      } else {
        return await base44.entities.AppSettings.create({
          setting_key: 'planning_calculation_mode',
          planning_calculation_mode: mode
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appSettings'] });
      toast.success('Mode de calcul enregistré');
    }
  });

  // Mutation to save compta settings
  const saveComptaSettingsMutation = useMutation({
    mutationFn: async (data) => {
      if (currentComptaSettings) {
        return await base44.entities.AppSettings.update(currentComptaSettings.id, data);
      } else {
        return await base44.entities.AppSettings.create({
          setting_key: 'compta_export',
          ...data
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appSettings'] });
      toast.success('Paramètres compta enregistrés');
    }
  });

  const handleSaveComptaSettings = () => {
    if (!comptaSettings.email_compta || !comptaSettings.etablissement_name || 
        !comptaSettings.responsable_name || !comptaSettings.responsable_email) {
      toast.error('Tous les champs obligatoires doivent être remplis');
      return;
    }
    saveComptaSettingsMutation.mutate(comptaSettings);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-orange-600 flex items-center gap-3">
            <Settings className="w-7 h-7" />
            Paramètres du Planning
          </DialogTitle>
          <p className="text-sm text-gray-600 mt-2">
            Configuration centralisée des options du module Planning (structure évolutive)
          </p>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-7 gap-1">
            <TabsTrigger value="statuts" className="text-xs flex flex-col items-center gap-1 py-2">
              <Calendar className="w-4 h-4" />
              <span>Statuts</span>
            </TabsTrigger>
            <TabsTrigger value="postes" className="text-xs flex flex-col items-center gap-1 py-2">
              <Settings className="w-4 h-4" />
              <span>Postes</span>
            </TabsTrigger>
            <TabsTrigger value="calculs" className="text-xs flex flex-col items-center gap-1 py-2">
              <Calculator className="w-4 h-4" />
              <span>Calculs</span>
            </TabsTrigger>
            <TabsTrigger value="compta" className="text-xs flex flex-col items-center gap-1 py-2">
              <Eye className="w-4 h-4" />
              <span>Compta</span>
            </TabsTrigger>
            <TabsTrigger value="affichage" className="text-xs flex flex-col items-center gap-1 py-2">
              <Eye className="w-4 h-4" />
              <span>Affichage</span>
            </TabsTrigger>
            <TabsTrigger value="actions" className="text-xs flex flex-col items-center gap-1 py-2">
              <Zap className="w-4 h-4" />
              <span>Actions</span>
            </TabsTrigger>
            <TabsTrigger value="optimisation" className="text-xs flex flex-col items-center gap-1 py-2">
              <TrendingDown className="w-4 h-4" />
              <span>Optim.</span>
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Statuts / Non-shifts */}
          <TabsContent value="statuts" className="mt-6 space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Gestion des statuts et événements non-shifts
              </h3>
              <p className="text-sm text-blue-800">
                Configurez les types d'événements (congés, absences, formations...) et leur impact sur le planning.
              </p>
            </div>

            <NonShiftTypesManager 
              open={true} 
              onOpenChange={() => {}} 
              embeddedMode={true}
            />
          </TabsContent>

          {/* Tab 2: Postes */}
          <TabsContent value="postes" className="mt-6 space-y-4">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
              <h3 className="font-semibold text-orange-900 mb-2 flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Gestion des postes de travail
              </h3>
              <p className="text-sm text-orange-800">
                Définissez les postes disponibles dans votre établissement et personnalisez leur apparence.
              </p>
            </div>

            <PositionsManager 
              open={true} 
              onOpenChange={() => {}} 
              embeddedMode={true}
            />
          </TabsContent>

          {/* Tab 3: Règles de calcul */}
          <TabsContent value="calculs" className="mt-6 space-y-4">
            <Alert className="bg-blue-50 border-blue-300">
              <Badge variant="outline" className="mb-2 bg-blue-100 text-blue-900">Fonctionnel</Badge>
              <AlertDescription className="text-sm text-gray-700">
                <strong>Mode de calcul des heures supplémentaires et complémentaires</strong>
                <br />
                Choisissez le mode adapté à votre organisation. Le changement est immédiat et réversible.
              </AlertDescription>
            </Alert>

            {/* Sélecteur de mode */}
            <div className="bg-white border-2 border-orange-200 rounded-lg p-6 space-y-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">🔀 Mode de calcul des heures</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Sélectionnez le mode qui correspond à votre convention collective
                  </p>
                </div>
                <Badge className={
                  calculationMode === 'disabled' ? 'bg-gray-400' :
                  calculationMode === 'weekly' ? 'bg-blue-600' :
                  'bg-purple-600'
                }>
                  {calculationMode === 'disabled' ? 'Désactivé' :
                   calculationMode === 'weekly' ? 'Hebdomadaire' :
                   'Mensuel'}
                </Badge>
              </div>

              <div className="space-y-3">
                {/* Désactivé */}
                <label className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  calculationMode === 'disabled' 
                    ? 'bg-gray-50 border-gray-400' 
                    : 'hover:bg-gray-50 border-gray-200'
                }`}>
                  <input
                    type="radio"
                    name="calculation_mode"
                    value="disabled"
                    checked={calculationMode === 'disabled'}
                    onChange={(e) => saveModeMutation.mutate(e.target.value)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900 flex items-center gap-2">
                      ⊗ Désactivé (par défaut)
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      Aucun calcul d'heures supplémentaires ou complémentaires. Affichage informatif uniquement.
                    </div>
                    <div className="mt-2 text-xs bg-gray-100 rounded px-2 py-1 text-gray-700">
                      ✓ Aucun impact paie • Mode sécurisé par défaut
                    </div>
                  </div>
                </label>

                {/* Mode hebdomadaire */}
                <label className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  calculationMode === 'weekly' 
                    ? 'bg-blue-50 border-blue-500' 
                    : 'hover:bg-blue-50 border-gray-200'
                }`}>
                  <input
                    type="radio"
                    name="calculation_mode"
                    value="weekly"
                    checked={calculationMode === 'weekly'}
                    onChange={(e) => saveModeMutation.mutate(e.target.value)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900 flex items-center gap-2">
                      📅 Calcul hebdomadaire (classique)
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      Les heures sont calculées semaine par semaine, puis agrégées sur le mois.
                    </div>
                    <div className="mt-2 space-y-1 text-xs">
                      <div className="bg-blue-100 rounded px-2 py-1 text-blue-900">
                        <strong>Temps plein (35h/semaine) :</strong> Supp. +25% (36-43h), +50% (>43h)
                      </div>
                      <div className="bg-green-100 rounded px-2 py-1 text-green-900">
                        <strong>Temps partiel :</strong> Compl. +10% (≤10% contrat), +25% (>10%) • Max 1/3 contrat
                      </div>
                    </div>
                  </div>
                </label>

                {/* Mode mensuel */}
                <label className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  calculationMode === 'monthly' 
                    ? 'bg-purple-50 border-purple-500' 
                    : 'hover:bg-purple-50 border-gray-200'
                }`}>
                  <input
                    type="radio"
                    name="calculation_mode"
                    value="monthly"
                    checked={calculationMode === 'monthly'}
                    onChange={(e) => saveModeMutation.mutate(e.target.value)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900 flex items-center gap-2">
                      📊 Calcul mensuel (lissage)
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      Les heures sont calculées sur l'ensemble du mois. Lisse les variations hebdomadaires.
                    </div>
                    <div className="mt-2 space-y-1 text-xs">
                      <div className="bg-purple-100 rounded px-2 py-1 text-purple-900">
                        <strong>Principe :</strong> Les dépassements hebdomadaires sont compensés si le total mensuel respecte le contrat
                      </div>
                      <div className="bg-purple-100 rounded px-2 py-1 text-purple-900">
                        <strong>Majorations :</strong> Identiques au mode hebdomadaire, calculées sur le mois
                      </div>
                    </div>
                  </div>
                </label>
              </div>

              <Alert className="bg-orange-50 border-orange-200 mt-4">
                <AlertDescription className="text-xs text-gray-700">
                  ⚠️ <strong>Important :</strong> Le changement de mode est immédiat et recalcule automatiquement tous les récapitulatifs. 
                  Les données sources (shifts) ne sont jamais modifiées. Le choix est réversible à tout moment.
                </AlertDescription>
              </Alert>
            </div>

            {/* Règles additionnelles */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 space-y-4">
              <div className="border-t pt-4">
                <h3 className="font-semibold text-gray-900 mb-3">⚠️ Règles d'alertes légales</h3>
                <div className="space-y-2 text-sm text-gray-600">
                  <p>• Repos minimum entre deux shifts (11h minimum)</p>
                  <p>• Dépassement de la durée journalière légale (10h recommandé)</p>
                  <p>• Plafond des heures complémentaires (1/3 du contrat)</p>
                  <p>• Conflits avec absences planifiées</p>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-800">
                💡 Ces règles de calcul constituent une première implémentation fonctionnelle, 
                destinée à être ajustable selon votre convention collective et vos accords d'entreprise.
              </div>
            </div>
          </TabsContent>

          {/* Tab 4: Comptabilité / Export */}
          <TabsContent value="compta" className="mt-6 space-y-4">
            <Alert className="bg-blue-50 border-blue-200">
              <Badge variant="outline" className="mb-2 bg-blue-100 text-blue-900">Configuration</Badge>
              <AlertDescription className="text-sm text-gray-700">
                Paramètres nécessaires pour l'export comptable mensuel (PDF + email automatique).
              </AlertDescription>
            </Alert>

            <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-6">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Mail className="w-5 h-5 text-orange-600" />
                Informations pour l'envoi automatique
              </h3>

              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-semibold text-gray-900">Email comptabilité *</Label>
                  <Input
                    type="email"
                    value={comptaSettings.email_compta || ''}
                    onChange={(e) => setComptaSettings({...comptaSettings, email_compta: e.target.value})}
                    placeholder="compta@example.com"
                    className="mt-1"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">Destinataire des exports mensuels</p>
                </div>

                <div>
                  <Label className="text-sm font-semibold text-gray-900">Nom de l'établissement *</Label>
                  <Input
                    value={comptaSettings.etablissement_name || ''}
                    onChange={(e) => setComptaSettings({...comptaSettings, etablissement_name: e.target.value})}
                    placeholder="Restaurant Le Graal"
                    className="mt-1"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">Apparaît dans l'en-tête des documents</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-semibold text-gray-900">Nom du responsable *</Label>
                    <Input
                      value={comptaSettings.responsable_name || ''}
                      onChange={(e) => setComptaSettings({...comptaSettings, responsable_name: e.target.value})}
                      placeholder="Jean Dupont"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-gray-900">Email du responsable *</Label>
                    <Input
                      type="email"
                      value={comptaSettings.responsable_email || ''}
                      onChange={(e) => setComptaSettings({...comptaSettings, responsable_email: e.target.value})}
                      placeholder="responsable@example.com"
                      className="mt-1"
                    />
                    <p className="text-[10px] text-gray-500 mt-1">Utilisé comme Reply-To dans l'email</p>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-semibold text-gray-900">Coordonnées du responsable</Label>
                  <Textarea
                    value={comptaSettings.responsable_coords || ''}
                    onChange={(e) => setComptaSettings({...comptaSettings, responsable_coords: e.target.value})}
                    placeholder="Tél: 01 23 45 67 89&#10;Email: responsable@example.com"
                    rows={3}
                    className="mt-1"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">Texte libre ajouté en signature de l'email</p>
                </div>

                <Button 
                  onClick={handleSaveComptaSettings}
                  className="w-full bg-orange-600 hover:bg-orange-700"
                >
                  Enregistrer les paramètres comptabilité
                </Button>
              </div>

              <div className="bg-orange-50 border border-orange-200 rounded p-3 text-xs text-gray-700">
                <strong>ℹ️ Fonctionnement :</strong> Une fois configuré, le bouton "Export compta" dans le planning 
                permet de générer et envoyer automatiquement les éléments de paie (récapitulatif + planning PDF) 
                à votre comptabilité.
              </div>
            </div>
          </TabsContent>

          {/* Tab 5: Affichage & ergonomie */}
          <TabsContent value="affichage" className="mt-6 space-y-4">
            <Alert className="bg-blue-50 border-blue-200">
              <Badge variant="outline" className="mb-2 bg-blue-100 text-blue-900">Fonctionnel</Badge>
              <AlertDescription className="text-sm text-gray-700">
                Options d'affichage pour personnaliser l'apparence du planning.
              </AlertDescription>
            </Alert>

            <div className="bg-white border-2 border-blue-200 rounded-lg p-6 space-y-4">
              <h3 className="font-bold text-gray-900 text-lg">🕐 Affichage des heures</h3>
              <p className="text-sm text-gray-600">
                Choisissez comment les durées et heures sont affichées partout dans le planning (récap semaine, récap mois, cartes shifts, export compta).
              </p>
              <div className="space-y-3">
                <label className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  hoursDisplayMode === 'HHMM' ? 'bg-blue-50 border-blue-500' : 'hover:bg-blue-50 border-gray-200'
                }`}>
                  <input
                    type="radio"
                    name="hours_display_mode"
                    value="HHMM"
                    checked={hoursDisplayMode === 'HHMM'}
                    onChange={() => saveDisplayModeMutation.mutate('HHMM')}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-semibold text-gray-900">🕐 Heures:minutes (ex: 5h30)</div>
                    <div className="text-xs text-gray-600 mt-1">Format HH:MM — plus lisible au quotidien</div>
                  </div>
                </label>
                <label className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  hoursDisplayMode === 'DECIMAL' ? 'bg-blue-50 border-blue-500' : 'hover:bg-blue-50 border-gray-200'
                }`}>
                  <input
                    type="radio"
                    name="hours_display_mode"
                    value="DECIMAL"
                    checked={hoursDisplayMode === 'DECIMAL'}
                    onChange={() => saveDisplayModeMutation.mutate('DECIMAL')}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-semibold text-gray-900">🔢 Décimal (ex: 5.50h)</div>
                    <div className="text-xs text-gray-600 mt-1">Format décimal à 2 décimales — utile pour export paie</div>
                  </div>
                </label>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-semibold text-gray-900">Harmonisation des hauteurs de ligne</Label>
                    <p className="text-xs text-gray-600 mt-1">
                      Toutes les cellules d'une même journée ont la même hauteur (activé)
                    </p>
                  </div>
                  <Switch checked={true} onCheckedChange={() => {}} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-semibold text-gray-900">Mode compact (en-têtes employés)</Label>
                    <p className="text-xs text-gray-600 mt-1">
                      Réduire l'espacement des en-têtes pour afficher plus d'employés
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{displayMode === 'compact' ? 'Compact' : 'Normal'}</span>
                    <Switch 
                      checked={displayMode === 'compact'}
                      onCheckedChange={(checked) => setDisplayMode(checked ? 'compact' : 'normal')}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-semibold text-gray-900">Afficher les icônes de statut</Label>
                    <p className="text-xs text-gray-600 mt-1">
                      Montrer les emojis sur les cartes de shifts (prochainement)
                    </p>
                  </div>
                  <Switch disabled />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-semibold text-gray-900">Animations de transition</Label>
                    <p className="text-xs text-gray-600 mt-1">
                      Activer les effets visuels lors des modifications (prochainement)
                    </p>
                  </div>
                  <Switch disabled />
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-800">
                💡 D'autres options d'affichage seront ajoutées selon vos retours d'usage.
              </div>
            </div>
          </TabsContent>

          {/* Tab 5: Actions rapides */}
          <TabsContent value="actions" className="mt-6 space-y-4">
            <Alert className="bg-yellow-50 border-yellow-300">
              <Badge variant="outline" className="mb-2">En expérimentation</Badge>
              <AlertDescription className="text-sm text-gray-700">
                Ces actions sont en phase de test et peuvent être ajustées selon les retours utilisateurs.
              </AlertDescription>
            </Alert>

            <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-semibold text-gray-900">Copier la case du dessus</Label>
                    <p className="text-xs text-gray-600 mt-1">
                      Permet de dupliquer le contenu de la dernière case non vide (activé)
                    </p>
                  </div>
                  <Switch checked={true} onCheckedChange={() => {}} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-semibold text-gray-900">Copier la semaine du dessus</Label>
                    <p className="text-xs text-gray-600 mt-1">
                      Bouton "Copier ↑" dans les récaps de semaine (activé)
                    </p>
                  </div>
                  <Switch checked={true} onCheckedChange={() => {}} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-semibold text-gray-900">Confirmation avant écrasement</Label>
                    <p className="text-xs text-gray-600 mt-1">
                      Demander confirmation si des données existent déjà (activé)
                    </p>
                  </div>
                  <Switch checked={true} onCheckedChange={() => {}} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-semibold text-gray-900">Historique des modifications</Label>
                    <p className="text-xs text-gray-600 mt-1">
                      Possibilité d'annuler les dernières actions (prochainement)
                    </p>
                  </div>
                  <Switch disabled />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-semibold text-gray-900">Mode fusion intelligente</Label>
                    <p className="text-xs text-gray-600 mt-1">
                      Éviter automatiquement les doublons lors de la copie (prochainement)
                    </p>
                  </div>
                  <Switch disabled />
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-800">
                💡 Ces actions rapides visent à optimiser votre productivité. Elles seront affinées progressivement.
              </div>
            </div>
          </TabsContent>

          {/* Tab 7: Optimisation Masse Salariale */}
          <TabsContent value="optimisation" className="mt-6">
            <OptimisationMasseSalariale />
          </TabsContent>

          {/* Tab 6: Sécurité & validation */}
          <TabsContent value="securite" className="mt-6 space-y-4">
            <Alert className="bg-purple-50 border-purple-300">
              <Badge variant="outline" className="mb-2">Prévisionnel</Badge>
              <AlertDescription className="text-sm text-gray-700">
                Les fonctionnalités de sécurité et de validation sont prévues mais non prioritaires à ce stade.
              </AlertDescription>
            </Alert>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 space-y-4">
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">🔒 Verrouillage du planning</h3>
                <div className="space-y-2 text-sm text-gray-600">
                  <p>• Verrouillage par période (semaine, mois)</p>
                  <p>• Verrouillage après validation RH</p>
                  <p>• Déverrouillage conditionnel avec traces</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold text-gray-900 mb-3">👥 Gestion des droits</h3>
                <div className="space-y-2 text-sm text-gray-600">
                  <p>• Qui peut créer / modifier / supprimer un shift</p>
                  <p>• Qui peut valider le planning</p>
                  <p>• Qui peut accéder aux paramètres</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold text-gray-900 mb-3">📜 Historique et traçabilité</h3>
                <div className="space-y-2 text-sm text-gray-600">
                  <p>• Journal des modifications (qui, quoi, quand)</p>
                  <p>• Export des historiques pour audit</p>
                  <p>• Conservation des versions précédentes</p>
                </div>
              </div>

              <div className="bg-purple-50 border border-purple-200 rounded p-3 text-xs text-purple-800 mt-4">
                💡 Ces fonctionnalités seront développées une fois les bases du planning stabilisées.
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-6 pt-4 border-t">
          <Alert className="bg-orange-50 border-orange-200">
            <AlertDescription className="text-xs text-gray-700">
              <strong>⚠️ Comportement par défaut :</strong> Tant qu'une option n'est pas explicitement configurée, 
              elle adopte un comportement neutre sans impact sur la paie ou les compteurs RH. 
              L'ensemble des réglages est réversible et non destructif.
            </AlertDescription>
          </Alert>
        </div>
      </DialogContent>
    </Dialog>
  );
}