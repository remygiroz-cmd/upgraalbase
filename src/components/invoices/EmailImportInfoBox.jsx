import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Mail, Copy, Check, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function EmailImportInfoBox() {
  const [copied, setCopied] = React.useState(false);

  const { data: establishments = [] } = useQuery({
    queryKey: ['establishments'],
    queryFn: () => base44.entities.Establishment.list()
  });

  const establishment = establishments[0];

  if (!establishment) return null;

  // Normaliser le nom de l'établissement pour l'adresse email
  const establishmentSlug = establishment.name
    ?.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Supprimer les accents
    .replace(/[^a-z0-9]/g, '') // Garder uniquement alphanumériques
    || 'etablissement';

  const emailAddress = `${establishmentSlug}.factures@upgraal.com`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(emailAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Erreur copie:', err);
    }
  };

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-6 mb-6">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-white rounded-lg">
          <Mail className="w-8 h-8 text-blue-600" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            📧 Automatisation des factures
          </h3>
          <p className="text-sm text-gray-700 mb-4">
            Pour importer automatiquement vos factures fournisseurs, envoyez-les par email à l'adresse suivante :
          </p>
          
          <div className="bg-white rounded-lg border-2 border-blue-300 p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <Mail className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <code className="text-base font-mono font-semibold text-blue-900 break-all">
                {emailAddress}
              </code>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopy}
              className={cn(
                "border-blue-300 transition-all flex-shrink-0",
                copied ? "bg-green-50 text-green-700 border-green-300" : "text-blue-700 hover:bg-blue-50"
              )}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Copié !
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" />
                  Copier
                </>
              )}
            </Button>
          </div>

          <div className="mt-4 bg-blue-100 rounded-lg p-3 flex gap-2">
            <Info className="w-4 h-4 text-blue-700 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-900">
              <strong>Automatique :</strong> Toutes les factures reçues en pièce jointe (PDF, JPG, PNG) seront automatiquement ajoutées à votre Coffre à factures et traitées par l'IA pour extraire fournisseur, montants et catégories.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}