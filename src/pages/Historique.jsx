import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { History, Download, Check, ClipboardList, Clock, Trash2, Search, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PageHeader from '@/components/ui/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function Historique() {
  const queryClient = useQueryClient();
  const [selectedDay, setSelectedDay] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', description: '', onConfirm: null });

  const { data: workSessions = [], isLoading: loadingSessions } = useQuery({
    queryKey: ['workSessions', 'completed'],
    queryFn: () => base44.entities.WorkSession.filter({ status: 'completed' }, '-created_date')
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list()
  });

  const deleteSessionMutation = useMutation({
    mutationFn: (id) => base44.entities.WorkSession.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workSessions'] });
    }
  });

  const deleteAllSessionsMutation = useMutation({
    mutationFn: async () => {
      const deletePromises = workSessions.map((session) =>
      base44.entities.WorkSession.delete(session.id)
      );
      return Promise.all(deletePromises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workSessions'] });
    }
  });

  const handleDeleteSession = (sessionId, e) => {
    e.stopPropagation();
    setConfirmDialog({
      open: true,
      title: 'Supprimer cet historique',
      description: 'Êtes-vous sûr de vouloir supprimer cet historique ? Cette action est irréversible.',
      onConfirm: () => deleteSessionMutation.mutate(sessionId)
    });
  };

  const handleDeleteAll = () => {
    setConfirmDialog({
      open: true,
      title: 'Supprimer tous les historiques',
      description: `Êtes-vous sûr de vouloir supprimer tous les ${workSessions.length} historiques ? Cette action est irréversible.`,
      onConfirm: () => deleteAllSessionsMutation.mutate()
    });
  };

  const calculateSessionTimes = (session) => {
    let totalSeconds = 0;
    let completedSeconds = 0;

    session.tasks?.forEach((task) => {
      const taskData = tasks.find((t) => t.id === task.task_id);
      if (taskData) {
        const taskSeconds = (taskData.duration_minutes || 0) * 60 + (taskData.duration_seconds || 0);
        totalSeconds += taskSeconds;
        if (task.is_completed) {
          completedSeconds += taskSeconds;
        }
      }
    });

    return {
      totalSeconds,
      completedSeconds,
      remainingSeconds: totalSeconds - completedSeconds
    };
  };

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}min`;
    }
    return `${minutes}min`;
  };

  const exportToCSV = () => {
    const rows = [
    ['Date', 'Tâche', 'Catégorie', 'Statut', 'Complété par', 'Complété à', 'Ajouté à']];


    workSessions.forEach((session) => {
      session.tasks?.forEach((task) => {
        rows.push([
        format(new Date(session.date), 'dd/MM/yyyy', { locale: fr }),
        task.task_name,
        task.category_name || '',
        task.is_completed ? 'Complété' : 'Non complété',
        task.completed_by_name || '',
        task.completed_at ? format(new Date(task.completed_at), 'dd/MM/yyyy HH:mm') : '',
        task.added_at ? format(new Date(task.added_at), 'dd/MM/yyyy HH:mm') : '']
        );
      });
    });

    const csvContent = rows.map((row) => row.join(';')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `historique_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  if (loadingSessions) {
    return <LoadingSpinner />;
  }

  if (workSessions.length === 0) {
    return (
      <div>
        <PageHeader
          icon={History}
          title="Historique"
          subtitle="Historique des mises en place" />

        <EmptyState
          icon={History}
          title="Aucun historique"
          description="L'historique apparaîtra après avoir terminé des mises en place" />

      </div>);

  }

  return (
    <div>
      <PageHeader
        icon={History}
        title="Historique"
        subtitle="Historique des mises en place"
        actions={
        <>
            <Button
            onClick={handleDeleteAll}
            variant="outline"
            className="border-red-600 text-red-400 hover:text-red-300 hover:bg-red-600/20 min-h-[44px]"
            disabled={deleteAllSessionsMutation.isPending}>

              <Trash2 className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Tout supprimer</span>
            </Button>
            <Button
            onClick={exportToCSV}
            variant="outline"
            className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700 min-h-[44px]">

              <Download className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Exporter CSV</span>
              <span className="sm:hidden">CSV</span>
            </Button>
          </>
        } />


      <div className="space-y-4">
        {workSessions.map((session) => {
          const completed = session.tasks?.filter((t) => t.is_completed).length || 0;
          const total = session.tasks?.length || 0;
          const { totalSeconds, remainingSeconds } = calculateSessionTimes(session);

          return (
            <motion.div
              key={session.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }} className="bg-slate-50 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-700/50 hover:border-slate-600 transition-all cursor-pointer group active:scale-[0.98]"

              onClick={() => setSelectedDay(session)}>

              <div className="flex items-center justify-between gap-3 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-base sm:text-lg truncate">
                    {format(new Date(session.date), 'EEEE d MMMM yyyy', { locale: fr })}
                  </h3>
                  <div className="flex items-center gap-2 sm:gap-4 mt-2 text-xs sm:text-sm text-slate-400 flex-wrap">
                    <span>{completed}/{total} tâches complétées</span>
                    {totalSeconds > 0 &&
                    <>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Temps total: {formatTime(totalSeconds)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Temps restant: {formatTime(remainingSeconds)}
                        </span>
                      </>
                    }
                    {session.started_by_name &&
                    <span>Démarré par {session.started_by_name}</span>
                    }
                    {session.completed_at &&
                    <span>Terminé à {format(new Date(session.completed_at), 'HH:mm')}</span>
                    }
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => handleDeleteSession(session.id, e)}
                    className="opacity-0 sm:group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300 hover:bg-red-600/20 min-h-[44px] min-w-[44px]">

                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <div className={cn(
                    "w-14 h-14 sm:w-16 sm:h-16 rounded-lg sm:rounded-xl flex items-center justify-center font-bold text-xl sm:text-2xl flex-shrink-0",
                    completed === total && total > 0 ?
                    "bg-orange-600/20 text-orange-400" :
                    "bg-slate-700 text-slate-400"
                  )}>
                    {Math.round(total > 0 ? completed / total * 100 : 0)}%
                  </div>
                </div>
              </div>
            </motion.div>);

        })}
      </div>

      {/* Day Detail Modal */}
      {selectedDay &&
      <DayDetailModal
        day={selectedDay}
        onClose={() => setSelectedDay(null)} />

      }

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.onConfirm}
        variant="danger"
        confirmText="Supprimer" />

    </div>);

}

function DayDetailModal({ day, onClose }) {
  if (!day) return null;
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState('all');

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list()
  });

  // Get unique users from completed tasks
  const uniqueUsers = useMemo(() => {
    const users = new Set();
    day.tasks?.forEach(task => {
      if (task.completed_by_name) {
        users.add(task.completed_by_name);
      }
    });
    return Array.from(users).sort();
  }, [day.tasks]);

  // Filter tasks by search and user
  const filteredTasks = useMemo(() => {
    return day.tasks?.filter(task => {
      const matchesSearch = searchQuery === '' || 
        task.task_name?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesUser = selectedUser === 'all' || 
        task.completed_by_name === selectedUser ||
        (!task.completed_by_name && selectedUser === 'not_completed');
      return matchesSearch && matchesUser;
    }) || [];
  }, [day.tasks, searchQuery, selectedUser]);

  // Group filtered tasks by category
  const tasksByCategory = {};
  filteredTasks.forEach((task) => {
    const catId = task.category_id || 'uncategorized';
    const catName = task.category_name || 'Sans catégorie';
    if (!tasksByCategory[catId]) {
      tasksByCategory[catId] = { name: catName, tasks: [] };
    }
    tasksByCategory[catId].tasks.push(task);
  });

  // Calculate total and remaining time
  let totalSeconds = 0;
  let completedSeconds = 0;

  day.tasks?.forEach((task) => {
    const taskData = tasks.find((t) => t.id === task.task_id);
    if (taskData) {
      const taskSeconds = (taskData.duration_minutes || 0) * 60 + (taskData.duration_seconds || 0);
      totalSeconds += taskSeconds;
      if (task.is_completed) {
        completedSeconds += taskSeconds;
      }
    }
  });

  const remainingSeconds = totalSeconds - completedSeconds;

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}min`;
    }
    return `${minutes}min`;
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {format(new Date(day.date), 'EEEE d MMMM yyyy', { locale: fr })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Session Info */}
          <div className="p-3 bg-slate-700/30 rounded-lg">
            <div className="flex flex-col gap-2 text-sm">
              {day.started_by_name &&
              <div className="flex justify-between">
                  <span className="text-slate-400">Démarré par :</span>
                  <span className="text-slate-200">{day.started_by_name}</span>
                </div>
              }
              {day.started_at &&
              <div className="flex justify-between">
                  <span className="text-slate-400">Heure de début :</span>
                  <span className="text-slate-200">{format(new Date(day.started_at), 'HH:mm')}</span>
                </div>
              }
              {day.completed_at &&
              <div className="flex justify-between">
                  <span className="text-slate-400">Heure de fin :</span>
                  <span className="text-slate-200">{format(new Date(day.completed_at), 'HH:mm')}</span>
                </div>
              }
              {totalSeconds > 0 &&
              <>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Temps total :</span>
                    <span className="text-slate-200 font-medium">{formatTime(totalSeconds)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Temps restant :</span>
                    <span className="text-slate-200 font-medium">{formatTime(remainingSeconds)}</span>
                  </div>
                </>
              }
            </div>
          </div>

          {/* Filters */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Rechercher une tâche..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-slate-700/30 border-slate-600 text-slate-200"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger className="bg-slate-700/30 border-slate-600 text-slate-200">
                  <SelectValue placeholder="Tous les utilisateurs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les utilisateurs</SelectItem>
                  <SelectItem value="not_completed">Tâches non complétées</SelectItem>
                  {uniqueUsers.map(user => (
                    <SelectItem key={user} value={user}>{user}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tasks by Category */}
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-orange-400" />
              Tâches ({filteredTasks.length} / {day.tasks?.length || 0})
            </h3>
            {filteredTasks.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                Aucune tâche trouvée
              </div>
            ) : (
            <div className="space-y-4">
              {Object.entries(tasksByCategory).map(([catId, categoryData]) =>
              <div key={catId}>
                  <h4 className="text-sm font-medium text-slate-300 mb-2">{categoryData.name}</h4>
                  <div className="space-y-2">
                    {categoryData.tasks.map((task, idx) =>
                  <div
                    key={idx}
                    className={cn(
                      "p-3 rounded-lg border",
                      task.is_completed ?
                      "bg-orange-900/20 border-orange-600/30" :
                      "bg-slate-700/30 border-slate-600/30"
                    )}>

                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h5 className={cn(
                          "font-medium",
                          task.is_completed && "line-through text-slate-500"
                        )}>
                              {task.task_name}
                            </h5>
                            {task.added_at &&
                        <p className="text-xs text-slate-500 mt-1">
                                Ajouté à {format(new Date(task.added_at), 'HH:mm')}
                              </p>
                        }
                          </div>
                          {task.is_completed &&
                      <div className="flex items-center gap-2 ml-4">
                              <Check className="w-5 h-5 text-orange-400" />
                              <div className="text-right">
                                <p className="text-sm text-slate-300">{task.completed_by_name}</p>
                                {task.completed_at &&
                          <p className="text-xs text-slate-500">
                                    {format(new Date(task.completed_at), 'HH:mm')}
                                  </p>
                          }
                              </div>
                            </div>
                      }
                        </div>
                      </div>
                  )}
                  </div>
                </div>
              )}
            </div>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <Button onClick={onClose} className="bg-slate-600 hover:bg-slate-500 text-slate-100">
            Fermer
          </Button>
        </div>
      </DialogContent>
    </Dialog>);

}