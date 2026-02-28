import { base44 } from '@/api/base44Client';

/**
 * SOURCE DE VÉRITÉ UNIQUE pour (month_key, reset_version)
 */

// Cache en mémoire pour éviter les appels répétés (rate limit)
// Invalidé explicitement lors du bumpMonthVersion
const _contextCache = new Map(); // monthKey -> { context, ts }
const CACHE_TTL_MS = 60_000; // 60 secondes

// Dédoublonnage des requêtes en cours (promise sharing)
const _inflight = new Map(); // monthKey -> Promise

export function invalidateMonthContextCache(monthKey) {
  _contextCache.delete(monthKey);
  _inflight.delete(monthKey);
}

/**
 * Récupère ou crée le contexte du mois actif
 * Résultats mis en cache 60s pour éviter le rate-limit.
 *
 * @param {string} monthKey - Format "YYYY-MM" (ex: "2026-02")
 * @returns {Promise<{month_key: string, reset_version: number}>}
 */
export async function getActiveMonthContext(monthKey) {
  // Cache hit
  const cached = _contextCache.get(monthKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.context;
  }

  // Dédoublonnage : si une requête est déjà en cours pour ce mois, on attend son résultat
  if (_inflight.has(monthKey)) {
    return _inflight.get(monthKey);
  }

  const promise = (async () => {
    const [yearStr, monthStr] = monthKey.split('-');
    if (!yearStr || !monthStr) throw new Error(`Invalid monthKey format: "${monthKey}".`);
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1;

    const planningMonths = await base44.entities.PlanningMonth.filter({ month_key: monthKey });

    let planningMonth;
    if (planningMonths.length === 0) {
      planningMonth = await base44.entities.PlanningMonth.create({
        year, month, month_key: monthKey, reset_version: 0
      });
    } else {
      planningMonth = planningMonths[0];
    }

    const context = {
      month_key: planningMonth.month_key,
      reset_version: planningMonth.reset_version
    };

    _contextCache.set(monthKey, { context, ts: Date.now() });
    _inflight.delete(monthKey);
    return context;
  })();

  _inflight.set(monthKey, promise);
  return promise;
}

/**
 * Incrémente la version du mois (utilisé lors du reset)
 * 
 * @param {string} monthKey - Format "YYYY-MM"
 * @returns {Promise<number>} - Nouvelle reset_version
 */
export async function bumpMonthVersion(monthKey) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🔄 MONTH CONTEXT - Bumping version (RESET)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Month: "${monthKey}"`);
  
  // Parse monthKey to extract year and month
  const [yearStr, monthStr] = monthKey.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1; // Convert to 0-indexed
  
  // Validate parsed values
  if (isNaN(year) || isNaN(month)) {
    throw new Error(`Failed to parse monthKey: "${monthKey}". Got year=${year}, month=${month}`);
  }
  
  const planningMonths = await base44.entities.PlanningMonth.filter({ month_key: monthKey });
  
  if (planningMonths.length === 0) {
    console.log('⚠️ No PlanningMonth found - Creating with reset_version=1');
    const newMonth = await base44.entities.PlanningMonth.create({
      year,
      month,
      month_key: monthKey,
      reset_version: 1
    });
    console.log(`✓ Created PlanningMonth with version 1 (ID: ${newMonth.id})`);
    console.log('═══════════════════════════════════════════════════════════\n');
    return 1;
  }
  
  const planningMonth = planningMonths[0];
  const oldVersion = planningMonth.reset_version;
  const newVersion = oldVersion + 1;
  
  await base44.entities.PlanningMonth.update(planningMonth.id, {
    reset_version: newVersion
  });
  
  console.log(`✓ Version bumped: ${oldVersion} → ${newVersion}`);
  console.log(`   PlanningMonth ID: ${planningMonth.id}`);
  console.log('═══════════════════════════════════════════════════════════\n');
  
  return newVersion;
}