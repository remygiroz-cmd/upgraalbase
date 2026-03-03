import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { getActiveMonthContext } from './monthContext';

/**
 * Hook to get current planning month version for reset/versioning system
 * Délègue à getActiveMonthContext pour partager le cache et éviter le rate-limit.
 */
export function usePlanningVersion(year, month) {
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

  const { data: planningMonth, isLoading } = useQuery({
    queryKey: ['planningMonth', monthKey],
    queryFn: async () => {
      const ctx = await getActiveMonthContext(monthKey);
      console.log(`[usePlanningVersion] ${monthKey} → reset_version=${ctx.reset_version}`);
      return ctx;
    },
    staleTime: 5 * 60_000, // 5 min — la version ne change que lors d'un reset explicite
    gcTime: 30 * 60_000,   // Garder en cache 30 min pour navigation rapide
    placeholderData: keepPreviousData,
    retry: 1
  });

  // Si déjà en cache (prefetch), isLoading=false immédiatement → resetVersion disponible de suite
  const resetVersion = isLoading ? undefined : (planningMonth?.reset_version ?? 0);

  return {
    resetVersion,
    monthKey,
    isLoading,
    planningMonth
  };
}

/**
 * Utility to add versioning fields when creating planning objects
 */
export function withPlanningVersion(data, resetVersion, monthKey) {
  return {
    ...data,
    reset_version: resetVersion,
    month_key: monthKey
  };
}

/**
 * Utility to filter planning data by current version
 */
export function filterByVersion(items, resetVersion) {
  if (!items) return [];
  return items.filter(item => (item.reset_version ?? 0) === resetVersion);
}