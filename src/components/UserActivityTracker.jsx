import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';

export default function UserActivityTracker() {
  const intervalRef = useRef(null);
  const visibilityRef = useRef(true);

  useEffect(() => {
    const updateActivity = async () => {
      try {
        if (visibilityRef.current) {
          await base44.functions.invoke('updateUserActivity', {});
        }
      } catch (error) {
        console.error('Failed to update activity:', error);
      }
    };

    const setOffline = async () => {
      try {
        await base44.functions.invoke('setUserOffline', {});
      } catch (error) {
        console.error('Failed to set offline:', error);
      }
    };

    // Update activity immediately on mount, then every 60 seconds
    updateActivity();
    intervalRef.current = setInterval(updateActivity, 60000);

    // Handle visibility change
    const handleVisibilityChange = () => {
      visibilityRef.current = !document.hidden;
      if (visibilityRef.current) {
        updateActivity();
      } else {
        setOffline();
      }
    };

    // Handle page unload
    const handleBeforeUnload = () => {
      setOffline();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      setOffline();
    };
  }, []);

  return null;
}