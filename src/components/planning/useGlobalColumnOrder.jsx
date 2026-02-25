import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getGlobalColumnOrder, saveGlobalColumnOrder } from './planningColumnOrderService';

/**
 * Hook pour gérer l'ordre GLOBAL des colonnes du planning
 * Cet ordre s'applique à TOUS les mois
 */
export function useGlobalColumnOrder() {
  const queryClient = useQueryClient();

  // Fetch global column order
  const { data: globalColumnOrder = [], isLoading } = useQuery({
    queryKey: ['globalColumnOrder'],
    queryFn: () => getGlobalColumnOrder(),
    staleTime: 0,
    refetchOnMount: true
  });

  // Mutation pour sauvegarder l'ordre global
  const saveOrderMutation = useMutation({
    mutationFn: (newColumnOrder) => saveGlobalColumnOrder(newColumnOrder),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['globalColumnOrder'] });
    }
  });

  return {
    globalColumnOrder,
    isLoading,
    saveGlobalColumnOrder: saveOrderMutation.mutate
  };
}