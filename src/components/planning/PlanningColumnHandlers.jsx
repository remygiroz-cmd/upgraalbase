// Logic helpers for column management
import { saveLayout } from './planningLayoutService';

export const createColumnHandlers = (monthKey, layout, setLayout, queryClient, employees) => {
  const handleColumnDrop = (sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    
    // Find indices in visible employees
    const fromIdx = employees.findIndex(e => e.id === sourceId);
    const toIdx = employees.findIndex(e => e.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    // Create new order
    const newEmployees = [...employees];
    const [moved] = newEmployees.splice(fromIdx, 1);
    newEmployees.splice(toIdx, 0, moved);
    const newOrder = newEmployees.map(e => e.id);

    // Update and save
    const newLayout = {
      column_order: newOrder,
      hidden_employee_ids: layout?.hidden_employee_ids || []
    };
    setLayout(newLayout);
    saveLayout(monthKey, newLayout);
  };

  const handleToggleColumn = (employeeId) => {
    const currentHidden = layout?.hidden_employee_ids || [];
    const newHidden = currentHidden.includes(employeeId)
      ? currentHidden.filter(id => id !== employeeId)
      : [...currentHidden, employeeId];

    const newLayout = {
      column_order: layout?.column_order || [],
      hidden_employee_ids: newHidden
    };
    setLayout(newLayout);
    saveLayout(monthKey, newLayout);
  };

  const handleShowAll = () => {
    const newLayout = {
      column_order: layout?.column_order || [],
      hidden_employee_ids: []
    };
    setLayout(newLayout);
    saveLayout(monthKey, newLayout);
  };

  return {
    handleColumnDrop,
    handleToggleColumn,
    handleShowAll
  };
};