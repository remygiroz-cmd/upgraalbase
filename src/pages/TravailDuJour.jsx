import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ChefHat, Check, CheckCircle2, X, Clock, RotateCcw, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  const [showCompletionModal, setShowCompletionModal] = useState(false);

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

  const handleCompleteTask = (taskIndex, completedQuantity = null) => {
    if (!activeSession) return;
    
    const updatedTasks = [...activeSession.tasks];
    const task = updatedTasks[taskIndex];
    
    // If completedQuantity is provided, use it; otherwise use the full quantity
    const finalQuantity = completedQuantity !== null 
      ? completedQuantity 
      : (task.quantity_to_produce || 1);
    
    const isFullyCompleted = finalQuantity >= (task.quantity_to_produce || 1);
    
    updatedTasks[taskIndex] = {
      ...updatedTasks[taskIndex],
      completed_quantity: finalQuantity,
      is_completed: isFullyCompleted,
      ...(isFullyCompleted && {
        completed_by: currentUser?.email,
        completed_by_name: currentUser?.full_name || currentUser?.email,
        completed_at: new Date().toISOString()
      })
    };

    updateSessionMutation.mutate({
      id: activeSession.id,
      data: { tasks: updatedTasks }
    });
  };

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
    completeSessionMutation.mutate({ id: activeSession.id });
  };

  const handleResetSession = () => {
    if (!activeSession) return;
    updateSessionMutation.mutate({
      id: activeSession.id,
      data: { tasks: [] }
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

  // Pass the global tasks array to components
  const globalTasks = tasks;

  // Calculate progress with partial completion
  const calculateProgress = () => {
    if (!activeSession.tasks?.length) return { completed: 0, total: 0, percent: 0 };
    
    let totalUnits = 0;
    let completedUnits = 0;
    
    activeSession.tasks.forEach(task => {
      const units = task.quantity_to_produce || 1;
      totalUnits += units;
      
      if (task.completed_quantity !== undefined) {
        completedUnits += Math.min(task.completed_quantity, units);
      } else if (task.is_completed) {
        completedUnits += units;
      }
    });
    
    return {
      completed: completedUnits,
      total: totalUnits,
      percent: totalUnits > 0 ? (completedUnits / totalUnits) * 100 : 0
    };
  };
  
  const progress = calculateProgress();
  const completedCount = activeSession.tasks?.filter(t => t.is_completed).length || 0;
  const totalCount = activeSession.tasks?.length || 0;

  // Calculate time with quantity
  const calculateTimeForTask = (sessionTask, remaining = false) => {
    const task = tasks.find(t => t.id === sessionTask.task_id);
    if (!task) return 0;
    const baseTime = (task.duration_minutes || 0) * 60 + (task.duration_seconds || 0);
    
    if (remaining) {
      // If task is completed, no time remaining
      if (sessionTask.is_completed) return 0;
      
      // Calculate remaining units based on completed quantity
      const totalUnits = sessionTask.quantity_to_produce || 1;
      const completedUnits = sessionTask.completed_quantity || 0;
      const remainingUnits = Math.max(0, totalUnits - completedUnits);
      return baseTime * remainingUnits;
    }
    
    const multiplier = sessionTask.quantity_to_produce || 1;
    return baseTime * multiplier;
  };

  const totalTimeSeconds = activeSession.tasks?.reduce((acc, sessionTask) => {
    return acc + calculateTimeForTask(sessionTask, false);
  }, 0) || 0;

  const remainingTimeSeconds = activeSession.tasks?.reduce((acc, sessionTask) => {
    return acc + calculateTimeForTask(sessionTask, true);
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
          <>
            <Button
              onClick={handleResetSession}
              variant="outline"
              className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Réinitialiser
            </Button>
            <Button
              onClick={handleCompleteSession}
              className="bg-orange-600 hover:bg-orange-700"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Mise en place terminée
            </Button>
          </>
        }
      />

      {/* Progress Section */}
      <div className="mb-6 p-4 bg-slate-800/50 rounded-2xl border border-slate-700/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-4">
            <span className="text-2xl font-bold text-orange-400">{progress.completed}/{progress.total}</span>
            <span className="text-slate-300">unités complétées</span>
            <span className="text-sm text-slate-400">({completedCount}/{totalCount} tâches)</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2 text-slate-400">
              <Clock className="w-4 h-4" />
              <span>Total: {formatTime(totalTimeSeconds)}</span>
            </div>
            <div className="flex items-center gap-2 text-orange-400">
              <Clock className="w-4 h-4" />
              <span>Restant: {formatTime(remainingTimeSeconds)}</span>
            </div>
          </div>
        </div>
        <Progress value={progress.percent} className="h-3 bg-slate-700" />
      </div>

      {/* Tasks by Category */}
      <div className="space-y-6">
        {Object.entries(tasksByCategory).map(([categoryId, tasks]) => {
          const category = categories.find(c => c.id === categoryId);
          const categoryName = category?.name || 'Sans catégorie';
          const categoryColor = category?.color || '#64748b';

          return (
            <div key={categoryId} className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
              <div 
                className="px-4 py-3 border-b border-slate-700/50"
                style={{ borderLeftWidth: 4, borderLeftColor: categoryColor }}
              >
                <h3 className="font-semibold">{categoryName}</h3>
                <p className="text-xs text-slate-400">
                  {tasks.filter(t => t.is_completed).length}/{tasks.length} complété{tasks.length > 1 ? 's' : ''}
                </p>
              </div>
              
              <div className="p-3 space-y-2">
                <AnimatePresence>
                  {tasks.map((task) => (
                    <WorkTaskCard
                      key={task.originalIndex}
                      task={task}
                      onComplete={(qty) => handleCompleteTask(task.originalIndex, qty)}
                      onRemove={() => handleRemoveTask(task.originalIndex)}
                      allTasksEntities={globalTasks}
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
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-400">
              <CheckCircle2 className="w-6 h-6" />
              Mise en place terminée !
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-slate-300 mb-6">
              La session a été enregistrée dans l'historique.
            </p>
            <Link to={createPageUrl('MiseEnPlace')}>
              <Button className="w-full bg-orange-600 hover:bg-orange-700">
                Créer une nouvelle mise en place
              </Button>
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WorkTaskCard({ task, onComplete, onRemove, allTasksEntities }) {
  const taskDetails = allTasksEntities.find(t => t.id === task.task_id);
  const hasQuantity = task.quantity_to_produce !== undefined && task.quantity_to_produce > 0;
  const [manualQuantity, setManualQuantity] = useState(task.completed_quantity || 0);
  const [showQuantityInput, setShowQuantityInput] = useState(false);
  
  const completedQuantity = task.completed_quantity || 0;
  const totalQuantity = task.quantity_to_produce || 1;
  const remainingQuantity = Math.max(0, totalQuantity - completedQuantity);
  const isPartiallyComplete = completedQuantity > 0 && completedQuantity < totalQuantity;
  
  const handleCompleteWithQuantity = () => {
    if (showQuantityInput) {
      onComplete(manualQuantity);
      setShowQuantityInput(false);
    } else {
      onComplete(totalQuantity);
    }
  };
  
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        "p-4 rounded-xl border transition-all",
        task.is_completed
          ? "bg-orange-900/20 border-orange-600/30"
          : isPartiallyComplete
          ? "bg-indigo-900/20 border-indigo-600/30"
          : "bg-slate-700/50 border-slate-600/50"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h4 className={cn(
              "font-medium",
              task.is_completed && "line-through text-slate-500"
            )}>
              {task.task_name}
            </h4>
            {hasQuantity && (
              <span className={cn(
                "px-2 py-1 rounded-lg text-xs font-medium whitespace-nowrap",
                task.is_completed 
                  ? "bg-orange-600/20 text-orange-400"
                  : isPartiallyComplete
                  ? "bg-indigo-600/20 text-indigo-400"
                  : "bg-slate-600/20 text-slate-400"
              )}>
                {task.is_completed 
                  ? `${totalQuantity} ${taskDetails?.unit || 'unités'} ✓`
                  : isPartiallyComplete
                  ? `Restant : ${remainingQuantity} ${taskDetails?.unit || 'unités'} (${completedQuantity}/${totalQuantity})`
                  : `À faire : ${totalQuantity} ${taskDetails?.unit || 'unités'}`
                }
              </span>
            )}
          </div>
          
          {!task.is_completed && hasQuantity && showQuantityInput && (
            <div className="mt-2 flex items-center gap-2">
              <Input
                type="number"
                min="0"
                max={totalQuantity}
                value={manualQuantity}
                onChange={(e) => setManualQuantity(parseInt(e.target.value) || 0)}
                className="h-8 w-24 bg-slate-800 border-slate-600 text-sm"
                placeholder="0"
              />
              <span className="text-xs text-slate-400">unités effectuées</span>
            </div>
          )}
          
          {task.is_completed && task.completed_by_name && (
            <div className="mt-2 flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-orange-600 flex items-center justify-center text-xs font-medium text-white">
                {task.completed_by_name.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm text-slate-400">{task.completed_by_name}</span>
              <span className="text-xs text-slate-500">
                {format(new Date(task.completed_at), 'HH:mm')}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {!task.is_completed && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={onRemove}
                className="text-slate-400 hover:text-red-400 hover:bg-red-600/20"
              >
                <X className="w-4 h-4" />
              </Button>
              {hasQuantity && !showQuantityInput && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setManualQuantity(completedQuantity);
                    setShowQuantityInput(true);
                  }}
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  Modifier
                </Button>
              )}
              <Button
                onClick={handleCompleteWithQuantity}
                className="bg-orange-600 hover:bg-orange-700 min-h-[44px]"
              >
                <Check className="w-4 h-4 mr-2" />
                {showQuantityInput ? 'Valider' : 'Terminé'}
              </Button>
            </>
          )}
          {task.is_completed && (
            <Check className="w-6 h-6 text-orange-400" />
          )}
        </div>
      </div>
    </motion.div>
  );
}