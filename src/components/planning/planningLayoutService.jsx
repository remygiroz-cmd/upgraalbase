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

export const applyLayoutToEmployees = (employees, globalColumnOrder, hiddenEmployeeIds = []) => {
  if (!employees) return employees;

  // Étape 1 : Filtrer les employés masqués
  const visibleEmployees = employees.filter(emp => !hiddenEmployeeIds?.includes(emp.id));
  
  if (!globalColumnOrder || globalColumnOrder.length === 0) {
    return visibleEmployees;
  }

  // Étape 2 : Réordonner selon globalColumnOrder
  const ordered = [];
  const usedIds = new Set();

  // D'abord, ajouter les employés selon l'ordre défini (s'ils existent et ne sont pas masqués)
  for (const empId of globalColumnOrder) {
    const emp = visibleEmployees.find(e => e.id === empId);
    if (emp) {
      ordered.push(emp);
      usedIds.add(empId);
    }
  }

  // Puis ajouter les employés visibles non présents dans globalColumnOrder
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