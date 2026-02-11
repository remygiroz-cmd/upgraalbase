import { useState, useCallback, useRef } from 'react';

const MAX_UNDO_STACK = 50;

/**
 * Hook pour gérer la pile undo/redo du planning
 * Chaque action est un objet:
 * {
 *   actionType: 'createShift' | 'updateShift' | 'deleteShift' | 'createNonShift' | 'deleteNonShift' | 'addCPPeriod' | 'deleteCPPeriod' | 'applyTemplate',
 *   label: string (pour toast),
 *   monthKey: string,
 *   before: { entities, type } - état avant,
 *   after: { entities, type } - état après,
 *   timestamp: number
 * }
 */
export function useUndoStack() {
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const isUndoingRef = useRef(false);
  const isRedoingRef = useRef(false);

  // Ajouter une action à la pile undo
  const pushAction = useCallback((action) => {
    // Ne pas enregistrer si on est en train d'undo/redo
    if (isUndoingRef.current || isRedoingRef.current) {
      return;
    }

    setUndoStack(prev => {
      const newStack = [...prev, { ...action, timestamp: Date.now() }];
      // Limiter la taille
      if (newStack.length > MAX_UNDO_STACK) {
        newStack.shift();
      }
      return newStack;
    });
    
    // Clear redo stack quand on fait une nouvelle action
    setRedoStack([]);
  }, []);

  // Retirer la dernière action de la pile undo
  const popUndo = useCallback(() => {
    const action = undoStack[undoStack.length - 1];
    if (action) {
      setUndoStack(prev => prev.slice(0, -1));
      setRedoStack(prev => [...prev, action]);
    }
    return action;
  }, [undoStack]);

  // Retirer la dernière action de la pile redo
  const popRedo = useCallback(() => {
    const action = redoStack[redoStack.length - 1];
    if (action) {
      setRedoStack(prev => prev.slice(0, -1));
      setUndoStack(prev => [...prev, action]);
    }
    return action;
  }, [redoStack]);

  // Clear toutes les piles
  const clear = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  // Clear pour un mois spécifique
  const clearMonth = useCallback((monthKey) => {
    setUndoStack(prev => prev.filter(a => a.monthKey !== monthKey));
    setRedoStack(prev => prev.filter(a => a.monthKey !== monthKey));
  }, []);

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  return {
    undoStack,
    redoStack,
    canUndo,
    canRedo,
    pushAction,
    popUndo,
    popRedo,
    clear,
    clearMonth,
    isUndoingRef,
    isRedoingRef
  };
}