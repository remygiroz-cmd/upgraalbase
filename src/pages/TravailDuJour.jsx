import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ChefHat, Check, CheckCircle2, X, Clock, Trash2, Plus, Minus, RotateCcw } from 'lucide-react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import DailyNoteCard from '@/components/cuisine/DailyNoteCard';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PageHeader from '@/components/ui/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
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
      completed_at: new Date().toISOString()
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
    const catId = task.category_id || 'uncategorized';
    if (!tasksByCategory[catId]) {
      tasksByCategory[catId] = [];
    }
    tasksByCategory[catId].push({ ...task, originalIndex: index });
  });

  // Calculate progress
  const completedCount = activeSession.tasks?.filter(t => t.is_completed).length || 0;
  const totalCount = activeSession.tasks?.length || 0;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  // Calculate time with quantity
  const calculateTimeForTask = (sessionTask) => {
    const task = tasks.find(t => t.id === sessionTask.task_id);
    if (!task) return 0;
    const baseTime = (task.duration_minutes || 0) * 60 + (task.duration_seconds || 0);
    
    // If we have both initial and current quantity, calculate proportional time
    if (sessionTask.initial_quantity_to_produce && sessionTask.initial_quantity_to_produce > 0) {
      const timePerUnit = baseTime / sessionTask.initial_quantity_to_produce;
      return timePerUnit * (sessionTask.quantity_to_produce || 1);
    }
    
    // Otherwise use the base time * current quantity
    const multiplier = sessionTask.quantity_to_produce || 1;
    return baseTime * multiplier;
  };

  const totalTimeSeconds = activeSession.tasks?.reduce((acc, sessionTask) => {
    return acc + calculateTimeForTask(sessionTask);
  }, 0) || 0;

  const remainingTimeSeconds = activeSession.tasks?.reduce((acc, sessionTask) => {
    if (sessionTask.is_completed) return acc;
    return acc + calculateTimeForTask(sessionTask);
  }, 0) || 0;

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}min`;
    return `${minutes}min`;
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
          <div className="text-gray-700 text-xs font-medium mb-2">
            Créée le {format(new Date(activeSession.started_at), "d MMM 'à' HH:mm", { locale: fr })}
          </div>
        )}
        <div className="flex flex-col gap-2 mb-3">
          <div className="flex items-center gap-2 text-gray-700 font-medium text-sm">
            <Clock className="w-4 h-4 flex-shrink-0" />
            <span>Total: {formatTime(totalTimeSeconds)}</span>
          </div>
          <div className="flex items-center gap-2 text-orange-600 font-semibold text-sm">
            <Clock className="w-4 h-4 flex-shrink-0" />
            <span>Restant: {formatTime(remainingTimeSeconds)}</span>
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
    </div>
  );
}

function WorkTaskCard({ task, onComplete, onUncomplete, onRemove, onUpdateQuantity }) {
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
            
            {task.ad_hoc_comment && (
              <p className="text-xs sm:text-sm text-gray-700 mt-2 italic break-words">
                {task.ad_hoc_comment}
              </p>
            )}
            
            {task.is_completed && task.completed_by_name && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <div className="w-6 h-6 rounded-full bg-orange-600 flex items-center justify-center text-xs font-medium text-white flex-shrink-0">
                  {task.completed_by_name.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs sm:text-sm text-gray-900 font-medium truncate">{task.completed_by_name}</span>
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