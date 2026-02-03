import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Calendar, Calculator, Eye, Zap, Lock } from 'lucide-react';
import PositionsManager from './PositionsManager';
import NonShiftTypesManager from './NonShiftTypesManager';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

export default function PlanningSettingsModal({ open, onOpenChange }) {
  const [activeTab, setActiveTab] = useState('statuts');

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
          <TabsList className="grid w-full grid-cols-6 gap-1">
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
            <TabsTrigger value="affichage" className="text-xs flex flex-col items-center gap-1 py-2">
              <Eye className="w-4 h-4" />
              <span>Affichage</span>
            </TabsTrigger>
            <TabsTrigger value="actions" className="text-xs flex flex-col items-center gap-1 py-2">
              <Zap className="w-4 h-4" />
              <span>Actions</span>
            </TabsTrigger>
            <TabsTrigger value="securite" className="text-xs flex flex-col items-center gap-1 py-2">
              <Lock className="w-4 h-4" />
              <span>Sécurité</span>
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
            <Alert className="bg-yellow-50 border-yellow-300">
              <Badge variant="outline" className="mb-2">En cours de définition</Badge>
              <AlertDescription className="text-sm text-gray-700">
                Les règles de calcul des heures et des récapitulatifs sont en cours de conception.
                Ces paramètres seront disponibles dans une prochaine version.
              </AlertDescription>
            </Alert>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 space-y-4">
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">📊 Calcul des récapitulatifs</h3>
                <div className="space-y-2 text-sm text-gray-600">
                  <p>• Récap hebdomadaire (semaine complète)</p>
                  <p>• Récap semaine incomplète (fin de mois)</p>
                  <p>• Récap mensuel</p>
                  <p>• Distinction heures normales / complémentaires / supplémentaires</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold text-gray-900 mb-3">⚠️ Règles d'alertes</h3>
                <div className="space-y-2 text-sm text-gray-600">
                  <p>• Repos minimum entre deux shifts</p>
                  <p>• Dépassement de la durée journalière légale</p>
                  <p>• Dépassement de la durée hebdomadaire</p>
                  <p>• Conflits d'absences</p>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-800">
                💡 Ces règles seront paramétrables et ajustables selon vos besoins métier.
              </div>
            </div>
          </TabsContent>

          {/* Tab 4: Affichage & ergonomie */}
          <TabsContent value="affichage" className="mt-6 space-y-4">
            <Alert className="bg-yellow-50 border-yellow-300">
              <Badge variant="outline" className="mb-2">En cours de définition</Badge>
              <AlertDescription className="text-sm text-gray-700">
                Les options d'affichage sont en cours de développement et pourront évoluer.
              </AlertDescription>
            </Alert>

            <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-semibold text-gray-900">Harmonisation des hauteurs de ligne</Label>
                    <p className="text-xs text-gray-600 mt-1">
                      Toutes les cellules d'une même journée ont la même hauteur (activé)
                    </p>
                  </div>
                  <Switch checked={true} disabled />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-semibold text-gray-900">Mode compact</Label>
                    <p className="text-xs text-gray-600 mt-1">
                      Réduire l'espacement et la taille des éléments (prochainement)
                    </p>
                  </div>
                  <Switch disabled />
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
                  <Switch checked={true} disabled />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-semibold text-gray-900">Copier la semaine du dessus</Label>
                    <p className="text-xs text-gray-600 mt-1">
                      Bouton "Copier ↑" dans les récaps de semaine (activé)
                    </p>
                  </div>
                  <Switch checked={true} disabled />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-semibold text-gray-900">Confirmation avant écrasement</Label>
                    <p className="text-xs text-gray-600 mt-1">
                      Demander confirmation si des données existent déjà (activé)
                    </p>
                  </div>
                  <Switch checked={true} disabled />
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