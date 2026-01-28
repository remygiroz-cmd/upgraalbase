import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { v4 as uuidv4 } from 'npm:uuid@9.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { data } = await req.json();
    if (!data || !data.trim()) {
      return Response.json({ success: false, error: 'Données vides', imported: 0, errors: ['Aucune donnée à importer'] }, { status: 400 });
    }

    // ===== AUTO-DETECT SEPARATOR =====
    const detectSeparator = (line) => {
      if (line.includes('\t')) return '\t';
      if (line.includes(';')) return ';';
      return ',';
    };

    const lines = data.trim().split('\n');
    const separator = detectSeparator(lines[0]);
    
    // ===== PARSE CSV/TSV WITH PROPER QUOTED HANDLING =====
    const parseCSVLine = (line, sep) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === sep && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    // ===== HEADER MAPPING =====
    const headerMap = {
      'NOM': 'last_name',
      'PRENOM': 'first_name',
      'DATE DE NAISSANCE': 'birth_date',
      'DATE NAISSANCE': 'birth_date',
      'LIEU DE NAISSANCE': 'birth_place',
      'LIEU NAISSANCE': 'birth_place',
      'ADRESSE POSTALE': 'address',
      'ADRESSE': 'address',
      'NATIONALITE': 'nationality',
      'NATIONALITÉ': 'nationality',
      'N° DE SECURITE SOCIALE': 'social_security_number',
      'N° SS': 'social_security_number',
      'NSS': 'social_security_number',
      'EMPLOI QUALIFICATION': 'position',
      'POSTE': 'position',
      'DATE D\'EMBAUCHE': 'start_date',
      'DATE EMBAUCHE': 'start_date',
      'EMBAUCHE': 'start_date',
      'SEXE': 'gender',
      'TYPE DE CONTRAT': 'contract_type',
      'TYPE CONTRAT': 'contract_type',
      'DATE DE SORTIE': 'exit_date',
      'DATE SORTIE': 'exit_date',
      'SORTIE': 'exit_date'
    };

    const parseHeaders = (headerLine) => {
      const raw = parseCSVLine(headerLine, separator);
      return raw.map(h => {
        const normalized = h.toUpperCase().trim();
        return headerMap[normalized] || null;
      });
    };

    // ===== UTILITIES =====
    const formatDate = (dateStr) => {
      if (!dateStr) return null;
      // Accept JJ/MM/AAAA and JJ-MM-AAAA
      const parts = dateStr.replace(/-/g, '/').split('/');
      if (parts.length === 3) {
        const [day, month, year] = parts;
        if (!/^\d{1,2}$/.test(day) || !/^\d{1,2}$/.test(month) || !/^\d{4}$/.test(year)) {
          return null;
        }
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      return null;
    };

    const normalizeGender = (genderStr) => {
      if (!genderStr) return null;
      const normalized = genderStr.toUpperCase().trim();
      const genderMap = {
        'M': 'male',
        'H': 'male',
        'MASCULIN': 'male',
        'MALE': 'male',
        'F': 'female',
        'FEMININ': 'female',
        'FÉMININ': 'female',
        'FEMALE': 'female'
      };
      return genderMap[normalized] || null;
    };

    const normalizeContractType = (contractStr) => {
      if (!contractStr) return null;
      const normalized = contractStr.toUpperCase().trim();
      const contractMap = {
        'CDI': 'cdi',
        'CDD': 'cdd',
        'EXTRA': 'extra',
        'APPRENTI': 'apprenti',
        'APPRENTICE': 'apprenti',
        'STAGE': 'stage'
      };
      return contractMap[normalized] || null;
    };

    const normalizeSSN = (ssn) => {
      if (!ssn) return '';
      return ssn.replace(/\s+/g, '').trim();
    };

    // ===== PARSE HEADERS =====
    const headerLine = lines[0];
    const fieldIndexes = parseHeaders(headerLine);
    
    // ===== IMPORT LOGIC =====
    const entries = [];
    const errors = [];
    let imported = 0;

    const allEntries = await base44.entities.PersonnelRegistry.list('-entry_order', 1);
    let nextOrder = (allEntries[0]?.entry_order || 0) + 1;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const values = parseCSVLine(line, separator);
        const row = {};

        // Map values to fields
        fieldIndexes.forEach((fieldName, index) => {
          if (fieldName && values[index]) {
            row[fieldName] = values[index].trim();
          }
        });

        // Validate required fields
        if (!row.last_name?.trim() || !row.first_name?.trim()) {
          errors.push(`Ligne ${i + 1}: Nom ou prénom manquant`);
          continue;
        }

        // Parse and normalize data
        const registryEntry = {
          employee_id: uuidv4(),
          last_name: row.last_name.trim(),
          first_name: row.first_name.trim(),
          birth_date: row.birth_date ? formatDate(row.birth_date) : null,
          birth_place: row.birth_place?.trim() || null,
          address: row.address?.trim() || null,
          nationality: row.nationality?.trim() || null,
          gender: row.gender ? normalizeGender(row.gender) : null,
          social_security_number: row.social_security_number ? normalizeSSN(row.social_security_number) : null,
          position: row.position?.trim() || null,
          start_date: row.start_date ? formatDate(row.start_date) : null,
          contract_type: row.contract_type ? normalizeContractType(row.contract_type) : null,
          exit_date: row.exit_date ? formatDate(row.exit_date) : null,
          entry_order: nextOrder,
          registered_by: user.email,
          registered_at: new Date().toISOString(),
          last_updated_at: new Date().toISOString()
        };

        // Check for duplicate (SSN or Name+Birth)
        let isDuplicate = false;
        
        if (registryEntry.social_security_number) {
          const existingSSN = await base44.entities.PersonnelRegistry.filter({
            social_security_number: registryEntry.social_security_number
          });
          if (existingSSN && existingSSN.length > 0) {
            isDuplicate = true;
          }
        }

        if (!isDuplicate && registryEntry.birth_date) {
          const existingName = await base44.entities.PersonnelRegistry.filter({
            last_name: registryEntry.last_name,
            first_name: registryEntry.first_name,
            birth_date: registryEntry.birth_date
          });
          if (existingName && existingName.length > 0) {
            isDuplicate = true;
          }
        }

        if (isDuplicate) {
          errors.push(`Ligne ${i + 1}: Employé déjà existant (doublon)`);
          continue;
        }

        // Create entry
        await base44.entities.PersonnelRegistry.create(registryEntry);
        imported++;
        nextOrder++;

      } catch (error) {
        errors.push(`Ligne ${i + 1}: ${error.message}`);
      }
    }

    return Response.json({
      success: true,
      imported: imported,
      errors: errors
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});