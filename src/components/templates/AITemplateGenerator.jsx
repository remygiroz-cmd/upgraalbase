import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, AlertCircle, CheckCircle, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

const PROMPTS_BY_CATEGORY = {
  'A_CONTRACTUEL': {
    CDD: `Tu es un expert juridique RH. Génère un contrat CDD (Contrat à Durée Déterminée) complet et conforme au droit français.

STRUCTURE OBLIGATOIRE :
1. En-tête avec coordonnées des deux parties
2. Titre du contrat
3. Article 1 : Objet du contrat (nature du poste, missions)
4. Article 2 : Motif du recours au CDD (précis et conforme au Code du travail)
5. Article 3 : Durée du contrat (dates début et fin)
6. Article 4 : Lieu de travail
7. Article 5 : Période d'essai
8. Article 6 : Horaires et temps de travail
9. Article 7 : Rémunération
10. Article 8 : Congés payés
11. Article 9 : Clauses générales
12. Signatures

TON : Professionnel, clair, juridiquement neutre
FORMAT : HTML structuré avec <h3> pour les articles, <p> pour le contenu
VARIABLES : Utilise les variables {{}} pour les données dynamiques`,
    
    CDI: `Tu es un expert juridique RH. Génère un contrat CDI (Contrat à Durée Indéterminée) complet et conforme au droit français.

STRUCTURE OBLIGATOIRE :
1. En-tête avec coordonnées des deux parties
2. Titre du contrat
3. Article 1 : Objet du contrat (nature du poste, missions)
4. Article 2 : Date d'effet et prise de fonction
5. Article 3 : Lieu de travail
6. Article 4 : Période d'essai
7. Article 5 : Horaires et temps de travail
8. Article 6 : Rémunération
9. Article 7 : Congés payés
10. Article 8 : Convention collective applicable
11. Article 9 : Clauses générales
12. Signatures

TON : Professionnel, formel, protecteur pour les deux parties
FORMAT : HTML structuré avec <h3> pour les articles, <p> pour le contenu
VARIABLES : Utilise les variables {{}} pour les données dynamiques`,

    AVENANT: `Tu es un expert juridique RH. Génère un avenant au contrat de travail conforme au droit français.

STRUCTURE OBLIGATOIRE :
1. En-tête avec coordonnées des deux parties
2. Titre "AVENANT AU CONTRAT DE TRAVAIL"
3. Préambule (référence au contrat initial)
4. Article 1 : Objet de la modification
5. Article 2 : Modalités de la modification
6. Article 3 : Date d'effet
7. Article 4 : Maintien des autres clauses
8. Signatures

TON : Neutre, factuel, sans jugement
FORMAT : HTML structuré avec <h3> pour les articles
VARIABLES : Utilise {{motifModification}}, {{ancienneValeur}}, {{nouvelleValeur}}, {{dateEffet}}`
  },

  'B_DISCIPLINAIRE': {
    AVERTISSEMENT: `Tu es un expert juridique RH. Génère une lettre d'avertissement conforme au droit français.

STRUCTURE OBLIGATOIRE :
1. En-tête (coordonnées employeur)
2. Coordonnées destinataire
3. Objet : Avertissement
4. Corps de lettre :
   - Rappel des faits (date, lieu, contexte)
   - Description factuelle et objective
   - Rappel des règles non respectées
   - Notification de l'avertissement
   - Mention des voies de recours
5. Formule de politesse
6. Signature

TON : Factuel, neutre, non émotionnel, non accusatoire
FORMAT : Lettre formelle en HTML
INTERDICTIONS : Ne jamais qualifier la faute (simple/grave/lourde), ne jamais suggérer une sanction future
VARIABLES : Utilise {{descriptionFaits}}, {{motifSanction}}`,

    CONVOCATION: `Tu es un expert juridique RH. Génère une convocation à entretien préalable à sanction.

STRUCTURE OBLIGATOIRE :
1. En-tête employeur
2. Coordonnées salarié
3. Objet : Convocation à entretien préalable
4. Corps :
   - Motif de la convocation (faits reprochés)
   - Date, heure et lieu de l'entretien
   - Droit de se faire assister
   - Mention légale (aucune sanction avant entretien)
5. Formule de politesse
6. Signature

TON : Formel, respectueux, juridiquement prudent
FORMAT : Lettre formelle en HTML
RESPECT DES DÉLAIS : Minimum 5 jours ouvrables entre envoi et entretien`,

    SANCTION: `Tu es un expert juridique RH. Génère une notification de sanction disciplinaire.

STRUCTURE OBLIGATOIRE :
1. En-tête employeur
2. Coordonnées salarié
3. Objet : Notification de sanction disciplinaire
4. Corps :
   - Rappel de l'entretien préalable
   - Faits reprochés (factuels, datés)
   - Sanction prononcée
   - Date d'effet
   - Voies de recours
5. Formule de politesse
6. Signature

TON : Factuel, mesuré, juridiquement neutre
FORMAT : Lettre formelle en HTML
INTERDICTIONS : Ne jamais conseiller une sanction spécifique`
  },

  'C_RUPTURE': {
    LICENCIEMENT: `Tu es un expert juridique RH. Génère une lettre de licenciement conforme au droit français.

STRUCTURE OBLIGATOIRE :
1. En-tête employeur
2. Coordonnées salarié
3. Objet : Notification de licenciement
4. Corps :
   - Rappel de l'entretien préalable
   - Motifs du licenciement (factuels, précis, vérifiables)
   - Durée du préavis ou dispense
   - Indemnités dues
   - Solde de tout compte
   - Documents remis (certificat de travail, attestation Pôle Emploi)
   - Voies de recours
5. Formule de politesse
6. Signature

TON : Formel, factuel, juridiquement rigoureux
FORMAT : Lettre formelle en HTML
INTERDICTIONS : Ne jamais qualifier la faute, ne jamais émettre de jugement moral`,

    FIN_CDD: `Tu es un expert juridique RH. Génère une notification de fin de CDD.

STRUCTURE OBLIGATOIRE :
1. En-tête employeur
2. Coordonnées salarié
3. Objet : Notification de fin de contrat CDD
4. Corps :
   - Rappel des dates du contrat
   - Confirmation de la fin à l'échéance prévue
   - Indemnité de fin de contrat (10%)
   - Indemnité compensatrice de congés payés
   - Documents remis
   - Remerciements
5. Formule de politesse
6. Signature

TON : Courtois, professionnel, reconnaissant`,

    RUPTURE_ESSAI: `Tu es un expert juridique RH. Génère une notification de rupture de période d'essai.

STRUCTURE OBLIGATOIRE :
1. En-tête employeur
2. Coordonnées salarié
3. Objet : Notification de rupture de période d'essai
4. Corps :
   - Rappel de la période d'essai en cours
   - Décision de rupture
   - Date de fin effective
   - Respect du délai de prévenance
   - Solde de tout compte
   - Documents remis
5. Formule de politesse
6. Signature

TON : Neutre, respectueux, sans justification excessive`
  },

  'D_ADMINISTRATIF': {
    ATTESTATION: `Tu es un expert juridique RH. Génère une attestation employeur.

STRUCTURE :
1. En-tête employeur
2. Titre "ATTESTATION"
3. Corps :
   - "Je soussigné(e)..."
   - Fonction du signataire
   - Attester que [salarié]...
   - Précisions demandées
   - Mention "Fait pour servir et valoir ce que de droit"
4. Date et lieu
5. Signature et cachet

TON : Formel, factuel, administratif`,

    COURRIER_RH: `Tu es un expert juridique RH. Génère un courrier RH administratif.

STRUCTURE :
1. En-tête employeur
2. Coordonnées destinataire
3. Objet du courrier
4. Corps adapté à la demande
5. Formule de politesse
6. Signature

TON : Professionnel, courtois, clair`
  },

  'E_LIBRE': {
    LETTRE_LIBRE: `Tu es un assistant de rédaction professionnelle. Génère une lettre professionnelle.

STRUCTURE :
1. En-tête
2. Coordonnées destinataire
3. Objet
4. Corps adapté
5. Formule de politesse
6. Signature

TON : Adapté au contexte (formel, courtois, neutre)`,

    NOTE_INTERNE: `Tu es un assistant de rédaction. Génère une note interne d'entreprise.

STRUCTURE :
1. En-tête
2. Destinataires
3. Objet
4. Corps de la note
5. Signature

TON : Clair, direct, professionnel`
  }
};

export default function AITemplateGenerator({ open, onOpenChange, templateType, categorieDocument, onInsertContent }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');

  // Charger les données d'établissement pour le contexte
  const { data: establishments = [] } = useQuery({
    queryKey: ['establishments'],
    queryFn: () => base44.entities.Establishment.list(),
    enabled: open
  });

  const establishment = establishments[0] || {};

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGeneratedContent('');

    try {
      const promptConfig = PROMPTS_BY_CATEGORY[categorieDocument]?.[templateType];
      
      if (!promptConfig) {
        toast.error('Type de document non supporté');
        return;
      }

      const contextPrompt = `${promptConfig}

CONTEXTE DE L'ÉTABLISSEMENT :
- Nom : ${establishment.name || 'Frenchy Sushi'}
- Adresse : ${establishment.postal_address || ''}
- Ville : ${establishment.city || ''}
- SIRET : ${establishment.siret || ''}
- Responsable : ${establishment.managers?.[0]?.name || ''}
- Email : ${establishment.contact_email || ''}

INSTRUCTIONS DE GÉNÉRATION :
1. Génère un contenu HTML complet et structuré
2. Utilise OBLIGATOIREMENT les variables entre doubles accolades {{variable}} pour toutes les données dynamiques
3. Variables employé : {{prenom}}, {{nom}}, {{adresse}}, {{naissance}}, {{lieuNaissance}}, {{nationalite}}, {{secu}}
4. Variables contrat : {{poste}}, {{debut}}, {{fin}}, {{heures}}, {{taux}}, {{salaireBrut}}, {{periodeEssaiTexte}}, {{finEssai}}
5. Variables établissement : {{etablissementNom}}, {{etablissementAdresse}}, {{responsableNom}}
6. Variables spécifiques selon le document : {{descriptionFaits}}, {{motifSanction}}, {{motifRupture}}, {{motifModification}}, etc.
7. Structure le HTML avec <h3> pour les titres d'articles, <p> pour les paragraphes
8. Utilise <strong> pour les éléments importants
9. Reste TOTALEMENT NEUTRE et FACTUEL
10. Ne jamais inventer de faits, ne jamais qualifier juridiquement sans données

GÉNÈRE UNIQUEMENT LE HTML, SANS PRÉAMBULE NI COMMENTAIRE.`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt: contextPrompt,
        add_context_from_internet: false
      });

      setGeneratedContent(response);
      toast.success('Contenu généré avec succès');
    } catch (error) {
      console.error('Error generating template:', error);
      toast.error('Erreur lors de la génération');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUse = () => {
    onInsertContent(generatedContent);
    toast.success('Contenu inséré dans l\'éditeur');
    onOpenChange(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedContent);
    toast.success('Contenu copié dans le presse-papier');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto bg-white border-gray-300">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900">
            <Sparkles className="w-5 h-5 text-violet-600" />
            Générateur IA de contenu RH
          </DialogTitle>
          <DialogDescription className="text-gray-600">
            Génération automatique d'un {templateType} - Catégorie {categorieDocument}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Disclaimer juridique */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-900">
              <p className="font-semibold mb-1">⚖️ Important - Responsabilité juridique</p>
              <p>
                Ce contenu est une <strong>proposition générée par une IA</strong>.
                Il doit être <strong>relu, adapté et validé</strong> par l'utilisateur avant toute utilisation officielle.
              </p>
              <p className="mt-2">
                L'IA ne prend aucune décision juridique, ne qualifie aucune faute et n'engage pas la responsabilité de l'employeur.
              </p>
            </div>
          </div>

          {/* Zone d'action */}
          {!generatedContent && !isGenerating && (
            <div className="text-center py-8">
              <div className="bg-violet-50 border-2 border-dashed border-violet-300 rounded-lg p-8">
                <Sparkles className="w-12 h-12 text-violet-600 mx-auto mb-4" />
                <h3 className="font-semibold text-gray-900 mb-2">Prêt à générer votre document</h3>
                <p className="text-sm text-gray-600 mb-4">
                  L'IA va créer un contenu complet basé sur :
                </p>
                <ul className="text-sm text-left text-gray-700 max-w-md mx-auto space-y-1 mb-6">
                  <li>✓ Le type de document : <strong>{templateType}</strong></li>
                  <li>✓ La catégorie juridique : <strong>{categorieDocument}</strong></li>
                  <li>✓ Les données de votre établissement</li>
                  <li>✓ Les bonnes pratiques juridiques françaises</li>
                </ul>
                <Button
                  onClick={handleGenerate}
                  className="bg-violet-600 hover:bg-violet-700"
                  size="lg"
                >
                  <Sparkles className="w-5 h-5 mr-2" />
                  Générer le contenu avec l'IA
                </Button>
              </div>
            </div>
          )}

          {/* Chargement */}
          {isGenerating && (
            <div className="text-center py-12">
              <Loader2 className="w-12 h-12 text-violet-600 animate-spin mx-auto mb-4" />
              <p className="text-gray-700 font-medium">Génération du contenu en cours...</p>
              <p className="text-sm text-gray-500 mt-2">Cela peut prendre quelques secondes</p>
            </div>
          )}

          {/* Contenu généré */}
          {generatedContent && !isGenerating && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-green-900">
                  <p className="font-semibold">Contenu généré avec succès !</p>
                  <p>Vous pouvez le prévisualiser ci-dessous, puis l'insérer dans l'éditeur pour le modifier librement.</p>
                </div>
              </div>

              <div className="border border-gray-300 rounded-lg p-6 bg-white max-h-[500px] overflow-auto">
                <div 
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: generatedContent }}
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900">
                <p className="font-medium mb-1">💡 Prochaines étapes :</p>
                <ol className="text-xs space-y-1 ml-4 list-decimal">
                  <li>Cliquez sur "Utiliser ce contenu" pour l'insérer dans l'éditeur</li>
                  <li>Modifiez et adaptez le texte selon vos besoins</li>
                  <li>Vérifiez que toutes les variables {{}} sont présentes</li>
                  <li>Sauvegardez votre template</li>
                </ol>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleCopy}
                  variant="outline"
                  className="flex-1"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copier
                </Button>
                <Button
                  onClick={handleGenerate}
                  variant="outline"
                  className="flex-1"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Régénérer
                </Button>
                <Button
                  onClick={handleUse}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Utiliser ce contenu
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}