import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { data } = await req.json();
    
    // Parse TSV data
    const lines = data.trim().split('\n');
    const headers = lines[0].split('\t');
    
    // Map headers to field names
    const headerMap = {
      'NOM': 'last_name',
      'PRENOM': 'first_name',
      'DATE DE NAISSANCE': 'birth_date',
      'LIEU DE NAISSANCE': 'birth_place',
      'ADRESSE POSTALE': 'address',
      'NATIONALITE': 'nationality',
      'N° DE SECURITE SOCIALE': 'social_security_number',
      'EMPLOI QUALIFICATION': 'position',
      'DATE D\'EMBAUCHE': 'start_date',
      'SEXE': 'gender',
      'TYPE DE CONTRAT': 'contract_type',
      'DATE DE SORTIE': 'exit_date'
    };

    const entries = [];
    const errors = [];

    // Get highest entry_order
    const allEntries = await base44.entities.PersonnelRegistry.list('-entry_order', 1);
    let nextOrder = (allEntries[0]?.entry_order || 0) + 1;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split('\t');
      const row = {};

      headers.forEach((header, index) => {
        const fieldName = headerMap[header];
        if (fieldName) {
          row[fieldName] = values[index]?.trim() || '';
        }
      });

      if (!row.last_name || !row.first_name) {
        errors.push(`Ligne ${i + 1}: Nom ou prénom manquant`);
        continue;
      }

      try {
        // Parse and format dates
        const formatDate = (dateStr) => {
          if (!dateStr) return null;
          const parts = dateStr.split('/');
          if (parts.length === 3) {
            return `${parts[2]}-${parts[1]}-${parts[0]}`;
          }
          return null;
        };

        // Map gender
        const genderMap = { 'M': 'male', 'F': 'female', 'H': 'male' };
        const gender = genderMap[row.gender] || null;

        // Map contract type
        const contractMap = {
          'CDI': 'cdi',
          'CDD': 'cdd',
          'EXTRA': 'extra',
          'APPRENTI': 'apprenti',
          'STAGE': 'stage'
        };
        const contractType = contractMap[row.contract_type?.toUpperCase()] || row.contract_type;

        // Normalize nationality
        const nationality = row.nationality?.replace(/FR/i, 'France')
          .replace(/FRANCE/i, 'France')
          .replace(/PORTUGAIS/i, 'Portugal')
          .replace(/PORTUGAISE/i, 'Portugal')
          .replace(/THAILANDE/i, 'Thaïlande')
          .replace(/THAILANDAISE/i, 'Thaïlande') || '';

        const registryEntry = {
          last_name: row.last_name.toUpperCase(),
          first_name: row.first_name.toUpperCase(),
          birth_date: formatDate(row.birth_date) || null,
          birth_place: row.birth_place?.toUpperCase() || '',
          address: row.address?.toUpperCase() || '',
          nationality: nationality,
          social_security_number: row.social_security_number || '',
          position: row.position || '',
          start_date: formatDate(row.start_date) || null,
          contract_type: contractType || '',
          exit_date: formatDate(row.exit_date) || null,
          entry_order: nextOrder,
          registered_by: user.email,
          registered_at: new Date().toISOString(),
          last_updated_at: new Date().toISOString()
        };

        // Check if already exists
        const existing = await base44.entities.PersonnelRegistry.filter({
          last_name: registryEntry.last_name,
          first_name: registryEntry.first_name,
          birth_date: registryEntry.birth_date
        });

        if (existing && existing.length === 0) {
          await base44.entities.PersonnelRegistry.create(registryEntry);
          nextOrder++;
        }
      } catch (error) {
        errors.push(`Ligne ${i + 1}: ${error.message}`);
      }
    }

    return Response.json({
      success: true,
      imported: lines.length - 1 - errors.length,
      errors: errors
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});