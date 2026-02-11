import { useState, useEffect } from 'react';

/**
 * Hook to manage hidden recap items per user
 * Stores preferences in localStorage
 */
export function useHiddenItems(userId) {
  const storageKey = `planning-hidden-items-${userId}`;
  
  const [hiddenItems, setHiddenItems] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch (error) {
      console.error('Error loading hidden items:', error);
      return new Set();
    }
  });

  // Save to localStorage whenever hiddenItems changes
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(hiddenItems)));
      // Dispatch custom event for same-tab listeners
      window.dispatchEvent(new Event('hidden-items-changed'));
    } catch (error) {
      console.error('Error saving hidden items:', error);
    }
  }, [hiddenItems, storageKey]);

  const hideItem = (itemKey) => {
    setHiddenItems(prev => new Set([...prev, itemKey]));
  };

  const showItem = (itemKey) => {
    setHiddenItems(prev => {
      const next = new Set(prev);
      next.delete(itemKey);
      return next;
    });
  };

  const isHidden = (itemKey) => {
    return hiddenItems.has(itemKey);
  };

  const showAll = () => {
    setHiddenItems(new Set());
  };

  const hasHiddenItems = hiddenItems.size > 0;

  return {
    hideItem,
    showItem,
    isHidden,
    showAll,
    hasHiddenItems,
    hiddenCount: hiddenItems.size
  };
}