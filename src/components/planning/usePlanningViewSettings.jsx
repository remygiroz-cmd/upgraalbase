import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export function usePlanningViewSettings() {
  const [columnOrder, setColumnOrder] = useState([]);
  const [hiddenColumns, setHiddenColumns] = useState([]);
  const queryClient = useQueryClient();

  // Fetch settings once
  const { data: _pvs = [] } = useQuery({
    queryKey: ['planningViewSettings'],
    queryFn: () => base44.entities.AppSettings.filter({ setting_key: 'planning_view' }),
    staleTime: Infinity,
    refetchOnWindowFocus: false
  });

  const planningViewRecord = _pvs[0] || null;
  const viewSettingsInitialized = useRef(false);

  // Initialize settings once
  useEffect(() => {
    if (planningViewRecord && !viewSettingsInitialized.current) {
      viewSettingsInitialized.current = true;
      setColumnOrder(planningViewRecord.column_order || []);
      setHiddenColumns(planningViewRecord.hidden_columns || []);
    }
  }, [planningViewRecord?.id]);

  // Real-time sync for all users
  useEffect(() => {
    if (!planningViewRecord?.id) return;
    const unsubscribe = base44.entities.AppSettings.subscribe((event) => {
      if (event.type === 'update' && event.id === planningViewRecord.id) {
        setColumnOrder(event.data.column_order || []);
        setHiddenColumns(event.data.hidden_columns || []);
      }
    });
    return unsubscribe;
  }, [planningViewRecord?.id]);

  // Save mutation
  const saveViewSettingsMutation = useMutation({
    mutationFn: async ({ columnOrder: co, hiddenColumns: hc }) => {
      if (planningViewRecord?.id) {
        return base44.entities.AppSettings.update(planningViewRecord.id, { column_order: co, hidden_columns: hc });
      }
      return base44.entities.AppSettings.create({ setting_key: 'planning_view', column_order: co, hidden_columns: hc });
    }
  });

  return {
    columnOrder,
    setColumnOrder,
    hiddenColumns,
    setHiddenColumns,
    saveViewSettingsMutation,
    planningViewRecord
  };
}