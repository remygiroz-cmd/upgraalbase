import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Copy, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

const FIELD_PROMPTS = {
  descriptionFaits: {
    title: "Description factuelle des faits",
    placeholder: "Décrivez la situation : dates, lieux, comportements observés...",
    systemPrompt: `Tu es un assistant juridique RH. L'utilisateur va décrire une situation.
Tu dois rédiger une description factuelle, neutre et professionnelle des faits.

RÈGLES STRICTES :
- Utilise uniquement des faits observables et vérifiables
- Inclus dates, lieux, témoins si mentionnés
- Ton neutre, non émotionnel, non accusatoire
- Aucune interprétation psychologique
- Aucune qualification juridique (faute simple/grave/lourde)
- Aucun jugement de valeur
- Pas de conclusions hâtives
- Maximum 300 mots

Format : paragraphe rédigé, pas de points à puces.`
  },
  motifSanction: {
    title: "Motif de la sanction",
    placeholder: "Expliquez le manquement constaté...",
    systemPrompt: `Tu es un assistant juridique RH. Rédige un motif de sanction disciplinaire.

RÈGLES STRICTES :
- Qualifier le manquement de façon neutre et factuelle
- Ne jamais suggérer une sanction spécifique
- Ne jamais qualifier la gravité (simple/grave/lourde)
- Rester factuel et mesurable
- Maximum 150 mots

Format : texte concis, professionnel.`
  },
  motifRupture: {
    title: "Motif de rupture",
    placeholder: "Expliquez les raisons de la rupture...",
    systemPrompt: `Tu es un assistant juridique RH. Rédige un motif de rupture contractuelle.

RÈGLES STRICTES :
- Rester neutre et factuel
- Ne jamais conseiller un type de rupture spécifique
- Éviter les termes juridiques complexes
- Décrire la situation sans jugement
- Maximum 200 mots

Format : texte professionnel et neutre.`
  },
  motifModification: {
    title: "Motif de modification contractuelle",
    placeholder: "Expliquez pourquoi cette modification est nécessaire...",
    systemPrompt: `Tu es un assistant juridique RH. Rédige un motif de modification contractuelle (avenant).

RÈGLES STRICTES :
- Expliquer factuellement la nécessité de la modification
- Ton neutre et professionnel
- Éviter le jargon juridique
- Rester concis et clair
- Maximum 150 mots

Format : texte clair et direct.`
  },
  default: {
    title: "Aide à la rédaction",
    placeholder: "Décrivez ce que vous souhaitez rédiger...",
    systemPrompt: `Tu es un assistant juridique RH. Aide l'utilisateur à rédiger un texte professionnel.

RÈGLES STRICTES :
- Ton neutre, factuel et professionnel
- Pas de jugement de valeur
- Pas de conseil juridique
- Pas de prise de décision
- Rester dans le cadre de la demande
- Maximum 250 mots

Format : texte professionnel adapté au contexte RH.`
  }
};

export default function AIWritingAssistant({ fieldKey, fieldLabel, onInsert }) {
  const [open, setOpen] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [generatedText, setGeneratedText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const promptConfig = FIELD_PROMPTS[fieldKey] || FIELD_PROMPTS.default;

  const handleGenerate = async () => {
    if (!userInput.trim()) {
      toast.error('Veuillez décrire la situation');
      return;
    }

    setIsGenerating(true);
    setGeneratedText('');

    try {
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `${promptConfig.systemPrompt}

DEMANDE DE L'UTILISATEUR :
${userInput}

RÉPONDS UNIQUEMENT AVEC LE TEXTE RÉDIGÉ, SANS PRÉAMBULE NI CONCLUSION.`,
        add_context_from_internet: false
      });

      setGeneratedText(response);
    } catch (error) {
      console.error('Error generating text:', error);
      toast.error('Erreur lors de la génération');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedText);
    setCopied(true);
    toast.success('Texte copié dans le presse-papier');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUse = () => {
    onInsert(generatedText);
    setOpen(false);
    setUserInput('');
    setGeneratedText('');
    toast.success('Texte inséré avec succès');
  };

  const handleClose = () => {
    setOpen(false);
    setUserInput('');
    setGeneratedText('');
    setCopied(false);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-50 hover:text-violet-800"
      >
        <Sparkles className="w-3.5 h-3.5" />
        Aide à la rédaction (IA)
      </Button>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-white border-gray-300">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-gray-900">
              <Sparkles className="w-5 h-5 text-violet-600" />
              Assistant IA - {promptConfig.title}
            </DialogTitle>
            <DialogDescription className="text-gray-600">
              Décrivez la situation en langage naturel. L'IA vous proposera une formulation professionnelle.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Disclaimer de sécurité */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex gap-2 text-sm">
              <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
              <p className="text-yellow-900">
                <strong>Important :</strong> L'assistant IA propose une aide à la rédaction. 
                Le contenu final reste sous votre entière responsabilité.
              </p>
            </div>

            {/* Input utilisateur */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">
                Décrivez la situation :
              </label>
              <Textarea
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder={promptConfig.placeholder}
                className="min-h-[120px] border-gray-300"
                disabled={isGenerating}
              />
              <Button
                onClick={handleGenerate}
                disabled={isGenerating || !userInput.trim()}
                className="w-full bg-violet-600 hover:bg-violet-700"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Génération en cours...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Générer une proposition
                  </>
                )}
              </Button>
            </div>

            {/* Texte généré */}
            {generatedText && (
              <div className="space-y-3">
                <div className="border-t border-gray-200 pt-4">
                  <label className="text-sm font-semibold text-gray-700 mb-2 block">
                    Proposition de l'IA :
                  </label>
                  <div className="bg-violet-50 border border-violet-200 rounded-lg p-4">
                    <p className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">
                      {generatedText}
                    </p>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900">
                  <p className="font-medium mb-1">💡 Recommandations :</p>
                  <ul className="text-xs space-y-1 ml-4 list-disc">
                    <li>Relisez et adaptez le texte si nécessaire</li>
                    <li>Vérifiez que tous les faits sont exacts</li>
                    <li>Assurez-vous que le ton reste neutre et professionnel</li>
                  </ul>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleCopy}
                    variant="outline"
                    className="flex-1"
                  >
                    {copied ? (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
                        Copié !
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Copier
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={handleUse}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Utiliser ce texte
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-200">
            <Button onClick={handleClose} variant="outline">
              Fermer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}