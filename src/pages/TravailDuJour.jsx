import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ChefHat, Check, CheckCircle2, X, Clock, Trash2 } from 'lucide-react';
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workSessions'] });
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
    <div>
      <PageHeader
        icon={ChefHat}
        title="Travail du Jour"
        subtitle={format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
        actions={
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button
              onClick={handleDeleteSession}
              variant="outline"
              className="border-red-600 text-red-600 hover:text-white hover:bg-red-600 w-full sm:w-auto"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Supprimer la liste</span>
              <span className="sm:hidden">Supprimer</span>
            </Button>
            <Button
              onClick={handleCompleteSession}
              className="bg-orange-600 hover:bg-orange-700 w-full sm:w-auto"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Mise en place terminée</span>
              <span className="sm:hidden">Terminée</span>
            </Button>
          </div>
        }
      />

      {/* Active Daily Notes */}
      <AnimatePresence>
        {activeNotes.map(note => (
          <div key={note.id} className="mb-4">
            <DailyNoteCard note={note} />
          </div>
        ))}
      </AnimatePresence>

      {/* Progress Section */}
      <div className="mb-6 p-4 bg-white rounded-2xl border-2 border-gray-300">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-3">
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="text-2xl font-bold text-orange-600">{completedCount}/{totalCount}</span>
            <span className="text-gray-900 font-medium text-sm sm:text-base">tâches complétées</span>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-2 text-sm w-full sm:w-auto">
            {activeSession.started_at && (
              <div className="text-gray-700 text-xs font-medium">
                Créée le {format(new Date(activeSession.started_at), "d MMM 'à' HH:mm", { locale: fr })}
              </div>
            )}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-2 text-gray-700 font-medium text-xs sm:text-sm">
                <Clock className="w-4 h-4" />
                <span>Total: {formatTime(totalTimeSeconds)}</span>
              </div>
              <div className="flex items-center gap-2 text-orange-600 font-semibold text-xs sm:text-sm">
                <Clock className="w-4 h-4" />
                <span>Restant: {formatTime(remainingTimeSeconds)}</span>
              </div>
            </div>
          </div>
        </div>
        <Progress value={progressPercent} className="h-3 bg-gray-200" />
      </div>

      {/* Tasks by Category */}
      <div className="space-y-6">
        {Object.entries(tasksByCategory).map(([categoryId, tasks]) => {
          const category = categories.find(c => c.id === categoryId);
          const categoryName = category?.name || 'Sans catégorie';
          const categoryColor = category?.color || '#64748b';

          return (
            <div key={categoryId} className="bg-white rounded-2xl border-2 border-gray-300 overflow-hidden shadow-sm">
              <div 
                className="px-3 sm:px-4 py-3 border-b-2 border-gray-200"
                style={{ borderLeftWidth: 4, borderLeftColor: categoryColor }}
              >
                <h3 className="font-semibold text-gray-900 text-sm sm:text-base break-words">{categoryName}</h3>
                <p className="text-xs text-gray-700 font-medium">
                  {tasks.filter(t => t.is_completed).length}/{tasks.length} complété{tasks.length > 1 ? 's' : ''}
                </p>
              </div>
              
              <div className="p-3 space-y-2">
                <AnimatePresence>
                  {tasks.map((task) => (
                    <WorkTaskCard
                      key={task.originalIndex}
                      task={task}
                      onComplete={() => handleCompleteTask(task.originalIndex)}
                      onUncomplete={() => handleUncompleteTask(task.originalIndex)}
                      onRemove={() => handleRemoveTask(task.originalIndex)}
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

function WorkTaskCard({ task, onComplete, onUncomplete, onRemove }) {
  const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()];
  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list()
  });
  
  const taskDetails = tasks.find(t => t.id === task.task_id);
  const hasQuantity = task.quantity_to_produce !== undefined && task.quantity_to_produce > 0;
  const isAdHoc = !task.task_id;
  
  // For binary tasks, get the multiplier from weekly_targets
  const isBinaryTask = taskDetails?.tracking_mode === 'binary';
  const binaryMultiplier = isBinaryTask && taskDetails?.weekly_targets?.[dayOfWeek] 
    ? taskDetails.weekly_targets[dayOfWeek] 
    : null;
  
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        "p-3 sm:p-4 rounded-xl border-2 transition-all",
        task.is_completed
          ? "bg-orange-50 border-orange-400"
          : "bg-white border-gray-300"
      )}
    >
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Task Image */}
        {taskDetails?.image_url && (
          <div className="flex-shrink-0">
            <img 
              src={taskDetails.image_url} 
              alt={task.task_name}
              className={cn(
                "w-full sm:w-20 sm:h-20 h-32 rounded-lg object-cover border-2",
                task.is_completed ? "border-orange-600/30 opacity-60" : "border-slate-600"
              )}
            />
          </div>
        )}

        <div className="flex-1 flex flex-col gap-3 min-w-0">
          <div className="flex-1">
            <div className="flex items-start gap-2 flex-wrap mb-2">
              <h4 className={cn(
                  "font-semibold text-gray-900 text-sm sm:text-base break-words",
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
              {hasQuantity && (
                <span className="px-2 py-1 rounded-lg bg-indigo-600/20 text-indigo-400 text-xs font-medium break-words">
                  Quantité : {task.quantity_to_produce} {taskDetails?.unit || ''}
                </span>
              )}
              {binaryMultiplier && binaryMultiplier > 0 && (
                <span className="px-2 py-1 rounded-lg bg-amber-600/20 text-amber-400 text-xs font-medium">
                  Quantité : {binaryMultiplier}
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

          <div className="flex items-center gap-2">
            {!task.is_completed && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onRemove}
                  className="text-gray-600 hover:text-red-600 hover:bg-red-50 min-h-[44px] min-w-[44px] px-2 sm:px-3"
                >
                  <X className="w-4 h-4" />
                </Button>
                <Button
                  onClick={onComplete}
                  className="bg-orange-600 hover:bg-orange-700 min-h-[44px] flex-1 text-sm"
                >
                  <Check className="w-4 h-4 mr-2" />
                  Terminé
                </Button>
              </>
            )}
            {task.is_completed && (
              <Button
                size="sm"
                onClick={onUncomplete}
                variant="outline"
                className="border-orange-600 text-orange-600 hover:bg-orange-50 min-h-[44px] w-full sm:w-auto text-sm"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Annuler
              </Button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}