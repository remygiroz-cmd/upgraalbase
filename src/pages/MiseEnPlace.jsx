import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ClipboardList, Plus, GripVertical, Clock, Hash, ToggleLeft, Pencil, Trash2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import TaskFormModal from '@/components/cuisine/TaskFormModal';
import CategoryManager from '@/components/cuisine/CategoryManager';
import StopwatchModal from '@/components/cuisine/StopwatchModal';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export default function MiseEnPlace() {
  const queryClient = useQueryClient();
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [stopwatchTask, setStopwatchTask] = useState(null);

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
              className="border-slate-600 hover:bg-slate-700"
            >
              Catégories
            </Button>
            <Button
              onClick={() => setShowTaskModal(true)}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nouvelle tâche
            </Button>
          </>
        }
      />

      {categories.length === 0 && tasks.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Aucune tâche"
          description="Commencez par créer des catégories puis ajoutez vos premières tâches de mise en place."
          action={
            <Button
              onClick={() => setShowCategoryManager(true)}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Créer une catégorie
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {/* Uncategorized tasks */}
          {uncategorizedTasks.length > 0 && (
            <CategoryColumn
              title="Sans catégorie"
              color="#64748b"
              tasks={uncategorizedTasks}
              onEditTask={handleEditTask}
              onDeleteTask={(id) => deleteTaskMutation.mutate(id)}
              onStartStopwatch={setStopwatchTask}
            />
          )}

          {/* Category columns */}
          {categories.map((category) => (
            <CategoryColumn
              key={category.id}
              title={category.name}
              color={category.color || '#10b981'}
              tasks={getTasksByCategory(category.id)}
              onEditTask={handleEditTask}
              onDeleteTask={(id) => deleteTaskMutation.mutate(id)}
              onStartStopwatch={setStopwatchTask}
            />
          ))}
        </div>
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
    </div>
  );
}

function CategoryColumn({ title, color, tasks, onEditTask, onDeleteTask, onStartStopwatch }) {
  return (
    <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
      <div 
        className="px-4 py-3 border-b border-slate-700/50"
        style={{ borderLeftWidth: 4, borderLeftColor: color }}
      >
        <h3 className="font-semibold">{title}</h3>
        <p className="text-xs text-slate-400">{tasks.length} tâche{tasks.length > 1 ? 's' : ''}</p>
      </div>
      
      <div className="p-3 space-y-2 max-h-[60vh] overflow-y-auto">
        <AnimatePresence>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onEdit={() => onEditTask(task)}
              onDelete={() => onDeleteTask(task.id)}
              onStartStopwatch={() => onStartStopwatch(task)}
            />
          ))}
        </AnimatePresence>
        
        {tasks.length === 0 && (
          <p className="text-center text-slate-500 text-sm py-8">
            Aucune tâche
          </p>
        )}
      </div>
    </div>
  );
}

function TaskCard({ task, onEdit, onDelete, onStartStopwatch }) {
  const formatDuration = () => {
    const mins = task.duration_minutes || 0;
    const secs = task.duration_seconds || 0;
    if (mins === 0 && secs === 0) return null;
    if (mins === 0) return `${secs}s`;
    if (secs === 0) return `${mins}min`;
    return `${mins}min ${secs}s`;
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        "group bg-slate-700/50 rounded-xl p-3 border border-slate-600/50",
        "hover:bg-slate-700 hover:border-slate-500/50 transition-all"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="text-slate-500 cursor-grab">
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
          <h4 className="font-medium truncate">{task.name}</h4>
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
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onStartStopwatch}
            className="p-2 rounded-lg hover:bg-emerald-600/20 text-slate-400 hover:text-emerald-400 transition-colors"
            title="Chronométrer"
          >
            <Play className="w-4 h-4" />
          </button>
          <button
            onClick={onEdit}
            className="p-2 rounded-lg hover:bg-slate-600 text-slate-400 hover:text-white transition-colors"
            title="Modifier"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
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