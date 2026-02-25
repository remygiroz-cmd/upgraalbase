import { base44 } from '@/api/base44Client';

export const getLayout = async (monthKey) => {
  if (!monthKey) return { hidden_employee_ids: [] };
  try {
    const layouts = await base44.entities.PlanningLayout.filter({ month_key: monthKey });
    if (layouts[0]) {
      // Retourner uniquement hidden_employee_ids (ignorer column_order)
      return { hidden_employee_ids: layouts[0].hidden_employee_ids || [] };
    }
    return { hidden_employee_ids: [] };
  } catch (error) {
    console.error('Erreur lecture layout:', error);
    return { hidden_employee_ids: [] };
  }
};

export const saveLayout = async (monthKey, { hidden_employee_ids }) => {
  if (!monthKey) return;
  try {
    const existing = await base44.entities.PlanningLayout.filter({ month_key: monthKey });
    
    if (existing[0]) {
      // Update - sauvegarder uniquement hidden_employee_ids
      await base44.entities.PlanningLayout.update(existing[0].id, {
        hidden_employee_ids: hidden_employee_ids || []
      });
    } else {
      // Create - sauvegarder uniquement hidden_employee_ids
      await base44.entities.PlanningLayout.create({
        month_key: monthKey,
        hidden_employee_ids: hidden_employee_ids || []
      });
    }
  } catch (error) {
    console.error('Erreur sauvegarde layout:', error);
  }
};

export const applyLayoutToEmployees = (employees, layout) => {
  if (!layout || !employees) return employees;

  const { column_order, hidden_employee_ids } = layout;
  
  // Filtrer les employés masqués
  const visibleEmployees = employees.filter(emp => !hidden_employee_ids?.includes(emp.id));
  
  if (!column_order || column_order.length === 0) {
    return visibleEmployees;
  }

  // Réordonner selon column_order, puis ajouter les autres à la fin
  const ordered = [];
  const usedIds = new Set();

  // D'abord, ajouter les employés selon l'ordre défini (s'ils existent et ne sont pas masqués)
  for (const empId of column_order) {
    const emp = visibleEmployees.find(e => e.id === empId);
    if (emp) {
      ordered.push(emp);
      usedIds.add(empId);
    }
  }

  // Puis ajouter les employés visibles non présents dans column_order
  for (const emp of visibleEmployees) {
    if (!usedIds.has(emp.id)) {
      ordered.push(emp);
    }
  }

  return ordered;
};

export const clearLayout = async (monthKey) => {
  if (!monthKey) return;
  try {
    const existing = await base44.entities.PlanningLayout.filter({ month_key: monthKey });
    if (existing[0]) {
      await base44.entities.PlanningLayout.delete(existing[0].id);
    }
  } catch (error) {
    console.error('Erreur suppression layout:', error);
  }
};