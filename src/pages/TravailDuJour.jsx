import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ChefHat, Filter, Clock, Check, MessageSquare, Plus, Minus, PartyPopper } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import PageHeader from '@/components/ui/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const DAYS_MAP = {
  0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday',
  4: 'thursday', 5: 'friday', 6: 'saturday'
};

export default function TravailDuJour() {
  const queryClient = useQueryClient();
  const today = format(new Date(), 'yyyy-MM-dd');
  const dayOfWeek = DAYS_MAP[new Date().getDay()];
  
  const [filterPoste, setFilterPoste] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [showChefMessage, setShowChefMessage] = useState(false);
  const [newMessage, setNewMessage] = useState('');

  const { data: tasks = [], isLoading: loadingTasks } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.filter({ is_active: true }, 'order')
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('order')
  });

  const { data: dailyTasks = [], isLoading: loadingDaily } = useQuery({
    queryKey: ['dailyTasks', today],
    queryFn: () => base44.entities.DailyTask.filter({ date: today })
  });

  const { data: chefMessages = [] } = useQuery({
    queryKey: ['chefMessages', today],
    queryFn: () => base44.entities.ChefMessage.filter({ date: today, is_active: true })
  });

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  // Initialize daily tasks for today
  useEffect(() => {
    if (tasks.length > 0 && !loadingDaily) {
      initializeDailyTasks();
    }
  }, [tasks, dailyTasks]);

  const initializeDailyTasks = async () => {
    const existingTaskIds = new Set(dailyTasks.map(dt => dt.task_id));
    const newDailyTasks = [];

    for (const task of tasks) {
      if (!existingTaskIds.has(task.id)) {
        const target = task.weekly_targets?.[dayOfWeek] || 0;
        if (target > 0 || task.tracking_mode === 'binary') {
          newDailyTasks.push({
            task_id: task.id,
            date: today,
            target_quantity: target,
            current_stock: 0,
            quantity_to_produce: target,
            is_completed: false
          });
        }
      }
    }

    if (newDailyTasks.length > 0) {
      await base44.entities.DailyTask.bulkCreate(newDailyTasks);
      queryClient.invalidateQueries({ queryKey: ['dailyTasks', today] });
    }
  };

  const updateDailyTaskMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.DailyTask.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dailyTasks', today] })
  });

  const createMessageMutation = useMutation({
    mutationFn: (data) => base44.entities.ChefMessage.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chefMessages', today] });
      setShowChefMessage(false);
      setNewMessage('');
    }
  });

  const handleComplete = (dailyTask, task) => {
    updateDailyTaskMutation.mutate({
      id: dailyTask.id,
      data: {
        is_completed: true,
        completed_by: currentUser?.email,
        completed_by_name: currentUser?.full_name || currentUser?.email,
        completed_at: new Date().toISOString()
      }
    });
  };

  const handleAdjustStock = (dailyTask, delta) => {
    const newStock = Math.max(0, (dailyTask.current_stock || 0) + delta);
    const toProduce = Math.max(0, dailyTask.target_quantity - newStock);
    updateDailyTaskMutation.mutate({
      id: dailyTask.id,
      data: {
        current_stock: newStock,
        quantity_to_produce: toProduce
      }
    });
  };

  const handleAddMessage = () => {
    if (!newMessage.trim()) return;
    createMessageMutation.mutate({
      content: newMessage.trim(),
      date: today,
      author: currentUser?.email,
      author_name: currentUser?.full_name || currentUser?.email,
      is_active: true
    });
  };

  // Merge tasks with daily tasks
  const mergedTasks = dailyTasks.map(dt => {
    const task = tasks.find(t => t.id === dt.task_id);
    return { ...dt, task };
  }).filter(dt => dt.task);

  // Apply filters
  const filteredTasks = mergedTasks.filter(dt => {
    if (filterPoste !== 'all' && dt.task.poste !== filterPoste) return false;
    if (filterCategory !== 'all' && dt.task.category_id !== filterCategory) return false;
    return true;
  });

  // Calculate progress
  const completedCount = filteredTasks.filter(dt => dt.is_completed).length;
  const totalCount = filteredTasks.length;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  // Calculate total time
  const totalTimeSeconds = filteredTasks.reduce((acc, dt) => {
    if (dt.is_completed) return acc;
    const task = dt.task;
    const unitTime = (task.duration_minutes || 0) * 60 + (task.duration_seconds || 0);
    const quantity = dt.quantity_to_produce || 1;
    return acc + (unitTime * quantity);
  }, 0);

  const formatTotalTime = () => {
    const hours = Math.floor(totalTimeSeconds / 3600);
    const minutes = Math.floor((totalTimeSeconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}min`;
    return `${minutes}min`;
  };

  if (loadingTasks || loadingDaily) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <PageHeader
        icon={ChefHat}
        title="Travail du Jour"
        subtitle={format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
        actions={
          <Button
            onClick={() => setShowChefMessage(true)}
            variant="outline"
            className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700"
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            Post-it
          </Button>
        }
      />

      {/* Chef Messages */}
      <AnimatePresence>
        {chefMessages.map(msg => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl light-mode:bg-amber-50 light-mode:border-amber-200 dark:bg-amber-600/20 dark:border-amber-600/30"
          >
            <p className="text-amber-900 light-mode:text-amber-900 dark:text-amber-200">{msg.content}</p>
            <p className="text-xs text-amber-700 light-mode:text-amber-700 dark:text-amber-400/70 mt-2">— {msg.author_name}</p>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Progress Section */}
      <div className="mb-6 p-4 bg-[rgb(var(--bg-card))] rounded-2xl border border-[rgb(var(--border-primary))] shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-4">
            <span className="text-2xl font-bold text-orange-500">{completedCount}/{totalCount}</span>
            <span className="text-[rgb(var(--text-secondary))]">tâches complétées</span>
          </div>
          <div className="flex items-center gap-2 text-[rgb(var(--text-secondary))]">
            <Clock className="w-4 h-4" />
            <span>{formatTotalTime()} restant</span>
          </div>
        </div>
        <Progress value={progressPercent} className="h-3 bg-[rgb(var(--bg-tertiary))]" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-[rgb(var(--text-secondary))]" />
          <Select value={filterPoste} onValueChange={setFilterPoste}>
            <SelectTrigger className="w-32 bg-[rgb(var(--bg-card))] border-[rgb(var(--border-secondary))]">
              <SelectValue placeholder="Poste" />
            </SelectTrigger>
            <SelectContent className="bg-[rgb(var(--bg-card))] border-[rgb(var(--border-primary))]">
              <SelectItem value="all">Tous postes</SelectItem>
              <SelectItem value="chaud">Chaud</SelectItem>
              <SelectItem value="froid">Froid</SelectItem>
              <SelectItem value="sushi">Sushi</SelectItem>
              <SelectItem value="patisserie">Pâtisserie</SelectItem>
              <SelectItem value="plonge">Plonge</SelectItem>
              <SelectItem value="autre">Autre</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-36 bg-[rgb(var(--bg-card))] border-[rgb(var(--border-secondary))]">
            <SelectValue placeholder="Catégorie" />
          </SelectTrigger>
          <SelectContent className="bg-[rgb(var(--bg-card))] border-[rgb(var(--border-primary))]">
            <SelectItem value="all">Toutes catégories</SelectItem>
            {categories.map(cat => (
              <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Task Grid */}
      {filteredTasks.length === 0 ? (
        <EmptyState
          icon={ChefHat}
          title="Aucune tâche aujourd'hui"
          description="Configurez les objectifs journaliers dans la Mise en Place"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {filteredTasks.map(dailyTask => (
              <DailyTaskCard
                key={dailyTask.id}
                dailyTask={dailyTask}
                task={dailyTask.task}
                onComplete={() => handleComplete(dailyTask, dailyTask.task)}
                onAdjustStock={(delta) => handleAdjustStock(dailyTask, delta)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Chef Message Modal */}
      <Dialog open={showChefMessage} onOpenChange={setShowChefMessage}>
        <DialogContent className="bg-[rgb(var(--bg-secondary))] border-[rgb(var(--border-primary))]">
          <DialogHeader>
            <DialogTitle className="text-[rgb(var(--text-primary))]">Post-it du Chef</DialogTitle>
          </DialogHeader>
          <Textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Message pour l'équipe..."
            className="bg-[rgb(var(--bg-tertiary))] border-[rgb(var(--border-secondary))] text-[rgb(var(--text-primary))] min-h-[100px]"
          />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowChefMessage(false)} className="border-[rgb(var(--border-secondary))] text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))]">
              Annuler
            </Button>
            <Button 
              onClick={handleAddMessage}
              disabled={!newMessage.trim()}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Publier
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DailyTaskCard({ dailyTask, task, onComplete, onAdjustStock }) {
  const isBinary = task.tracking_mode === 'binary';
  
  const estimatedTime = () => {
    const unitTime = (task.duration_minutes || 0) * 60 + (task.duration_seconds || 0);
    const quantity = dailyTask.quantity_to_produce || 1;
    const total = unitTime * quantity;
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}min`;
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        "p-4 rounded-2xl border transition-all shadow-sm",
        dailyTask.is_completed
          ? "bg-orange-50 border-orange-200 light-mode:bg-orange-50 dark:bg-orange-900/20 dark:border-orange-600/30"
          : "bg-[rgb(var(--bg-card))] border-[rgb(var(--border-primary))]"
      )}
    >
      <div className="flex gap-4">
        {task.image_url && (
          <img
            src={task.image_url}
            alt={task.name}
            className={cn(
              "w-16 h-16 rounded-xl object-cover flex-shrink-0",
              dailyTask.is_completed && "opacity-50"
            )}
          />
        )}
        
        <div className="flex-1 min-w-0">
          <h3 className={cn(
            "font-medium truncate text-[rgb(var(--text-primary))]",
            dailyTask.is_completed && "line-through text-[rgb(var(--text-tertiary))]"
          )}>
            {task.name}
          </h3>
          
          {!isBinary && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-indigo-500 font-semibold">
                {dailyTask.quantity_to_produce} {task.unit}
              </span>
              <span className="text-[rgb(var(--text-secondary))] text-sm">à produire</span>
            </div>
          )}
          
          {isBinary && dailyTask.target_quantity > 1 && (
            <p className="text-amber-500 text-sm mt-1">
              ×{dailyTask.target_quantity}
            </p>
          )}

          <div className="flex items-center gap-2 mt-2 text-xs text-[rgb(var(--text-secondary))]">
            <Clock className="w-3 h-3" />
            <span>{estimatedTime()}</span>
          </div>
        </div>
      </div>

      {/* Completed by */}
      {dailyTask.is_completed && dailyTask.completed_by_name && (
        <div className="mt-3 pt-3 border-t border-[rgb(var(--border-primary))] flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-orange-600 flex items-center justify-center text-xs font-medium text-white">
            {dailyTask.completed_by_name.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm text-[rgb(var(--text-secondary))]">{dailyTask.completed_by_name}</span>
          <Check className="w-4 h-4 text-orange-500 ml-auto" />
        </div>
      )}

      {/* Actions */}
      {!dailyTask.is_completed && (
        <div className="mt-4 flex items-center gap-2">
          {!isBinary && (
            <div className="flex items-center gap-1 mr-auto">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onAdjustStock(-1)}
                className="w-8 h-8 p-0"
              >
                <Minus className="w-4 h-4" />
              </Button>
              <span className="w-8 text-center text-sm">{dailyTask.current_stock}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onAdjustStock(1)}
                className="w-8 h-8 p-0"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          )}
          
          <Button
            onClick={onComplete}
            className="bg-orange-600 hover:bg-orange-700 text-white min-h-[44px]"
          >
            <Check className="w-4 h-4 mr-2" />
            Terminé
          </Button>
        </div>
      )}
    </motion.div>
  );
}