/**
 * Bridge hook to provide saveLayout function to the Planning page
 * This solves the "saveLayout is not defined" error by properly
 * integrating usePlanningLayout with the column management handlers
 */
import { usePlanningLayout } from './usePlanningLayout';

export function usePlanningLayoutIntegration(monthKey) {
  const { layout, saveLayout } = usePlanningLayout(monthKey);
  
  return {
    layout,
    saveLayout,
    // Wrapped handlers that ensure saveLayout is always defined
    wrapSaveLayout: (fn) => {
      return (...args) => {
        if (typeof saveLayout === 'function') {
          return fn(saveLayout, ...args);
        }
        console.warn('saveLayout is not defined yet');
      };
    }
  };
}