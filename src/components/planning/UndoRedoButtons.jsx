import React from 'react';
import { Button } from '@/components/ui/button';
import { Undo2, Redo2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function UndoRedoButtons({ 
  canUndo, 
  canRedo, 
  onUndo, 
  onRedo, 
  isUndoing, 
  isRedoing 
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={onUndo}
        disabled={!canUndo || isUndoing}
        className={cn(
          "gap-2",
          !canUndo && "opacity-50 cursor-not-allowed"
        )}
        title="Annuler (Ctrl+Z / ⌘Z)"
      >
        {isUndoing ? (
          <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
        ) : (
          <Undo2 className="w-4 h-4" />
        )}
        <span className="hidden sm:inline">Annuler</span>
      </Button>
      
      <Button
        variant="outline"
        size="sm"
        onClick={onRedo}
        disabled={!canRedo || isRedoing}
        className={cn(
          "gap-2",
          !canRedo && "opacity-50 cursor-not-allowed"
        )}
        title="Rétablir (Ctrl+Y / ⌘⇧Z)"
      >
        {isRedoing ? (
          <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
        ) : (
          <Redo2 className="w-4 h-4" />
        )}
        <span className="hidden sm:inline">Rétablir</span>
      </Button>
    </div>
  );
}