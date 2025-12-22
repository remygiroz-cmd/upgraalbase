import React, { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Play, Pause, RotateCcw, Check, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function StopwatchModal({ task, onClose }) {
  const queryClient = useQueryClient();
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef(null);

  const theoreticalSeconds = (task.duration_minutes || 0) * 60 + (task.duration_seconds || 0);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setTime(prev => prev + 100);
      }, 100);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning]);

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Task.update(task.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      onClose();
    }
  });

  const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const centiseconds = Math.floor((ms % 1000) / 10);
    return {
      display: `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
      centiseconds: centiseconds.toString().padStart(2, '0')
    };
  };

  const handleReset = () => {
    setTime(0);
    setIsRunning(false);
  };

  const handleValidate = () => {
    const totalSeconds = Math.floor(time / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    updateMutation.mutate({
      duration_minutes: minutes,
      duration_seconds: seconds
    });
  };

  const { display, centiseconds } = formatTime(time);
  const currentSeconds = Math.floor(time / 1000);
  const progress = theoreticalSeconds > 0 
    ? Math.min((currentSeconds / theoreticalSeconds) * 100, 100) 
    : 0;
  const isOverTime = currentSeconds > theoreticalSeconds && theoreticalSeconds > 0;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-emerald-500" />
            Chronomètre
          </DialogTitle>
        </DialogHeader>

        <div className="py-6">
          {/* Task name */}
          <p className="text-center text-slate-400 mb-6">{task.name}</p>

          {/* Timer display */}
          <div className="text-center mb-8">
            <div className={cn(
              "text-6xl font-mono font-bold transition-colors",
              isOverTime ? "text-red-500" : "text-white"
            )}>
              {display}
              <span className="text-2xl text-slate-500">.{centiseconds}</span>
            </div>
            
            {theoreticalSeconds > 0 && (
              <p className="text-sm text-slate-500 mt-2">
                Théorique: {task.duration_minutes || 0}min {task.duration_seconds || 0}s
              </p>
            )}
          </div>

          {/* Progress bar */}
          {theoreticalSeconds > 0 && (
            <div className="mb-8">
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all duration-100",
                    isOverTime ? "bg-red-500" : "bg-emerald-500"
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            <Button
              size="lg"
              variant="outline"
              onClick={handleReset}
              className="w-14 h-14 rounded-full border-slate-600"
            >
              <RotateCcw className="w-5 h-5" />
            </Button>

            <Button
              size="lg"
              onClick={() => setIsRunning(!isRunning)}
              className={cn(
                "w-20 h-20 rounded-full",
                isRunning
                  ? "bg-amber-600 hover:bg-amber-700"
                  : "bg-emerald-600 hover:bg-emerald-700"
              )}
            >
              {isRunning ? (
                <Pause className="w-8 h-8" />
              ) : (
                <Play className="w-8 h-8 ml-1" />
              )}
            </Button>

            <Button
              size="lg"
              variant="outline"
              onClick={handleValidate}
              disabled={time === 0 || updateMutation.isPending}
              className="w-14 h-14 rounded-full border-emerald-600 text-emerald-400 hover:bg-emerald-600/20"
            >
              <Check className="w-5 h-5" />
            </Button>
          </div>

          {/* Help text */}
          <p className="text-center text-xs text-slate-500 mt-6">
            Valider le temps pour mettre à jour la durée théorique
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}