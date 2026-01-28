import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Plus, Trash2, Edit2, GripHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

export default function TeamsManager() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const { data: teams = [], isLoading: teamsLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list('order')
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.list('last_name')
  });

  const createTeamMutation = useMutation({
    mutationFn: (data) => base44.entities.Team.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Équipe créée');
      handleCloseForm();
    }
  });

  const updateTeamMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Team.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Équipe modifiée');
      handleCloseForm();
    }
  });

  const deleteTeamMutation = useMutation({
    mutationFn: (id) => base44.entities.Team.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Équipe supprimée');
    }
  });

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingTeam(null);
  };

  const handleDragEnd = (result) => {
    const { draggableId, destination } = result;

    if (!destination) return;

    const empId = draggableId.replace('employee-', '');
    const teamId = destination.droppableId === 'unassigned' ? null : destination.droppableId;

    const employee = employees.find(e => e.id === empId);
    if (employee) {
      base44.entities.Employee.update(empId, { team_id: teamId, team: teamId ? teams.find(t => t.id === teamId)?.name : '' });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Employé assigné');
    }
  };

  if (teamsLoading) {
    return <div className="text-center py-8 text-gray-600">Chargement...</div>;
  }

  const unassignedEmployees = employees.filter(e => !e.team_id && e.is_active);
  const teamsList = teams.filter(t => t.is_active);

  return (
    <div>
      <div className="mb-6">
        <Button
          onClick={() => setShowForm(true)}
          className="bg-orange-600 hover:bg-orange-700 min-h-[44px]"
        >
          <Plus className="w-4 h-4 mr-2" />
          Créer une équipe
        </Button>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
          {/* Teams */}
          {teamsList.map((team) => {
            const teamEmployees = employees.filter(e => e.team_id === team.id && e.is_active);
            return (
              <Droppable key={team.id} droppableId={team.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      "bg-white border-2 rounded-lg p-4 min-h-[300px] transition-all",
                      snapshot.isDraggingOver ? "border-orange-400 bg-orange-50" : "border-gray-300"
                    )}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: team.color || '#f97316' }}
                        />
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 truncate">{team.name}</h3>
                          <p className="text-xs text-gray-500">{teamEmployees.length} employé(s)</p>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => setEditingTeam(team)}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Modifier"
                        >
                          <Edit2 className="w-4 h-4 text-gray-600" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(team)}
                          className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </div>

                    {/* Team Members */}
                    <div className="space-y-2">
                      {teamEmployees.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-4">Glissez des employés ici</p>
                      ) : (
                        teamEmployees.map((emp, index) => (
                          <Draggable key={emp.id} draggableId={`employee-${emp.id}`} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={cn(
                                  "bg-gray-50 border border-gray-200 rounded-lg p-2 flex items-center gap-2 cursor-move transition-all",
                                  snapshot.isDragging && "shadow-lg bg-white border-orange-400"
                                )}
                              >
                                <GripHorizontal className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">
                                    {emp.first_name} {emp.last_name}
                                  </p>
                                  {emp.position && (
                                    <p className="text-xs text-gray-600 truncate">{emp.position}</p>
                                  )}
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))
                      )}
                    </div>

                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            );
          })}
        </div>

        {/* Unassigned Employees */}
        <Droppable droppableId="unassigned">
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={cn(
                "bg-white border-2 rounded-lg p-4 transition-all",
                snapshot.isDraggingOver ? "border-orange-400 bg-orange-50" : "border-gray-300"
              )}
            >
              <h3 className="font-semibold text-gray-900 mb-4">Sans équipe ({unassignedEmployees.length})</h3>
              <div className="space-y-2 min-h-[50px]">
                {unassignedEmployees.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">Tous les employés sont assignés</p>
                ) : (
                  unassignedEmployees.map((emp, index) => (
                    <Draggable key={emp.id} draggableId={`employee-${emp.id}`} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={cn(
                            "bg-gray-50 border border-gray-200 rounded-lg p-2 flex items-center gap-2 cursor-move transition-all",
                            snapshot.isDragging && "shadow-lg bg-white border-orange-400"
                          )}
                        >
                          <GripHorizontal className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {emp.first_name} {emp.last_name}
                            </p>
                            {emp.position && (
                              <p className="text-xs text-gray-600 truncate">{emp.position}</p>
                            )}
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))
                )}
              </div>
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Team Form Modal */}
      <TeamFormModal
        open={showForm || !!editingTeam}
        onClose={handleCloseForm}
        team={editingTeam}
        onSubmit={(data) => {
          if (editingTeam) {
            updateTeamMutation.mutate({ id: editingTeam.id, data });
          } else {
            createTeamMutation.mutate(data);
          }
        }}
      />

      {/* Confirm Delete */}
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={() => setConfirmDelete(null)}
        title="Supprimer l'équipe"
        description={`Êtes-vous sûr de vouloir supprimer l'équipe "${confirmDelete?.name}" ? Les employés ne seront pas supprimés.`}
        onConfirm={() => {
          deleteTeamMutation.mutate(confirmDelete.id);
          setConfirmDelete(null);
        }}
        variant="danger"
        confirmText="Supprimer"
      />
    </div>
  );
}

function TeamFormModal({ open, onClose, team, onSubmit }) {
  const [formData, setFormData] = React.useState({ name: '', color: '#f97316' });

  React.useEffect(() => {
    if (team) {
      setFormData({ name: team.name, color: team.color || '#f97316' });
    } else {
      setFormData({ name: '', color: '#f97316' });
    }
  }, [team]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Le nom est requis');
      return;
    }
    onSubmit(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white border-gray-300 w-[calc(100vw-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-gray-900">
            {team ? 'Modifier l\'équipe' : 'Créer une équipe'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="text-gray-900">Nom de l'équipe *</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Cuisine, Livraison..."
              className="bg-white border-gray-300 text-gray-900 mt-1"
              autoFocus
            />
          </div>

          <div>
            <Label className="text-gray-900">Couleur</Label>
            <div className="flex items-center gap-3 mt-1">
              <input
                type="color"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="w-12 h-10 rounded border-gray-300 cursor-pointer"
              />
              <span className="text-sm text-gray-600">{formData.color}</span>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg text-gray-900 hover:bg-gray-50 font-medium transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors min-h-[44px]"
            >
              {team ? 'Modifier' : 'Créer'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}