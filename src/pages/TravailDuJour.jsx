import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ChefHat, Check, CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import PageHeader from '@/components/ui/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function TravailDuJour() {
  const queryClient = useQueryClient();
  const today = format(new Date(), 'yyyy-MM-dd');

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

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list()
  });

  const updateSessionMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.WorkSession.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workSessions'] });
    }
  });

  const completeSessionMutation = useMutation({
    mutationFn: ({ id, data = {} }) => base44.entities.WorkSession.update(id, {
      ...data,
      status: 'completed',
      completed_at: new Date().toISOString()
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workSessions'] });
    }
  });

  const handleCompleteTask = async (taskIndex) => {
    if (!activeSession) return;
    
    const updatedTasks = [...activeSession.tasks];
    updatedTasks[taskIndex] = {
      ...updatedTasks[taskIndex],
      is_completed: true,
      completed_by: currentUser?.email,
      completed_by_name: currentUser?.full_name || currentUser?.email,
      completed_at: new Date().toISOString()
    };

    // Check if all tasks are completed
    const allCompleted = updatedTasks.every(t => t.is_completed);

    // Always update tasks first
    await base44.entities.WorkSession.update(activeSession.id, { tasks: updatedTasks });

    if (allCompleted) {
      // Then complete the session
      await base44.entities.WorkSession.update(activeSession.id, {
        status: 'completed',
        completed_at: new Date().toISOString()
      });
    }

    // Refresh data
    queryClient.invalidateQueries({ queryKey: ['workSessions'] });
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
    
    if (window.confirm('Terminer la mise en place du jour ?')) {
      completeSessionMutation.mutate({ id: activeSession.id });
    }
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

  // Calculate progress and time
  const completedCount = activeSession.tasks?.filter(t => t.is_completed).length || 0;
  const totalCount = activeSession.tasks?.length || 0;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  // Calculate total and remaining time
  const totalTimeSeconds = activeSession.tasks?.reduce((acc, sessionTask) => {
    const task = tasks.find(t => t.id === sessionTask.task_id);
    if (!task) return acc;
    const taskTime = (task.duration_minutes || 0) * 60 + (task.duration_seconds || 0);
    return acc + taskTime;
  }, 0) || 0;

  const remainingTimeSeconds = activeSession.tasks?.reduce((acc, sessionTask) => {
    if (sessionTask.is_completed) return acc;
    const task = tasks.find(t => t.id === sessionTask.task_id);
    if (!task) return acc;
    const taskTime = (task.duration_minutes || 0) * 60 + (task.duration_seconds || 0);
    return acc + taskTime;
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
          <Button
            onClick={handleCompleteSession}
            className="bg-orange-600 hover:bg-orange-700"
          >
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Mise en place terminée
          </Button>
        }
      />

      {/* Progress Section */}
      <div className="mb-6 p-4 bg-slate-800/50 rounded-2xl border border-slate-700/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-4">
            <span className="text-2xl font-bold text-orange-400">{completedCount}/{totalCount}</span>
            <span className="text-slate-300">tâches complétées</span>
          </div>
          <div className="text-right">
            <div className="text-sm text-slate-400">Temps total : {formatTime(totalTimeSeconds)}</div>
            <div className="text-lg font-semibold text-orange-400">Restant : {formatTime(remainingTimeSeconds)}</div>
          </div>
        </div>
        <Progress value={progressPercent} className="h-3 bg-slate-700" />
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
                      onComplete={() => handleCompleteTask(task.originalIndex)}
                      onRemove={() => handleRemoveTask(task.originalIndex)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WorkTaskCard({ task, onComplete, onRemove }) {
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
          : "bg-slate-700/50 border-slate-600/50"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h4 className={cn(
            "font-medium",
            task.is_completed && "line-through text-slate-500"
          )}>
            {task.task_name}
          </h4>
          
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

        <div className="flex items-center gap-2">
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
              <Button
                onClick={onComplete}
                className="bg-orange-600 hover:bg-orange-700 min-h-[44px]"
              >
                <Check className="w-4 h-4 mr-2" />
                Terminé
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