import React, { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export default function UserActivityTracker() {
  const intervalRef = useRef(null);
  const visibilityRef = useRef(true);
  const lastUpdateRef = useRef(0);
  const queryClient = useQueryClient();

  // Get current user and employee
  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['allEmployees'],
    queryFn: () => base44.entities.Employee.list()
  });

  const currentEmployee = React.useMemo(() => {
    if (!currentUser?.email || !employees.length) return null;
    const normalizeEmail = (email) => email?.trim().toLowerCase() || '';
    return employees.find(emp => normalizeEmail(emp.email) === normalizeEmail(currentUser.email));
  }, [currentUser, employees]);

  useEffect(() => {
    if (!currentEmployee?.id) return;

    const updateActivity = async () => {
      try {
        const now = Date.now();
        // Don't update if we did so less than 30 seconds ago
        if (now - lastUpdateRef.current < 30000) return;
        
        if (visibilityRef.current) {
          await base44.entities.Employee.update(currentEmployee.id, {
            last_seen_at: new Date().toISOString()
          });
          lastUpdateRef.current = now;
          // Refresh employees list
          queryClient.invalidateQueries({ queryKey: ['allEmployees'] });
        }
      } catch (error) {
        console.error('Failed to update activity:', error);
      }
    };

    const setOffline = async () => {
      try {
        await base44.entities.Employee.update(currentEmployee.id, {
          last_seen_at: new Date().toISOString()
        });
      } catch (error) {
        // Silent fail on unload
      }
    };

    // Update activity immediately on mount, then every 45 seconds
    updateActivity();
    intervalRef.current = setInterval(updateActivity, 45000);

    // Handle visibility change
    const handleVisibilityChange = () => {
      visibilityRef.current = !document.hidden;
      if (visibilityRef.current) {
        updateActivity();
      } else {
        setOffline();
      }
    };

    // Handle page focus
    const handleFocus = () => {
      updateActivity();
    };

    // Handle page unload
    const handleBeforeUnload = () => {
      setOffline();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      setOffline();
    };
  }, [currentEmployee?.id, queryClient]);

  return null;
}