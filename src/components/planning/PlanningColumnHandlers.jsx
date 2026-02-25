export const createColumnHandlers = ({
  employees,
  layout,
  monthKey,
  savePlanningLayout,
  setLayout,
  setDraggingId,
  setDragOverId,
}) => {
  const handleColumnDragStart = (id) => setDraggingId(id);
  const handleColumnDragOver = (id) => setDragOverId(id);

  const handleColumnDrop = (sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const current = [...employees];
    const fromIdx = current.findIndex(e => e.id === sourceId);
    const toIdx = current.findIndex(e => e.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const newOrder = [...current];
    const [moved] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, moved);
    const newIds = newOrder.map(e => e.id);
    const newLayout = { column_order: newIds, hidden_employee_ids: layout?.hidden_employee_ids || [] };
    setLayout(newLayout);
    savePlanningLayout(newLayout);
    setDraggingId(null);
    setDragOverId(null);
  };

  const handleColumnDragEnd = () => {
    setDraggingId(null);
    setDragOverId(null);
  };

  const toggleHideColumn = async (employeeId) => {
    const hiddenIds = layout?.hidden_employee_ids || [];
    const next = hiddenIds.includes(employeeId)
      ? hiddenIds.filter(id => id !== employeeId)
      : [...hiddenIds, employeeId];
    const newLayout = { column_order: layout?.column_order || [], hidden_employee_ids: next };
    setLayout(newLayout);
    await savePlanningLayout(newLayout);
  };

  const showAllColumns = async () => {
    const newLayout = { column_order: layout?.column_order || [], hidden_employee_ids: [] };
    setLayout(newLayout);
    await savePlanningLayout(newLayout);
  };

  return {
    handleColumnDragStart,
    handleColumnDragOver,
    handleColumnDrop,
    handleColumnDragEnd,
    toggleHideColumn,
    showAllColumns,
  };
};