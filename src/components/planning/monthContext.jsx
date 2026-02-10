import { base44 } from '@/api/base44Client';

/**
 * SOURCE DE VÉRITÉ UNIQUE pour (month_key, reset_version)
 * 
 * Garantit que tous les writes et reads utilisent exactement le même reset_version actif
 * Élimine les divergences entre modules (ApplyTemplate vs Export vs Planning UI)
 */

/**
 * Récupère ou crée le contexte du mois actif
 * 
 * @param {string} monthKey - Format "YYYY-MM" (ex: "2026-02")
 * @returns {Promise<{month_key: string, reset_version: number}>}
 */
export async function getActiveMonthContext(monthKey) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📅 MONTH CONTEXT - Getting active version');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Input month_key: "${monthKey}"`);
  
  // Parse monthKey to extract year and month
  const [yearStr, monthStr] = monthKey.split('-');
  if (!yearStr || !monthStr) {
    throw new Error(`Invalid monthKey format: "${monthKey}". Expected "YYYY-MM".`);
  }
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1; // Convert to 0-indexed
  
  // Chercher l'entité PlanningMonth pour ce mois
  const planningMonths = await base44.entities.PlanningMonth.filter({ month_key: monthKey });
  
  let planningMonth;
  
  if (planningMonths.length === 0) {
    // Créer une nouvelle entrée avec reset_version = 0
    console.log('⚠️ No PlanningMonth found - Creating with reset_version=0');
    planningMonth = await base44.entities.PlanningMonth.create({
      year,
      month,
      month_key: monthKey,
      reset_version: 0
    });
    console.log(`✓ Created PlanningMonth (ID: ${planningMonth.id})`);
  } else {
    planningMonth = planningMonths[0];
    console.log(`✓ Found existing PlanningMonth (ID: ${planningMonth.id})`);
  }
  
  const context = {
    month_key: planningMonth.month_key,
    reset_version: planningMonth.reset_version
  };
  
  console.log(`📊 ACTIVE CONTEXT:`);
  console.log(`   month_key: "${context.month_key}"`);
  console.log(`   reset_version: ${context.reset_version}`);
  console.log('═══════════════════════════════════════════════════════════\n');
  
  return context;
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