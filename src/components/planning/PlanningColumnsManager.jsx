import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff } from 'lucide-react';

export default function PlanningColumnsManager({
  hiddenEmployeeIds,
  layout,
  allEmployees,
  canManageColumns,
  onSaveLayout,
  isOpen,
  onOpenChange
}) {
  if (!canManageColumns) return null;

  const handleToggleColumn = (employeeId) => {
    const newHidden = hiddenEmployeeIds.includes(employeeId)
      ? hiddenEmployeeIds.filter(id => id !== employeeId)
      : [...hiddenEmployeeIds, employeeId];
    
    onSaveLayout({
      column_order: layout?.column_order || [],
      hidden_employee_ids: newHidden
    });
  };

  const handleShowAll = () => {
    onSaveLayout({
      column_order: layout?.column_order || [],
      hidden_employee_ids: []
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <EyeOff className="w-4 h-4 text-orange-500" />
            Colonnes masquées ({hiddenEmployeeIds.length})
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {hiddenEmployeeIds.map(id => {
            const emp = allEmployees.find(e => e.id === id);
            if (!emp) return null;
            return (
              <div key={id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg border">
                <span className="text-sm font-medium">{emp.first_name} {emp.last_name}</span>
                <button
                  onClick={() => handleToggleColumn(id)}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                  title="Afficher cette colonne"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Afficher
                </button>
              </div>
            );
          })}
          {hiddenEmployeeIds.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">
              Aucune colonne masquée
            </p>
          )}
        </div>
        <div className="flex gap-2 pt-2 border-t">
          <Button
            onClick={handleShowAll}
            disabled={hiddenEmployeeIds.length === 0}
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
          >
            <Eye className="w-3.5 h-3.5 mr-1" />
            Tout afficher
          </Button>
          <Button
            onClick={() => onOpenChange(false)}
            size="sm"
            className="flex-1 text-xs bg-orange-500 hover:bg-orange-600"
          >
            Fermer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}