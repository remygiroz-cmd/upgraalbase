import React, { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Play, Pause, RotateCcw, Check, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function StopwatchModal({ task, onClose }) {
  const queryClient = useQueryClient();
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [showQuantityDialog, setShowQuantityDialog] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
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
    if (time === 0) return;
    setIsRunning(false);
    setShowQuantityDialog(true);
  };

  const handleConfirmQuantity = () => {
    const quantityNum = parseFloat(quantity);
    if (!quantityNum || quantityNum <= 0 || !unit.trim()) return;
    
    // Calculate time per unit
    const totalSeconds = Math.floor(time / 1000);
    const timePerUnit = totalSeconds / quantityNum;
    const minutes = Math.floor(timePerUnit / 60);
    const seconds = Math.floor(timePerUnit % 60);
    
    updateMutation.mutate({
      duration_minutes: minutes,
      duration_seconds: seconds,
      unit: unit.trim()
    });
  };

  const { display, centiseconds } = formatTime(time);
  const currentSeconds = Math.floor(time / 1000);
  const progress = theoreticalSeconds > 0 
    ? Math.min((currentSeconds / theoreticalSeconds) * 100, 100) 
    : 0;
  const isOverTime = currentSeconds > theoreticalSeconds && theoreticalSeconds > 0;

  return (
    <>
    <Dialog open={!showQuantityDialog} onOpenChange={onClose}>
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
              isOverTime ? "text-red-400" : "text-slate-100"
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
                    isOverTime ? "bg-red-500" : "bg-orange-500"
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
                  : "bg-orange-600 hover:bg-orange-700"
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
              className="w-14 h-14 rounded-full border-orange-600 text-orange-400 hover:bg-orange-600/20"
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

    <Dialog open={showQuantityDialog} onOpenChange={(open) => {
      if (!open) {
        setShowQuantityDialog(false);
        setQuantity('');
        setUnit('');
      }
    }}>
      <DialogContent className="bg-slate-800 border-slate-700 w-[calc(100vw-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-slate-100">Quantité produite</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <p className="text-slate-300 text-sm">
            Temps total : {formatTime(time).display}
          </p>
          
          <div className="space-y-2">
            <label className="text-slate-300 text-sm font-medium">
              Combien de produits avez-vous produit ?
            </label>
            <Input
              type="number"
              min="0.1"
              step="0.1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Ex: 2"
              className="bg-slate-700 border-slate-600 text-slate-100"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label className="text-slate-300 text-sm font-medium">
              Unité de mesure
            </label>
            <Input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="Ex: sachets, grammes, litres..."
              className="bg-slate-700 border-slate-600 text-slate-100"
            />
          </div>

          {quantity && unit && parseFloat(quantity) > 0 && (
            <div className="p-3 bg-orange-600/20 rounded-lg border border-orange-600/30">
              <p className="text-orange-300 text-sm">
                Temps par {unit.toLowerCase().replace(/s$/, '')} : {formatTime(Math.floor(time / parseFloat(quantity))).display}
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-end">
          <Button
            variant="outline"
            onClick={() => {
              setShowQuantityDialog(false);
              setQuantity('');
              setUnit('');
            }}
            className="border-slate-600 text-slate-300 hover:bg-slate-700"
          >
            Retour
          </Button>
          <Button
            onClick={handleConfirmQuantity}
            disabled={!quantity || !unit || parseFloat(quantity) <= 0 || updateMutation.isPending}
            className="bg-orange-600 hover:bg-orange-700"
          >
            Valider
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}