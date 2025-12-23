import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ClipboardList, Plus, GripVertical, Clock, Hash, ToggleLeft, Pencil, Trash2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import TaskFormModal from '@/components/cuisine/TaskFormModal';
import CategoryManager from '@/components/cuisine/CategoryManager';
import StopwatchModal from '@/components/cuisine/StopwatchModal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { motion, AnimatePresence } from 'framer-motion';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

export default function MiseEnPlace() {
  const queryClient = useQueryClient();
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [stopwatchTask, setStopwatchTask] = useState(null);
  const [selectedTasks, setSelectedTasks] = useState(new Set());
  const [stockInputs, setStockInputs] = useState({});
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', description: '', onConfirm: null });
  const [showArchives, setShowArchives] = useState(false);
  const [archiveTab, setArchiveTab] = useState('categories');
  const today = format(new Date(), 'yyyy-MM-dd');
  const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()];

  const { data: allCategories = [], isLoading: loadingCategories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('order')
  });

  const { data: allTasks = [], isLoading: loadingTasks } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('order')
  });

  const categories = allCategories.filter(c => !c.is_archived);
  const tasks = allTasks.filter(t => !t.is_archived);
  const archivedCategories = allCategories.filter(c => c.is_archived);
  const archivedTasks = allTasks.filter(t => t.is_archived);

  const archiveTaskMutation = useMutation({
    mutationFn: (id) => base44.entities.Task.update(id, { is_archived: true, archived_at: new Date().toISOString() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] })
  });

  const restoreTaskMutation = useMutation({
    mutationFn: (id) => base44.entities.Task.update(id, { is_archived: false, archived_at: null }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] })
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Category.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] })
  });

  const archiveCategoryMutation = useMutation({
    mutationFn: (id) => base44.entities.Category.update(id, { is_archived: true, archived_at: new Date().toISOString() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] })
  });

  const restoreCategoryMutation = useMutation({
    mutationFn: (id) => base44.entities.Category.update(id, { is_archived: false, archived_at: null }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] })
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] })
  });

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    
    const { source, destination, type } = result;

    // Handle category reordering
    if (type === 'category') {
      const items = Array.from(categories);
      const [reorderedItem] = items.splice(source.index, 1);
      items.splice(destination.index, 0, reorderedItem);

      try {
        const updates = items.map((item, index) => 
          base44.entities.Category.update(item.id, { order: index })
        );
        await Promise.all(updates);
        queryClient.invalidateQueries({ queryKey: ['categories'] });
      } catch (error) {
        console.error('Error reordering:', error);
      }
      return;
    }

    // Handle task reordering
    if (type === 'task') {
      const sourceCategoryId = source.droppableId;
      const destCategoryId = destination.droppableId;

      // Get source and destination tasks
      const sourceTasks = sourceCategoryId === 'uncategorized' 
        ? uncategorizedTasks 
        : getTasksByCategory(sourceCategoryId);
      
      const destTasks = destCategoryId === 'uncategorized'
        ? uncategorizedTasks
        : getTasksByCategory(destCategoryId);

      // Same category reorder
      if (sourceCategoryId === destCategoryId) {
        const items = Array.from(sourceTasks);
        const [reorderedItem] = items.splice(source.index, 1);
        items.splice(destination.index, 0, reorderedItem);

        try {
          const updates = items.map((item, index) => 
            base44.entities.Task.update(item.id, { order: index })
          );
          await Promise.all(updates);
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
        } catch (error) {
          console.error('Error reordering tasks:', error);
        }
      } else {
        // Move between categories
        const sourceItems = Array.from(sourceTasks);
        const destItems = Array.from(destTasks);
        const [movedItem] = sourceItems.splice(source.index, 1);
        destItems.splice(destination.index, 0, movedItem);

        try {
          const updates = [
            // Update moved item's category
            base44.entities.Task.update(movedItem.id, { 
              category_id: destCategoryId === 'uncategorized' ? null : destCategoryId,
              order: destination.index 
            }),
            // Reorder source category tasks
            ...sourceItems.map((item, index) => 
              base44.entities.Task.update(item.id, { order: index })
            ),
            // Reorder destination category tasks
            ...destItems.map((item, index) => 
              base44.entities.Task.update(item.id, { order: index })
            )
          ];
          await Promise.all(updates);
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
        } catch (error) {
          console.error('Error moving task:', error);
        }
      }
    }
  };

  const handleEditTask = (task) => {
    setEditingTask(task);
    setShowTaskModal(true);
  };

  const handleCloseTaskModal = () => {
    setShowTaskModal(false);
    setEditingTask(null);
  };

  const getTasksByCategory = (categoryId) => {
    return tasks.filter(t => t.category_id === categoryId).sort((a, b) => (a.order || 0) - (b.order || 0));
  };

  const uncategorizedTasks = tasks.filter(t => !t.category_id);

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: activeSessions = [] } = useQuery({
    queryKey: ['workSessions', 'active'],
    queryFn: () => base44.entities.WorkSession.filter({ date: today, status: 'active' })
  });

  const hasActiveSession = activeSessions.length > 0;
  const activeSession = activeSessions[0];

  const createSessionMutation = useMutation({
    mutationFn: (data) => base44.entities.WorkSession.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workSessions'] });
      setSelectedTasks(new Set());
    }
  });

  const updateSessionMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.WorkSession.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workSessions'] });
      setSelectedTasks(new Set());
    }
  });

  const toggleTaskSelection = (taskId) => {
    const newSelected = new Set(selectedTasks);
    if (newSelected.has(taskId)) {
      newSelected.delete(taskId);
    } else {
      newSelected.add(taskId);
    }
    setSelectedTasks(newSelected);
  };

  const handleStockInput = (taskId, value) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const currentStock = parseFloat(value) || 0;
    const targetQuantity = task.weekly_targets?.[dayOfWeek] || 0;
    
    setStockInputs(prev => ({
      ...prev,
      [taskId]: currentStock
    }));

    // Auto uncheck if current stock >= target
    if (currentStock >= targetQuantity && selectedTasks.has(taskId)) {
      const newSelected = new Set(selectedTasks);
      newSelected.delete(taskId);
      setSelectedTasks(newSelected);
    }
  };

  // Check if auto-schedule task should be triggered
  const shouldAutoSchedule = (task) => {
    if (!task.auto_schedule?.enabled) return false;
    
    const now = new Date();
    const currentDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    // Check if trigger day matches
    if (task.auto_schedule.trigger_day !== currentDay) return false;
    if (!task.auto_schedule.trigger_time_start || !task.auto_schedule.trigger_time_end) return false;
    
    // Check if current time is within the time range
    return currentTime >= task.auto_schedule.trigger_time_start && currentTime <= task.auto_schedule.trigger_time_end;
  };

  // Auto-select tasks on mount
  React.useEffect(() => {
    const newSelected = new Set();
    const newStockInputs = {};
    
    tasks.forEach(task => {
      // Auto-schedule tasks
      if (shouldAutoSchedule(task)) {
        newSelected.add(task.id);
        if (task.auto_schedule.quantity) {
          newStockInputs[task.id] = task.auto_schedule.quantity;
        }
      }
      
      // Stock check tasks
      if (task.requires_stock_check && (task.weekly_targets?.[dayOfWeek] || 0) > 0) {
        const currentStock = stockInputs[task.id] || 0;
        const targetQuantity = task.weekly_targets[dayOfWeek] || 0;
        if (currentStock < targetQuantity) {
          newSelected.add(task.id);
        }
      }
    });
    
    setSelectedTasks(newSelected);
    if (Object.keys(newStockInputs).length > 0) {
      setStockInputs(prev => ({ ...prev, ...newStockInputs }));
    }
  }, [tasks]);

  const handleCreateNewSession = async () => {
    const selectedTasksArray = Array.from(selectedTasks).map(taskId => {
      const task = tasks.find(t => t.id === taskId);
      const category = categories.find(c => c.id === task?.category_id);
      
      const baseTask = {
        task_id: taskId,
        task_name: task?.name,
        category_id: task?.category_id,
        category_name: category?.name,
        is_completed: false,
        added_at: new Date().toISOString()
      };

      // Add stock info if task requires it
      if (task?.requires_stock_check) {
        const currentStock = stockInputs[taskId] || 0;
        const targetQuantity = task.weekly_targets?.[dayOfWeek] || 0;
        const quantityToProduce = Math.max(0, targetQuantity - currentStock);

        baseTask.current_stock = currentStock;
        baseTask.target_quantity = targetQuantity;
        baseTask.quantity_to_produce = quantityToProduce;
      }
      // Add auto-schedule quantity
      else if (task?.auto_schedule?.enabled && task?.auto_schedule?.quantity) {
        baseTask.quantity_to_produce = task.auto_schedule.quantity;
      }

      return baseTask;
    });

    createSessionMutation.mutate({
      date: today,
      status: 'active',
      tasks: selectedTasksArray,
      started_by: currentUser?.email,
      started_by_name: currentUser?.full_name || currentUser?.email,
      started_at: new Date().toISOString()
    });
    
    // Reset stock inputs
    setStockInputs({});
  };

  const handleAddToSession = async () => {
    if (!activeSession) return;
    
    // Check for duplicate tasks
    const existingTaskIds = new Set(activeSession.tasks?.map(t => t.task_id) || []);
    const duplicateTasks = Array.from(selectedTasks).filter(taskId => existingTaskIds.has(taskId));
    
    if (duplicateTasks.length > 0) {
      const duplicateNames = duplicateTasks
        .map(taskId => tasks.find(t => t.id === taskId)?.name)
        .filter(Boolean)
        .join(', ');
      
      const confirmMessage = duplicateTasks.length === 1
        ? `La tâche "${duplicateNames}" est déjà présente dans la liste. Voulez-vous l'ajouter de nouveau ?`
        : `Les tâches suivantes sont déjà présentes dans la liste : ${duplicateNames}. Voulez-vous les ajouter de nouveau ?`;
      
      setConfirmDialog({
        open: true,
        title: 'Tâche(s) déjà présente(s)',
        description: confirmMessage,
        onConfirm: () => proceedWithAddToSession()
      });
      return;
    }
    
    proceedWithAddToSession();
  };

  const proceedWithAddToSession = () => {
    const selectedTasksArray = Array.from(selectedTasks).map(taskId => {
      const task = tasks.find(t => t.id === taskId);
      const category = categories.find(c => c.id === task?.category_id);
      
      const baseTask = {
        task_id: taskId,
        task_name: task?.name,
        category_id: task?.category_id,
        category_name: category?.name,
        is_completed: false,
        added_at: new Date().toISOString()
      };

      // Add stock info if task requires it
      if (task?.requires_stock_check) {
        const currentStock = stockInputs[taskId] || 0;
        const targetQuantity = task.weekly_targets?.[dayOfWeek] || 0;
        const quantityToProduce = Math.max(0, targetQuantity - currentStock);

        baseTask.current_stock = currentStock;
        baseTask.target_quantity = targetQuantity;
        baseTask.quantity_to_produce = quantityToProduce;
      }
      // Add auto-schedule quantity
      else if (task?.auto_schedule?.enabled && task?.auto_schedule?.quantity) {
        baseTask.quantity_to_produce = task.auto_schedule.quantity;
      }

      return baseTask;
    });

    const updatedTasks = [...(activeSession.tasks || []), ...selectedTasksArray];
    
    updateSessionMutation.mutate({
      id: activeSession.id,
      data: { tasks: updatedTasks }
    });
    
    // Reset stock inputs
    setStockInputs({});
  };

  if (loadingCategories || loadingTasks) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <PageHeader
        icon={ClipboardList}
        title="Mise en Place"
        subtitle="Catalogue des tâches de production"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => setShowCategoryManager(true)}
              className="border-slate-600 hover:bg-slate-700 text-slate-900 hover:text-slate-100"
            >
              Catégories
            </Button>
            <Button
              onClick={() => setShowTaskModal(true)}
              className="bg-orange-600 hover:bg-orange-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nouvelle tâche
            </Button>
          </>
        }
      />

      {/* Selection Actions */}
      <AnimatePresence>
        {selectedTasks.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-0 left-0 right-0 z-40 lg:bottom-6 lg:px-6 pointer-events-none"
          >
            <div className="max-w-7xl mx-auto pointer-events-auto">
              <div className="bg-orange-600/95 backdrop-blur-lg border-t-2 lg:border-2 border-orange-500/50 lg:rounded-2xl shadow-2xl p-3 lg:p-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <span className="font-semibold text-white text-sm lg:text-base">
                    {selectedTasks.size} tâche{selectedTasks.size > 1 ? 's' : ''} sélectionnée{selectedTasks.size > 1 ? 's' : ''}
                  </span>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <Button
                      variant="outline"
                      onClick={() => setSelectedTasks(new Set())}
                      className="flex-1 sm:flex-none border-white/30 bg-white/10 text-white hover:bg-white/20 hover:border-white/50 text-sm"
                    >
                      Annuler
                    </Button>
                    {hasActiveSession ? (
                      <Button
                        onClick={handleAddToSession}
                        disabled={updateSessionMutation.isPending}
                        className="flex-1 sm:flex-none bg-white text-orange-600 hover:bg-orange-50 font-semibold text-sm whitespace-nowrap"
                      >
                        <Plus className="w-4 h-4 mr-1 lg:mr-2" />
                        <span className="hidden sm:inline">Ajouter à la liste</span>
                        <span className="sm:hidden">Ajouter</span>
                      </Button>
                    ) : (
                      <Button
                        onClick={handleCreateNewSession}
                        disabled={createSessionMutation.isPending}
                        className="flex-1 sm:flex-none bg-white text-orange-600 hover:bg-orange-50 font-semibold text-sm whitespace-nowrap"
                      >
                        <Plus className="w-4 h-4 mr-1 lg:mr-2" />
                        <span className="hidden sm:inline">Créer nouvelle liste</span>
                        <span className="sm:hidden">Créer</span>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {categories.length === 0 && tasks.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Aucune tâche"
          description="Commencez par créer des catégories puis ajoutez vos premières tâches de mise en place."
          action={
            <Button
              onClick={() => setShowCategoryManager(true)}
              className="bg-orange-600 hover:bg-orange-700"
            >
              Créer une catégorie
            </Button>
          }
        />
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="categories" direction="horizontal" type="category">
            {(provided) => (
              <div 
                {...provided.droppableProps}
                ref={provided.innerRef}
                className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6"
              >
                {/* Uncategorized tasks */}
                {uncategorizedTasks.length > 0 && (
                  <CategoryColumn
                    categoryId="uncategorized"
                    title="Sans catégorie"
                    color="#64748b"
                    tasks={uncategorizedTasks}
                    onEditTask={handleEditTask}
                    onDeleteTask={(id) => archiveTaskMutation.mutate(id)}
                    onStartStopwatch={setStopwatchTask}
                    isDraggable={false}
                    selectedTasks={selectedTasks}
                    onToggleSelection={toggleTaskSelection}
                    stockInputs={stockInputs}
                    onStockInput={handleStockInput}
                    dayOfWeek={dayOfWeek}
                  />
                )}

                {/* Category columns */}
                {categories.map((category, index) => (
                  <Draggable key={category.id} draggableId={category.id} index={index} type="category">
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                      >
                        <CategoryColumn
                          categoryId={category.id}
                          title={category.name}
                          color={category.color || '#10b981'}
                          tasks={getTasksByCategory(category.id)}
                          onEditTask={handleEditTask}
                          onDeleteTask={(id) => archiveTaskMutation.mutate(id)}
                          onStartStopwatch={setStopwatchTask}
                          category={category}
                          onEditCategory={(cat) => updateCategoryMutation.mutate(cat)}
                          onDeleteCategory={(id) => archiveCategoryMutation.mutate(id)}
                          dragHandleProps={provided.dragHandleProps}
                          isDragging={snapshot.isDragging}
                          isDraggable={true}
                          selectedTasks={selectedTasks}
                          onToggleSelection={toggleTaskSelection}
                          stockInputs={stockInputs}
                          onStockInput={handleStockInput}
                          dayOfWeek={dayOfWeek}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}

      {/* Task Form Modal */}
      <TaskFormModal
        open={showTaskModal}
        onClose={handleCloseTaskModal}
        task={editingTask}
        categories={categories}
      />

      {/* Category Manager Modal */}
      <Dialog open={showCategoryManager} onOpenChange={setShowCategoryManager}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-lg">
          <DialogHeader>
            <DialogTitle>Gérer les catégories</DialogTitle>
          </DialogHeader>
          <CategoryManager onClose={() => setShowCategoryManager(false)} />
        </DialogContent>
      </Dialog>

      {/* Stopwatch Modal */}
      {stopwatchTask && (
        <StopwatchModal
          task={stopwatchTask}
          onClose={() => setStopwatchTask(null)}
        />
      )}

      {/* Archives Section */}
      <div className="mt-12 border-t border-slate-700 pt-8">
        <Button
          variant="outline"
          onClick={() => setShowArchives(!showArchives)}
          className="mb-6 border-slate-600 hover:bg-slate-700 text-slate-900 hover:text-slate-100"
        >
          {showArchives ? 'Masquer les archives' : 'Afficher les archives'}
        </Button>

        <AnimatePresence>
          {showArchives && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <div className="mb-4 flex gap-2">
                <Button
                  variant={archiveTab === 'categories' ? 'default' : 'outline'}
                  onClick={() => setArchiveTab('categories')}
                  className={archiveTab === 'categories' ? 'bg-orange-600 hover:bg-orange-700' : 'border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700'}
                >
                  Catégories archivées ({archivedCategories.length})
                </Button>
                <Button
                  variant={archiveTab === 'tasks' ? 'default' : 'outline'}
                  onClick={() => setArchiveTab('tasks')}
                  className={archiveTab === 'tasks' ? 'bg-orange-600 hover:bg-orange-700' : 'border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700'}
                >
                  Tâches archivées ({archivedTasks.length})
                </Button>
              </div>

              {archiveTab === 'categories' && (
                <div className="space-y-3">
                  {archivedCategories.length === 0 ? (
                    <p className="text-center text-slate-500 py-8">Aucune catégorie archivée</p>
                  ) : (
                    archivedCategories.map(category => (
                      <div key={category.id} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-1 h-12 rounded-full" style={{ backgroundColor: category.color || '#64748b' }} />
                          <div>
                            <h4 className="font-medium">{category.name}</h4>
                            <p className="text-xs text-slate-400">
                              Archivée le {format(new Date(category.archived_at), 'dd/MM/yyyy')}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => restoreCategoryMutation.mutate(category.id)}
                          className="border-green-600 text-green-400 hover:bg-green-600/20"
                        >
                          Restaurer
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {archiveTab === 'tasks' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {archivedTasks.length === 0 ? (
                    <p className="col-span-full text-center text-slate-500 py-8">Aucune tâche archivée</p>
                  ) : (
                    archivedTasks.map(task => (
                      <div key={task.id} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                        <div className="flex items-start gap-3 mb-3">
                          {task.image_url && (
                            <img src={task.image_url} alt={task.name} className="w-12 h-12 rounded-lg object-cover" />
                          )}
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium break-words">{task.name}</h4>
                            <p className="text-xs text-slate-400">
                              Archivée le {format(new Date(task.archived_at), 'dd/MM/yyyy')}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => restoreTaskMutation.mutate(task.id)}
                          className="w-full border-green-600 text-green-400 hover:bg-green-600/20"
                        >
                          Restaurer
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.onConfirm}
        variant="warning"
      />
    </div>
  );
}

function CategoryColumn({ categoryId, title, color, tasks, onEditTask, onDeleteTask, onStartStopwatch, category, onEditCategory, onDeleteCategory, dragHandleProps, isDragging, isDraggable, selectedTasks, onToggleSelection, stockInputs, onStockInput, dayOfWeek }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(title);
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState(false);

  const handleSaveEdit = () => {
    if (editName.trim() && category) {
      onEditCategory({ id: category.id, data: { name: editName.trim() } });
      setIsEditing(false);
    }
  };

  const handleDelete = () => {
    if (category) {
      setConfirmDeleteCategory(true);
    }
  };

  return (
    <div className={cn(
      "bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden transition-all",
      isDragging && "ring-2 ring-orange-500/50 shadow-xl scale-105"
    )}>
      <div 
        className="px-4 py-3 border-b border-slate-700/50 flex items-center gap-2"
        style={{ borderLeftWidth: 4, borderLeftColor: color }}
      >
        {isDraggable && (
          <div 
            {...dragHandleProps}
            className="cursor-grab active:cursor-grabbing touch-none p-1 hover:bg-slate-700/50 rounded transition-colors"
          >
            <GripVertical className="w-4 h-4 text-orange-500" />
          </div>
        )}
        
        {isEditing ? (
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveEdit();
              if (e.key === 'Escape') {
                setEditName(title);
                setIsEditing(false);
              }
            }}
            onBlur={handleSaveEdit}
            className="flex-1 h-8 bg-slate-700 border-slate-600 text-sm"
            autoFocus
          />
        ) : (
          <div className="flex-1">
            <h3 className="font-semibold">{title}</h3>
            <p className="text-xs text-slate-400">{tasks.length} tâche{tasks.length > 1 ? 's' : ''}</p>
          </div>
        )}
        
        {isDraggable && !isEditing && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsEditing(true)}
              className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-orange-400 transition-colors"
              title="Modifier"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={handleDelete}
              className="p-2 rounded-lg hover:bg-red-600/20 text-slate-400 hover:text-red-400 transition-colors"
              title="Supprimer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
      
      <Droppable droppableId={categoryId} type="task">
        {(provided, snapshot) => (
          <div 
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              "p-3 space-y-2 min-h-[100px] transition-colors",
              snapshot.isDraggingOver && "bg-orange-600/10"
            )}
          >
            {tasks.map((task, index) => (
              <Draggable key={task.id} draggableId={task.id} index={index} type="task">
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                  >
                    <TaskCard
                      task={task}
                      onEdit={() => onEditTask(task)}
                      onDelete={() => onDeleteTask(task.id)}
                      onStartStopwatch={() => onStartStopwatch(task)}
                      isSelected={selectedTasks?.has(task.id)}
                      onToggleSelection={() => onToggleSelection?.(task.id)}
                      dragHandleProps={provided.dragHandleProps}
                      isDragging={snapshot.isDragging}
                      stockValue={stockInputs?.[task.id]}
                      onStockChange={(value) => onStockInput?.(task.id, value)}
                      dayOfWeek={dayOfWeek}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
            
            {tasks.length === 0 && (
              <p className="text-center text-slate-500 text-sm py-8">
                Aucune tâche
              </p>
            )}
          </div>
        )}
      </Droppable>

      <ConfirmDialog
        open={confirmDeleteCategory}
        onOpenChange={setConfirmDeleteCategory}
        title="Archiver la catégorie"
        description={`Êtes-vous sûr de vouloir archiver la catégorie "${title}" ? Vous pourrez la restaurer depuis les archives.`}
        onConfirm={() => onDeleteCategory(category.id)}
        variant="warning"
        confirmText="Archiver"
      />
    </div>
  );
}

function TaskCard({ task, onEdit, onDelete, onStartStopwatch, isSelected, onToggleSelection, dragHandleProps, isDragging, stockValue, onStockChange, dayOfWeek }) {
  const formatDuration = () => {
    const mins = task.duration_minutes || 0;
    const secs = task.duration_seconds || 0;
    if (mins === 0 && secs === 0) return null;
    if (mins === 0) return `${secs}s`;
    if (secs === 0) return `${mins}min`;
    return `${mins}min ${secs}s`;
  };

  const requiresStock = task.requires_stock_check && dayOfWeek && (task.weekly_targets?.[dayOfWeek] || 0) > 0;
  const targetQuantity = task.weekly_targets?.[dayOfWeek] || 0;
  const currentStock = stockValue || 0;
  const quantityToProduce = Math.max(0, targetQuantity - currentStock);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      onClick={requiresStock ? undefined : onToggleSelection}
      className={cn(
        "group bg-slate-700/50 rounded-xl p-3 border transition-all",
        !requiresStock && "cursor-pointer",
        isSelected 
          ? "bg-orange-600/30 border-orange-600/70 ring-2 ring-orange-600/50" 
          : "border-slate-600/50 hover:bg-slate-700 hover:border-slate-500/50",
        isDragging && "shadow-2xl ring-2 ring-orange-500/50 scale-105 rotate-2"
      )}
    >
      <div className="flex items-start gap-3">
        <div 
          {...dragHandleProps}
          className="text-slate-500 cursor-grab active:cursor-grabbing touch-none"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4" />
        </div>
        
        {task.image_url && (
          <img 
            src={task.image_url} 
            alt={task.name}
            className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
          />
        )}
        
        <div className="flex-1 min-w-0">
          <h4 className="font-medium break-words">{task.name}</h4>
          <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
            {formatDuration() && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDuration()}
              </span>
            )}
            <span className={cn(
              "px-2 py-0.5 rounded-full text-[10px] font-medium uppercase",
              task.tracking_mode === 'binary' 
                ? "bg-amber-600/20 text-amber-400"
                : "bg-indigo-600/20 text-indigo-400"
            )}>
              {task.tracking_mode === 'binary' ? (
                <span className="flex items-center gap-1">
                  <ToggleLeft className="w-3 h-3" />
                  Binaire
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Hash className="w-3 h-3" />
                  Quantité
                </span>
              )}
            </span>
          </div>
          
          {requiresStock && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400 flex-shrink-0">Stock restant :</label>
                <Input
                  type="number"
                  min="0"
                  value={currentStock}
                  onChange={(e) => onStockChange?.(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="h-7 w-20 bg-slate-800 border-slate-600 text-xs"
                  placeholder="0"
                />
                <span className="text-xs text-slate-400">/ {targetQuantity}</span>
              </div>
              {quantityToProduce > 0 && (
                <p className="text-xs text-orange-400">
                  À produire : {quantityToProduce} {task.unit || 'unités'}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStartStopwatch();
            }}
            className="p-2 rounded-lg hover:bg-orange-600/20 text-slate-300 hover:text-orange-400 transition-colors"
            title="Chronométrer"
          >
            <Play className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="p-2 rounded-lg hover:bg-slate-600 text-slate-400 hover:text-white transition-colors"
            title="Modifier"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-2 rounded-lg hover:bg-red-600/20 text-slate-400 hover:text-red-400 transition-colors"
            title="Supprimer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}