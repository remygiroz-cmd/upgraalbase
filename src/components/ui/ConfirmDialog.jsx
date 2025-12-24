import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ConfirmDialog({ 
  open, 
  onOpenChange, 
  title, 
  description, 
  onConfirm, 
  onCancel,
  confirmText = "Confirmer",
  cancelText = "Annuler",
  variant = "warning" // "warning" | "danger" | "info"
}) {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    onOpenChange(false);
  };

  const variantStyles = {
    warning: "bg-orange-600/20 border-orange-600/50",
    danger: "bg-red-600/20 border-red-600/50",
    info: "bg-blue-600/20 border-blue-600/50"
  };

  const iconColors = {
    warning: "text-orange-400",
    danger: "text-red-400",
    info: "text-blue-400"
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-800 border-slate-700 w-[calc(100vw-2rem)] max-w-md">
        <div className={cn(
          "absolute inset-0 rounded-lg border-2 pointer-events-none",
          variantStyles[variant]
        )} />

        <DialogHeader>
          <div className="flex items-start gap-3 sm:gap-4">
            <div className={cn(
              "w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0",
              variantStyles[variant]
            )}>
              <AlertTriangle className={cn("w-5 h-5 sm:w-6 sm:h-6", iconColors[variant])} />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base sm:text-lg mb-2 break-words">{title}</DialogTitle>
              <DialogDescription className="text-slate-300 text-xs sm:text-sm leading-relaxed break-words">
                {description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 mt-4 sm:mt-6">
          <Button
            variant="outline"
            onClick={handleCancel}
            className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700 w-full sm:w-auto min-h-[44px]"
          >
            {cancelText}
          </Button>
          <Button
            onClick={handleConfirm}
            className={cn(
              "w-full sm:w-auto min-h-[44px]",
              variant === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-orange-600 hover:bg-orange-700"
            )}
          >
            {confirmText}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}