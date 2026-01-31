import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const data = await req.json();
    const { payslip_id, pdf_url, employee_id, month } = data;

    if (!payslip_id || !pdf_url) {
      return Response.json({ error: 'Missing payslip_id or pdf_url' }, { status: 400 });
    }

    // Récupérer la fiche de paie
    const payslips = await base44.asServiceRole.entities.Payslip.filter({ id: payslip_id });
    if (payslips.length === 0) {
      return Response.json({ error: 'Payslip not found' }, { status: 404 });
    }

    const payslip = payslips[0];

    try {
      // Appeler l'agent IA pour extraction
      const extractionResult = await base44.integrations.Core.InvokeLLM({
        prompt: `Vous êtes un expert en lecture de fiches de paie françaises. Vous devez extraire AVEC PRÉCISION ABSOLUE les données du PDF fourni.

RÈGLES ABSOLUES :
1. Si une donnée est incertaine, ambiguë ou non trouvée → incluez-la dans quality_issues et marquez extraction_ok = false
2. Ne JAMAIS deviner une valeur monétaire
3. Ne JAMAIS arrondir arbitrairement
4. Vérifier la cohérence : brut ≥ net, charges ≥ 0
5. Identifier le salarié par : matricule/NIR → nom + prénom
6. Normaliser TOUS les montants en EUR sur 2 décimales

TÂCHE :
- Lire intégralement le PDF
- Extraire : mois, salarié, période, tous éléments de paie
- Identifier et vérifier : brut, charges salariales, charges patronales, net à payer, coût de revient
- Extraire congés payés (CP) : acquis N, pris N, solde N, et N-1 si présents
- Détecter anomalies → quality_issues
- Calculer confidenceScore (0-100)

RÉPONDEZ EN JSON STRICT :
{
  "month": "YYYY-MM",
  "employee": {
    "first_name": "...",
    "last_name": "...",
    "matricule": "..."
  },
  "brut": 0.00,
  "net_a_payer": 0.00,
  "charges_salariales_total": 0.00,
  "charges_patronales_total": 0.00,
  "charges_total": 0.00,
  "cout_de_revient": 0.00,
  "cp": {
    "N": { "acquis": 0.00, "pris": 0.00, "solde": 0.00 },
    "N_1": { "acquis": 0.00, "pris": 0.00, "solde": 0.00 }
  },
  "quality_issues": [],
  "confidence_score": 95,
  "extraction_ok": true
}`,
        file_urls: [pdf_url],
        response_json_schema: {
          type: 'object',
          properties: {
            month: { type: 'string' },
            employee: {
              type: 'object',
              properties: {
                first_name: { type: 'string' },
                last_name: { type: 'string' },
                matricule: { type: 'string' }
              }
            },
            brut: { type: 'number' },
            net_a_payer: { type: 'number' },
            charges_salariales_total: { type: 'number' },
            charges_patronales_total: { type: 'number' },
            charges_total: { type: 'number' },
            cout_de_revient: { type: 'number' },
            cp: {
              type: 'object',
              properties: {
                N: {
                  type: 'object',
                  properties: {
                    acquis: { type: 'number' },
                    pris: { type: 'number' },
                    solde: { type: 'number' }
                  }
                },
                N_1: {
                  type: 'object',
                  properties: {
                    acquis: { type: 'number' },
                    pris: { type: 'number' },
                    solde: { type: 'number' }
                  }
                }
              }
            },
            quality_issues: { type: 'array', items: { type: 'string' } },
            confidence_score: { type: 'number' },
            extraction_ok: { type: 'boolean' }
          }
        }
      });

      const extracted = extractionResult;

      // Vérifications cohérence
      const issues = [...(extracted.quality_issues || [])];
      
      if (extracted.brut && extracted.net_a_payer && extracted.brut < extracted.net_a_payer) {
        issues.push('Incohérence : brut < net à payer');
        extracted.extraction_ok = false;
      }
      
      if ((extracted.charges_salariales_total || 0) < 0 || (extracted.charges_patronales_total || 0) < 0) {
        issues.push('Incohérence : charges négatives détectées');
        extracted.extraction_ok = false;
      }

      // Calculer charges_total et cout_de_revient si pas présents
      if (!extracted.charges_total) {
        extracted.charges_total = (extracted.charges_salariales_total || 0) + (extracted.charges_patronales_total || 0);
      }
      if (!extracted.cout_de_revient) {
        extracted.cout_de_revient = (extracted.brut || 0) + (extracted.charges_patronales_total || 0);
      }

      // Mettre à jour la fiche de paie
      await base44.asServiceRole.entities.Payslip.update(payslip_id, {
        extracted_data: extracted,
        confidence_score: extracted.confidence_score || 0,
        status_extraction: extracted.extraction_ok ? 'extracted' : 'needs_review',
        quality_issues: issues
      });

      return Response.json({
        success: true,
        payslip_id,
        status: extracted.extraction_ok ? 'extracted' : 'needs_review',
        confidence_score: extracted.confidence_score,
        quality_issues: issues
      });

    } catch (llmError) {
      console.error('LLM extraction error:', llmError.message);
      
      await base44.asServiceRole.entities.Payslip.update(payslip_id, {
        status_extraction: 'failed',
        error_message: `Extraction IA échouée : ${llmError.message}`
      });

      return Response.json({
        success: false,
        payslip_id,
        status: 'failed',
        error: llmError.message
      });
    }

  } catch (error) {
    console.error('Extract payslip error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});