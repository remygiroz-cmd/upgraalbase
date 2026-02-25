import { saveLayout } from './planningLayoutService';

export function useColumnVisibility(layout, monthKey, setLayout) {
  const toggleHideColumn = (employeeId) => {
    const hiddenIds = layout?.hidden_employee_ids || [];
    const next = hiddenIds.includes(employeeId) 
      ? hiddenIds.filter(id => id !== employeeId) 
      : [...hiddenIds, employeeId];
    const newLayout = { column_order: layout?.column_order || [], hidden_employee_ids: next };
    setLayout(newLayout);
    saveLayout(monthKey, newLayout);
  };

  const showAllColumns = () => {
    const newLayout = { column_order: layout?.column_order || [], hidden_employee_ids: [] };
    setLayout(newLayout);
    saveLayout(monthKey, newLayout);
  };

  return { toggleHideColumn, showAllColumns };
}