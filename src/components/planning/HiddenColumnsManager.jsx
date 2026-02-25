import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export const usePlanningViewSettings = (monthKey, setHiddenColumns, queryClient) => {
  const { data: viewSettings } = useQuery({
    queryKey: ['planningViewSettings', monthKey],
    queryFn: async () => {
      if (!monthKey) return null;
      const settings = await base44.entities.AppSettings.filter({ setting_key: `planning_view_${monthKey}` });
      return settings[0] || null;
    },
    enabled: !!monthKey
  });

  useEffect(() => {
    if (viewSettings?.hidden_columns) {
      setHiddenColumns(viewSettings.hidden_columns);
    } else {
      setHiddenColumns([]);
    }
  }, [viewSettings]);

  const saveViewSettings = async (data) => {
    if (!monthKey) return;
    try {
      const existing = await base44.entities.AppSettings.filter({ setting_key: `planning_view_${monthKey}` });
      if (existing[0]) {
        await base44.entities.AppSettings.update(existing[0].id, data);
      } else {
        await base44.entities.AppSettings.create({
          setting_key: `planning_view_${monthKey}`,
          ...data
        });
      }
      queryClient.invalidateQueries({ queryKey: ['planningViewSettings', monthKey] });
    } catch (error) {
      console.error('Erreur sauvegarde affichage:', error);
    }
  };

  return saveViewSettings;
};