import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { file_url } = await req.json();

    if (!file_url) {
      return Response.json({ error: 'file_url required' }, { status: 400 });
    }

    // Extraction via IA avec schéma JSON + contexte internet si besoin
    const extractionResult = await base44.integrations.Core.InvokeLLM({
      prompt: `Analyse cette facture et extrais les informations suivantes avec précision :
      - Nom du fournisseur (nom complet de l'entreprise)
      - Date de la facture (format YYYY-MM-DD)
      - Description courte en 5-12 mots maximum (ex: "Carburant utilitaire livraison - Station X")
      - Catégorie(s) parmi : Produits alimentaires, Carburant, Fournitures de bureau, Garagiste / Entretien véhicule, Matériel / Équipement, Emballages, Télécom / Internet, Énergie, Divers
      - Montant HT en euros
      - Montant TTC en euros
      - Montant TVA en euros
      - Texte intégral de la facture (pour indexation recherche)
      
      Si une information n'est pas claire ou manque, mets null.
      Retourne aussi un score de confiance entre 0 et 1 (1 = très sûr, 0 = très incertain).`,
      file_urls: [file_url],
      response_json_schema: {
        type: "object",
        properties: {
          supplier_name: { type: "string" },
          invoice_date: { type: "string" },
          description: { type: "string" },
          categories: {
            type: "array",
            items: { type: "string" }
          },
          amount_ht: { type: "number" },
          amount_ttc: { type: "number" },
          amount_tva: { type: "number" },
          indexed_text: { type: "string" },
          confidence_score: { type: "number" }
        }
      }
    });

    // Déterminer le statut selon la confiance et les champs manquants
    const data = extractionResult;
    const missingCriticalFields = !data.supplier_name || !data.amount_ttc;
    const lowConfidence = (data.confidence_score || 0) < 0.7;
    
    const status = (missingCriticalFields || lowConfidence) ? 'a_verifier' : 'non_envoyee';

    return Response.json({
      ...data,
      status,
      needs_review: (missingCriticalFields || lowConfidence)
    });

  } catch (error) {
    console.error('Extraction error:', error);
    return Response.json({ 
      error: error.message,
      status: 'a_verifier',
      needs_review: true
    }, { status: 500 });
  }
});