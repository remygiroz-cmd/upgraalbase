import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { file_url, file_name } = await req.json();

    if (!file_url) {
      return Response.json({ error: 'file_url required' }, { status: 400 });
    }

    // Étape 1 : Extraire le texte intégral (OCR si nécessaire)
    let fullTextContent = '';
    try {
      const ocrPrompt = `Extrait TOUT le texte visible dans ce document (facture). 
      Retourne uniquement le texte brut, ligne par ligne, sans analyse.`;
      
      const ocrResult = await base44.integrations.Core.InvokeLLM({
        prompt: ocrPrompt,
        file_urls: [file_url]
      });
      
      fullTextContent = typeof ocrResult === 'string' ? ocrResult : (ocrResult.text || '');
    } catch (error) {
      console.error('OCR error:', error);
      fullTextContent = '';
    }

    // Étape 2 : Extraction des données structurées
    const extractionPrompt = `Analyse cette facture fournisseur et extrait les informations suivantes.

RÈGLES STRICTES :
- Si une info n'est PAS visible, mets null (pas de valeur inventée)
- Pour les catégories, choisis parmi : Produits alimentaires, Carburant, Fournitures de bureau, Garagiste / Entretien véhicule, Matériel / Équipement, Emballages, Télécom / Internet, Énergie, Divers
- Pour la description : 5 à 12 mots maximum, factuel, pas de détails inutiles
- Pour les montants : extraire les chiffres exacts (pas d'arrondi)
- Si la confiance est faible (texte illisible, infos manquantes), mets confidence < 0.6

Texte de la facture :
${fullTextContent}`;

    const extractionSchema = {
      type: "object",
      properties: {
        supplier_name: { type: "string" },
        invoice_date: { type: "string" },
        categories: { 
          type: "array",
          items: { type: "string" }
        },
        description: { type: "string" },
        amount_ht: { type: "number" },
        amount_ttc: { type: "number" },
        amount_tva: { type: "number" },
        accounting_nature: { type: "string" },
        confidence: { type: "number" }
      }
    };

    const extractedData = await base44.integrations.Core.InvokeLLM({
      prompt: extractionPrompt,
      file_urls: [file_url],
      response_json_schema: extractionSchema
    });

    // Déterminer le statut
    const confidence = extractedData.confidence || 0;
    const missingCriticalFields = !extractedData.supplier_name || !extractedData.amount_ttc;
    
    let status = 'non_envoyee';
    if (confidence < 0.6 || missingCriticalFields) {
      status = 'a_verifier';
    }

    // Normaliser le nom du fichier
    const dateStr = extractedData.invoice_date 
      ? extractedData.invoice_date.replace(/\//g, '-')
      : new Date().toISOString().split('T')[0];
    const supplierStr = (extractedData.supplier_name || 'Fournisseur').replace(/[^a-zA-Z0-9]/g, '_');
    const ttcStr = extractedData.amount_ttc ? Math.round(extractedData.amount_ttc) : 'XX';
    const normalizedFileName = `${dateStr}__${supplierStr}__${ttcStr}.pdf`;

    return Response.json({
      success: true,
      data: {
        ...extractedData,
        full_text_content: fullTextContent,
        status: status,
        normalized_file_name: normalizedFileName,
        file_url: file_url,
        file_name: file_name
      }
    });

  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});