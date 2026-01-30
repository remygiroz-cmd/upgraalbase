import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ClipboardList, Plus, GripVertical, Clock, Hash, ToggleLeft, Pencil, Trash2, Play, Bell, Search } from 'lucide-react';
import SuccessOverlay from '@/components/cuisine/SuccessOverlay';
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
import AdHocTaskModal from '@/components/cuisine/AdHocTaskModal';
import DailyNoteModal from '@/components/cuisine/DailyNoteModal';
import { motion, AnimatePresence } from 'framer-motion';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { getServiceDate } from '@/components/utils/serviceDate';

export default function MiseEnPlace() {
  const queryClient = useQueryClient();
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [stopwatchTask, setStopwatchTask] = useState(null);
  const [selectedTasks, setSelectedTasks] = useState(new Set());
  const [stockInputs, setStockInputs] = useState({});
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', description: '', onConfirm: null });
  const [showAdHocModal, setShowAdHocModal] = useState(false);
  const [adHocTasks, setAdHocTasks] = useState([]);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const today = getServiceDate(); // Utilise le jour de service au lieu de la date système
  const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()];

  const { data: categories = [], isLoading: loadingCategories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('order')
  });

  const { data: tasks = [], isLoading: loadingTasks } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('order')
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id) => base44.entities.Task.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] })
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Category.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] })
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id) => base44.entities.Category.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] })
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] })
  });

  const handleDragEnd = async (result) => {
    const { source, destination, type } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    // Handle category reordering
    if (type === 'category') {
      const visibleCategories = categories.filter(category => getTasksByCategory(category.id).length > 0);
      const items = Array.from(visibleCategories);
      const [reorderedItem] = items.splice(source.index, 1);
      items.splice(destination.index, 0, reorderedItem);

      const updates = [];
      items.forEach((item, index) => {
        if (item.order !== index) {
          updates.push({ id: item.id, order: index });
        }
      });

      if (updates.length > 0) {
        await Promise.all(
          updates.map(update => 
            base44.entities.Category.update(update.id, { order: update.order })
          )
        );
        queryClient.invalidateQueries({ queryKey: ['categories'] });
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

        const updates = [];
        items.forEach((item, index) => {
          if (item.order !== index) {
            updates.push({ id: item.id, order: index });
          }
        });

        if (updates.length > 0) {
          await Promise.all(
            updates.map(update => 
              base44.entities.Task.update(update.id, { order: update.order })
            )
          );
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
        }
      } else {
        // Move between categories
        const sourceItems = Array.from(sourceTasks);
        const destItems = Array.from(destTasks);
        const [movedItem] = sourceItems.splice(source.index, 1);
        destItems.splice(destination.index, 0, movedItem);

        const updates = [];
        
        // Update moved item's category
        updates.push({
          id: movedItem.id,
          data: {
            category_id: destCategoryId === 'uncategorized' ? null : destCategoryId,
            order: destination.index
          }
        });

        // Reorder source category tasks
        sourceItems.forEach((item, index) => {
          if (item.order !== index) {
            updates.push({ id: item.id, data: { order: index } });
          }
        });

        // Reorder destination category tasks
        destItems.forEach((item, index) => {
          if (item.order !== index) {
            updates.push({ id: item.id, data: { order: index } });
          }
        });

        if (updates.length > 0) {
          await Promise.all(
            updates.map(update => 
              base44.entities.Task.update(update.id, update.data)
            )
          );
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
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
    return tasks
      .filter(t => t.category_id === categoryId)
      .filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  };

  const uncategorizedTasks = tasks
    .filter(t => !t.category_id)
    .filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()));

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
      setShowSuccessOverlay(true);
    }
  });

  const updateSessionMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.WorkSession.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workSessions'] });
      setSelectedTasks(new Set());
      setShowSuccessOverlay(true);
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
    if (!task.auto_schedule?.enabled || !task.auto_schedule?.schedules?.length) return false;
    
    const now = new Date();
    const currentDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    // Check if any schedule matches current day and time
    return task.auto_schedule.schedules.some(schedule => {
      if (schedule.trigger_day !== currentDay) return false;
      if (!schedule.trigger_time_start || !schedule.trigger_time_end) return false;
      return currentTime >= schedule.trigger_time_start && currentTime <= schedule.trigger_time_end;
    });
  };

  const getAutoScheduleQuantity = (task) => {
    if (!task.auto_schedule?.enabled || !task.auto_schedule?.schedules?.length) return null;
    
    const now = new Date();
    const currentDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    const matchingSchedule = task.auto_schedule.schedules.find(schedule => {
      if (schedule.trigger_day !== currentDay) return false;
      if (!schedule.trigger_time_start || !schedule.trigger_time_end) return false;
      return currentTime >= schedule.trigger_time_start && currentTime <= schedule.trigger_time_end;
    });

    return matchingSchedule?.quantity || null;
  };

  // Auto-select tasks on mount
  React.useEffect(() => {
    const newSelected = new Set();
    const newStockInputs = {};
    
    tasks.forEach(task => {
      // Auto-schedule tasks - skip if session already exists
      if (shouldAutoSchedule(task)) {
        if (!hasActiveSession) {
          newSelected.add(task.id);
          const quantity = getAutoScheduleQuantity(task);
          if (quantity) {
            newStockInputs[task.id] = quantity;
          }
        }
      }
      
      // Stock check tasks
      if (task.requires_stock_check && (task.weekly_targets?.[dayOfWeek] || 0) > 0) {
        const targetQuantity = task.weekly_targets[dayOfWeek] || 0;
        // Si une session existe déjà, pré-remplir avec la quantité cible (stock complet)
        const currentStock = hasActiveSession ? targetQuantity : (stockInputs[task.id] || 0);
        
        if (!hasActiveSession) {
          newStockInputs[task.id] = currentStock;
        } else {
          newStockInputs[task.id] = targetQuantity;
        }
        
        if (currentStock < targetQuantity) {
          newSelected.add(task.id);
        }
      }
    });
    
    setSelectedTasks(newSelected);
    if (Object.keys(newStockInputs).length > 0) {
      setStockInputs(prev => ({ ...prev, ...newStockInputs }));
    }
  }, [tasks, hasActiveSession]);

  const handleCreateNewSession = async () => {
    // Clôturer toutes les sessions actives existantes
    const allActiveSessions = await base44.entities.WorkSession.filter({ status: 'active' });
    if (allActiveSessions.length > 0) {
      await Promise.all(
        allActiveSessions.map(session =>
          base44.entities.WorkSession.update(session.id, {
            status: 'completed',
            completed_by: currentUser?.email,
            completed_by_name: currentUser?.full_name || currentUser?.email,
            completed_at: new Date().toISOString()
          })
        )
      );
      queryClient.invalidateQueries({ queryKey: ['workSessions'] });
    }

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
        baseTask.initial_quantity_to_produce = quantityToProduce;
      }
      // Add auto-schedule quantity
      else if (task?.auto_schedule?.enabled) {
        const quantity = getAutoScheduleQuantity(task);
        if (quantity) {
          baseTask.quantity_to_produce = quantity;
          baseTask.initial_quantity_to_produce = quantity;
        }
      }
      // For binary tasks, add quantity from weekly targets
      else if (task?.tracking_mode === 'binary' && task?.weekly_targets?.[dayOfWeek]) {
        baseTask.quantity_to_produce = task.weekly_targets[dayOfWeek];
        baseTask.initial_quantity_to_produce = task.weekly_targets[dayOfWeek];
      }

      return baseTask;
    });

    // Add ad-hoc tasks
    const adHocTasksArray = adHocTasks.map(adHoc => ({
      task_id: null,
      task_name: adHoc.name,
      category_id: null,
      category_name: null,
      is_completed: false,
      added_at: new Date().toISOString(),
      ad_hoc_comment: adHoc.comment
    }));

    createSessionMutation.mutate({
      date: today,
      status: 'active',
      tasks: [...selectedTasksArray, ...adHocTasksArray],
      started_by: currentUser?.email,
      started_by_name: currentUser?.full_name || currentUser?.email,
      started_at: new Date().toISOString()
    });
    
    // Reset
    setStockInputs({});
    setAdHocTasks([]);
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
        baseTask.initial_quantity_to_produce = quantityToProduce;
      }
      // Add auto-schedule quantity
      else if (task?.auto_schedule?.enabled) {
        const quantity = getAutoScheduleQuantity(task);
        if (quantity) {
          baseTask.quantity_to_produce = quantity;
          baseTask.initial_quantity_to_produce = quantity;
        }
      }
      // For binary tasks, add quantity from weekly targets
      else if (task?.tracking_mode === 'binary' && task?.weekly_targets?.[dayOfWeek]) {
        baseTask.quantity_to_produce = task.weekly_targets[dayOfWeek];
        baseTask.initial_quantity_to_produce = task.weekly_targets[dayOfWeek];
      }

      return baseTask;
    });

    // Add ad-hoc tasks
    const adHocTasksArray = adHocTasks.map(adHoc => ({
      task_id: null,
      task_name: adHoc.name,
      category_id: null,
      category_name: null,
      is_completed: false,
      added_at: new Date().toISOString(),
      ad_hoc_comment: adHoc.comment
    }));

    const updatedTasks = [...(activeSession.tasks || []), ...selectedTasksArray, ...adHocTasksArray];
    
    updateSessionMutation.mutate({
      id: activeSession.id,
      data: { tasks: updatedTasks }
    });
    
    // Reset
    setStockInputs({});
    setAdHocTasks([]);
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
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setShowNoteModal(true)}
              className="border-orange-600 text-orange-600 hover:bg-orange-600/20 min-h-[44px]"
            >
              <Bell className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Note d'équipe</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowCategoryManager(true)}
              className="border-slate-600 hover:bg-slate-700 text-slate-900 hover:text-slate-100 min-h-[44px]"
            >
              <span className="hidden sm:inline">Catégories</span>
              <span className="sm:hidden">Cat.</span>
            </Button>
            <Button
              onClick={() => setShowTaskModal(true)}
              className="bg-orange-600 hover:bg-orange-700 min-h-[44px]"
            >
              <Plus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Nouvelle tâche</span>
              <span className="sm:hidden">Tâche</span>
            </Button>
          </div>
        }
      />

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Rechercher une tâche..."
          className="pl-10 bg-white border-gray-300 text-gray-900 min-h-[44px]"
        />
      </div>

      {/* Selection Actions */}
      <AnimatePresence>
        {(selectedTasks.size > 0 || adHocTasks.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-0 left-0 right-0 z-40 lg:bottom-6 lg:px-6 pointer-events-none"
          >
            <div className="max-w-7xl mx-auto pointer-events-auto">
              <div className="bg-orange-600/95 backdrop-blur-lg border-t-2 lg:border-2 border-orange-500/50 lg:rounded-2xl shadow-2xl p-3 lg:p-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-white text-sm lg:text-base">
                      {selectedTasks.size + adHocTasks.length} tâche{(selectedTasks.size + adHocTasks.length) > 1 ? 's' : ''} sélectionnée{(selectedTasks.size + adHocTasks.length) > 1 ? 's' : ''}
                    </span>
                    {adHocTasks.length > 0 && (
                      <span className="text-xs text-orange-200">
                        dont {adHocTasks.length} ponctuelle{adHocTasks.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelectedTasks(new Set());
                        setAdHocTasks([]);
                      }}
                      className="flex-1 sm:flex-none border-white/30 bg-white/10 text-white hover:bg-white/20 hover:border-white/50 text-sm"
                    >
                      Annuler
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowAdHocModal(true)}
                      className="flex-1 sm:flex-none border-white/30 bg-white/10 text-white hover:bg-white/20 hover:border-white/50 text-sm"
                    >
                      <Plus className="w-4 h-4 mr-1 lg:mr-2" />
                      <span className="hidden sm:inline">Tâche ponctuelle</span>
                      <span className="sm:hidden">Ponctuelle</span>
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
          <Droppable droppableId="categories" type="category">
            {(provided, snapshot) => (
              <div 
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 pb-32"
              >
                {/* Uncategorized tasks */}
                {uncategorizedTasks.length > 0 && (
                  <CategoryColumn
                    categoryId="uncategorized"
                    title="Sans catégorie"
                    color="#64748b"
                    tasks={uncategorizedTasks}
                    onEditTask={handleEditTask}
                    onDeleteTask={(id) => deleteTaskMutation.mutate(id)}
                    onStartStopwatch={setStopwatchTask}
                    isDraggable={false}
                    selectedTasks={selectedTasks}
                    onToggleSelection={toggleTaskSelection}
                    stockInputs={stockInputs}
                    onStockInput={handleStockInput}
                    dayOfWeek={dayOfWeek}
                    currentUser={currentUser}
                  />
                )}

                {/* Category columns */}
                {categories.filter(category => getTasksByCategory(category.id).length > 0).map((category, index) => (
                  <Draggable key={category.id} draggableId={category.id} index={index}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={cn(
                          "transition-transform duration-200",
                          snapshot.isDragging && "z-50"
                        )}
                      >
                        <CategoryColumn
                          categoryId={category.id}
                          title={category.name}
                          color={category.color || '#10b981'}
                          tasks={getTasksByCategory(category.id)}
                          onEditTask={handleEditTask}
                          onDeleteTask={(id) => deleteTaskMutation.mutate(id)}
                          onStartStopwatch={setStopwatchTask}
                          category={category}
                          onEditCategory={(cat) => updateCategoryMutation.mutate(cat)}
                          onDeleteCategory={(id) => deleteCategoryMutation.mutate(id)}
                          dragHandleProps={provided.dragHandleProps}
                          isDragging={snapshot.isDragging}
                          isDraggable={true}
                          selectedTasks={selectedTasks}
                          onToggleSelection={toggleTaskSelection}
                          stockInputs={stockInputs}
                          onStockInput={handleStockInput}
                          dayOfWeek={dayOfWeek}
                          currentUser={currentUser}
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

      {/* Ad Hoc Task Modal */}
      <AdHocTaskModal
        open={showAdHocModal}
        onClose={() => setShowAdHocModal(false)}
        onAdd={(task) => setAdHocTasks(prev => [...prev, task])}
      />

      {/* Daily Note Modal */}
      <DailyNoteModal
        open={showNoteModal}
        onClose={() => setShowNoteModal(false)}
      />

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.onConfirm}
        variant="warning"
      />

      {/* Success Overlay */}
      <SuccessOverlay
        show={showSuccessOverlay}
        onComplete={() => setShowSuccessOverlay(false)}
      />
    </div>
  );
}

function CategoryColumn({ categoryId, title, color, tasks, onEditTask, onDeleteTask, onStartStopwatch, category, onEditCategory, onDeleteCategory, dragHandleProps, isDragging, isDraggable, selectedTasks, onToggleSelection, stockInputs, onStockInput, dayOfWeek, currentUser }) {
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
      "bg-white rounded-xl sm:rounded-2xl border-2 overflow-hidden transition-all duration-200",
      isDragging ? "ring-4 ring-orange-400 shadow-2xl border-orange-500" : "border-gray-200 shadow-sm"
    )}>
      <div 
        className={cn(
          "px-3 sm:px-4 py-2.5 sm:py-3 border-b-2 flex items-center gap-2 transition-colors",
          isDragging ? "bg-orange-50 border-orange-300" : "border-gray-200"
        )}
        style={{ borderLeftWidth: 4, borderLeftColor: color }}
      >
        {isDraggable && (
          <div 
            {...dragHandleProps}
            className="cursor-grab active:cursor-grabbing touch-none p-2 -m-1 hover:bg-orange-100 rounded-lg transition-all active:scale-110"
          >
            <GripVertical className={cn("w-5 h-5 transition-colors", isDragging ? "text-orange-600" : "text-orange-500")} />
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
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 text-sm sm:text-base truncate">{title}</h3>
            <p className="text-xs text-gray-600">{tasks.length} tâche{tasks.length > 1 ? 's' : ''}</p>
          </div>
        )}
        
        {isDraggable && !isEditing && (
          <div className="flex items-center gap-0.5 sm:gap-1">
            <button
              onClick={() => setIsEditing(true)}
              className="p-1.5 sm:p-2 rounded-lg hover:bg-orange-50 text-gray-600 hover:text-orange-600 transition-colors active:scale-95"
              title="Modifier"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={handleDelete}
              className="p-1.5 sm:p-2 rounded-lg hover:bg-red-50 text-gray-600 hover:text-red-600 transition-colors active:scale-95"
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
              "p-3 space-y-2 min-h-[100px] transition-all duration-150 ease-out",
              snapshot.isDraggingOver ? "bg-orange-100 border-2 border-orange-400 -m-px" : "bg-transparent"
            )}
          >
            {tasks.map((task, index) => (
              <Draggable key={task.id} draggableId={task.id} index={index}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    className={cn(
                      "transition-transform duration-150",
                      snapshot.isDragging && "z-50"
                    )}
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
                      isAdmin={currentUser?.role === 'admin'}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
            
            {tasks.length === 0 && (
              <p className="text-center text-gray-500 text-sm py-8">
                Aucune tâche
              </p>
            )}
          </div>
        )}
      </Droppable>

      <ConfirmDialog
        open={confirmDeleteCategory}
        onOpenChange={setConfirmDeleteCategory}
        title="Supprimer la catégorie"
        description={`Êtes-vous sûr de vouloir supprimer la catégorie "${title}" ?`}
        onConfirm={() => onDeleteCategory(category.id)}
        variant="danger"
        confirmText="Supprimer"
      />
    </div>
  );
}

function TaskCard({ task, onEdit, onDelete, onStartStopwatch, isSelected, onToggleSelection, dragHandleProps, isDragging, stockValue, onStockChange, dayOfWeek, isAdmin }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  
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
    <div
      onClick={requiresStock ? undefined : onToggleSelection}
      className={cn(
        "group bg-white rounded-lg sm:rounded-xl p-2.5 sm:p-3 border-2 transition-all duration-150",
        !requiresStock && "cursor-pointer active:scale-[0.98]",
        isSelected 
          ? "bg-orange-50 border-orange-500 ring-2 ring-orange-300" 
          : "border-gray-300 hover:bg-gray-50 hover:border-gray-400",
        isDragging && "border-orange-600 shadow-2xl bg-orange-50 z-50"
      )}
    >
      <div className="flex items-start gap-2 sm:gap-3">
        <div 
          {...dragHandleProps}
          className={cn(
            "cursor-grab active:cursor-grabbing touch-none pt-0.5 p-1 -m-1 hover:bg-orange-100 rounded transition-all active:scale-110",
            isDragging && "text-orange-600"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className={cn("w-5 h-5 transition-colors", isDragging ? "text-orange-600" : "text-gray-400")} />
        </div>
        
        {task.image_url && (
          <img 
            src={task.image_url} 
            alt={task.name}
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg object-cover flex-shrink-0"
          />
        )}
        
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-gray-900 text-sm sm:text-base break-words">{task.name}</h4>
          <div className="flex items-center gap-2 sm:gap-3 mt-1 text-xs text-gray-600 flex-wrap">
            {formatDuration() && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDuration()}
              </span>
            )}
            <span className={cn(
              "px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] font-bold uppercase whitespace-nowrap",
              task.tracking_mode === 'binary' 
                ? "bg-amber-100 text-amber-700"
                : "bg-indigo-100 text-indigo-700"
            )}>
              {task.tracking_mode === 'binary' ? (
                <span className="flex items-center gap-1">
                  <ToggleLeft className="w-3 h-3" />
                  <span className="hidden sm:inline">Binaire</span>
                  <span className="sm:hidden">Bin</span>
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Hash className="w-3 h-3" />
                  <span className="hidden sm:inline">Quantité</span>
                  <span className="sm:hidden">Qté</span>
                </span>
              )}
            </span>
          </div>
          
          {requiresStock && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-[11px] sm:text-xs text-gray-700 font-medium">Stock restant :</label>
                <Input
                  type="number"
                  min="0"
                  value={currentStock}
                  onChange={(e) => onStockChange?.(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="h-8 sm:h-7 w-16 sm:w-20 bg-gray-50 border-gray-300 text-xs font-semibold"
                  placeholder="0"
                />
                <span className="text-xs text-gray-700 font-medium">/ {targetQuantity}</span>
              </div>
              {quantityToProduce > 0 && (
                <p className="text-[11px] sm:text-xs text-orange-600 font-semibold">
                  À produire : {quantityToProduce} {task.unit || 'unités'}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStartStopwatch();
            }}
            className="p-1.5 sm:p-2 rounded-lg hover:bg-orange-100 text-gray-600 hover:text-orange-600 transition-colors active:scale-95"
            title="Chronométrer"
          >
            <Play className="w-4 h-4" />
          </button>
          {isAdmin && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="p-1.5 sm:p-2 rounded-lg hover:bg-blue-100 text-gray-600 hover:text-blue-600 transition-colors active:scale-95"
                title="Modifier"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(true);
                }}
                className="p-1.5 sm:p-2 rounded-lg hover:bg-red-100 text-gray-600 hover:text-red-600 transition-colors active:scale-95"
                title="Supprimer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Supprimer la tâche"
        description={`Êtes-vous sûr de vouloir supprimer la tâche "${task.name}" ?`}
        onConfirm={onDelete}
        variant="danger"
        confirmText="Supprimer"
      />
    </div>
  );
}