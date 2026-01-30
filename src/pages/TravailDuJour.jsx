import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ChefHat, Check, CheckCircle2, X, Clock, Trash2, Plus, Minus, RotateCcw, Timer, AlertCircle } from 'lucide-react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import DailyNoteCard from '@/components/cuisine/DailyNoteCard';
import TaskDurationModal from '@/components/cuisine/TaskDurationModal';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PageHeader from '@/components/ui/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import UserAvatar from '@/components/ui/UserAvatar';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';

export default function TravailDuJour() {
  const queryClient = useQueryClient();
  const today = format(new Date(), 'yyyy-MM-dd');
  const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()];
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', description: '', onConfirm: null });
  const [hideCompleted, setHideCompleted] = useState(true);
  const [durationModal, setDurationModal] = useState({ open: false, task: null, taskIndex: null });

  const { data: activeSession, isLoading } = useQuery({
    queryKey: ['workSessions', 'active', today],
    queryFn: async () => {
      const sessions = await base44.entities.WorkSession.filter({ date: today, status: 'active' });
      return sessions[0];
    }
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('order')
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list()
  });

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: activeNotes = [] } = useQuery({
    queryKey: ['dailyNotes'],
    queryFn: async () => {
      const notes = await base44.entities.DailyNote.list('-created_date');
      const now = new Date();
      return notes.filter(note => {
        const expires = new Date(note.expires_at);
        return expires > now && note.is_active;
      });
    },
    refetchInterval: 60000 // Refresh every minute
  });

  const updateSessionMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.WorkSession.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workSessions'] });
    }
  });

  const completeSessionMutation = useMutation({
    mutationFn: ({ id }) => base44.entities.WorkSession.update(id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      completed_by: currentUser?.email,
      completed_by_name: currentUser?.full_name || currentUser?.email
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workSessions'] });
      setShowCompletionModal(true);
    }
  });

  const handleCompleteTask = (taskIndex) => {
    if (!activeSession) return;
    
    const updatedTasks = [...activeSession.tasks];
    updatedTasks[taskIndex] = {
      ...updatedTasks[taskIndex],
      is_completed: true,
      completed_by: currentUser?.email,
      completed_by_name: currentUser?.full_name || currentUser?.email,
      completed_at: new Date().toISOString()
    };

    updateSessionMutation.mutate({
      id: activeSession.id,
      data: { tasks: updatedTasks }
    });
  };

  const handleUncompleteTask = (taskIndex) => {
    if (!activeSession) return;
    
    const updatedTasks = [...activeSession.tasks];
    updatedTasks[taskIndex] = {
      ...updatedTasks[taskIndex],
      is_completed: false,
      completed_by: undefined,
      completed_by_name: undefined,
      completed_at: undefined
    };

    updateSessionMutation.mutate({
      id: activeSession.id,
      data: { tasks: updatedTasks }
    });
  };

  // Auto-complete session when all tasks are done
  useEffect(() => {
    if (!activeSession || activeSession.status === 'completed') return;
    
    const allTasksCompleted = activeSession.tasks?.length > 0 && 
      activeSession.tasks.every(task => task.is_completed);
    
    if (allTasksCompleted) {
      completeSessionMutation.mutate({ id: activeSession.id });
    }
  }, [activeSession?.tasks]);

  const handleRemoveTask = (taskIndex) => {
    if (!activeSession) return;
    
    const updatedTasks = activeSession.tasks.filter((_, idx) => idx !== taskIndex);
    
    updateSessionMutation.mutate({
      id: activeSession.id,
      data: { tasks: updatedTasks }
    });
  };

  const handleUpdateQuantity = (taskIndex, newQuantity) => {
    if (!activeSession || newQuantity < 1) return;
    
    const updatedTasks = [...activeSession.tasks];
    updatedTasks[taskIndex] = {
      ...updatedTasks[taskIndex],
      quantity_to_produce: newQuantity
    };
    
    updateSessionMutation.mutate({
      id: activeSession.id,
      data: { tasks: updatedTasks }
    });
  };

  const handleCompleteSession = () => {
    if (!activeSession) return;
    setConfirmDialog({
      open: true,
      title: 'Terminer la mise en place',
      description: 'Êtes-vous sûr de vouloir terminer la mise en place ? La session sera archivée dans l\'historique.',
      onConfirm: () => completeSessionMutation.mutate({ id: activeSession.id })
    });
  };

  const deleteSessionMutation = useMutation({
    mutationFn: (id) => base44.entities.WorkSession.delete(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workSessions', 'active', today] });
      await queryClient.refetchQueries({ queryKey: ['workSessions', 'active', today] });
      window.location.href = createPageUrl('Home');
    }
  });

  const handleDeleteSession = () => {
    if (!activeSession) return;
    setConfirmDialog({
      open: true,
      title: 'Supprimer la liste',
      description: 'Êtes-vous sûr de vouloir supprimer complètement cette liste de travail du jour ? Cette action est irréversible.',
      onConfirm: () => deleteSessionMutation.mutate(activeSession.id)
    });
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!activeSession) {
    return (
      <div>
        <PageHeader
          icon={ChefHat}
          title="Travail du Jour"
          subtitle={format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
        />
        <EmptyState
          icon={ChefHat}
          title="Aucune liste active"
          description="Créez une liste depuis la Mise en Place en sélectionnant des tâches"
        />
      </div>
    );
  }

  // Group tasks by category
  const tasksByCategory = {};
  activeSession.tasks?.forEach((task, index) => {
    // Skip completed tasks if hideCompleted is true
    if (hideCompleted && task.is_completed) return;
    
    const catId = task.category_id || 'uncategorized';
    if (!tasksByCategory[catId]) {
      tasksByCategory[catId] = [];
    }
    tasksByCategory[catId].push({ ...task, originalIndex: index });
  });

  // Sort tasks within each category by their order from Task entity
  Object.keys(tasksByCategory).forEach(catId => {
    tasksByCategory[catId].sort((a, b) => {
      const taskA = tasks.find(t => t.id === a.task_id);
      const taskB = tasks.find(t => t.id === b.task_id);
      const orderA = taskA?.order || 0;
      const orderB = taskB?.order || 0;
      return orderA - orderB;
    });
  });

  // Calculate progress
  const completedCount = activeSession.tasks?.filter(t => t.is_completed).length || 0;
  const totalCount = activeSession.tasks?.length || 0;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  // Calculate time with new duration system
  const calculateTimeForTask = (sessionTask) => {
    const task = tasks.find(t => t.id === sessionTask.task_id);
    if (!task) return 0;
    
    const quantity = sessionTask.quantity_to_produce || 1;
    
    // New duration system
    if (task.durationMode === 'FIXED' && task.estimatedMinutes) {
      return task.estimatedMinutes * 60; // Convert to seconds
    }
    
    if (task.durationMode === 'PER_UNIT' && task.minutesPerUnit) {
      return task.minutesPerUnit * quantity * 60; // Convert to seconds
    }
    
    // Fallback to old system if new fields not set
    const baseTime = (task.duration_minutes || 0) * 60 + (task.duration_seconds || 0);
    if (baseTime > 0) {
      if (sessionTask.initial_quantity_to_produce && sessionTask.initial_quantity_to_produce > 0) {
        const timePerUnit = baseTime / sessionTask.initial_quantity_to_produce;
        return timePerUnit * quantity;
      }
      return baseTime * quantity;
    }
    
    return 0;
  };

  const totalTimeMinutes = activeSession.tasks?.reduce((acc, sessionTask) => {
    return acc + (calculateTimeForTask(sessionTask) / 60);
  }, 0) || 0;

  const remainingTimeMinutes = activeSession.tasks?.reduce((acc, sessionTask) => {
    if (sessionTask.is_completed) return acc;
    return acc + (calculateTimeForTask(sessionTask) / 60);
  }, 0) || 0;

  const formatTime = (minutes) => {
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}h${mins.toString().padStart(2, '0')}` : `${hours}h`;
  };

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }
  });

  const handleSaveDuration = (durationData) => {
    const { taskIndex } = durationModal;
    if (taskIndex === null) return;
    
    const sessionTask = activeSession.tasks[taskIndex];
    const task = tasks.find(t => t.id === sessionTask.task_id);
    
    if (task) {
      updateTaskMutation.mutate({
        id: task.id,
        data: durationData
      });
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-4 sm:mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-orange-600/20 text-orange-400 flex items-center justify-center flex-shrink-0">
            <ChefHat className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 break-words">Travail du Jour</h1>
            <p className="text-xs sm:text-sm text-gray-700 break-words">{format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 mt-3">
          <Button
            onClick={() => setHideCompleted(!hideCompleted)}
            variant="outline"
            className={cn(
              "w-full min-h-[44px] transition-colors",
              hideCompleted 
                ? "border-orange-600 text-orange-600 bg-orange-50 hover:bg-orange-100" 
                : "border-gray-300 text-gray-700 hover:bg-gray-50"
            )}
          >
            {hideCompleted ? 'Afficher tout' : 'Masquer terminées'}
          </Button>
          <Button
            onClick={handleDeleteSession}
            variant="outline"
            className="border-red-600 text-red-600 hover:text-white hover:bg-red-600 w-full min-h-[44px]"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Supprimer
          </Button>
          <Button
            onClick={handleCompleteSession}
            className="bg-orange-600 hover:bg-orange-700 w-full min-h-[48px] font-semibold"
          >
            <CheckCircle2 className="w-5 h-5 mr-2" />
            Terminée
          </Button>
        </div>
      </div>

      {/* Active Daily Notes */}
      <AnimatePresence>
        {activeNotes.map(note => (
          <div key={note.id} className="mb-4">
            <DailyNoteCard note={note} />
          </div>
        ))}
      </AnimatePresence>

      {/* Progress Section */}
      <div className="mb-4 sm:mb-6 p-4 bg-white rounded-2xl border-2 border-gray-300 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-3xl sm:text-4xl font-bold text-orange-600">{completedCount}/{totalCount}</span>
          <span className="text-gray-900 font-semibold text-base sm:text-lg">tâches complétées</span>
        </div>
        {activeSession.started_at && (
          <div className="flex items-center gap-2 text-gray-700 text-xs font-medium mb-2 flex-wrap">
            <span>Créée le {format(new Date(activeSession.started_at), "d MMM 'à' HH:mm", { locale: fr })} par</span>
            {activeSession.started_by && (
              <UserAvatar 
                userEmail={activeSession.started_by} 
                userName={activeSession.started_by_name}
                size="xs"
                showName={true}
              />
            )}
          </div>
        )}
        {activeSession.status === 'completed' && activeSession.completed_at && (
          <div className="flex items-center gap-2 text-orange-600 text-xs font-semibold mb-2 flex-wrap">
            <span>Validée le {format(new Date(activeSession.completed_at), "d MMM 'à' HH:mm", { locale: fr })} par</span>
            {activeSession.completed_by && (
              <UserAvatar 
                userEmail={activeSession.completed_by} 
                userName={activeSession.completed_by_name}
                size="xs"
                showName={true}
              />
            )}
          </div>
        )}
        <div className="space-y-2 mb-3">
          <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600 font-medium">Temps total estimé</span>
              <span className="text-lg font-bold text-gray-900">{formatTime(totalTimeMinutes)}</span>
            </div>
          </div>
          <div className="p-3 rounded-lg bg-orange-50 border border-orange-200">
            <div className="flex items-center justify-between">
              <span className="text-xs text-orange-600 font-medium">Temps restant</span>
              <span className="text-lg font-bold text-orange-600">{formatTime(remainingTimeMinutes)}</span>
            </div>
          </div>
        </div>
        <Progress value={progressPercent} className="h-3 bg-gray-200" />
      </div>

      {/* Tasks by Category */}
      <div className="space-y-4 sm:space-y-6">
        {Object.entries(tasksByCategory).map(([categoryId, tasks]) => {
          const category = categories.find(c => c.id === categoryId);
          const categoryName = category?.name || 'Sans catégorie';
          const categoryColor = category?.color || '#64748b';

          return (
            <div key={categoryId} className="bg-white rounded-2xl border-2 border-gray-300 overflow-hidden shadow-sm">
              <div 
                className="px-4 py-3 border-b-2 border-gray-200"
                style={{ borderLeftWidth: 4, borderLeftColor: categoryColor }}
              >
                <h3 className="font-bold text-gray-900 text-base break-words">{categoryName}</h3>
                <p className="text-xs text-gray-700 font-medium mt-1">
                  {tasks.filter(t => t.is_completed).length}/{tasks.length} complété{tasks.length > 1 ? 's' : ''}
                </p>
              </div>
              
              <div className="p-3 space-y-3">
                <AnimatePresence>
                  {tasks.map((task) => (
                    <WorkTaskCard
                      key={task.originalIndex}
                      task={task}
                      onComplete={() => handleCompleteTask(task.originalIndex)}
                      onUncomplete={() => handleUncompleteTask(task.originalIndex)}
                      onRemove={() => handleRemoveTask(task.originalIndex)}
                      onUpdateQuantity={(newQuantity) => handleUpdateQuantity(task.originalIndex, newQuantity)}
                      onEditDuration={() => {
                        const taskEntity = tasks.find(t => t.id === task.task_id);
                        setDurationModal({ open: true, task: taskEntity, taskIndex: task.originalIndex });
                      }}
                      allTasks={tasks}
                      taskEntities={tasks}
                      dayOfWeek={dayOfWeek}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          );
        })}
      </div>

      {/* Completion Modal */}
      <Dialog open={showCompletionModal} onOpenChange={setShowCompletionModal}>
        <DialogContent className="bg-slate-800 border-slate-700 w-[calc(100vw-2rem)] max-w-md sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-400 text-sm sm:text-base break-words">
              <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" />
              <span>Mise en place terminée !</span>
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 sm:py-4">
            <p className="text-slate-300 mb-4 sm:mb-6 text-xs sm:text-sm break-words">
              La session a été enregistrée dans l'historique.
            </p>
            <Link to={createPageUrl('MiseEnPlace')}>
              <Button className="w-full bg-orange-600 hover:bg-orange-700 min-h-[44px] text-sm sm:text-base">
                Créer une nouvelle mise en place
              </Button>
            </Link>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.onConfirm}
        variant={confirmDialog.title.includes('Supprimer') ? 'danger' : 'warning'}
      />

      {/* Duration Modal */}
      <TaskDurationModal
        open={durationModal.open}
        onOpenChange={(open) => setDurationModal({ ...durationModal, open })}
        task={durationModal.task}
        onSave={handleSaveDuration}
      />
    </div>
  );
}

function WorkTaskCard({ task, onComplete, onUncomplete, onRemove, onUpdateQuantity, onEditDuration }) {
  const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()];
  const [localQuantity, setLocalQuantity] = useState(task.quantity_to_produce || 1);
  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list()
  });
  
  const taskDetails = tasks.find(t => t.id === task.task_id);
  const isAdHoc = !task.task_id;

  // Sync local state with prop changes
  useEffect(() => {
    setLocalQuantity(task.quantity_to_produce || 1);
  }, [task.quantity_to_produce]);
  
  // Ensure all non-ad-hoc tasks have a quantity
  if (!isAdHoc && (task.quantity_to_produce === undefined || task.quantity_to_produce === null)) {
    task.quantity_to_produce = 1;
    if (!task.initial_quantity_to_produce) {
      task.initial_quantity_to_produce = 1;
    }
  }
  
  const hasQuantity = !isAdHoc;
  
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        "p-4 rounded-xl border-2 transition-all",
        task.is_completed
          ? "bg-orange-50 border-orange-400"
          : "bg-white border-gray-300"
      )}
    >
      <div className="flex flex-col gap-3">
        {/* Task Image */}
        {taskDetails?.image_url && (
          <div className="w-full">
            <img 
              src={taskDetails.image_url} 
              alt={task.task_name}
              className={cn(
                "w-full h-48 rounded-lg object-cover border-2",
                task.is_completed ? "border-orange-600/30 opacity-60" : "border-gray-300"
              )}
            />
          </div>
        )}

        <div className="flex flex-col gap-3">
          <div className="flex-1">
            <div className="flex items-start gap-2 flex-wrap mb-2">
              <h4 className={cn(
                  "font-bold text-gray-900 text-base break-words",
                  task.is_completed && "line-through text-gray-500"
                )}>
                  {task.task_name}
                </h4>
              {isAdHoc && (
                <span className="px-2 py-1 rounded-lg bg-purple-600/20 text-purple-400 text-xs font-medium whitespace-nowrap">
                  Ponctuelle
                </span>
              )}
            </div>
            
            <div className="space-y-2">
              {/* Duration Display */}
              <DurationDisplay task={task} taskDetails={taskDetails} onEditDuration={onEditDuration} />
              
              {task.current_stock !== undefined && task.target_quantity !== undefined && (
                <div className="w-full px-2 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium">
                  Stock restant : {task.current_stock} / {task.target_quantity}
                </div>
              )}
              
              <div className="flex flex-wrap gap-2">
              {hasQuantity && !task.is_completed && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600/20">
                  <button
                    onClick={() => {
                      const newQuantity = localQuantity - 1;
                      if (newQuantity >= 1) {
                        setLocalQuantity(newQuantity);
                        onUpdateQuantity(newQuantity);
                      }
                    }}
                    className="w-10 h-10 rounded-md bg-white/20 hover:bg-white/30 active:bg-white/40 flex items-center justify-center transition-all active:scale-95 touch-manipulation"
                  >
                    <Minus className="w-5 h-5 text-indigo-400" />
                  </button>
                  <span className="text-indigo-400 text-sm font-medium min-w-[4rem] text-center break-words px-2">
                    {localQuantity} {taskDetails?.unit || ''}
                  </span>
                  <button
                    onClick={() => {
                      const newQuantity = localQuantity + 1;
                      setLocalQuantity(newQuantity);
                      onUpdateQuantity(newQuantity);
                    }}
                    className="w-10 h-10 rounded-md bg-white/20 hover:bg-white/30 active:bg-white/40 flex items-center justify-center transition-all active:scale-95 touch-manipulation"
                  >
                    <Plus className="w-5 h-5 text-indigo-400" />
                  </button>
                </div>
              )}
                {hasQuantity && task.is_completed && (
                  <span className="px-2 py-1 rounded-lg bg-indigo-600/20 text-indigo-400 text-xs font-medium break-words">
                    Quantité : {task.quantity_to_produce} {taskDetails?.unit || ''}
                  </span>
                )}
              </div>
            </div>
            
            {task.ad_hoc_comment && (
              <p className="text-xs sm:text-sm text-gray-700 mt-2 italic break-words">
                {task.ad_hoc_comment}
              </p>
            )}
            
            {task.is_completed && task.completed_by && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <UserAvatar 
                  userEmail={task.completed_by} 
                  userName={task.completed_by_name}
                  size="sm"
                  showName={true}
                />
                <span className="text-xs text-gray-700 whitespace-nowrap">
                  {format(new Date(task.completed_at), 'HH:mm')}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 mt-2">
            {!task.is_completed && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onRemove}
                  className="text-gray-600 hover:text-red-600 hover:bg-red-50 min-h-[48px] min-w-[48px] px-3"
                >
                  <X className="w-5 h-5" />
                </Button>
                <Button
                  onClick={onComplete}
                  className="bg-orange-600 hover:bg-orange-700 min-h-[52px] flex-1 text-base font-semibold"
                >
                  <Check className="w-5 h-5 mr-2" />
                  Terminé
                </Button>
              </>
            )}
            {task.is_completed && (
              <Button
                size="sm"
                onClick={onUncomplete}
                variant="outline"
                className="border-orange-600 text-orange-600 hover:bg-orange-50 min-h-[48px] w-full text-base font-semibold"
              >
                <RotateCcw className="w-5 h-5 mr-2" />
                Annuler
              </Button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function DurationDisplay({ task, taskDetails, onEditDuration }) {
  const isAdHoc = !task.task_id;
  
  if (isAdHoc || !taskDetails) return null;

  const { durationMode, estimatedMinutes, minutesPerUnit, unitLabel } = taskDetails;
  const quantity = task.quantity_to_produce || 1;

  const formatTime = (minutes) => {
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}h${mins.toString().padStart(2, '0')}` : `${hours}h`;
  };

  let timeDisplay = null;
  let hasValidDuration = false;

  if (durationMode === 'FIXED' && estimatedMinutes > 0) {
    hasValidDuration = true;
    timeDisplay = (
      <div className="flex items-center gap-2">
        <Timer className="w-4 h-4 text-blue-600" />
        <span className="text-sm font-medium text-blue-700">
          ⏱ {formatTime(estimatedMinutes)}
        </span>
      </div>
    );
  } else if (durationMode === 'PER_UNIT' && minutesPerUnit > 0) {
    hasValidDuration = true;
    const totalMinutes = minutesPerUnit * quantity;
    timeDisplay = (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Timer className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-medium text-blue-700">
            ⏱ {formatTime(totalMinutes)}
          </span>
        </div>
        <span className="text-xs text-gray-600 ml-6">
          {minutesPerUnit} min/{unitLabel || 'unité'} × {quantity}
        </span>
      </div>
    );
  }

  return (
    <div className="w-full">
      {hasValidDuration ? (
        <div className="flex items-start justify-between p-2 rounded-lg bg-blue-50 border border-blue-200">
          <div className="flex-1">
            {timeDisplay}
          </div>
          {!task.is_completed && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onEditDuration}
              className="text-blue-600 hover:text-blue-700 hover:bg-blue-100 h-8 px-2"
            >
              <Clock className="w-4 h-4" />
            </Button>
          )}
        </div>
      ) : (
        <div className="flex items-start justify-between p-2 rounded-lg bg-yellow-50 border border-yellow-200">
          <div className="flex items-center gap-2 flex-1">
            <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0" />
            <span className="text-xs text-yellow-700 font-medium">
              Durée à définir
            </span>
          </div>
          {!task.is_completed && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onEditDuration}
              className="text-yellow-600 hover:text-yellow-700 hover:bg-yellow-100 h-8 px-2"
            >
              <Clock className="w-4 h-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}