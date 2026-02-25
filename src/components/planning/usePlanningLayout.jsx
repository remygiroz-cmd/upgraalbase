import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getLayout, saveLayout, clearLayout } from './planningLayoutService';

export const computeMonthKey = (year, month) => {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
};

export const usePlanningLayout = (monthKey) => {
  const queryClient = useQueryClient();

  // Fetch layout pour le mois spécifique
  const { data: dbLayout = null, isLoading } = useQuery({
    queryKey: ['planningLayout', monthKey],
    queryFn: () => getLayout(monthKey),
    enabled: !!monthKey,
    staleTime: 1000 * 60 * 5, // 5 min
  });

  // Default layout si aucun record en DB
  const layout = dbLayout || { column_order: [], hidden_employee_ids: [] };

  // Mutation pour sauvegarder
  const saveLayoutMutation = useMutation({
    mutationFn: (newLayout) => saveLayout(monthKey, newLayout),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planningLayout', monthKey] });
    },
  });

  // Mutation pour effacer
  const clearLayoutMutation = useMutation({
    mutationFn: () => clearLayout(monthKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planningLayout', monthKey] });
    },
  });

  return {
    layout,
    isLoading,
    saveLayout: (newLayout) => saveLayoutMutation.mutateAsync(newLayout),
    clearLayout: () => clearLayoutMutation.mutateAsync(),
  };
};