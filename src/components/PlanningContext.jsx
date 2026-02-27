import React, { createContext, useContext, useState } from 'react';

const PlanningContext = createContext();

export function PlanningContextProvider({ children }) {
  const [planningOpenToken, setPlanningOpenToken] = useState(null);

  const triggerPlanningOpen = () => {
    const token = Date.now();
    console.log(`PLANNING_SIDEBAR_CLICK token=${token}`);
    setPlanningOpenToken(token);
  };

  return (
    <PlanningContext.Provider value={{ planningOpenToken, triggerPlanningOpen }}>
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