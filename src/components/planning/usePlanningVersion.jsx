import { useQuery } from '@tanstack/react-query';
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
    staleTime: 2 * 60_000, // 2 min — évite les refetch inutiles au changement de mois
    gcTime: 10 * 60_000,
    retry: 1
  });

  // CRITIQUE : undefined tant que non chargé → les queries restent disabled
  // Ne jamais tomber à 0 par défaut, sinon on charge les shifts de la version 0
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