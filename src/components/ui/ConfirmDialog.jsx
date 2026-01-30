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

  const iconColorMap = {
    warning: "text-yellow-600",
    danger: "text-red-600",
    info: "text-blue-600"
  };

  const bgColorMap = {
    warning: "bg-yellow-100",
    danger: "bg-red-100",
    info: "bg-blue-100"
  };

  const buttonColorMap = {
    warning: "bg-yellow-600 hover:bg-yellow-700",
    danger: "bg-red-600 hover:bg-red-700",
    info: "bg-blue-600 hover:bg-blue-700"
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white border-gray-200 w-[calc(100vw-2rem)] max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3 sm:gap-4">
            <div className={cn(
              "w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center flex-shrink-0",
              bgColorMap[variant]
            )}>
              <AlertTriangle className={cn("w-5 h-5 sm:w-6 sm:h-6", iconColorMap[variant])} />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base sm:text-lg mb-2 break-words text-gray-900">{title}</DialogTitle>
              <DialogDescription className="text-gray-600 text-xs sm:text-sm leading-relaxed break-words">
                {description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 mt-4 sm:mt-6">
          <Button
            variant="outline"
            onClick={handleCancel}
            className="bg-white border-gray-300 text-gray-700 hover:bg-gray-50 w-full sm:w-auto min-h-[44px]"
          >
            {cancelText}
          </Button>
          <Button
            onClick={handleConfirm}
            className={cn(
              "w-full sm:w-auto min-h-[44px] text-white",
              buttonColorMap[variant]
            )}
          >
            {confirmText}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}