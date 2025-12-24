import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Edit, Trash2, User, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

const COLORS = [
  { value: '#ef4444', label: 'Rouge' },
  { value: '#f97316', label: 'Orange' },
  { value: '#f59e0b', label: 'Jaune' },
  { value: '#10b981', label: 'Vert' },
  { value: '#3b82f6', label: 'Bleu' },
  { value: '#8b5cf6', label: 'Violet' },
  { value: '#ec4899', label: 'Rose' },
  { value: '#6b7280', label: 'Gris' }
];

export default function TeamManager({ employees }) {
  const queryClient = useQueryClient();
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.filter({ is_active: true }, 'order')
  });

  const createTeamMutation = useMutation({
    mutationFn: (data) => base44.entities.Team.create({ ...data, order: teams.length }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      setShowTeamForm(false);
      setEditingTeam(null);
      toast.success('Équipe créée');
    }
  });

  const updateTeamMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Team.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      setShowTeamForm(false);
      setEditingTeam(null);
      toast.success('Équipe mise à jour');
    }
  });

  const deleteTeamMutation = useMutation({
    mutationFn: (id) => base44.entities.Team.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setConfirmDelete(null);
      toast.success('Équipe supprimée');
    }
  });

  const updateEmployeeMutation = useMutation({
    mutationFn: ({ employeeId, teamId }) => 
      base44.entities.Employee.update(employeeId, { team_id: teamId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    }
  });

  const handleDragEnd = (result) => {
    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (source.droppableId === destination.droppableId) return;

    const employeeId = draggableId;
    const newTeamId = destination.droppableId === 'unassigned' ? null : destination.droppableId;

    updateEmployeeMutation.mutate({ employeeId, teamId: newTeamId });
  };

  const getEmployeesForTeam = (teamId) => {
    return employees.filter(emp => emp.team_id === teamId);
  };

  const unassignedEmployees = employees.filter(emp => !emp.team_id);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Gestion des Équipes</h2>
          <p className="text-sm text-gray-600">Glissez-déposez les employés dans les équipes</p>
        </div>
        <Button
          onClick={() => setShowTeamForm(true)}
          className="bg-orange-600 hover:bg-orange-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nouvelle équipe
        </Button>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {/* Unassigned employees */}
          <Droppable droppableId="unassigned">
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={cn(
                  "bg-white rounded-xl border-2 p-4 transition-colors min-h-[200px]",
                  snapshot.isDraggingOver ? "border-orange-500 bg-orange-50" : "border-gray-300"
                )}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900">Non assignés</h3>
                  <Badge variant="outline" className="border-gray-400 text-gray-600">
                    {unassignedEmployees.length}
                  </Badge>
                </div>

                <div className="space-y-2">
                  {unassignedEmployees.map((emp, index) => (
                    <Draggable key={emp.id} draggableId={emp.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={cn(
                            "flex items-center gap-3 p-3 bg-gray-50 rounded-lg border transition-all",
                            snapshot.isDragging ? "border-orange-500 shadow-lg" : "border-gray-200"
                          )}
                        >
                          <GripVertical className="w-4 h-4 text-gray-400" />
                          {emp.photo_url ? (
                            <img src={emp.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                              <User className="w-4 h-4 text-gray-500" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {emp.first_name} {emp.last_name}
                            </p>
                            <p className="text-xs text-gray-600 truncate">{emp.position}</p>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              </div>
            )}
          </Droppable>

          {/* Teams */}
          {teams.map((team) => {
            const teamEmployees = getEmployeesForTeam(team.id);
            const manager = teamEmployees.find(emp => emp.id === team.manager_id);

            return (
              <Droppable key={team.id} droppableId={team.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      "bg-white rounded-xl border-2 p-4 transition-colors min-h-[200px]",
                      snapshot.isDraggingOver ? "border-orange-500 bg-orange-50" : "border-gray-300"
                    )}
                    style={{ borderTopColor: team.color }}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-gray-900 truncate">{team.name}</h3>
                          <Badge variant="outline" className="border-gray-400 text-gray-600">
                            {teamEmployees.length}
                          </Badge>
                        </div>
                        {team.description && (
                          <p className="text-xs text-gray-600 line-clamp-2">{team.description}</p>
                        )}
                        {manager && (
                          <p className="text-xs text-gray-500 mt-1">
                            👤 Manager: {manager.first_name} {manager.last_name}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingTeam(team);
                            setShowTeamForm(true);
                          }}
                          className="h-8 w-8 text-gray-600 hover:text-gray-900"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setConfirmDelete(team)}
                          className="h-8 w-8 text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {teamEmployees.map((emp, index) => (
                        <Draggable key={emp.id} draggableId={emp.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={cn(
                                "flex items-center gap-3 p-3 bg-gray-50 rounded-lg border transition-all",
                                snapshot.isDragging ? "border-orange-500 shadow-lg" : "border-gray-200"
                              )}
                            >
                              <GripVertical className="w-4 h-4 text-gray-400" />
                              {emp.photo_url ? (
                                <img src={emp.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                                  <User className="w-4 h-4 text-gray-500" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {emp.first_name} {emp.last_name}
                                </p>
                                <p className="text-xs text-gray-600 truncate">{emp.position}</p>
                              </div>
                              {emp.id === team.manager_id && (
                                <Badge variant="outline" className="border-orange-500 text-orange-600 text-xs">
                                  Manager
                                </Badge>
                              )}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            );
          })}
        </div>
      </DragDropContext>

      {/* Team Form Modal */}
      <TeamFormModal
        open={showTeamForm}
        onClose={() => {
          setShowTeamForm(false);
          setEditingTeam(null);
        }}
        team={editingTeam}
        employees={employees}
        onSave={(data) => {
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
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title="Supprimer l'équipe"
        description={`Êtes-vous sûr de vouloir supprimer l'équipe "${confirmDelete?.name}" ? Les employés seront déplacés vers "Non assignés".`}
        onConfirm={() => deleteTeamMutation.mutate(confirmDelete.id)}
        variant="danger"
        confirmText="Supprimer"
      />
    </div>
  );
}

function TeamFormModal({ open, onClose, team, employees, onSave }) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    color: COLORS[0].value,
    manager_id: ''
  });

  React.useEffect(() => {
    if (team) {
      setForm({
        name: team.name || '',
        description: team.description || '',
        color: team.color || COLORS[0].value,
        manager_id: team.manager_id || ''
      });
    } else {
      setForm({
        name: '',
        description: '',
        color: COLORS[0].value,
        manager_id: ''
      });
    }
  }, [team, open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  // Filter employees who could be managers (only those in this team or unassigned)
  const availableManagers = employees.filter(emp => 
    !team || emp.team_id === team.id || !emp.team_id
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white border-gray-300 max-w-md">
        <DialogHeader>
          <DialogTitle>{team ? 'Modifier' : 'Nouvelle'} équipe</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Nom de l'équipe *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Ex: Cuisine"
              className="mt-1 bg-white border-gray-300"
              required
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={form.description}
              onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Ex: Équipe de cuisine"
              className="mt-1 bg-white border-gray-300"
            />
          </div>

          <div>
            <Label>Couleur</Label>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, color: color.value }))}
                  className={cn(
                    "h-10 rounded-lg border-2 transition-all",
                    form.color === color.value ? "border-gray-900 scale-105" : "border-gray-300"
                  )}
                  style={{ backgroundColor: color.value }}
                  title={color.label}
                />
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="manager_id">Manager (optionnel)</Label>
            <select
              id="manager_id"
              value={form.manager_id}
              onChange={(e) => setForm(prev => ({ ...prev, manager_id: e.target.value }))}
              className="mt-1 w-full h-10 px-3 rounded-md border border-gray-300 bg-white text-sm"
            >
              <option value="">Aucun manager</option>
              {availableManagers.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.first_name} {emp.last_name} - {emp.position || 'Sans poste'}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="border-gray-300">
              Annuler
            </Button>
            <Button type="submit" className="bg-orange-600 hover:bg-orange-700">
              {team ? 'Mettre à jour' : 'Créer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}