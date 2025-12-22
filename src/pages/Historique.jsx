import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { History, Calendar, Clock, CheckCircle2, Download, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PageHeader from '@/components/ui/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';
import { format, subDays, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function Historique() {
  const [selectedDate, setSelectedDate] = useState(null);
  
  // Get last 30 days of history
  const dates = Array.from({ length: 30 }, (_, i) => format(subDays(new Date(), i + 1), 'yyyy-MM-dd'));

  const { data: dailyTasks = [], isLoading: loadingTasks } = useQuery({
    queryKey: ['dailyTasksHistory'],
    queryFn: async () => {
      const allTasks = await base44.entities.DailyTask.list('-date', 500);
      return allTasks;
    }
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list()
  });

  const { data: chefMessages = [] } = useQuery({
    queryKey: ['chefMessagesHistory'],
    queryFn: () => base44.entities.ChefMessage.list('-date', 100)
  });

  // Group daily tasks by date
  const tasksByDate = dailyTasks.reduce((acc, dt) => {
    if (!acc[dt.date]) acc[dt.date] = [];
    acc[dt.date].push(dt);
    return acc;
  }, {});

  // Group messages by date
  const messagesByDate = chefMessages.reduce((acc, msg) => {
    if (!acc[msg.date]) acc[msg.date] = [];
    acc[msg.date].push(msg);
    return acc;
  }, {});

  const getDayStats = (date) => {
    const dayTasks = tasksByDate[date] || [];
    const completed = dayTasks.filter(t => t.is_completed).length;
    const total = dayTasks.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    const totalTime = dayTasks.reduce((acc, dt) => {
      if (!dt.is_completed) return acc;
      const task = tasks.find(t => t.id === dt.task_id);
      if (!task) return acc;
      const unitTime = (task.duration_minutes || 0) * 60 + (task.duration_seconds || 0);
      const quantity = dt.quantity_to_produce || 1;
      return acc + (unitTime * quantity);
    }, 0);

    return { completed, total, percentage, totalTime, messages: messagesByDate[date] || [] };
  };

  const handleExport = () => {
    const rows = [['Date', 'Tâches complétées', 'Total', '%', 'Temps production (min)']];
    
    dates.forEach(date => {
      const stats = getDayStats(date);
      if (stats.total > 0) {
        rows.push([
          format(parseISO(date), 'dd/MM/yyyy'),
          stats.completed,
          stats.total,
          stats.percentage + '%',
          Math.round(stats.totalTime / 60)
        ]);
      }
    });

    const csv = rows.map(r => r.join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `historique_production.csv`;
    link.click();
  };

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}min`;
    return `${minutes}min`;
  };

  if (loadingTasks) {
    return <LoadingSpinner />;
  }

  // Filter dates that have data
  const datesWithData = dates.filter(date => {
    const stats = getDayStats(date);
    return stats.total > 0;
  });

  return (
    <div>
      <PageHeader
        icon={History}
        title="Historique"
        subtitle="Archives de production"
        actions={
          <Button
            variant="outline"
            onClick={handleExport}
            className="border-slate-600"
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        }
      />

      {datesWithData.length === 0 ? (
        <EmptyState
          icon={History}
          title="Aucun historique"
          description="L'historique de production apparaîtra ici après vos premières journées de travail"
        />
      ) : (
        <div className="space-y-3">
          {datesWithData.map(date => {
            const stats = getDayStats(date);
            return (
              <button
                key={date}
                onClick={() => setSelectedDate(date)}
                className={cn(
                  "w-full p-4 rounded-2xl border text-left transition-all",
                  "bg-slate-800/50 border-slate-700/50",
                  "hover:bg-slate-800 hover:border-slate-600/50"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-slate-700 flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-slate-400" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {format(parseISO(date), "EEEE d MMMM", { locale: fr })}
                      </p>
                      <div className="flex items-center gap-4 mt-1 text-sm text-slate-400">
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {stats.completed}/{stats.total} tâches
                        </span>
                        {stats.totalTime > 0 && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTime(stats.totalTime)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "text-2xl font-bold",
                      stats.percentage >= 80 ? "text-emerald-400" :
                      stats.percentage >= 50 ? "text-amber-400" : "text-red-400"
                    )}>
                      {stats.percentage}%
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-500" />
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-3 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all",
                      stats.percentage >= 80 ? "bg-emerald-500" :
                      stats.percentage >= 50 ? "bg-amber-500" : "bg-red-500"
                    )}
                    style={{ width: `${stats.percentage}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Day Detail Modal */}
      {selectedDate && (
        <DayDetailModal
          date={selectedDate}
          dailyTasks={tasksByDate[selectedDate] || []}
          tasks={tasks}
          messages={messagesByDate[selectedDate] || []}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}

function DayDetailModal({ date, dailyTasks, tasks, messages, onClose }) {
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {format(parseISO(date), "EEEE d MMMM yyyy", { locale: fr })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Messages du chef */}
          {messages.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-400 mb-2">Messages du Chef</h3>
              <div className="space-y-2">
                {messages.map(msg => (
                  <div
                    key={msg.id}
                    className="p-3 bg-amber-600/10 border border-amber-600/20 rounded-lg"
                  >
                    <p className="text-amber-200">{msg.content}</p>
                    <p className="text-xs text-amber-400/70 mt-1">— {msg.author_name}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tâches */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 mb-2">Tâches ({dailyTasks.length})</h3>
            <div className="space-y-2">
              {dailyTasks.map(dt => {
                const task = tasks.find(t => t.id === dt.task_id);
                if (!task) return null;
                
                return (
                  <div
                    key={dt.id}
                    className={cn(
                      "p-3 rounded-lg border",
                      dt.is_completed
                        ? "bg-emerald-900/10 border-emerald-600/20"
                        : "bg-slate-700/30 border-slate-600/30"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {dt.is_completed && (
                          <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                        )}
                        <div>
                          <p className={cn(
                            "font-medium",
                            !dt.is_completed && "text-slate-400"
                          )}>
                            {task.name}
                          </p>
                          {dt.completed_by_name && (
                            <p className="text-xs text-slate-500">
                              Par {dt.completed_by_name}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      {task.tracking_mode === 'quantity' && (
                        <span className="text-sm text-slate-400">
                          {dt.quantity_to_produce} {task.unit}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-slate-700">
          <Button onClick={onClose} className="bg-slate-600 hover:bg-slate-500">
            Fermer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}