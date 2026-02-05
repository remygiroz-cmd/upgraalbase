import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Rôles autorisés à extraire des données de factures
const ALLOWED_ROLES = ['admin', 'manager', 'comptable', 'gestionnaire'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Vérification authentification
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Vérification des permissions
    if (!ALLOWED_ROLES.includes(user.role)) {
      console.warn(`[SECURITY] User ${user.id} attempted to extract invoice data without permission`);
      return Response.json({ error: 'Permissions insuffisantes' }, { status: 403 });
    }

    const { file_url } = await req.json();

    if (!file_url) {
      return Response.json({ error: 'file_url is required' }, { status: 400 });
    }

    // Extraction IA
    const extractionResult = await base44.integrations.Core.InvokeLLM({
      prompt: `Analyse cette facture et extrais les informations suivantes en JSON:
- supplier: nom du fournisseur
- invoice_date: date de la facture (format YYYY-MM-DD)
- categories: tableau de catégories parmi ["Produits alimentaires", "Carburant", "Fournitures de bureau", "Garagiste / Entretien véhicule", "Matériel / Équipement", "Emballages", "Télécom / Internet", "Énergie", "Divers"]
- short_description: description courte de 5 à 12 mots maximum
- accounting_account: compte comptable ou nature si mentionné (ex: 6063, 6064, Carburant, Entretien)
- amount_ht: montant HT en nombre
- amount_ttc: montant TTC en nombre
- vat: TVA en nombre
- indexed_text: texte intégral de la facture pour indexation
- confidence: ton niveau de confiance global (0 à 1)

Si une information n'est pas trouvée, mets null. Sois précis et extrait tout le texte pour indexed_text.`,
      file_urls: [file_url],
      response_json_schema: {
        type: "object",
        properties: {
          supplier: { type: ["string", "null"] },
          invoice_date: { type: ["string", "null"] },
          categories: { type: "array", items: { type: "string" } },
          short_description: { type: ["string", "null"] },
          accounting_account: { type: ["string", "null"] },
          amount_ht: { type: ["number", "null"] },
          amount_ttc: { type: ["number", "null"] },
          vat: { type: ["number", "null"] },
          indexed_text: { type: "string" },
          confidence: { type: "number" }
        }
      }
    });

    // Déterminer le statut
    const missingCritical = !extractionResult.supplier || !extractionResult.amount_ttc;
    const lowConfidence = extractionResult.confidence < 0.7;
    const status = (missingCritical || lowConfidence) ? "a_verifier" : "non_envoyee";

    console.log(`[INFO] Invoice extraction completed with confidence: ${extractionResult.confidence}`);

    return Response.json({
      ...extractionResult,
      status
    });

  } catch (error) {
    console.error('[ERROR] extractInvoiceData:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
