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

    // Prompt structuré pour extraction des données de facture
    const extractionPrompt = `Tu es un expert comptable. Analyse cette facture et extrais les informations suivantes avec précision.

INSTRUCTIONS:
- Extraire le nom du fournisseur (société ou personne)
- Date de la facture (format YYYY-MM-DD si possible)
- Montant HT, TTC et TVA (en euros)
- Générer une description courte et précise (5-12 mots maximum)
- Identifier les catégories pertinentes parmi cette liste:
  * Produits alimentaires
  * Carburant
  * Fournitures de bureau
  * Garagiste / Entretien véhicule
  * Matériel / Équipement
  * Emballages
  * Télécom / Internet
  * Énergie
  * Divers

IMPORTANT: Si une information n'est pas clairement visible, mettre null. Indiquer ton niveau de confiance global (0-1).`;

    // Extraction avec LLM + vision
    const extractionResult = await base44.integrations.Core.InvokeLLM({
      prompt: extractionPrompt,
      file_urls: [file_url],
      response_json_schema: {
        type: "object",
        properties: {
          fournisseur: { type: "string" },
          date_facture: { type: "string" },
          description: { type: "string" },
          categories: {
            type: "array",
            items: { type: "string" }
          },
          montant_ht: { type: "number" },
          montant_ttc: { type: "number" },
          tva: { type: "number" },
          confiance: { type: "number" },
          texte_complet: { type: "string" }
        }
      }
    });

    // OCR pour recherche plein texte (extraction du texte brut)
    const ocrPrompt = `Extrais TOUT le texte visible sur cette facture, ligne par ligne, sans modification. Je veux le texte brut complet pour indexation.`;

    const ocrResult = await base44.integrations.Core.InvokeLLM({
      prompt: ocrPrompt,
      file_urls: [file_url]
    });

    const texteIndexe = typeof ocrResult === 'string' ? ocrResult : (ocrResult.texte || extractionResult.texte_complet || '');

    // Validation et détermination du statut
    let statut = 'non_envoyee';
    const confiance = extractionResult.confiance || 0;
    
    // Si confiance faible OU si champs critiques manquants
    if (confiance < 0.7 || !extractionResult.fournisseur || !extractionResult.montant_ttc) {
      statut = 'a_verifier';
    }

    return Response.json({
      success: true,
      data: {
        fournisseur: extractionResult.fournisseur || null,
        date_facture: extractionResult.date_facture || null,
        description: extractionResult.description || 'Facture sans description',
        categories: extractionResult.categories || ['Divers'],
        montant_ht: extractionResult.montant_ht || null,
        montant_ttc: extractionResult.montant_ttc || null,
        tva: extractionResult.tva || null,
        confiance_ia: confiance,
        texte_indexe: texteIndexe,
        statut: statut
      }
    });

  } catch (error) {
    console.error('Error in extractInvoiceData:', error);
    return Response.json({ 
      error: error.message,
      success: false 
    }, { status: 500 });
  }
});