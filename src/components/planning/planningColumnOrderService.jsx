import { base44 } from '@/api/base44Client';

/**
 * Service pour gérer l'ordre GLOBAL des colonnes du planning
 * Cet ordre s'applique à TOUS les mois
 */

export async function getGlobalColumnOrder() {
  try {
    const records = await base44.entities.PlanningColumnOrder.filter({ key: 'global' });
    if (records.length > 0) {
      return records[0].column_order || [];
    }
    return [];
  } catch (error) {
    console.error('Erreur getGlobalColumnOrder:', error);
    return [];
  }
}

export async function saveGlobalColumnOrder(columnOrder) {
  try {
    const records = await base44.entities.PlanningColumnOrder.filter({ key: 'global' });
    
    if (records.length > 0) {
      // Mise à jour
      await base44.entities.PlanningColumnOrder.update(records[0].id, {
        column_order: columnOrder
      });
    } else {
      // Création
      await base44.entities.PlanningColumnOrder.create({
        key: 'global',
        column_order: columnOrder
      });
    }
  } catch (error) {
    console.error('Erreur saveGlobalColumnOrder:', error);
    throw error;
  }
}