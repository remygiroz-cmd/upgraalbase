import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

/**
 * Hook to get current planning month version for reset/versioning system
 * Returns the current reset_version for filtering all planning data
 */
export function usePlanningVersion(year, month) {
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

  const { data: planningMonth, isLoading } = useQuery({
    queryKey: ['planningMonth', year, month],
    queryFn: async () => {
      const months = await base44.entities.PlanningMonth.filter({ 
        year, 
        month 
      });
      
      if (months.length > 0) {
        return months[0];
      }
      
      // Create initial month record if doesn't exist
      return await base44.entities.PlanningMonth.create({
        year,
        month,
        month_key: monthKey,
        reset_version: 0
      });
    },
    staleTime: 30000, // Cache for 30s
    retry: 1
  });

  const resetVersion = planningMonth?.reset_version ?? 0;

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