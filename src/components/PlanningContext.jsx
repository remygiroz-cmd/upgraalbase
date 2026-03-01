import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';

const PlanningContext = createContext();

export function PlanningContextProvider({ children }) {
  const [planningOpenToken, setPlanningOpenToken] = useState(null);

  const triggerPlanningOpen = useCallback(() => {
    const token = Date.now();
    console.log(`PLANNING_SIDEBAR_CLICK token=${token}`);
    setPlanningOpenToken(token);
  }, []);

  // Stabiliser la valeur du contexte pour éviter que tous les consumers
  // re-rendent à chaque render du provider
  const value = useMemo(
    () => ({ planningOpenToken, triggerPlanningOpen }),
    [planningOpenToken, triggerPlanningOpen]
  );

  return (
    <PlanningContext.Provider value={value}>
      {children}
    </PlanningContext.Provider>
  );
}

export function usePlanningContext() {
  const context = useContext(PlanningContext);
  if (!context) {
    throw new Error('usePlanningContext must be used within PlanningContextProvider');
  }
  return context;
}